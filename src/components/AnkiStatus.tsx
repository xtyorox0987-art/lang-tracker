import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { fetchTodayAnkiStats, isAnkiConnected } from "../lib/anki";
import { addAnkiSnapshot } from "../store/repository";
import { CATEGORY_COLORS, toLocalDateStr } from "../types";

export function AnkiStatus() {
  const {
    userId,
    loadTodayEntries,
    loadAnkiSnapshots,
    ankiSnapshots,
    bumpDataVersion,
  } = useAppStore();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const today = toLocalDateStr();
  const todaySnap = ankiSnapshots.find((s) => s.date === today);

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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-200">📚 Anki</h2>
        <div className="flex items-center gap-2">
          {connected === null ? (
            <span className="text-xs text-gray-500">Checking…</span>
          ) : connected ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-2 h-2 bg-gray-600 rounded-full inline-block" />
              Offline
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={!connected || syncing}
            className="px-3 py-1 text-xs rounded-md bg-[#06d6a0]/10 text-[#06d6a0] hover:bg-[#06d6a0]/20 border border-[#06d6a0]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {todaySnap ? (
        <div className="bg-[#1a1a2e] rounded-lg border border-[#2a2a4a] p-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div
                className="text-2xl font-bold"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {todaySnap.reviewCount}
              </div>
              <div className="text-xs text-gray-500">Reviews</div>
            </div>
            <div>
              <div
                className="text-2xl font-bold"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {(() => {
                  const totalSec = Math.round(todaySnap.reviewTimeMs / 1000);
                  const m = Math.floor(totalSec / 60);
                  const s = totalSec % 60;
                  return `${m}:${String(s).padStart(2, "0")}`;
                })()}
              </div>
              <div className="text-xs text-gray-500">Study Time</div>
            </div>
            <div>
              <div
                className="text-2xl font-bold"
                style={{ color: CATEGORY_COLORS.anki }}
              >
                {todaySnap.matureCount}
              </div>
              <div className="text-xs text-gray-500">Matured</div>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500 border-t border-[#2a2a4a] pt-2">
            <span>
              Learning {todaySnap.youngCount} / New {todaySnap.newCount}
            </span>
            {lastSync && <span>Last sync {lastSync}</span>}
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-sm text-gray-500">
          {connected
            ? 'Press "Sync" to fetch today\'s Anki data'
            : "Start Anki desktop and enable AnkiConnect"}
        </div>
      )}
    </div>
  );
}
