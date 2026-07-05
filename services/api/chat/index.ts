import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { retrieveAndGenerate } from "../shared/bedrock-client";

const KB_ID = process.env.KB_ID!;
const KB_REGION = process.env.KB_REGION!;
const CHAT_MODEL_ARN = process.env.CHAT_MODEL_ARN!;

interface ChatRequestBody {
  message?: string;
  sessionId?: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!CHAT_MODEL_ARN) {
    return jsonResponse(500, {
      error:
        "CHAT_MODEL_ARN is not configured. Set the chatModelArn CDK context value (see Phase 0 in the project plan) and redeploy.",
    });
  }

  let body: ChatRequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return jsonResponse(400, { error: "Body must include a non-empty 'message' string." });
  }

  const result = await retrieveAndGenerate({
    region: KB_REGION,
    kbId: KB_ID,
    modelArn: CHAT_MODEL_ARN,
    query: body.message,
    sessionId: body.sessionId,
  });

  return jsonResponse(200, {
    answer: result.answer,
    citations: result.citations,
    sessionId: result.sessionId,
  });
};

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
