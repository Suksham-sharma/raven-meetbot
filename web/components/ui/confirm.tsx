"use client";

import * as React from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const BACKDROP = cn(
  "fixed inset-0 z-40 min-h-dvh bg-ink-1/25 backdrop-blur-[1px]",
  "transition-opacity duration-150 ease-out",
  "data-starting-style:opacity-0 data-ending-style:opacity-0",
);

const POPUP = cn(
  "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
  "flex w-[25rem] max-w-[calc(100vw-2rem)] flex-col gap-4",
  "rounded-xl border border-rule bg-paper p-6 shadow-e3 outline-none",
  "transition-[scale,opacity] duration-150 ease-out",
  "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
);

export function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={BACKDROP} />
        <AlertDialog.Popup className={POPUP}>
          <div>
            <AlertDialog.Title className="font-serif text-[21px] leading-tight font-normal tracking-[-0.012em]">
              {title}
            </AlertDialog.Title>
            {body && (
              <AlertDialog.Description className="mt-2 text-[14px] leading-relaxed text-ink-2">
                {body}
              </AlertDialog.Description>
            )}
          </div>

          {/* Cancel sits first and carries the weight: the confirm side of an
              irreversible action should never be the resting focus. */}
          <div className="flex items-center justify-end gap-2">
            <AlertDialog.Close
              render={<Button variant="secondary" size="sm" />}
              disabled={pending}
            >
              {cancelLabel}
            </AlertDialog.Close>
            <Button
              variant={destructive ? "danger" : "primary"}
              size="sm"
              loading={pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
