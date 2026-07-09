import * as path from "path";
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { HttpApi, CorsHttpMethod, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";

export interface ApiStackProps extends StackProps {
  kbId: string;
  kbRegion: string;
  /** Name of the pre-existing S3 bucket backing the Knowledge Base, for direct/exhaustive reads (not managed by this stack). */
  golfDataBucket: string;
  /** Cross-region inference profile ID for the chat model, e.g. "us.anthropic.claude-opus-4-6-v1". Leave blank until verified (Phase 0). */
  chatModelId: string;
  /** Cross-region inference profile ID for the one-pager report model. Leave blank until verified (Phase 0). */
  reportModelId: string;
  callbackUrls: string[];
  logoutUrls: string[];
  /** Email of the single owner user. If blank, the Cognito user is not auto-created (see scripts/seed-cognito-user.ts). */
  ownerEmail: string;
}

const SERVICES_ROOT = path.join(__dirname, "..", "..", "services", "api");

export class ApiStack extends Stack {
  public readonly httpApiUrl: string;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;
  public readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const kbArn = `arn:aws:bedrock:${props.kbRegion}:${this.account}:knowledge-base/${props.kbId}`;
    // Built from account + region at synth time, rather than accepting a full ARN via
    // context, so the AWS account ID never has to be hardcoded in committed cdk.json.
    const chatModelArn = props.chatModelId
      ? `arn:aws:bedrock:${props.kbRegion}:${this.account}:inference-profile/${props.chatModelId}`
      : "";
    const reportModelArn = props.reportModelId
      ? `arn:aws:bedrock:${props.kbRegion}:${this.account}:inference-profile/${props.reportModelId}`
      : "";
    // A cross-region inference profile routes the actual InvokeModel call to one of several
    // regional foundation-model ARNs -- callers need InvokeModel permission on those too,
    // not just on the inference-profile ARN itself.
    const foundationModelArn = (modelId: string) =>
      `arn:aws:bedrock:*::foundation-model/${modelId.replace(/^(us|eu|apac|global)\./, "")}`;

    // --- Auth: single-user Cognito pool -------------------------------------------------
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Single-user personal project: safe to destroy/recreate during iteration.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const domainPrefix = `golf-insights-${this.account}`;
    const domain = userPool.addDomain("UserPoolDomain", {
      cognitoDomain: { domainPrefix },
    });

    const userPoolClient = userPool.addClient("SpaClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
    });

    if (props.ownerEmail) {
      // Manually provisioned single user; self-service sign-up is disabled.
      new cognito.CfnUserPoolUser(this, "OwnerUser", {
        userPoolId: userPool.userPoolId,
        username: props.ownerEmail,
        userAttributes: [
          { name: "email", value: props.ownerEmail },
          { name: "email_verified", value: "true" },
        ],
        desiredDeliveryMediums: ["EMAIL"],
      });
    }

    const authorizer = new HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] }
    );

    // --- Storage: generated one-pagers + index -------------------------------------------
    const reportsBucket = new s3.Bucket(this, "ReportsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const reportsTable = new dynamodb.Table(this, "ReportsIndexTable", {
      partitionKey: { name: "reportId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Lambdas --------------------------------------------------------------------------
    const commonBundling = {
      externalModules: ["@aws-sdk/*"],
      minify: true,
    };
    const runtime = Runtime.NODEJS_20_X;
    const timeout = Duration.seconds(30);

    const healthFn = new NodejsFunction(this, "HealthFn", {
      entry: path.join(SERVICES_ROOT, "health", "index.ts"),
      runtime,
      timeout: Duration.seconds(5),
      bundling: commonBundling,
    });

    const chatFn = new NodejsFunction(this, "ChatFn", {
      entry: path.join(SERVICES_ROOT, "chat", "index.ts"),
      runtime,
      timeout,
      bundling: commonBundling,
      environment: {
        KB_ID: props.kbId,
        KB_REGION: props.kbRegion,
        CHAT_MODEL_ARN: chatModelArn,
      },
    });
    chatFn.addToRolePolicy(
      new iam.PolicyStatement({
        // RetrieveAndGenerate performs a retrieval step internally, which is
        // authorized separately from the RetrieveAndGenerate action itself.
        actions: ["bedrock:RetrieveAndGenerate", "bedrock:Retrieve"],
        resources: [kbArn],
      })
    );
    if (chatModelArn) {
      chatFn.addToRolePolicy(
        new iam.PolicyStatement({
          // GetInferenceProfile is required when modelArn is a cross-region inference
          // profile -- Bedrock resolves it internally before invoking the underlying model.
          actions: [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "bedrock:GetInferenceProfile",
          ],
          resources: [chatModelArn, foundationModelArn(props.chatModelId)],
        })
      );
    }

    const generateReportFn = new NodejsFunction(this, "GenerateReportFn", {
      entry: path.join(SERVICES_ROOT, "generate-report", "index.ts"),
      runtime,
      timeout: Duration.seconds(60),
      bundling: commonBundling,
      environment: {
        KB_ID: props.kbId,
        KB_REGION: props.kbRegion,
        REPORT_MODEL_ARN: reportModelArn,
        REPORTS_BUCKET: reportsBucket.bucketName,
        REPORTS_TABLE: reportsTable.tableName,
      },
    });
    generateReportFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:Retrieve"],
        resources: [kbArn],
      })
    );
    if (reportModelArn) {
      generateReportFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeModel", "bedrock:GetInferenceProfile"],
          resources: [reportModelArn, foundationModelArn(props.reportModelId)],
        })
      );
    }
    reportsBucket.grantWrite(generateReportFn);
    reportsTable.grantWriteData(generateReportFn);

    const golfDataBucket = s3.Bucket.fromBucketName(this, "GolfDataBucket", props.golfDataBucket);

    const seasonOverviewFn = new NodejsFunction(this, "SeasonOverviewFn", {
      entry: path.join(SERVICES_ROOT, "season-overview", "index.ts"),
      runtime,
      // Reads and parses every 2025 tournament CSV in the bucket, then a Bedrock call --
      // slower than the other routes, so it gets a longer timeout.
      timeout: Duration.seconds(90),
      memorySize: 512,
      bundling: commonBundling,
      environment: {
        KB_REGION: props.kbRegion,
        REPORT_MODEL_ARN: reportModelArn,
        REPORTS_BUCKET: reportsBucket.bucketName,
        REPORTS_TABLE: reportsTable.tableName,
        GOLF_DATA_BUCKET: props.golfDataBucket,
      },
    });
    golfDataBucket.grantRead(seasonOverviewFn);
    if (reportModelArn) {
      seasonOverviewFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeModel", "bedrock:GetInferenceProfile"],
          resources: [reportModelArn, foundationModelArn(props.reportModelId)],
        })
      );
    }
    reportsBucket.grantWrite(seasonOverviewFn);
    reportsTable.grantWriteData(seasonOverviewFn);

    const listReportsFn = new NodejsFunction(this, "ListReportsFn", {
      entry: path.join(SERVICES_ROOT, "list-reports", "index.ts"),
      runtime,
      timeout,
      bundling: commonBundling,
      environment: { REPORTS_TABLE: reportsTable.tableName },
    });
    reportsTable.grantReadData(listReportsFn);

    const getReportFn = new NodejsFunction(this, "GetReportFn", {
      entry: path.join(SERVICES_ROOT, "get-report", "index.ts"),
      runtime,
      timeout,
      bundling: commonBundling,
      environment: {
        REPORTS_BUCKET: reportsBucket.bucketName,
        REPORTS_TABLE: reportsTable.tableName,
      },
    });
    reportsBucket.grantRead(getReportFn);
    reportsTable.grantReadData(getReportFn);

    // --- HTTP API ---------------------------------------------------------------------------
    // CORS origins must match the browser's Origin header exactly (no trailing slash),
    // whereas callbackUrls/logoutUrls are full redirect URIs and do have a trailing slash.
    const corsOrigins = props.callbackUrls.map((url) => url.replace(/\/$/, ""));
    const httpApi = new HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: corsOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    httpApi.addRoutes({
      path: "/health",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("HealthIntegration", healthFn),
    });

    httpApi.addRoutes({
      path: "/chat",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("ChatIntegration", chatFn),
      authorizer,
    });

    httpApi.addRoutes({
      path: "/reports",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("GenerateReportIntegration", generateReportFn),
      authorizer,
    });

    httpApi.addRoutes({
      path: "/reports",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ListReportsIntegration", listReportsFn),
      authorizer,
    });

    httpApi.addRoutes({
      path: "/reports/{id}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetReportIntegration", getReportFn),
      authorizer,
    });

    httpApi.addRoutes({
      path: "/season-overview",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("SeasonOverviewIntegration", seasonOverviewFn),
      authorizer,
    });

    this.httpApiUrl = httpApi.apiEndpoint;
    this.userPoolId = userPool.userPoolId;
    this.userPoolClientId = userPoolClient.userPoolClientId;
    this.cognitoDomain = domain.baseUrl();

    new CfnOutput(this, "HttpApiUrlOutput", { value: this.httpApiUrl });
    new CfnOutput(this, "UserPoolIdOutput", { value: this.userPoolId });
    new CfnOutput(this, "UserPoolClientIdOutput", { value: this.userPoolClientId });
    new CfnOutput(this, "CognitoDomainOutput", { value: this.cognitoDomain });
  }
}
