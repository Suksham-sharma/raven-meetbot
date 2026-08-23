"use client";

import * as React from "react";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const BACKDROP = cn(
  "fixed inset-0 z-40 min-h-dvh bg-ink-1/25",
  "opacity-[calc(1-var(--drawer-swipe-progress))]",
  "transition-opacity duration-300 ease-out data-swiping:duration-0",
  "data-starting-style:opacity-0 data-ending-style:opacity-0",
);

const POPUP = cn(
  "h-full w-[30rem] max-w-[calc(100vw-3rem)] overflow-y-auto overscroll-contain",
  "border-l border-rule bg-paper shadow-e3 outline-none",
  "[transform:translateX(var(--drawer-swipe-movement-x))]",
  "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
  "data-starting-style:[transform:translateX(100%)]",
  "data-ending-style:[transform:translateX(100%)]",
);

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <Drawer.Portal>
        <Drawer.Backdrop className={BACKDROP} />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-stretch justify-end">
          <Drawer.Popup className={POPUP}>
            <Drawer.Content className="flex min-h-full flex-col px-7 py-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Drawer.Title className="font-serif text-[21px] leading-tight font-normal tracking-[-0.012em]">
                    {title}
                  </Drawer.Title>
                  {description && (
                    <Drawer.Description className="mt-1 text-[13px] text-ink-3">
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close
                  aria-label="Close"
                  className={cn(
                    "-mr-1.5 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm text-ink-3",
                    "transition-colors duration-150 hover:bg-card hover:text-ink-1",
                  )}
                >
                  <X size={15} />
                </Drawer.Close>
              </div>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export const SheetClose = Drawer.Close;
