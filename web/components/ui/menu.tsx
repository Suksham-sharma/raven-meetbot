"use client";

import * as React from "react";
import { Menu as Base } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

const POPUP = cn(
  "z-50 min-w-[11rem] origin-[var(--transform-origin)] rounded-lg",
  "border border-rule bg-paper py-1.5 shadow-e2 outline-none",
  "transition-[transform,opacity] duration-150 ease-out",
  "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
);

const ITEM = cn(
  "flex cursor-default items-center gap-2.5 px-3.5 py-2 text-[13.5px] text-ink-2",
  "outline-none select-none",
  "data-highlighted:bg-card data-highlighted:text-ink-1",
);

export function Menu({
  label = "More actions",
  bordered,
  children,
}: {
  label?: string;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Base.Root>
      <Base.Trigger
        aria-label={label}
        className={cn(
          "grid size-8 place-items-center rounded-sm outline-none",
          "transition-colors duration-150",
          bordered
            ? "border border-rule bg-paper text-ink-2 hover:border-ink-4 hover:bg-card hover:text-ink-1"
            : "text-ink-3 hover:bg-card hover:text-ink-1",
          "data-popup-open:bg-card data-popup-open:text-ink-1",
        )}
      >
        <DotsThree size={18} weight="bold" />
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner side="bottom" align="end" sideOffset={6}>
          <Base.Popup className={POPUP}>{children}</Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <Base.Item
      onClick={onClick}
      className={cn(ITEM, destructive && "text-live data-highlighted:text-live")}
    >
      {children}
    </Base.Item>
  );
}

export function MenuSeparator() {
  return <Base.Separator className="my-1.5 h-px bg-rule-lo" />;
}
