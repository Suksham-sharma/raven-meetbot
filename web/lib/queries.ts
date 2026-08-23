"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { CalendarMode, CalendarResponse, OpenAction } from "./types";

export const keys = {
  session: ["session"] as const,
  calendar: ["calendar"] as const,
  upcoming: ["calendar", "upcoming"] as const,
  bots: ["bots"] as const,
  meetings: ["meetings"] as const,
  actionItems: ["action-items"] as const,
  meeting: (id: string) => ["meeting", id] as const,
  meetingActions: (id: string) => ["meeting-actions", id] as const,
  transcript: (id: string) => ["transcript", id] as const,
  recording: (id: string) => ["recording", id] as const,
  botStatus: (id: string) => ["bot-status", id] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: api.me,
    staleTime: 5 * 60_000,
  });
}

// Liveness comes from the queue, never from the bot's own status vocabulary:
// that vocabulary has grown twice ("alone_detected" mid-record, "complete"
// after "ended") and every guess at it has been wrong in one direction or the
// other. BullMQ knows whether the job is still running.
const FINISHED_QUEUE_STATES = new Set(["completed", "failed", "unknown"]);

export function useActiveBots() {
  const { data: session } = useSession();

  const query = useQuery({
    queryKey: keys.bots,
    queryFn: api.bots,
    enabled: Boolean(session),
    staleTime: 0,
    refetchInterval: 5_000,
  });

  const active = (query.data?.bots ?? []).filter(
    (b) => !FINISHED_QUEUE_STATES.has(b.queueState),
  );

  return { ...query, active };
}

export function useStopBot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => api.stopBot(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.bots });
      queryClient.invalidateQueries({ queryKey: keys.meetings });
      queryClient.invalidateQueries({ queryKey: keys.upcoming });
    },
  });
}

export function useUpcoming() {
  const { data: session } = useSession();

  return useQuery({
    queryKey: keys.upcoming,
    queryFn: api.upcoming,
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

export function useCalendar() {
  const { data: session } = useSession();

  return useQuery({
    queryKey: keys.calendar,
    queryFn: api.calendar,
    enabled: Boolean(session),
  });
}

export function useUpdateCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mode: CalendarMode) => api.updateCalendar(mode),
    onSuccess: ({ calendar }) => {
      queryClient.setQueryData<CalendarResponse>(keys.calendar, (current) =>
        current?.calendar
          ? { calendar: { ...current.calendar, mode: calendar.mode } }
          : current,
      );
    },
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.disconnectCalendar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.calendar }),
  });
}

export function useSyncCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.syncCalendar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.calendar }),
  });
}

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

export function useActionItems(limit = 12) {
  const { data: session } = useSession();

  return useQuery({
    queryKey: [...keys.actionItems, limit],
    queryFn: () => api.actionItems({ limit }),
    enabled: Boolean(session),
  });
}

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

export function useMeetingActions(id: string) {
  return useQuery({
    queryKey: keys.meetingActions(id),
    queryFn: () => api.meetingActions(id),
    enabled: Boolean(id),
  });
}

export function useApproveAction(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.approveAction(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.meetingActions(meetingId) }),
  });
}

export function useRejectAction(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.rejectAction(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: keys.meetingActions(meetingId) }),
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

export function useJoinMeet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ url, botName }: { url: string; botName?: string }) => api.joinMeet(url, botName),
    onSuccess: ({ jobId }, { url, botName }) => {
      queryClient.setQueryData(keys.botStatus(jobId), {
        jobId,
        status: "queued",
        meetingUrl: url,
        botName: botName ?? "Raven",
        timeline: [],
      });
    },
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
    queryKey: keys.botStatus(jobId),
    queryFn: () => api.botStatus(jobId),
    enabled: Boolean(jobId) && enabled,
    refetchInterval: enabled ? 3000 : false,
    retry: false,
  });
}
