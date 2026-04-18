import { describe, it, expect } from "vitest";
import {
  todayRange,
  weekRange,
  monthRange,
  yearRange,
  allRange,
} from "./dates";

const DAY = 86400000;

describe("todayRange", () => {
  it("returns midnight to next midnight (24h)", () => {
    const now = new Date(2026, 3, 18, 14, 30); // Apr 18 14:30 local
    const [start, end] = todayRange(now);
    expect(end - start).toBe(DAY);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getMinutes()).toBe(0);
  });
});

describe("weekRange", () => {
  it("week starting Monday: returns 7-day span beginning on Mon", () => {
    // Saturday 2026-04-18
    const now = new Date(2026, 3, 18);
    const [start, end] = weekRange(1, now);
    expect(end - start).toBe(7 * DAY);
    expect(new Date(start).getDay()).toBe(1); // Monday
    expect(new Date(start).getDate()).toBe(13);
  });

  it("week starting Sunday: returns 7-day span beginning on Sun", () => {
    const now = new Date(2026, 3, 18); // Saturday
    const [start] = weekRange(0, now);
    expect(new Date(start).getDay()).toBe(0); // Sunday
    expect(new Date(start).getDate()).toBe(12);
  });
});

describe("monthRange", () => {
  it("returns the 1st of this month to the 1st of next month", () => {
    const now = new Date(2026, 3, 18);
    const [start, end] = monthRange(now);
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(start).getMonth()).toBe(3); // April
    expect(new Date(end).getMonth()).toBe(4); // May
    expect(new Date(end).getDate()).toBe(1);
  });

  it("crosses year boundary in December", () => {
    const now = new Date(2026, 11, 15);
    const [, end] = monthRange(now);
    expect(new Date(end).getFullYear()).toBe(2027);
    expect(new Date(end).getMonth()).toBe(0);
  });
});

describe("yearRange", () => {
  it("returns Jan 1 of this year to Jan 1 of next year", () => {
    const now = new Date(2026, 6, 1);
    const [start, end] = yearRange(now);
    expect(new Date(start).getFullYear()).toBe(2026);
    expect(new Date(start).getMonth()).toBe(0);
    expect(new Date(end).getFullYear()).toBe(2027);
  });
});

describe("allRange", () => {
  it("starts at epoch and ends 1 day after now", () => {
    const now = new Date(2026, 3, 18, 12);
    const [start, end] = allRange(now);
    expect(start).toBe(0);
    expect(end).toBe(now.getTime() + DAY);
  });
});
