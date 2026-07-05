import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getReportRecord, getReportBody } from "../shared/reports-store";

const REPORTS_BUCKET = process.env.REPORTS_BUCKET!;
const REPORTS_TABLE = process.env.REPORTS_TABLE!;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const reportId = event.pathParameters?.id;
  if (!reportId) {
    return jsonResponse(400, { error: "Missing report id in path." });
  }

  const record = await getReportRecord(REPORTS_TABLE, reportId);
  if (!record) {
    return jsonResponse(404, { error: `No report found with id "${reportId}".` });
  }

  const body = await getReportBody(REPORTS_BUCKET, record.s3Key);
  return jsonResponse(200, { ...record, body });
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
