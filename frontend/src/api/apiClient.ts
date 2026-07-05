import { loadRuntimeConfig } from "../runtimeConfig";

export interface Citation {
  text?: string;
  location?: unknown;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  sessionId?: string;
}

export interface ReportSummary {
  reportId: string;
  topic: string;
  generatedAt: string;
}

export interface ReportDetail extends ReportSummary {
  s3Key: string;
  model: string;
  body: string;
}

async function request<T>(path: string, idToken: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = await loadRuntimeConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request to ${path} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export function sendChatMessage(
  idToken: string,
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  return request<ChatResponse>("/chat", idToken, {
    method: "POST",
    body: JSON.stringify({ message, sessionId }),
  });
}

export function generateReport(idToken: string, topic: string): Promise<ReportDetail> {
  return request<ReportDetail>("/reports", idToken, {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

export function listReports(idToken: string): Promise<ReportSummary[]> {
  return request<ReportSummary[]>("/reports", idToken);
}

export function getReport(idToken: string, reportId: string): Promise<ReportDetail> {
  return request<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`, idToken);
}
