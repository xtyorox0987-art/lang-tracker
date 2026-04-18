import { describe, it, expect } from "vitest";
import { toLocalDateStr } from "../types";

describe("toLocalDateStr", () => {
  it("formats a Date as YYYY-MM-DD in local time", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026 local
    expect(toLocalDateStr(d)).toBe("2026-01-05");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 8, 9); // Sep 9
    expect(toLocalDateStr(d)).toBe("2026-09-09");
  });

  it("handles end-of-year correctly", () => {
    const d = new Date(2026, 11, 31);
    expect(toLocalDateStr(d)).toBe("2026-12-31");
  });
});
