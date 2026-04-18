import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  fetchTodayAnkiStats,
  isAnkiConnected,
  backfillAnkiMatureHistory,
} from "../lib/anki";
import {
  addAnkiSnapshot,
  getAnkiSnapshotsForRange,
  batchAddAnkiSnapshots,
} from "../store/repository";
import { CATEGORY_COLORS, toLocalDateStr } from "../types";
import type { AnkiSnapshot } from "../types";

export function AnkiStatus() {
  const {
    userId,
    loadTodayEntries,
    loadAnkiSnapshots,
    loadMonthAnkiSnapshots,
    loadYearAnkiSnapshots,
    loadAllAnkiSnapshots,
    ankiSnapshots,
    bumpDataVersion,
    dataVersion,
    selectedDate,
  } = useAppStore();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string | null>(null);
  const [dateSnap, setDateSnap] = useState<AnkiSnapshot | null>(null);

  const today = toLocalDateStr();
  const isToday = selectedDate === today;

  // Load snapshot for selected date
  useEffect(() => {
    if (isToday || !userId) {
      setDateSnap(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const snaps = await getAnkiSnapshotsForRange(
        userId,
        selectedDate,
        selectedDate,
      );
      if (cancelled) return;
      setDateSnap(snaps[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, isToday, userId, dataVersion]);

  const displaySnap = isToday
    ? (ankiSnapshots.find((s) => s.date === today) ?? null)
    : dateSnap;

  const checkConnection = async () => {
    const ok = await isAnkiConnected();
    setConnected(ok);
  };

  useEffect(() => {
    checkConnection();
    const id = setInterval(checkConnection, 30000);
    return () => clearInterval(id);
  }, []);

  const handleSync = async () => {
    if (!userId || syncing) return;
    setSyncing(true);
    try {
      const stats = await fetchTodayAnkiStats();
      if (stats) {
        await addAnkiSnapshot(userId, stats);
        await loadAnkiSnapshots();
        await loadTodayEntries();
        bumpDataVersion();
        setLastSync(
          new Date().toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleBackfill = async () => {
    if (!userId || backfilling) return;
    setBackfilling(true);
    setBackfillProgress("Starting…");
    try {
      const snapshots = await backfillAnkiMatureHistory((_pct, msg) => {
        setBackfillProgress(msg);
      });
      // Batch-save all snapshots at once
      const { saved, failed } = await batchAddAnkiSnapshots(userId, snapshots);
      await loadAnkiSnapshots();
      await loadMonthAnkiSnapshots();
      await loadYearAnkiSnapshots();
      await loadAllAnkiSnapshots();
      bumpDataVersion();
      const msg =
        failed > 0
          ? `Done! ${saved}/${snapshots.length} saved (${failed} failed)`
          : `Done! ${saved} days saved`;
      setBackfillProgress(msg);
      setTimeout(() => setBackfillProgress(null), 5000);
    } catch (err) {
      setBackfillProgress(
        `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      );
      setTimeout(() => setBackfillProgress(null), 8000);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-200">📚 Anki</h2>
        <div className="flex items-center gap-2">
          {connected === null ? (
            <span className="text-xs text-gray-500">Checking…</span>
          ) : connected ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="size-2 bg-green-400 rounded-full inline-block" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="size-2 bg-gray-600 rounded-full inline-block" />
              Offline
            </span>
          )}
          {isToday && (
            <button
              onClick={handleSync}
              disabled={!connected || syncing}
              className="px-3 py-1 text-xs rounded-md bg-[#34d399]/10 text-[#34d399] hover:bg-[#34d399]/20 border border-[#34d399]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      </div>

      {displaySnap ? (
        <div className="bg-[#1a1a2e] rounded-lg border border-[#2a2a4a] p-3">
          {!isToday && (
            <div className="text-xs text-gray-500 mb-2">{selectedDate}</div>
          )}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {displaySnap.reviewCount}
              </div>
              <div className="text-xs text-gray-500">Reviews</div>
            </div>
            <div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {(() => {
                  const totalSec = Math.round(displaySnap.reviewTimeMs / 1000);
                  const m = Math.floor(totalSec / 60);
                  const s = totalSec % 60;
                  return `${m}:${String(s).padStart(2, "0")}`;
                })()}
              </div>
              <div className="text-xs text-gray-500">Study Time</div>
            </div>
            <div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {displaySnap.matureCount}
              </div>
              <div className="text-xs text-gray-500">Matured</div>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500 border-t border-[#2a2a4a] pt-2">
            <span>
              Learning {displaySnap.youngCount} / New {displaySnap.newCount}
            </span>
            {isToday && lastSync && <span>Last sync {lastSync}</span>}
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <div className="text-3xl mb-2">📚</div>
          <p className="text-sm text-gray-500 text-pretty">
            {connected
              ? 'Press "Sync" to fetch today\'s Anki data'
              : "Start Anki desktop and enable AnkiConnect"}
          </p>
        </div>
      )}

      {/* Backfill button */}
      {connected && isToday && (
        <div className="mt-3 pt-3 border-t border-[#2a2a4a]">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500">
                Backfill mature history from review logs
              </span>
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="px-3 py-1 text-xs rounded-md bg-[#2a2a4a] text-gray-400 hover:bg-[#3a3a5a] hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {backfilling ? "Processing…" : "Backfill"}
            </button>
          </div>
          {backfillProgress && (
            <p
              className="mt-1 text-xs text-gray-400"
              role="status"
              aria-live="polite"
            >
              {backfillProgress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
