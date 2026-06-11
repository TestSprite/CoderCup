'use client';

import useSWR from 'swr';
import {
  fetchJson,
  fetchJsonl,
  type LeaderboardJson,
  type AgentJson,
  type LiveEvent,
} from './api';

export function useLeaderboard() {
  return useSWR<LeaderboardJson>(
    '/leaderboard.json',
    (path: string) => fetchJson<LeaderboardJson>(path),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );
}

export function useAgent(slug: string) {
  return useSWR<AgentJson>(
    slug ? `/agents/${slug}.json` : null,
    (path: string) => fetchJson<AgentJson>(path),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );
}

export function useLiveReplay(runId: string, opts?: { pollingMs?: number }) {
  return useSWR<LiveEvent[]>(
    runId ? `/runs/${runId}/live.jsonl` : null,
    (path: string) => fetchJsonl<LiveEvent>(path),
    {
      refreshInterval: opts?.pollingMs ?? 3_000,
      revalidateOnFocus: false,
    },
  );
}
