"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarSimple, SignOut, VideoCamera } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { useSession } from "@/lib/queries";

// Only routes that exist are listed. A nav full of links to unbuilt screens is
// the same failure as a button with no handler.
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
        <Link href="/" className="flex items-center gap-2.5" title="Raven">
          <span className="size-2 shrink-0 rounded-full bg-accent" />
          {!collapsed && (
            <span className="font-serif text-[19px] font-medium tracking-[-0.02em]">
              Raven
            </span>
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

        {!collapsed && data?.user && (
          <p className="mb-1.5 truncate text-[12.5px] text-ink-3">
            {data.user.name ?? data.user.email}
          </p>
        )}

        <button
          type="button"
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          aria-label="Sign out"
          className={cn(
            "flex items-center gap-2 rounded-sm text-[12.5px] text-ink-3",
            "transition-colors duration-150 hover:bg-card hover:text-ink-1",
            collapsed ? "w-full justify-center p-2.5" : "-mx-2 min-h-6 px-2 py-1",
          )}
        >
          <SignOut size={collapsed ? 18 : 15} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}
