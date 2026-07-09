#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

const kbId = app.node.tryGetContext("kbId") as string;
const kbRegion = app.node.tryGetContext("kbRegion") as string;
const golfDataBucket = app.node.tryGetContext("golfDataBucket") as string;
const chatModelId = app.node.tryGetContext("chatModelId") as string;
const reportModelId = app.node.tryGetContext("reportModelId") as string;
const callbackUrls = (app.node.tryGetContext("callbackUrls") as string[]) ?? [
  "http://localhost:5173/",
];
const logoutUrls = (app.node.tryGetContext("logoutUrls") as string[]) ?? [
  "http://localhost:5173/",
];
const ownerEmail = app.node.tryGetContext("ownerEmail") as string;

if (!kbId || !kbRegion) {
  throw new Error(
    "Missing required context: kbId and kbRegion must be set in cdk.json (or via -c)."
  );
}

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? kbRegion,
};

const apiStack = new ApiStack(app, "GolfInsightsApiStack", {
  env,
  kbId,
  kbRegion,
  golfDataBucket,
  chatModelId,
  reportModelId,
  callbackUrls,
  logoutUrls,
  ownerEmail,
});

new FrontendStack(app, "GolfInsightsFrontendStack", {
  env,
  apiUrl: apiStack.httpApiUrl,
  userPoolId: apiStack.userPoolId,
  userPoolClientId: apiStack.userPoolClientId,
  cognitoDomain: apiStack.cognitoDomain,
});
