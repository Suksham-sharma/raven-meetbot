"use client";

import { Toaster as Sonner, toast } from "sonner";

export { toast };

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={10}
      offset={20}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-lg border border-rule bg-paper px-4 py-3 shadow-e2",
          title: "text-[14px] leading-[1.45] text-ink-1",
          description: "mt-0.5 text-[12.5px] leading-[1.45] text-ink-2",
          actionButton:
            "ml-auto shrink-0 rounded-[999px] bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-ink hover:bg-accent-hi",
          cancelButton:
            "ml-auto shrink-0 rounded-[999px] px-3 py-1 text-[12.5px] text-ink-2 hover:bg-card",
          icon: "shrink-0",
          error: "border-live/40",
          success: "border-accent-line",
        },
      }}
    />
  );
}
