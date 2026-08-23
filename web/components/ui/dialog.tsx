"use client";

import * as React from "react";
import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const BACKDROP = cn(
  "fixed inset-0 z-40 min-h-dvh bg-ink-1/25 backdrop-blur-[1px]",
  "transition-opacity duration-150 ease-out",
  "data-starting-style:opacity-0 data-ending-style:opacity-0",
);

const POPUP = cn(
  "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
  "flex w-[27rem] max-w-[calc(100vw-2rem)] flex-col",
  "rounded-xl border border-rule bg-paper shadow-e3 outline-none",
  "transition-[scale,opacity] duration-150 ease-out",
  "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
);

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange}>
      <Base.Portal>
        <Base.Backdrop className={BACKDROP} />
        <Base.Popup className={cn(POPUP, className)}>
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div className="min-w-0">
              <Base.Title className="font-serif text-[21px] leading-tight font-normal tracking-[-0.012em]">
                {title}
              </Base.Title>
              {description && (
                <Base.Description className="mt-1 text-[13px] text-ink-3">
                  {description}
                </Base.Description>
              )}
            </div>
            <Base.Close
              aria-label="Close"
              className={cn(
                "-mr-1.5 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm text-ink-3",
                "transition-colors duration-150 hover:bg-card hover:text-ink-1",
              )}
            >
              <X size={15} />
            </Base.Close>
          </div>

          <div className="px-6 pb-6">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-rule-lo px-6 py-4">
              {footer}
            </div>
          )}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

export const DialogClose = Base.Close;
