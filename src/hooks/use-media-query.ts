import { useEffect, useState } from "react";

/** Whether a CSS media query matches, kept up to date when it changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The wide desktop layout (sidebar + top bar) starts at Tailwind's `lg`. */
export const useIsWideLayout = () => useMediaQuery("(min-width: 1024px)");
