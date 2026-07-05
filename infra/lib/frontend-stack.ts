import * as path from "path";
import { Stack, StackProps, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

export interface FrontendStackProps extends StackProps {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // SPA routing: unknown paths fall back to index.html so client-side routing works.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    // Deploy the built SPA. Run `npm run build` in /frontend before `cdk deploy` here.
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "..", "..", "frontend", "dist")),
        // Runtime config, fetched by the SPA at startup (avoids baking deploy-time
        // values into the Vite build, which would create a build/deploy ordering problem).
        s3deploy.Source.jsonData("config.json", {
          apiUrl: props.apiUrl,
          userPoolId: props.userPoolId,
          userPoolClientId: props.userPoolClientId,
          cognitoDomain: props.cognitoDomain,
          region: this.region,
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "SiteUrlOutput", {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
