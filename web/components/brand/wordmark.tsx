import { cn } from "@/lib/cn";

const H = 1.05;
const AR = 0.9311;
const GAP = 0.09;
const DROP = 0.09;

const MASK = {
  WebkitMaskImage: "url(/logo-r.png)",
  maskImage: "url(/logo-r.png)",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
} as const;

export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        ...MASK,
        display: "inline-block",
        height: `${H}em`,
        width: `${H * AR}em`,
        verticalAlign: `${-DROP}em`,
        marginRight: `${GAP}em`,
        backgroundColor: "currentColor",
      }}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-serif font-medium tracking-[-0.02em] whitespace-nowrap",
        className,
      )}
    >
      <Mark className="text-accent" />
      aven
    </span>
  );
}
