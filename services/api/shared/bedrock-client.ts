import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  RetrieveCommand,
  type RetrievalResultLocation,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export interface ChatResult {
  answer: string;
  citations: { text?: string; location?: RetrievalResultLocation }[];
  sessionId?: string;
}

export async function retrieveAndGenerate(params: {
  region: string;
  kbId: string;
  modelArn: string;
  query: string;
  sessionId?: string;
}): Promise<ChatResult> {
  const client = new BedrockAgentRuntimeClient({ region: params.region });
  const res = await client.send(
    new RetrieveAndGenerateCommand({
      input: { text: params.query },
      sessionId: params.sessionId,
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: params.kbId,
          modelArn: params.modelArn,
        },
      },
    })
  );

  const citations = (res.citations ?? []).flatMap((c) =>
    (c.retrievedReferences ?? []).map((ref) => ({
      text: ref.content?.text,
      location: ref.location,
    }))
  );

  return {
    answer: res.output?.text ?? "",
    citations,
    sessionId: res.sessionId,
  };
}

export interface RetrievedChunk {
  text: string;
  location?: RetrievalResultLocation;
  score?: number;
}

export async function retrieve(params: {
  region: string;
  kbId: string;
  query: string;
  maxResults?: number;
}): Promise<RetrievedChunk[]> {
  const client = new BedrockAgentRuntimeClient({ region: params.region });
  const res = await client.send(
    new RetrieveCommand({
      knowledgeBaseId: params.kbId,
      retrievalQuery: { text: params.query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: params.maxResults ?? 10 },
      },
    })
  );

  return (res.retrievalResults ?? []).map((r) => ({
    text: r.content?.text ?? "",
    location: r.location,
    score: r.score,
  }));
}

export async function converse(params: {
  region: string;
  modelArn: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<string> {
  const client = new BedrockRuntimeClient({ region: params.region });
  const res = await client.send(
    new ConverseCommand({
      modelId: params.modelArn,
      system: [{ text: params.systemPrompt }],
      messages: [{ role: "user", content: [{ text: params.userMessage }] }],
    })
  );

  const content = res.output?.message?.content ?? [];
  return content
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}
