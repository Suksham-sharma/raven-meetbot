"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MagnifyingGlass,
  SidebarSimple,
  SignOut,
  VideoCamera,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useSession } from "@/lib/queries";
import { useCommandPalette } from "@/components/layout/app-shell";
import { Mark, Wordmark } from "@/components/brand/wordmark";

const NAV: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Meetings", icon: VideoCamera },
];

export function NavRail({
  collapsed,
  canToggle,
  onToggle,
}: {
  collapsed: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useSession();
  const openPalette = useCommandPalette();

  async function signOut() {
    await api.logout().catch(() => undefined);
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <aside
      aria-label="Sections"
      className={cn(
        "flex h-full flex-col border-r border-rule bg-rail py-6",
        collapsed ? "items-center px-2.5" : "px-3",
      )}
    >
      <div
        className={cn(
          "mb-7 flex items-center",
          collapsed ? "justify-center" : "justify-between px-3",
        )}
      >
        <Link href="/" title="Raven" aria-label="Raven" className="inline-block">
          {collapsed ? (
            <Mark className="text-accent text-[19px]" />
          ) : (
            <Wordmark className="text-[19px]" />
          )}
        </Link>
        {canToggle && !collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="grid size-7 place-items-center rounded-sm text-ink-3 transition-colors duration-150 hover:bg-card hover:text-ink-1"
          >
            <SidebarSimple />
          </button>
        )}
      </div>

      <nav className="flex w-full flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Glyph }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-sm text-[13.5px]",
                "transition-colors duration-150 ease-out",
                collapsed ? "justify-center p-2.5" : "px-3 py-2",
                active
                  ? "bg-accent-tint font-medium text-accent"
                  : "text-ink-2 hover:bg-card hover:text-ink-1",
              )}
            >
              <Glyph weight={active ? "fill" : "regular"} />
              {!collapsed && label}
            </Link>
          );
        })}

        {/* Sits with the routes because it behaves like one — it is the way
            you get to a meeting by name from anywhere. Not a route, so no
            aria-current and no active state; the shortcut is spelled out
            because a shortcut nobody can see is a shortcut nobody uses. */}
        {openPalette && (
          <button
            type="button"
            onClick={openPalette}
            title={collapsed ? "Search everything" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-sm text-[13.5px] text-ink-2",
              "transition-colors duration-150 ease-out hover:bg-card hover:text-ink-1",
              collapsed ? "justify-center p-2.5" : "px-3 py-2",
            )}
          >
            <MagnifyingGlass />
            {!collapsed && (
              <>
                Search
                <kbd className="ml-auto font-sans text-[11px] text-ink-3">⌘K</kbd>
              </>
            )}
          </button>
        )}
      </nav>

      <div className={cn("mt-auto w-full", collapsed ? "" : "px-3")}>
        {canToggle && collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="mb-2 grid w-full place-items-center rounded-sm p-2.5 text-ink-3 transition-colors duration-150 hover:bg-card hover:text-ink-1"
          >
            <SidebarSimple />
          </button>
        )}

        {/* One row, not a name stacked above a button — who is signed in and
            the way out are one thing, and stacked they read as two orphans
            left at the bottom of the column. The rule is the only one in the
            rail and it earns itself: it separates the account from the routes,
            which is a different kind of thing rather than a further item. */}
        {collapsed ? (
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className={cn(
              "flex w-full justify-center rounded-sm p-2.5 text-ink-3",
              "transition-colors duration-150 hover:bg-card hover:text-ink-1",
            )}
          >
            <SignOut size={18} />
          </button>
        ) : (
          <div className="-mx-1 flex items-center gap-1 border-t border-rule-lo px-1 pt-3">
            {data?.user && (
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                {data.user.name ?? data.user.email}
              </span>
            )}
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-sm text-ink-3",
                "transition-colors duration-150 hover:bg-card hover:text-ink-1",
              )}
            >
              <SignOut size={15} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
