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
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  TimeEntry,
  AnkiSnapshot,
  ActiveTimer,
  AppSettings,
  VideoResource,
  VideoWatchSession,
  DeckProgressSnapshot,
} from "../types";

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

export async function updateTimeEntry(
  userId: string,
  entry: TimeEntry,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined),
  );
  if (db) {
    const ref = doc(db, "users", userId, "time_entries", entry.id);
    await setDoc(ref, clean);
  } else {
    const key = `entries_${userId}`;
    const entries = localGet<TimeEntry>(key).map((e) =>
      e.id === entry.id ? entry : e,
    );
    localSet(key, entries);
  }
}

export async function deleteTimeEntry(
  userId: string,
  entryId: string,
): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "time_entries", entryId);
    await deleteDoc(ref);
  } else {
    const key = `entries_${userId}`;
    const entries = localGet<TimeEntry>(key).filter((e) => e.id !== entryId);
    localSet(key, entries);
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

/** Batch-save up to 500 AnkiSnapshots per commit (Firestore limit). */
export async function batchAddAnkiSnapshots(
  userId: string,
  snapshots: AnkiSnapshot[],
): Promise<{ saved: number; failed: number }> {
  if (!db) {
    for (const snap of snapshots) await addAnkiSnapshot(userId, snap);
    return { saved: snapshots.length, failed: 0 };
  }
  const BATCH_SIZE = 450; // stay under Firestore 500-op limit
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const chunk = snapshots.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const snap of chunk) {
      const ref = doc(db, "users", userId, "anki_snapshots", snap.date);
      batch.set(ref, snap, { merge: true });
    }
    try {
      await batch.commit();
      saved += chunk.length;
    } catch {
      // Retry once
      try {
        const retry = writeBatch(db);
        for (const snap of chunk) {
          const ref = doc(db, "users", userId, "anki_snapshots", snap.date);
          retry.set(ref, snap, { merge: true });
        }
        await retry.commit();
        saved += chunk.length;
      } catch {
        failed += chunk.length;
      }
    }
  }
  return { saved, failed };
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

// ---- Video Resources ----

function normalizeVideoResource(resource: VideoResource): VideoResource {
  const now = Date.now();
  return {
    ...resource,
    source: resource.source ?? "manual",
    status: resource.status ?? "candidate",
    createdAt: resource.createdAt ?? resource.updatedAt ?? now,
    updatedAt: resource.updatedAt ?? resource.createdAt ?? now,
  };
}

export async function upsertVideoResource(
  userId: string,
  resource: VideoResource,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(resource).filter(([, v]) => v !== undefined),
  );
  if (db) {
    const ref = doc(db, "users", userId, "video_resources", resource.id);
    await setDoc(ref, clean, { merge: true });
  } else {
    const key = `videos_${userId}`;
    const resources = localGet<VideoResource>(key).filter(
      (v) => v.id !== resource.id,
    );
    resources.push(resource);
    localSet(key, resources);
  }
}

export async function getVideoResources(
  userId: string,
): Promise<VideoResource[]> {
  if (db) {
    const col = collection(db, "users", userId, "video_resources");
    const snap = await getDocs(query(col, orderBy("updatedAt", "desc")));
    return snap.docs.map((d) =>
      normalizeVideoResource(d.data() as VideoResource),
    );
  } else {
    const key = `videos_${userId}`;
    return localGet<VideoResource>(key)
      .map(normalizeVideoResource)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export async function deleteVideoResource(
  userId: string,
  resourceId: string,
): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "video_resources", resourceId);
    await deleteDoc(ref);
  } else {
    const key = `videos_${userId}`;
    const resources = localGet<VideoResource>(key).filter(
      (v) => v.id !== resourceId,
    );
    localSet(key, resources);
  }
}

// ---- Video Watch Sessions ----

export async function addVideoWatchSession(
  userId: string,
  session: VideoWatchSession,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(session).filter(([, v]) => v !== undefined),
  );
  if (db) {
    const col = collection(db, "users", userId, "video_watch_sessions");
    await addDoc(col, clean);
  } else {
    const key = `video_sessions_${userId}`;
    const sessions = localGet<VideoWatchSession>(key);
    sessions.push(session);
    localSet(key, sessions);
  }
}

export async function getVideoWatchSessionsForRange(
  userId: string,
  startMs: number,
  endMs: number,
): Promise<VideoWatchSession[]> {
  if (db) {
    const col = collection(db, "users", userId, "video_watch_sessions");
    const q = query(
      col,
      where("startTime", ">=", startMs),
      where("startTime", "<", endMs),
      orderBy("startTime", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map(
      (d) => ({ ...d.data(), id: d.id }) as VideoWatchSession,
    );
  } else {
    const key = `video_sessions_${userId}`;
    return localGet<VideoWatchSession>(key)
      .filter((s) => s.startTime >= startMs && s.startTime < endMs)
      .sort((a, b) => b.startTime - a.startTime);
  }
}

// ---- Deck Progress Snapshots ----

export async function addDeckProgressSnapshot(
  userId: string,
  snap: DeckProgressSnapshot,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(snap).filter(([, v]) => v !== undefined),
  );
  if (db) {
    const ref = doc(db, "users", userId, "deck_progress_snapshots", snap.id);
    await setDoc(ref, clean, { merge: true });
  } else {
    const key = `deck_progress_${userId}`;
    const snaps = localGet<DeckProgressSnapshot>(key).filter(
      (s) => s.id !== snap.id,
    );
    snaps.push(snap);
    localSet(key, snaps);
  }
}

export async function getLatestDeckProgressSnapshots(
  userId: string,
): Promise<DeckProgressSnapshot[]> {
  const latestByDeck = new Map<string, DeckProgressSnapshot>();
  const collect = (snapshots: DeckProgressSnapshot[]) => {
    for (const snap of snapshots) {
      const existing = latestByDeck.get(snap.deckName);
      if (!existing || snap.syncedAt > existing.syncedAt) {
        latestByDeck.set(snap.deckName, snap);
      }
    }
    return [...latestByDeck.values()].sort((a, b) => b.syncedAt - a.syncedAt);
  };

  if (db) {
    const col = collection(db, "users", userId, "deck_progress_snapshots");
    const snap = await getDocs(query(col, orderBy("syncedAt", "desc")));
    return collect(snap.docs.map((d) => d.data() as DeckProgressSnapshot));
  }

  const key = `deck_progress_${userId}`;
  return collect(localGet<DeckProgressSnapshot>(key));
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

// ---- Settings ----

export async function saveSettings(
  userId: string,
  settings: AppSettings,
): Promise<void> {
  if (db) {
    const ref = doc(db, "users", userId, "state", "settings");
    await setDoc(ref, settings);
  } else {
    localStorage.setItem(`settings_${userId}`, JSON.stringify(settings));
  }
}

export async function loadSettings(
  userId: string,
): Promise<AppSettings | null> {
  if (db) {
    const ref = doc(db, "users", userId, "state", "settings");
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as AppSettings) : null;
  } else {
    try {
      const raw = localStorage.getItem(`settings_${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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
  const videoResources = await getVideoResources(userId);
  const videoWatchSessions = await getVideoWatchSessionsForRange(
    userId,
    farPast,
    farFuture,
  );
  const deckProgressSnapshots = await getLatestDeckProgressSnapshots(userId);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    timeEntries: entries,
    ankiSnapshots: ankiSnaps,
    videoResources,
    videoWatchSessions,
    deckProgressSnapshots,
  };
}

export async function importData(
  userId: string,
  data: {
    timeEntries?: TimeEntry[];
    ankiSnapshots?: AnkiSnapshot[];
    videoResources?: VideoResource[];
    videoWatchSessions?: VideoWatchSession[];
    deckProgressSnapshots?: DeckProgressSnapshot[];
  },
): Promise<{ added: number; skipped: number }> {
  const entries = data.timeEntries ?? [];
  const snaps = data.ankiSnapshots ?? [];
  const videoResources = data.videoResources ?? [];
  const videoWatchSessions = data.videoWatchSessions ?? [];
  const deckProgressSnapshots = data.deckProgressSnapshots ?? [];

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

  for (const resource of videoResources) {
    await upsertVideoResource(userId, resource);
  }

  for (const session of videoWatchSessions) {
    await addVideoWatchSession(userId, session);
  }

  for (const snap of deckProgressSnapshots) {
    await addDeckProgressSnapshot(userId, snap);
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
