# golf-insights

A chat + one-pager-report app on AWS backed by an **existing** Bedrock Knowledge Base
(`SWP1IYS4SI`, region `us-east-2`) that already contains golf data. This project does
not ingest or manage that KB's data — it only reads from it.

## Layout

- `infra/` — AWS CDK (TypeScript) app. `ApiStack` (Cognito, API Gateway, Lambdas, S3,
  DynamoDB) and `FrontendStack` (S3 + CloudFront static hosting for the SPA).
- `services/api/` — Lambda handler source, bundled by `NodejsFunction` (esbuild) at
  synth time — no separate manual build step needed for Lambda code.
- `frontend/` — Vite + React + TypeScript SPA.
- `scripts/` — one-off operational scripts (e.g. seeding the single Cognito user).

## Key facts

- Bedrock KB ID: `SWP1IYS4SI`, region `us-east-2`. Referenced by ARN in IAM policies;
  never created/modified by this repo's CDK.
- Chat and report generation use Claude models via **cross-region inference profile
  IDs**, not bare model IDs — most current Claude models on Bedrock require this.
  Configured via CDK context (`chatModelId`, `reportModelId` in `cdk.json` or `-c`
  flags) as just the profile ID (e.g. `us.anthropic.claude-opus-4-6-v1`); `ApiStack`
  builds the full ARN at synth time from account+region so the account ID never has
  to live in committed config. Both are currently set to Claude Opus 4.6, verified
  working (model access enabled) in this account as of 2026-07-05.
- Single-user app: one Cognito user, provisioned manually (see `scripts/seed-cognito-user.ts`),
  self-service sign-up disabled.
- No deployment has happened yet as of this writing — AWS credentials are not yet
  configured on the dev machine. `cdk synth` works without credentials; `cdk deploy`
  does not.

## Conventions

- Lambda handlers: one `index.ts` per route under `services/api/<route-name>/`,
  shared code in `services/api/shared/`.
- IAM: grant the narrowest possible resource-scoped permissions (specific KB ARN,
  specific inference-profile ARNs) — never `bedrock:*` or `resource: "*"`.
