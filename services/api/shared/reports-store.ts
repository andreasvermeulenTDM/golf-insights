import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

export interface ReportRecord {
  reportId: string;
  topic: string;
  s3Key: string;
  generatedAt: string;
  model: string;
}

export async function saveReport(
  tableName: string,
  bucketName: string,
  record: ReportRecord,
  body: string
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: record.s3Key,
      Body: body,
      ContentType: "text/markdown",
    })
  );
  await ddbClient.send(new PutCommand({ TableName: tableName, Item: record }));
}

export async function getReportRecord(
  tableName: string,
  reportId: string
): Promise<ReportRecord | undefined> {
  const res = await ddbClient.send(
    new GetCommand({ TableName: tableName, Key: { reportId } })
  );
  return res.Item as ReportRecord | undefined;
}

export async function getReportBody(bucketName: string, s3Key: string): Promise<string> {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
  return (await res.Body?.transformToString()) ?? "";
}

export async function listReportRecords(tableName: string): Promise<ReportRecord[]> {
  // Personal-scale app (low item count) -- a full scan is simple and fast enough.
  // Revisit with a GSI on generatedAt if the catalog grows large.
  const res = await ddbClient.send(new ScanCommand({ TableName: tableName }));
  const items = (res.Items ?? []) as ReportRecord[];
  return items.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
