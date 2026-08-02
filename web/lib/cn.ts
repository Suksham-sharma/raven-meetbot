import clsx, { type ClassValue } from "clsx";

/**
 * Join class names conditionally.
 *
 * No tailwind-merge here on purpose: our components expose variants through
 * cva rather than inviting callers to override arbitrary utilities, so the
 * conflict-resolution cost tailwind-merge pays for at runtime buys us nothing.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
