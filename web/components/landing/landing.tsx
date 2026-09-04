import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/brand/wordmark";
import { GoogleMark } from "@/components/brand/google-mark";
import { cn } from "@/lib/cn";
import { HeroProposal } from "./hero-proposal";
import { Reveal } from "./reveal";
import {
  ActionsCrop,
  AskCrop,
  FollowUpsCrop,
  JoinCrop,
  NotesCrop,
} from "./mocks";

const HERO_PLATE = "/landing/hero-plate.jpg";
const CLOSING_PLATE = "/landing/closing-plate.jpg";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23p)'/%3E%3C/svg%3E\")";

const EYEBROW =
  "text-[11.5px] font-semibold uppercase tracking-[0.11em] text-ink-3";

const PRIMARY = cn(
  "inline-flex h-11 items-center justify-center gap-2.5 rounded-[999px] px-6",
  "bg-accent text-[15px] font-medium text-accent-ink",
  "transition-[background-color] duration-150 ease-out hover:bg-accent-hi",
  "active:scale-[0.985]",
);

const CONTAINER = "mx-auto w-full max-w-[1180px] px-6 sm:px-10";

export function Landing() {
  return (
    <div className="relative overflow-x-clip">
      <noscript>
        <style>{".reveal{opacity:1;transform:none}"}</style>
      </noscript>
      <Nav />
      <Hero />
      <Chapter
        id="how"
        eyebrow="Joins on its own"
        title="One participant, start to finish."
        body="Connect Google Calendar and Raven knocks on every call with a Meet link, a minute early. It records as a visible participant, leaves when everyone does, and has the notes ready before you've made coffee."
      >
        <JoinCrop />
      </Chapter>
      <Chapter
        id="notes"
        flip
        eyebrow="Notes"
        title="Every note points at the moment."
        body="What was said is set in serif. What Raven wrote about it is not. Click a name and a time, and the recording plays right there, so a decision is never more than one tap from the sentence that made it."
      >
        <NotesCrop />
      </Chapter>
      <Chapter
        id="followups"
        eyebrow="Follow-ups"
        title="Who owes what, and by when."
        body="Every commitment gets an owner, a date and the second it was made. Yours sit at the top of Home until you tick them off. Nobody has to write “action items” on a whiteboard again."
      >
        <FollowUpsCrop />
      </Chapter>
      <Chapter
        id="actions"
        flip
        eyebrow="Actions"
        title="It asks before it does anything."
        body="When a meeting produces work, Raven drafts it as the thing it will become, a Linear issue or a Slack message, with the moment that caused it attached. Approve it, edit it first, or dismiss it. Nothing leaves without a tap, and the reason stays on the card long after it's filed."
      >
        <ActionsCrop />
      </Chapter>
      <Chapter
        id="memory"
        eyebrow="Memory"
        title="Ask across every meeting you've had."
        body="Raven remembers the whole archive, not one call. Ask what was decided, who committed to what, or how a plan changed, and the answer cites a person at a moment, never a footnote number. Each citation plays in place."
      >
        <AskCrop />
      </Chapter>
      <Trust />
      <Closing />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule-lo bg-paper">
      <div className={cn(CONTAINER, "flex h-16 items-center justify-between")}>
        <Link href="/" aria-label="Raven" className="inline-block">
          <Wordmark className="text-[21px]" />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
          {[
            ["#how", "How it works"],
            ["#actions", "Actions"],
            ["#memory", "Memory"],
            ["#trust", "Trust"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-[14px] text-ink-2 transition-colors duration-150 hover:text-ink-1"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-[999px] px-4 text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:bg-card hover:text-ink-1"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center rounded-[999px] bg-accent px-4 text-[14px] font-medium text-accent-ink transition-[background-color] duration-150 hover:bg-accent-hi"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: GRAIN, opacity: 0.02 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 left-[48%] hidden lg:block"
      >
        <Image
          src={HERO_PLATE}
          alt=""
          fill
          priority
          quality={92}
          sizes="60vw"
          className="object-cover object-[center_35%]"
        />
        <div className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-paper to-transparent" />
      </div>

      <div
        className={cn(
          CONTAINER,
          "relative grid gap-12 pt-16 pb-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:pt-8 lg:pb-16",
        )}
      >
        <div className="min-w-0 max-w-[600px]">
          <p className={cn(EYEBROW, "hero-rise mb-6")}>
            A meeting assistant for Google Meet
          </p>
          <h1
            className="hero-rise font-serif text-[46px] leading-[1.02] font-normal tracking-[-0.025em] text-balance sm:text-[62px] lg:text-[72px]"
            style={{ animationDelay: "60ms" }}
          >
            Notes are the easy part.
          </h1>
          <p
            className="hero-rise mt-6 max-w-[50ch] text-[17px] leading-[1.6] text-ink-2 sm:text-[18px]"
            style={{ animationDelay: "140ms" }}
          >
            Raven joins the call, records it, writes the notes and keeps track
            of who owes what. Then it drafts the ticket and the message, and
            waits for you to say yes.
          </p>
          <div
            className="hero-rise mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
            style={{ animationDelay: "220ms" }}
          >
            <a href="/api/v1/auth/google" className={PRIMARY}>
              <GoogleMark />
              Continue with Google
            </a>
            <a
              href="#how"
              className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 transition-colors duration-150 hover:text-accent"
            >
              See how it works
              <ArrowRight
                size={14}
                className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              />
            </a>
          </div>
          <p
            className="hero-rise mt-6 text-[13px] text-ink-3"
            style={{ animationDelay: "300ms" }}
          >
            Your first two meetings are free. Raven joins as a visible
            participant, so everyone in the call can see it.
          </p>
        </div>

        <div
          className="hero-rise relative flex min-w-0 justify-center lg:justify-start lg:pl-2"
          style={{ animationDelay: "360ms" }}
        >
          <div
            aria-hidden
            className="absolute inset-x-[-1.5rem] inset-y-[-2rem] -z-10 rounded-[24px] lg:hidden"
          >
            <Image
              src={HERO_PLATE}
              alt=""
              fill
              quality={75}
              sizes="100vw"
              className="rounded-[24px] object-cover object-[center_40%]"
            />
          </div>
          <HeroProposal />
        </div>
      </div>
    </section>
  );
}

function Chapter({
  id,
  eyebrow,
  title,
  body,
  flip,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div
        className={cn(
          CONTAINER,
          "grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-14 lg:py-24",
        )}
      >
        <Reveal
          className={cn(
            "min-w-0 max-w-[440px] lg:col-span-5",
            flip && "lg:order-2 lg:col-start-8",
          )}
        >
          <p className={cn(EYEBROW, "mb-4")}>{eyebrow}</p>
          <h2 className="font-serif text-[34px] leading-[1.08] font-normal tracking-[-0.02em] text-balance sm:text-[40px]">
            {title}
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.62] text-ink-2">{body}</p>
        </Reveal>
        <Reveal
          as="figure"
          delay={90}
          className={cn(
            "min-w-0 rounded-xl bg-card px-5 py-7 sm:px-10 sm:py-11 lg:col-span-7",
            flip && "lg:order-1 lg:col-span-7",
          )}
        >
          {children}
        </Reveal>
      </div>
    </section>
  );
}

const TRUST = [
  {
    title: "Everyone in the call can see it.",
    body: "Raven joins as a participant with its own tile and its own name. It never records from the shadows, and it leaves when the last person does.",
  },
  {
    title: "It reads your calendar. It never writes to it.",
    body: "Calendar access is used for one thing: knowing when your next Meet is. No invites, no edits, no reminders sent on your behalf.",
  },
  {
    title: "Nothing is sent without your tap.",
    body: "Every Linear issue and every Slack message is a proposal until you approve it. Dismissing one is a single click, and the record of why it was proposed stays.",
  },
  {
    title: "Your recordings are yours.",
    body: "Each account's meetings are stored separately. Delete a meeting and the recording, transcript and notes go with it.",
  },
];

function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 bg-rail">
      <div className={cn(CONTAINER, "py-16 sm:py-20 lg:py-24")}>
        <Reveal className="max-w-[560px]">
          <p className={cn(EYEBROW, "mb-4")}>Trust</p>
          <h2 className="font-serif text-[34px] leading-[1.08] font-normal tracking-[-0.02em] text-balance sm:text-[40px]">
            A participant, not a wiretap.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.62] text-ink-2">
            The category has spent two years apologising for meeting bots.
            Raven is one, on purpose, and the rules it follows are the ones
            you&rsquo;d want a person in the room to follow.
          </p>
        </Reveal>
        <ul className="mt-12 grid gap-x-12 sm:grid-cols-2">
          {TRUST.map((t, i) => (
            <Reveal
              as="li"
              key={t.title}
              delay={i * 60}
              className="border-t border-rule py-6"
            >
              <p className="text-[16.5px] font-medium">{t.title}</p>
              <p className="mt-2 text-[15px] leading-[1.6] text-ink-2">{t.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 left-[50%] hidden lg:block"
      >
        <Image
          src={CLOSING_PLATE}
          alt=""
          fill
          quality={92}
          sizes="50vw"
          className="object-cover object-[center_70%]"
        />
        <div className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-r from-paper to-transparent" />
      </div>
      <div className={cn(CONTAINER, "relative py-24 sm:py-32 lg:py-40")}>
        <Reveal className="max-w-[520px]">
          <h2 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.022em] text-balance sm:text-[52px]">
            Start remembering.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.62] text-ink-2">
            Sign in with Google, connect your calendar, and Raven will be in
            your next meeting. The first two are free.
          </p>
          <div className="mt-8">
            <a href="/api/v1/auth/google" className={PRIMARY}>
              <GoogleMark />
              Continue with Google
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule-lo">
      <div
        className={cn(
          CONTAINER,
          "flex flex-col gap-4 py-8 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <Wordmark className="text-[18px] text-ink-1" />
        <p>Works with Google Meet today. Zoom and Teams are next.</p>
        <div className="flex items-center gap-5">
          <Link href="/login" className="transition-colors hover:text-ink-1">
            Sign in
          </Link>
          <Link href="/register" className="transition-colors hover:text-ink-1">
            Make an account
          </Link>
        </div>
      </div>
    </footer>
  );
}
