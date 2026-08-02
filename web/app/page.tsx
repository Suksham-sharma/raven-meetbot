import Link from "next/link";

/**
 * Placeholder. The meetings list belongs here, but it needs `GET /meetings`,
 * which the API does not expose yet — see API-SURFACE.md.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-[560px] flex-col justify-center px-8 py-20">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-accent" />
        <span className="font-serif text-[20px] font-medium tracking-[-0.02em]">
          Raven
        </span>
      </div>

      <h1 className="mb-4 font-serif text-[32px] leading-[1.15] font-normal tracking-[-0.018em] text-balance">
        Your meetings, remembered.
      </h1>

      <p className="mb-8 text-[15px] leading-relaxed text-ink-2">
        The app is being built. The design system is complete, and every
        component carries the reasoning behind it.
      </p>

      <Link
        href="/design"
        className="inline-flex h-9 w-fit items-center rounded-[999px] bg-accent px-4 text-sm font-medium text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-hi"
      >
        Open the design system
      </Link>
    </main>
  );
}
