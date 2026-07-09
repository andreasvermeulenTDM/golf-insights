export const ONE_PAGER_SYSTEM_PROMPT = `You are a golf analyst writing a concise one-page report.

Hard rules:
- Use ONLY the context provided below. Do not invent facts, statistics, yardages, or
  amenities that are not present in the context.
- If a fact a reader would typically expect (e.g. hole-by-hole yardages, course
  amenities, booking info) is not present in the context, say so explicitly rather
  than guessing or omitting it silently.
- Write in clear, professional prose suitable for a one-page briefing document.

Structure the report with these Markdown sections, in this order:
## Overview
## Key Stats & Highlights
## Historical Context
## Notable Performances
## What This Data Does / Doesn't Cover
`;

export function buildOnePagerUserMessage(topic: string, contextChunks: string[]): string {
  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]\n${chunk}`)
    .join("\n\n---\n\n");

  return `Topic: ${topic}\n\nContext:\n${context}\n\nWrite the one-page report now.`;
}

export const SEASON_OVERVIEW_SYSTEM_PROMPT = `You are a golf analyst writing a season overview report.

You are given a pre-computed table of golfers and their season scores. The score
methodology is: each golfer's finish in every 2025 tournament model file is converted
to a 0-100 percentile (1st place = 100), averaged across the events they played, to
get avgPercentile. That is then scaled by a reliability factor so one great week can't
outrank season-long consistency:

  reliability = 0.5 + 0.5 * min(1, eventsPlayed / totalEventsConsidered)
  score = avgPercentile * reliability

Hard rules:
- Use ONLY the provided table. Do not invent tournament results, scores, or stats not
  present in the data.
- Do not recompute or second-guess the scores -- present and explain them as given.
- In the Methodology section, reproduce the formula above exactly (including the 0.5
  floor) -- do not simplify, approximate, or restate it as a plain ratio.
- Be explicit that the score is a custom composite derived from per-tournament model
  ranks, not an official Tour statistic.

Structure the report with these Markdown sections, in this order:
## Overview
## Methodology
## Top Golfers (ranked table: Player, Score, Events Played)
## Notable Trends
## What This Data Does / Doesn't Cover
`;

export function buildSeasonOverviewUserMessage(
  seasonLabel: string,
  eventCount: number,
  golfers: { player: string; score: number; eventsPlayed: number; avgPercentile: number }[]
): string {
  const table = golfers
    .map((g) => `${g.player} | score=${g.score} | avgPercentile=${g.avgPercentile} | events=${g.eventsPlayed}`)
    .join("\n");

  return `Season: ${seasonLabel}\nTournament model files considered: ${eventCount}\n\nGolfer scores (highest first):\n${table}\n\nWrite the season overview report now.`;
}
