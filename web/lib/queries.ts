"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const keys = {
  session: ["session"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meeting", id] as const,
  transcript: (id: string) => ["transcript", id] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: api.me,
    staleTime: 5 * 60_000,
  });
}

// Gated on the session rather than on where it is mounted: relying on the
// component tree to hold it back 401s on the way to the login redirect, and
// caches that error. This has regressed once already.
export function useMeetings() {
  const { data: session } = useSession();

  return useInfiniteQuery({
    queryKey: keys.meetings,
    queryFn: ({ pageParam }) => api.meetings({ before: pageParam }),
    enabled: Boolean(session),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before ?? undefined,
    select: (data) => ({
      meetings: data.pages.flatMap((p) => p.meetings),
      corpus: data.pages[0].corpus,
    }),
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: keys.meeting(id),
    queryFn: () => api.meeting(id),
    enabled: Boolean(id),
  });
}

export function useTranscript(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.transcript(id),
    queryFn: () => api.transcript(id),
    enabled: enabled && Boolean(id),
    staleTime: Infinity,
  });
}
