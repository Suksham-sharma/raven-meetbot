"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconContext } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";

// Never set an icon in ink-4: at 2.33:1 it fails the 3:1 contrast floor.
// aria-hidden by default, so an icon that ever stands alone must name itself.
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
