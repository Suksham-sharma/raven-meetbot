"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "transition-[background-color,border-color,color,opacity] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.985]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent-hi",
        secondary:
          "bg-paper text-ink-1 border border-rule hover:border-ink-4 hover:bg-card",
        ghost: "text-ink-2 hover:bg-card hover:text-ink-1",
        quiet: "text-ink-3 hover:text-ink-1",
        danger: "bg-live text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px] rounded-[999px]",
        md: "h-9 px-4 text-sm rounded-[999px]",
        lg: "h-11 px-6 text-[15px] rounded-[999px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, loading, disabled, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(button({ variant, size }), className)}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="size-3.5 shrink-0 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "ghost" | "secondary";
  }
>(function IconButton({ className, variant = "ghost", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-grid size-8 place-items-center rounded-sm",
        "transition-colors duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-45",
        variant === "ghost"
          ? "text-ink-3 hover:bg-card hover:text-ink-1"
          : "border border-rule bg-paper text-ink-2 hover:border-ink-4 hover:text-ink-1",
        className,
      )}
      {...props}
    />
  );
});
