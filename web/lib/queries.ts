"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { OpenAction } from "./types";

export const keys = {
  session: ["session"] as const,
  meetings: ["meetings"] as const,
  actionItems: ["action-items"] as const,
  meeting: (id: string) => ["meeting", id] as const,
  transcript: (id: string) => ["transcript", id] as const,
  recording: (id: string) => ["recording", id] as const,
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
export function useMeetings(filters: { q?: string; type?: string; participant?: string } = {}) {
  const { data: session } = useSession();
  const f = { q: filters.q || undefined, type: filters.type || undefined, participant: filters.participant || undefined };
  return useInfiniteQuery({
    queryKey: [...keys.meetings, f],
    queryFn: ({ pageParam }) => api.meetings({ before: pageParam, ...f }),
    enabled: Boolean(session),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before ?? undefined,
    select: (data) => ({
      meetings: data.pages.flatMap((p) => p.meetings),
      corpus: data.pages[0].corpus,
    }),
  });
}

// Session-gated for the same reason as useMeetings.
export function useActionItems(limit = 12) {
  const { data: session } = useSession();

  return useQuery({
    queryKey: [...keys.actionItems, limit],
    queryFn: () => api.actionItems({ limit }),
    enabled: Boolean(session),
  });
}

/**
 * Optimistic, because a checkbox that waits on a round trip feels broken —
 * this is the one control in the product a user clicks reflexively.
 *
 * The cache is patched in place rather than invalidated on success: the list is
 * ordered open-first server-side, so refetching would slide a row out from
 * under the cursor the instant it is ticked. It settles on the next natural
 * refetch instead.
 */
export function useToggleActionItem(limit = 12) {
  const queryClient = useQueryClient();
  const key = [...keys.actionItems, limit];

  return useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      api.setActionItemCompleted(id, completed),

    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ items: OpenAction[] }>(key);

      queryClient.setQueryData<{ items: OpenAction[] }>(key, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      completed_at: completed ? new Date().toISOString() : null,
                    }
                  : i,
              ),
            }
          : old,
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
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

/**
 * Polls while the media is still being made, so a meeting opened straight off a
 * call turns into a player on its own instead of needing a reload. A 409 is the
 * expected answer for the first minutes and must not be retried as a fault —
 * retry would burn the attempts and then surface it as an error.
 */
export function useRecording(id: string) {
  return useQuery({
    queryKey: keys.recording(id),
    queryFn: () => api.recording(id),
    enabled: Boolean(id),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
    refetchInterval: (q) =>
      q.state.error instanceof ApiError && q.state.error.status === 409
        ? 20_000
        : false,
    staleTime: 5 * 60_000,
  });
}

export function useRetryMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryMeeting(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: keys.meeting(id) });
      qc.invalidateQueries({ queryKey: keys.meetings });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meetings }),
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.updateMeeting(id, title),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: keys.meeting(v.id) });
      qc.invalidateQueries({ queryKey: keys.meetings });
    },
  });
}

export function usePlainSearch(q: string, opts: { speaker?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["plain-search", q, opts.speaker],
    queryFn: () => api.search({ q, speaker: opts.speaker }),
    enabled: Boolean(q) && (opts.enabled ?? true),
  });
}

export function useJoinMeet() {
  return useMutation({
    mutationFn: ({ url, botName }: { url: string; botName?: string }) => api.joinMeet(url, botName),
  });
}

export function useUploadMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => api.uploadMeeting(file, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meetings }),
  });
}

export function useBulkUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => api.bulkUpload(files),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meetings }),
  });
}

export function useBotStatus(jobId: string, enabled = true) {
  return useQuery({
    queryKey: ["bot-status", jobId],
    queryFn: () => api.botStatus(jobId),
    enabled: Boolean(jobId) && enabled,
    refetchInterval: enabled ? 3000 : false,
    retry: false,
  });
}
