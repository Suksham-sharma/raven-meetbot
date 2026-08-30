"use client";

import { ProposalCard, type Proposal } from "./proposal";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { useApproveAction, useRejectAction } from "@/lib/queries";
import type { AgentAction } from "@/lib/types";

export function Proposals({
  meetingId,
  actions,
  onEvidence,
}: {
  meetingId: string;
  actions: AgentAction[];
  onEvidence?: (startS: number) => void;
}) {
  const approve = useApproveAction(meetingId);
  const reject = useRejectAction(meetingId);

  if (actions.length === 0) return null;

  function onApprove(a: AgentAction) {
    approve.mutate(a.id, {
      onSuccess: (res) => {
        if (res.dry_run) {
          toast("Dry run — nothing was sent.", {
            description: "Turn off AGENT_DRY_RUN to execute for real.",
          });
          return;
        }
        toast.success(`${kindNoun(a.kind)} created.`, {
          description: res.action.result?.url ?? res.action.result?.externalId,
        });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.reason === "not_connected") {
          toast.error(`${integrationName(a.kind)} is not connected yet.`, {
            description: "Connect it in Settings, then approve this again.",
          });
          return;
        }
        toast.error(`Couldn't create the ${kindNoun(a.kind).toLowerCase()}.`, {
          description: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  function onDismiss(a: AgentAction) {
    reject.mutate(a.id, {
      onSuccess: () => toast("Dismissed.", { description: a.title }),
      onError: (error) =>
        toast.error("Couldn't dismiss that.", {
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {actions.map((a) => (
        <ProposalCard
          key={a.id}
          proposal={toProposal(a)}
          onApprove={
            a.status === "proposed" ? () => onApprove(a) : undefined
          }
          onDismiss={
            a.status === "proposed" ? () => onDismiss(a) : undefined
          }
          onRetry={a.status === "failed" ? () => onApprove(a) : undefined}
          onPlayMoment={
            a.evidence?.start_s != null && onEvidence
              ? () => onEvidence(a.evidence!.start_s!)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function toProposal(a: AgentAction): Proposal {
  const payload = a.payload as {
    assignee?: string;
    owner?: string;
    due?: string;
    team?: string;
    channel?: string;
  };

  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    target: payload.team ?? payload.channel,
    owner: payload.assignee ?? payload.owner ?? null,
    due: payload.due ?? null,
    reason: a.reasoning ?? undefined,
    evidenceAt: a.evidence?.start_s ?? undefined,
    status: a.status,
    result: a.result ?? undefined,
  };
}

function kindNoun(kind: AgentAction["kind"]): string {
  return kind === "linear_issue" ? "Linear issue" : "Slack message";
}

function integrationName(kind: AgentAction["kind"]): string {
  return kind === "linear_issue" ? "Linear" : "Slack";
}
