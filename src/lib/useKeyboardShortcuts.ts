import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { toLocalDateStr } from "../types";

/**
 * Global keyboard shortcuts:
 *  - Space: toggle Active timer
 *  - P:     toggle Passive timer
 *  - ←/→:   move selected date
 *
 * Ignored when focus is in an input/textarea/contentEditable.
 */
export function useKeyboardShortcuts() {
  const activeTimer = useAppStore((s) => s.activeTimer);
  const startTimer = useAppStore((s) => s.startTimer);
  const stopTimer = useAppStore((s) => s.stopTimer);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const setSelectedDate = useAppStore((s) => s.setSelectedDate);

  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const toggle = async (category: "active" | "passive") => {
      if (activeTimer?.isRunning) {
        if (activeTimer.category === category) {
          await stopTimer();
        } else {
          await stopTimer();
          startTimer(category);
        }
      } else {
        startTimer(category);
      }
    };

    const moveDay = (offset: number) => {
      const d = new Date(selectedDate + "T00:00:00");
      d.setDate(d.getDate() + offset);
      const next = toLocalDateStr(d);
      if (next <= toLocalDateStr()) setSelectedDate(next);
    };

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      if (e.code === "Space") {
        e.preventDefault();
        void toggle("active");
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        void toggle("passive");
      } else if (e.key === "ArrowLeft") {
        moveDay(-1);
      } else if (e.key === "ArrowRight") {
        moveDay(1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTimer, startTimer, stopTimer, selectedDate, setSelectedDate]);
}
