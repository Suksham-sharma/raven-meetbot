import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

const CONTACT_EMAIL = "sukshamever@gmail.com";

export function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper text-ink-1">
      <header className="border-b border-rule-lo">
        <div className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-6 sm:px-10">
          <Link href="/" aria-label="Raven home">
            <Wordmark className="text-[21px]" />
          </Link>
          <nav aria-label="Legal pages" className="flex items-center gap-5 text-[13px] text-ink-3">
            <Link href="/privacy" className="transition-colors hover:text-ink-1">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink-1">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 py-14 sm:px-10 sm:py-20">
        <p className="mb-4 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
          Raven
        </p>
        <h1 className="font-serif text-[42px] leading-[1.04] font-normal tracking-[-0.024em] text-balance sm:text-[54px]">
          {title}
        </h1>
        <p className="mt-6 max-w-[62ch] font-serif text-[19px] leading-[1.62] font-light text-ink-2">
          {description}
        </p>
        <p className="mt-5 text-[12.5px] text-ink-3">Effective September 5, 2026</p>

        <article className="mt-14 space-y-11">{children}</article>
      </main>

      <footer className="border-t border-rule-lo">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3 px-6 py-8 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <Wordmark className="text-[18px] text-ink-1" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-ink-1">
              Contact
            </a>
            <Link href="/privacy" className="transition-colors hover:text-ink-1">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink-1">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-[27px] leading-tight font-normal tracking-[-0.015em]">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.72] text-ink-2">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-3 pl-5 marker:text-ink-4">{children}</ul>;
}

export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="font-medium text-accent underline decoration-accent-line underline-offset-3">
      {children}
    </a>
  );
}

export { CONTACT_EMAIL };
