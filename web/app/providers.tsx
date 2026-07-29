"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconContext } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";

// One place for icon weight and size so it can't drift per component. Regular
// at 18px lands around a 1.5px stroke — the same weight as the type, and heavy
// enough to clear the 3:1 floor for meaningful icons. Never set an icon in
// ink-4; at 2.33:1 it fails that floor.
// aria-hidden by default: every icon here sits beside its own label or a
// button that already carries an aria-label, so announcing them duplicates.
// An icon that ever stands alone must override this and name itself.
const ICONS = { size: 18, weight: "regular", "aria-hidden": true } as const;

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) =>
              error instanceof ApiError && error.status < 500
                ? false
                : count < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <IconContext.Provider value={ICONS}>{children}</IconContext.Provider>
    </QueryClientProvider>
  );
}
