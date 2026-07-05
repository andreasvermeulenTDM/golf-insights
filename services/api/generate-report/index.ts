import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { retrieve, converse } from "../shared/bedrock-client";
import { ONE_PAGER_SYSTEM_PROMPT, buildOnePagerUserMessage } from "../shared/prompt-templates";
import { saveReport } from "../shared/reports-store";

const KB_ID = process.env.KB_ID!;
const KB_REGION = process.env.KB_REGION!;
const REPORT_MODEL_ARN = process.env.REPORT_MODEL_ARN!;
const REPORTS_BUCKET = process.env.REPORTS_BUCKET!;
const REPORTS_TABLE = process.env.REPORTS_TABLE!;

interface GenerateReportBody {
  topic?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!REPORT_MODEL_ARN) {
    return jsonResponse(500, {
      error:
        "REPORT_MODEL_ARN is not configured. Set the reportModelArn CDK context value (see Phase 0 in the project plan) and redeploy.",
    });
  }

  let body: GenerateReportBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return jsonResponse(400, { error: "Body must include a non-empty 'topic' string." });
  }

  const chunks = await retrieve({ region: KB_REGION, kbId: KB_ID, query: topic, maxResults: 15 });
  if (chunks.length === 0) {
    return jsonResponse(404, {
      error: `No knowledge base content found for topic "${topic}".`,
    });
  }

  const reportBody = await converse({
    region: KB_REGION,
    modelArn: REPORT_MODEL_ARN,
    systemPrompt: ONE_PAGER_SYSTEM_PROMPT,
    userMessage: buildOnePagerUserMessage(
      topic,
      chunks.map((c) => c.text)
    ),
  });

  const reportId = randomUUID();
  const record = {
    reportId,
    topic,
    s3Key: `reports/${reportId}.md`,
    generatedAt: new Date().toISOString(),
    model: REPORT_MODEL_ARN,
  };

  await saveReport(REPORTS_TABLE, REPORTS_BUCKET, record, reportBody);

  return jsonResponse(201, { ...record, body: reportBody });
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
