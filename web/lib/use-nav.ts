"use client";

import * as React from "react";
import { useMediaQuery } from "./use-media-query";

const KEY = "raven:nav-collapsed";

// DESIGN.md §5 makes the collapse a hard constraint below 1040px, so narrow
// wins over the stored preference rather than being merged with it.
//
// null means "not read yet" — writing on every render of that state would
// clobber the stored value before the read lands.
export function useNav() {
  const narrow = useMediaQuery("(max-width: 1039px)");
  const [pinned, setPinned] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setPinned(localStorage.getItem(KEY) === "1");
  }, []);

  React.useEffect(() => {
    if (pinned !== null) localStorage.setItem(KEY, pinned ? "1" : "0");
  }, [pinned]);

  const toggle = React.useCallback(() => setPinned((prev) => !prev), []);

  return { collapsed: narrow || pinned === true, canToggle: !narrow, toggle };
}
