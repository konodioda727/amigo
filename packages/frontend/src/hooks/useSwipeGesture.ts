import { useEffect, useRef } from "react";

interface SwipeGestureOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  edgeThreshold?: number;
  swipeThreshold?: number;
}

/**
 * Custom hook for handling swipe gestures
 * Detects left/right swipes and edge swipes
 */
export const useSwipeGesture = ({
  onSwipeRight,
  onSwipeLeft,
  edgeThreshold = 30,
  swipeThreshold = 50,
}: SwipeGestureOptions) => {
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      touchCurrentX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      if (touchStartX.current !== null && touchCurrentX.current !== null) {
        const diff = touchCurrentX.current - touchStartX.current;

        // Right swipe from left edge
        if (touchStartX.current < edgeThreshold && diff > swipeThreshold) {
          onSwipeRight?.();
        }
        // Left swipe
        else if (diff < -swipeThreshold) {
          onSwipeLeft?.();
        }
      }

      touchStartX.current = null;
      touchCurrentX.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSwipeRight, onSwipeLeft, edgeThreshold, swipeThreshold]);
};
