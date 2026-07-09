import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { parse } from "csv-parse/sync";

const s3Client = new S3Client({});

export interface GolferAggregate {
  player: string;
  score: number;
  avgPercentile: number;
  eventsPlayed: number;
  totalEventsConsidered: number;
  perEventRanks: { file: string; rank: number; fieldSize: number }[];
}

interface EventResult {
  file: string;
  rows: { player: string; rank: number }[];
}

function findColumnIndex(header: string[], candidates: string[]): number {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

async function parseEventFile(bucket: string, key: string): Promise<EventResult | undefined> {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await res.Body?.transformToString();
  if (!body) return undefined;

  const records = parse(body, { skip_empty_lines: true, relax_column_count: true }) as string[][];
  if (records.length < 2) return undefined;

  const header = records[0];
  const playerIdx = findColumnIndex(header, ["PlayerName", "Player", "Name"]);
  const rankIdx = findColumnIndex(header, ["Rank"]);
  if (playerIdx === -1 || rankIdx === -1) return undefined;

  const rows: { player: string; rank: number }[] = [];
  for (const row of records.slice(1)) {
    const player = row[playerIdx]?.trim();
    const rank = Number(row[rankIdx]);
    if (player && Number.isFinite(rank) && rank > 0) {
      rows.push({ player, rank });
    }
  }
  if (rows.length === 0) return undefined;
  return { file: key, rows };
}

/**
 * Score methodology (agreed with user): for each 2025 tournament model file, a golfer's
 * rank in that file is converted to a 0-100 percentile (1st place = 100, last = 0). A
 * golfer's raw average percentile across every event they appear in is then scaled by
 * how many of the season's events they actually played, so a single great week can't
 * outrank season-long consistency: reliability = 0.5 + 0.5 * min(1, eventsPlayed / totalEvents).
 */
export async function computeSeasonScores(
  bucket: string,
  filenameMustInclude: string
): Promise<{ golfers: GolferAggregate[]; eventFiles: string[] }> {
  const listRes = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket }));
  const keys = (listRes.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter((key) => key.toLowerCase().endsWith(".csv") && key.includes(filenameMustInclude));

  const events = (await Promise.all(keys.map((key) => parseEventFile(bucket, key)))).filter(
    (e): e is EventResult => e !== undefined
  );

  const totalEvents = events.length;
  const byPlayer = new Map<string, { file: string; rank: number; fieldSize: number }[]>();

  for (const event of events) {
    const fieldSize = event.rows.length;
    for (const row of event.rows) {
      const list = byPlayer.get(row.player) ?? [];
      list.push({ file: event.file, rank: row.rank, fieldSize });
      byPlayer.set(row.player, list);
    }
  }

  const golfers: GolferAggregate[] = [];
  for (const [player, perEventRanks] of byPlayer) {
    const percentiles = perEventRanks.map(({ rank, fieldSize }) =>
      fieldSize > 1 ? (100 * (fieldSize - rank)) / (fieldSize - 1) : 100
    );
    const avgPercentile = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
    const eventsPlayed = perEventRanks.length;
    const reliability = 0.5 + 0.5 * Math.min(1, eventsPlayed / Math.max(totalEvents, 1));
    const score = avgPercentile * reliability;

    golfers.push({
      player,
      score: Math.round(score * 10) / 10,
      avgPercentile: Math.round(avgPercentile * 10) / 10,
      eventsPlayed,
      totalEventsConsidered: totalEvents,
      perEventRanks,
    });
  }

  golfers.sort((a, b) => b.score - a.score);
  return { golfers, eventFiles: keys };
}
