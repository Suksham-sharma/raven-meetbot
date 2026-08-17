"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { useMeetings, useSession } from "@/lib/queries";
import { useNav } from "@/lib/use-nav";
import { CommandPalette } from "@/components/raven/command-palette";
import { NavRail } from "./nav-rail";

const PaletteContext = React.createContext<(() => void) | null>(null);

export function useCommandPalette() {
  return React.useContext(PaletteContext);
}

export function AppShell({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  const router = useRouter();
  const { data, error, isPending } = useSession();
  const { collapsed, canToggle, toggle } = useNav();
  const [searching, setSearching] = React.useState(false);
  const meetings = useMeetings();
  const unauthorized = error instanceof ApiError && error.status === 401;

  const openPalette = React.useCallback(() => setSearching(true), []);

  React.useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  if (isPending || unauthorized || !data) {
    return <div className="h-dvh bg-paper" />;
  }

  const nav = collapsed ? "64px" : "200px";
  const navWide = collapsed ? "64px" : "232px";

  return (
    <PaletteContext.Provider value={openPalette}>
    <div
      style={
        {
          "--nav": nav,
          "--nav-wide": navWide,
        } as React.CSSProperties
      }
      className={cn(
        "grid min-h-dvh grid-cols-[var(--nav)_minmax(0,1fr)]",
        "min-[1040px]:h-dvh min-[1040px]:overflow-hidden",
        rail &&
          "min-[1040px]:grid-cols-[var(--nav)_minmax(0,1fr)_360px] xl:grid-cols-[var(--nav-wide)_minmax(0,1fr)_420px]",
        !rail && "xl:grid-cols-[var(--nav-wide)_minmax(0,1fr)]",
      )}
    >
      {/* Reaching the rail otherwise means tabbing through every meeting —
          34 stops on a real archive. */}
      {rail && (
        <a
          href="#ask"
          className={cn(
            "fixed -top-16 left-3 z-20 rounded-sm bg-accent px-4 py-2",
            "text-[13px] font-medium text-accent-ink",
            "transition-[top] duration-150 ease-out focus:top-3",
          )}
        >
          Skip to ask
        </a>
      )}

      <NavRail collapsed={collapsed} canToggle={canToggle} onToggle={toggle} />

      <main id="content" className="min-w-0 min-[1040px]:overflow-y-auto">
        {children}
      </main>

      {rail && (
        <aside
          id="ask"
          aria-label="Ask across your meetings"
          className="hidden min-w-0 border-l border-rule bg-rail min-[1040px]:block min-[1040px]:overflow-y-auto"
        >
          {rail}
        </aside>
      )}

      <CommandPalette
        meetings={meetings.data?.meetings ?? []}
        open={searching}
        onOpenChange={setSearching}
        onSelect={(id) => router.push(`/m/${encodeURIComponent(id)}`)}
      />
    </div>
    </PaletteContext.Provider>
  );
}
