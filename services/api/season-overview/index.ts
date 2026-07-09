import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { converse } from "../shared/bedrock-client";
import { SEASON_OVERVIEW_SYSTEM_PROMPT, buildSeasonOverviewUserMessage } from "../shared/prompt-templates";
import { computeSeasonScores } from "../shared/season-score";
import { saveReport } from "../shared/reports-store";

const KB_REGION = process.env.KB_REGION!;
const REPORT_MODEL_ARN = process.env.REPORT_MODEL_ARN!;
const REPORTS_BUCKET = process.env.REPORTS_BUCKET!;
const REPORTS_TABLE = process.env.REPORTS_TABLE!;
const GOLF_DATA_BUCKET = process.env.GOLF_DATA_BUCKET!;

const SEASON_LABEL = "2025";
const TOP_N = 20;

export const handler: APIGatewayProxyHandlerV2 = async () => {
  if (!REPORT_MODEL_ARN) {
    return jsonResponse(500, {
      error:
        "REPORT_MODEL_ARN is not configured. Set the reportModelId CDK context value and redeploy.",
    });
  }

  const { golfers, eventFiles } = await computeSeasonScores(GOLF_DATA_BUCKET, SEASON_LABEL);
  if (golfers.length === 0) {
    return jsonResponse(404, {
      error: `No parseable ${SEASON_LABEL} tournament model CSVs found in ${GOLF_DATA_BUCKET}.`,
    });
  }

  const topGolfers = golfers.slice(0, TOP_N);

  const reportBody = await converse({
    region: KB_REGION,
    modelArn: REPORT_MODEL_ARN,
    systemPrompt: SEASON_OVERVIEW_SYSTEM_PROMPT,
    userMessage: buildSeasonOverviewUserMessage(SEASON_LABEL, eventFiles.length, topGolfers),
  });

  const reportId = randomUUID();
  const record = {
    reportId,
    topic: `${SEASON_LABEL} Season Overview`,
    s3Key: `reports/${reportId}.md`,
    generatedAt: new Date().toISOString(),
    model: REPORT_MODEL_ARN,
  };

  await saveReport(REPORTS_TABLE, REPORTS_BUCKET, record, reportBody);

  return jsonResponse(201, { ...record, body: reportBody, eventFilesConsidered: eventFiles.length });
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
