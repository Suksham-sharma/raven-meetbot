"use client";

import * as React from "react";
import { Checkbox as Base } from "@base-ui/react/checkbox";
import { cn } from "@/lib/cn";

/**
 * Base UI handles the keyboard and ARIA behaviour; every visual decision is
 * ours. That split is the whole reason we picked an unstyled primitive library
 * instead of a styled one.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof Base.Root>) {
  return (
    <Base.Root
      className={cn(
        "grid size-[17px] shrink-0 place-items-center rounded-xs border-[1.5px]",
        "border-ink-4 bg-paper transition-colors duration-150 ease-out",
        "hover:border-accent",
        "data-[checked]:border-accent data-[checked]:bg-accent",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <Base.Indicator className="flex text-accent-ink">
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
          <path
            d="M2 6.2 4.7 8.9 10 3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Base.Indicator>
    </Base.Root>
  );
}
