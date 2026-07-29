"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface FieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  pill?: boolean;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  function Field(
    { label, hint, error, icon, pill, className, id, ...props },
    ref,
  ) {
    const auto = React.useId();
    const inputId = id ?? auto;
    const describedBy = error
      ? `${inputId}-err`
      : hint
        ? `${inputId}-hint`
        : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-ink-2"
          >
            {label}
          </label>
        )}

        <div
          className={cn(
            "flex items-center gap-2.5 bg-paper transition-colors duration-150 ease-out",
            "border px-3.5 h-10",
            pill ? "rounded-[999px]" : "rounded-sm",
            error
              ? "border-live focus-within:ring-2 focus-within:ring-live/25"
              : "border-field hover:border-ink-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
            props.disabled && "opacity-50 pointer-events-none",
            className,
          )}
        >
          {icon && (
            <span className="shrink-0 text-ink-3" aria-hidden="true">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-[14px] text-ink-1",
              "placeholder:text-ink-3 focus:outline-none",
            )}
            {...props}
          />
        </div>

        {error ? (
          <p id={`${inputId}-err`} className="text-[12.5px] text-live">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-[12.5px] text-ink-3">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
