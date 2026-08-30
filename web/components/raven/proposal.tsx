"use client";

import * as React from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { timecode } from "@/lib/speaker";

export type ProposalStatus = "proposed" | "executing" | "executed" | "failed" | "rejected";

export interface Proposal {
  id: number;
  kind: "linear_issue" | "slack_message";
  title: string;
  target?: string;
  owner?: string | null;
  due?: string | null;
  reason?: string;
  evidenceSpeaker?: string;
  evidenceAt?: number;
  status: ProposalStatus;
  result?: { url?: string; externalId?: string; error?: string };
}

export function ProposalCard({
  proposal,
  onApprove,
  onPlayMoment,
  onDismiss,
  onRetry,
  onCancel,
}: {
  proposal: Proposal;
  onApprove?: () => void;
  onPlayMoment?: () => void;
  onDismiss?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
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
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] text-ink-2">{kindLabel(proposal)}</p>
        {status === "executed" && (
          <Pill tone="good" size="sm" className="shrink-0">
            {proposal.result?.externalId ?? "Done"}
          </Pill>
        )}
        {status === "rejected" && (
          <Pill tone="bare" size="sm" className="shrink-0">
            Dismissed
          </Pill>
        )}
        {status === "failed" && (
          <Pill tone="live" size="sm" className="shrink-0">
            Didn&rsquo;t go through
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

      {/* Provenance survives the decision. "Why was this filed?" is a question
          you ask about the thing that already got filed. */}
      {proposal.reason && (
        <p
          className={cn(
            "mb-5 text-[13px]",
            settled ? "text-ink-3" : "text-ink-2",
          )}
        >
          {proposal.reason}
          {proposal.evidenceAt != null && (
            <>
              {` — because of what ${proposal.evidenceSpeaker ?? "they"} said at `}
              <span className={cn("font-mono", settled ? "" : "text-accent")}>
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
          {onPlayMoment && (
            <Button variant="secondary" onClick={onPlayMoment}>
              Play the moment
            </Button>
          )}
          <Button variant="quiet" className="ml-auto" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "executing" && (
        <div className="flex items-center gap-2">
          <Button variant="primary" loading>
            {proposal.kind === "linear_issue" ? "Filing it" : "Posting it"}
          </Button>
          {onCancel && (
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {status === "failed" && (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="quiet" className="ml-auto" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "executed" && proposal.result?.url && (
        <a
          href={proposal.result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
        >
          {proposal.kind === "linear_issue" ? "Open in Linear" : "Open in Slack"}
          <ArrowUpRight size={14} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

const KIND = {
  linear_issue: { present: "file", past: "filed" },
  slack_message: { present: "post", past: "posted" },
} as const;

function kindLabel(p: Proposal): string {
  const what =
    p.kind === "linear_issue"
      ? p.target
        ? `a Linear issue in ${p.target}`
        : "a Linear issue"
      : "a recap to Slack";
  const { present, past } = KIND[p.kind];

  switch (p.status) {
    case "executed":
      return `${capitalize(past)} ${what}`;
    case "rejected":
      return `Would have ${past} ${what}`;
    default:
      return `${capitalize(present)} ${what}`;
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
