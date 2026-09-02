"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AllowanceReached, useAllowance } from "@/components/raven/allowance";
import { ApiError } from "@/lib/api";
import { useBotStatus, useJoinMeet } from "@/lib/queries";

export function JoinMeetingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = React.useState("");
  const [err, setErr] = React.useState("");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [reached, setReached] = React.useState(false);
  const join = useJoinMeet();
  const status = useBotStatus(jobId ?? "", Boolean(jobId));
  const allowance = useAllowance();
  const blocked = reached || Boolean(allowance?.exhausted);

  function reset() {
    setUrl("");
    setErr("");
    setJobId(null);
    setReached(false);
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!url.trim()) {
      setErr("Paste a Google Meet link");
      return;
    }
    try {
      const res = await join.mutateAsync({ url: url.trim() });
      setJobId(res.jobId);
    } catch (ex) {
      if (ex instanceof ApiError && ex.reason === "quota_exhausted") {
        setReached(true);
        return;
      }
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const latest = status.data?.timeline?.slice(-1)[0]?.state;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Join a meeting"
      description={
        jobId || blocked
          ? undefined
          : "Raven joins as a visible participant. Everyone in the call can see it."
      }
    >
      {blocked && !jobId ? (
        <AllowanceReached limit={allowance?.limit ?? 0} onDone={close} />
      ) : !jobId ? (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            label="Meet link"
            placeholder="https://meet.google.com/abc-defg-hij"
            error={err || undefined}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={join.isPending}
            >
              Dispatch bot
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[14.5px] text-ink-1">
              Raven is on its way in.
            </p>
            <p className="mt-1 text-[13px] text-ink-3">
              {status.data?.status ?? "queued"}
              {latest ? ` · ${latest}` : ""}
            </p>
          </div>

          {status.data?.timeline && status.data.timeline.length > 0 && (
            <ol className="flex flex-col gap-1.5 border-l border-rule-lo pl-3.5">
              {status.data.timeline.slice(-4).map((t) => (
                <li
                  key={t.timestamp}
                  className="flex items-baseline justify-between gap-3 text-[13px]"
                >
                  <span className="text-ink-2">{t.state}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-3">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {status.error && (
            <p className="text-[13px] text-live">
              {(status.error as Error).message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              Join another
            </Button>
            <Button variant="primary" size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
