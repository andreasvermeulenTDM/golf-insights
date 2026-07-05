import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { listReportRecords } from "../shared/reports-store";

const REPORTS_TABLE = process.env.REPORTS_TABLE!;

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const records = await listReportRecords(REPORTS_TABLE);
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      records.map(({ reportId, topic, generatedAt }) => ({ reportId, topic, generatedAt }))
    ),
  };
};
