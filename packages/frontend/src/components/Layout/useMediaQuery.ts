import { useEffect, useState } from "react";

/**
 * Custom hook for responsive media queries
 * @param query - CSS media query string (e.g., "(min-width: 768px)")
 * @returns boolean indicating if the media query matches
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => {
    // SSR-safe initialization
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    // Skip if window is not available (SSR)
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    
    // Update state if initial value was different
    setMatches(mediaQuery.matches);

    // Event handler for media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers support addEventListener
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
};
