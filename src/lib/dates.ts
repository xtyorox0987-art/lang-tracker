/**
 * Date range helpers — pure functions, all timestamps in local time.
 * Each returns a [startMs, endMs) half-open interval in ms epoch.
 */

export function todayRange(now: Date = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000);
  return [start.getTime(), end.getTime()];
}

export function weekRange(
  weekStartsOn: 0 | 1,
  now: Date = new Date(),
): [number, number] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  const weekStart = new Date(today.getTime() - diff * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  return [weekStart.getTime(), weekEnd.getTime()];
}

export function monthRange(now: Date = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [start.getTime(), end.getTime()];
}

export function yearRange(now: Date = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return [start.getTime(), end.getTime()];
}

export function allRange(now: Date = new Date()): [number, number] {
  return [0, now.getTime() + 86400000];
}
