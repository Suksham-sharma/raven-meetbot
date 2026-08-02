"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { timecode } from "@/lib/speaker";

/** Mirrors agent_actions.status exactly. `failed` is retryable server-side. */
export type ProposalStatus = "proposed" | "executing" | "executed" | "failed" | "rejected";

export interface Proposal {
  id: number;
  kind: "linear_issue" | "slack_message";
  title: string;
  target?: string;
  owner?: string | null;
  /** Free text from the transcript, never a date. Render as a string. */
  due?: string | null;
  reason?: string;
  evidenceSpeaker?: string;
  evidenceAt?: number;
  status: ProposalStatus;
  result?: { url?: string; externalId?: string; error?: string };
}

/**
 * DESIGN.md: a proposal renders as the artifact it will become, not as a
 * description of it. The user should be evaluating the output, not the intent.
 *
 * Actions are deliberately unequal: Approve is solid and irreversible, Edit is
 * outline, Dismiss is text. Symmetric buttons cause misclicks on the one action
 * that cannot be undone.
 */
export function ProposalCard({
  proposal,
  onApprove,
  onEdit,
  onDismiss,
  onRetry,
}: {
  proposal: Proposal;
  onApprove?: () => void;
  onEdit?: () => void;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  const { status } = proposal;
  const settled = status === "executed" || status === "rejected";

  return (
    <div
      className={cn(
        "rounded-xl p-6 transition-colors duration-200 ease-out",
        status === "failed"
          ? "bg-live-tint"
          : settled
            ? "border border-rule-lo bg-paper"
            : "bg-accent-tint",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[13px] text-ink-2">{kindLabel(proposal)}</p>
        {status === "executed" && (
          <Pill tone="good" size="sm" className="ml-auto">
            {proposal.result?.externalId ?? "Done"}
          </Pill>
        )}
        {status === "rejected" && (
          <Pill tone="bare" size="sm" className="ml-auto">
            Dismissed
          </Pill>
        )}
        {status === "failed" && (
          <Pill tone="live" size="sm" className="ml-auto">
            Couldn&rsquo;t file it
          </Pill>
        )}
      </div>

      <p
        className={cn(
          "mb-3 font-serif text-[21px] leading-[1.25] tracking-[-0.012em] text-balance",
          settled && "text-ink-3",
          status === "rejected" && "line-through decoration-ink-4/50",
        )}
      >
        {proposal.title}
      </p>

      {proposal.reason && !settled && (
        <p className="mb-5 text-[13px] text-ink-2">
          {proposal.reason}
          {proposal.evidenceAt != null && (
            <>
              {` — because of what ${proposal.evidenceSpeaker ?? "they"} said at `}
              <span className="font-mono text-accent">
                {timecode(proposal.evidenceAt)}
              </span>
            </>
          )}
        </p>
      )}

      {/* Failure stays visible. A toast that scrolls away is not a record. */}
      {status === "failed" && proposal.result?.error && (
        <p className="mb-5 rounded-md bg-white/60 px-3.5 py-2.5 text-[13px] text-ink-2">
          {proposal.result.error}
        </p>
      )}

      {status === "proposed" && (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onApprove}>
            Approve
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            Edit first
          </Button>
          <Button variant="quiet" className="ml-auto" onClick={onDismiss}>
            Not this one
          </Button>
        </div>
      )}

      {status === "executing" && (
        <Button variant="primary" loading>
          Filing it
        </Button>
      )}

      {status === "failed" && (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="quiet" className="ml-auto" onClick={onDismiss}>
            Give up on this
          </Button>
        </div>
      )}

      {status === "executed" && proposal.result?.url && (
        <a
          href={proposal.result.url}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
        >
          Open in Linear
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 2h6v6M10 2 3 9" />
          </svg>
        </a>
      )}
    </div>
  );
}

function kindLabel(p: Proposal): string {
  if (p.kind === "linear_issue") {
    return p.target
      ? `Raven wants to file a Linear issue in ${p.target}`
      : "Raven wants to file a Linear issue";
  }
  return "Raven wants to post a recap to Slack";
}
