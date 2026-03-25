import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { TimeEntry, AnkiSnapshot, ActiveTimer } from "../types";

// ---- Fallback: localStorage for when Firebase is not configured ----

function localGet<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function localSet<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ---- Time Entries ----

export async function addTimeEntry(
  userId: string,
  entry: TimeEntry,
): Promise<void> {
  // Firestore does not accept undefined values — strip them
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined),
  );
  if (db) {
    const col = collection(db, "users", userId, "time_entries");
    await addDoc(col, clean);
  } else {
    const key = `entries_${userId}`;
    const entries = localGet<TimeEntry>(key);
    entries.push(entry);
    localSet(key, entries);
  }
}

export async function getTimeEntriesForRange(
  userId: string,
  startMs: number,
  endMs: number,
): Promise<TimeEntry[]> {
  if (db) {
    const col = collection(db, "users", userId, "time_entries");
    const q = query(
      col,
      where("startTime", ">=", startMs),
      where("startTime", "<", endMs),
      orderBy("startTime", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TimeEntry);
  } else {
    const key = `entries_${userId}`;
    return localGet<TimeEntry>(key)
      .filter((e) => e.startTime >= startMs && e.startTime < endMs)
      .sort((a, b) => b.startTime - a.startTime);
  }
}

// ---- Anki Snapshots ----

export async function addAnkiSnapshot(
  userId: string,
  snap: AnkiSnapshot,
): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "anki_snapshots", snap.date);
    await setDoc(ref, snap, { merge: true });
  } else {
    const key = `anki_${userId}`;
    const snaps = localGet<AnkiSnapshot>(key).filter(
      (s) => s.date !== snap.date,
    );
    snaps.push(snap);
    localSet(key, snaps);
  }
}

export async function getAnkiSnapshotsForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<AnkiSnapshot[]> {
  if (db) {
    const col = collection(db, "users", userId, "anki_snapshots");
    const q = query(
      col,
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AnkiSnapshot);
  } else {
    const key = `anki_${userId}`;
    return localGet<AnkiSnapshot>(key)
      .filter((s) => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

// ---- Active Timer (singleton) ----

export async function saveActiveTimer(
  userId: string,
  timer: ActiveTimer,
): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "state", "activeTimer");
    await setDoc(ref, timer);
  } else {
    localStorage.setItem(`timer_${userId}`, JSON.stringify(timer));
  }
}

export async function loadActiveTimer(
  userId: string,
): Promise<ActiveTimer | null> {
  if (db) {
    const ref = doc(db, "users", userId, "state", "activeTimer");
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as ActiveTimer) : null;
  } else {
    try {
      const raw = localStorage.getItem(`timer_${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function clearActiveTimer(userId: string): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "state", "activeTimer");
    await deleteDoc(ref);
  } else {
    localStorage.removeItem(`timer_${userId}`);
  }
}

// ---- Export / Import ----

/** 既存エントリの重複を排除し、不正エントリ(startTime<=0)も削除 */
export async function deduplicateEntries(userId: string): Promise<number> {
  if (db) {
    const col = collection(db, "users", userId, "time_entries");
    const snap = await getDocs(query(col));
    const seen = new Set<string>();
    let removed = 0;
    for (const d of snap.docs) {
      const e = d.data() as TimeEntry;
      // 不正エントリ (startTime <= 0) を削除
      if (!e.startTime || e.startTime <= 0) {
        await deleteDoc(d.ref);
        removed++;
        continue;
      }
      const key = `${e.startTime}_${e.category}_${e.duration}`;
      if (seen.has(key)) {
        await deleteDoc(d.ref);
        removed++;
      } else {
        seen.add(key);
      }
    }
    return removed;
  } else {
    const key = `entries_${userId}`;
    const entries = localGet<TimeEntry>(key);
    const seen = new Set<string>();
    const unique: TimeEntry[] = [];
    for (const e of entries) {
      if (!e.startTime || e.startTime <= 0) continue;
      const k = `${e.startTime}_${e.category}_${e.duration}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(e);
      }
    }
    const removed = entries.length - unique.length;
    if (removed > 0) localSet(key, unique);
    return removed;
  }
}

export async function exportAllData(userId: string) {
  const now = Date.now();
  const farPast = 0;
  const farFuture = now + 365 * 86400000;

  const entries = await getTimeEntriesForRange(userId, farPast, farFuture);
  const ankiSnaps = await getAnkiSnapshotsForRange(
    userId,
    "2000-01-01",
    "2100-01-01",
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    timeEntries: entries,
    ankiSnapshots: ankiSnaps,
  };
}

export async function importData(
  userId: string,
  data: { timeEntries?: TimeEntry[]; ankiSnapshots?: AnkiSnapshot[] },
): Promise<{ added: number; skipped: number }> {
  const entries = data.timeEntries ?? [];
  const snaps = data.ankiSnapshots ?? [];

  // 重複チェック: 既存エントリと startTime+category+duration が一致するものはスキップ
  const existingEntries = await getTimeEntriesForRange(
    userId,
    0,
    Date.now() + 365 * 86400000,
  );
  const existingKeys = new Set(
    existingEntries.map((e) => `${e.startTime}_${e.category}_${e.duration}`),
  );

  let added = 0;
  let skipped = 0;
  for (const entry of entries) {
    const key = `${entry.startTime}_${entry.category}_${entry.duration}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);
    await addTimeEntry(userId, entry);
    added++;
  }

  for (const snap of snaps) {
    await addAnkiSnapshot(userId, snap);
  }

  return { added, skipped };
}

// ---- Local → Firestore Migration ----

/** Check if local-user data exists */
export function hasLocalData(): boolean {
  const entries = localGet<TimeEntry>("entries_local-user");
  const snaps = localGet<AnkiSnapshot>("anki_local-user");
  return entries.length > 0 || snaps.length > 0;
}

/** Migrate local-user data to Firestore under real userId */
export async function migrateLocalData(
  userId: string,
): Promise<{ entries: number; snapshots: number }> {
  const entries = localGet<TimeEntry>("entries_local-user");
  const snaps = localGet<AnkiSnapshot>("anki_local-user");

  let entryCount = 0;
  for (const entry of entries) {
    await addTimeEntry(userId, entry);
    entryCount++;
  }

  let snapCount = 0;
  for (const snap of snaps) {
    await addAnkiSnapshot(userId, snap);
    snapCount++;
  }

  // Clear local data after migration
  localStorage.removeItem("entries_local-user");
  localStorage.removeItem("anki_local-user");
  localStorage.removeItem("timer_local-user");

  return { entries: entryCount, snapshots: snapCount };
}
