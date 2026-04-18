import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { CATEGORY_LABELS, CATEGORY_COLORS, toLocalDateStr } from "../types";
import type { TimeEntry, Category } from "../types";
import {
  updateTimeEntry,
  deleteTimeEntry,
  getTimeEntriesForRange,
  getAnkiSnapshotsForRange,
} from "../store/repository";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDurationCompact(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function EditModal({
  entry,
  onSave,
  onCancel,
}: {
  entry: TimeEntry;
  onSave: (updated: TimeEntry) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const d = new Date(entry.startTime);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [category, setCategory] = useState<Category>(entry.category);
  const [date, setDate] = useState(dateStr);
  const [startTime, setStartTime] = useState(formatTime(entry.startTime));
  const [endTime, setEndTime] = useState(formatTime(entry.endTime));
  const [note, setNote] = useState(entry.note ?? "");

  // Focus trap & Escape key
  useEffect(() => {
    const el = dialogRef.current;
    if (el) el.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSave = () => {
    const start = new Date(`${date}T${startTime}:00`).getTime();
    let end = new Date(`${date}T${endTime}:00`).getTime();
    if (end <= start) end += 86400000;
    const duration = Math.round((end - start) / 1000);
    if (duration < 1 || duration > 86400) return;

    onSave({
      ...entry,
      category,
      startTime: start,
      endTime: end,
      duration,
      note: note || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Entry"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-4 w-80 max-w-[90vw] outline-none"
      >
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Edit Entry</h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
            >
              <option value="active">Active</option>
              <option value="passive">Passive</option>
              <option value="anki">Anki</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#4bc0c8]/20 text-[#4bc0c8] hover:bg-[#4bc0c8]/30 transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#2a2a4a] text-gray-400 hover:bg-[#3a3a5a] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!showMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showMenu]);

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-[#2a2a4a] last:border-0">
      <div
        className="w-2 h-8 rounded-full"
        style={{ backgroundColor: CATEGORY_COLORS[entry.category] }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-200">
          {CATEGORY_LABELS[entry.category]}
          {entry.note && (
            <span className="ml-2 text-gray-500 text-xs">{entry.note}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
        </div>
      </div>
      <div className="text-sm font-mono text-gray-400 tabular-nums">
        {formatDurationCompact(entry.duration)}
      </div>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="text-gray-500 hover:text-gray-300 text-sm px-1"
          aria-label="Entry options"
          aria-expanded={showMenu}
        >
          ⋯
        </button>
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-6 z-50 bg-[#16213e] border border-[#2a2a4a] rounded-lg shadow-lg py-1 min-w-[100px]">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onEdit(entry);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#2a2a4a]"
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelete(entry);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[#2a2a4a]"
              >
                🗑 Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DailyGoalBar({
  todaySec,
  goalMinutes,
}: {
  todaySec: number;
  goalMinutes: number;
}) {
  const goalSec = goalMinutes * 60;
  const pct = Math.min((todaySec / goalSec) * 100, 100);
  const done = todaySec >= goalSec;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">
          Daily Goal: {formatDurationCompact(todaySec)} /{" "}
          {formatDurationCompact(goalSec)}
        </span>
        <span className={done ? "text-green-400" : "text-yellow-400"}>
          {done ? "✓ Done!" : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="relative h-2.5 bg-[#2a2a4a] rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: done ? "#06d6a0" : "#f59e0b",
          }}
        />
      </div>
    </div>
  );
}

export function EntryList() {
  const {
    userId,
    todayEntries,
    ankiSnapshots,
    settings,
    loadTodayEntries,
    loadWeekEntries,
    bumpDataVersion,
    dataVersion,
    selectedDate,
    setSelectedDate,
  } = useAppStore();
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);
  const [dateEntries, setDateEntries] = useState<TimeEntry[]>([]);
  const [dateAnkiSnap, setDateAnkiSnap] = useState<
    import("../types").AnkiSnapshot | null
  >(null);

  const isToday = selectedDate === toLocalDateStr();
  const displayEntries = isToday ? todayEntries : dateEntries;

  // Load entries and Anki snapshot for non-today dates
  useEffect(() => {
    if (isToday || !userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDateAnkiSnap(null);
      return;
    }
    let cancelled = false;
    const d = new Date(selectedDate + "T00:00:00");
    const start = d.getTime();
    const end = start + 86400000;
    (async () => {
      const [entries, snaps] = await Promise.all([
        getTimeEntriesForRange(userId, start, end),
        getAnkiSnapshotsForRange(userId, selectedDate, selectedDate),
      ]);
      if (cancelled) return;
      setDateEntries(entries);
      setDateAnkiSnap(snaps[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, isToday, userId, dataVersion]);

  // Get Anki time from snapshots — use store for today, fetched snap for other dates
  const todayAnkiSnap = isToday
    ? ankiSnapshots.find((s) => s.date === selectedDate)
    : dateAnkiSnap;
  const ankiSec = todayAnkiSnap
    ? Math.round(todayAnkiSnap.reviewTimeMs / 1000)
    : 0;

  const totalByCategory = displayEntries.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.duration;
      return acc;
    },
    {} as Record<string, number>,
  );
  totalByCategory["anki"] = (totalByCategory["anki"] ?? 0) + ankiSec;

  const totalSec = displayEntries.reduce((s, e) => s + e.duration, 0) + ankiSec;

  const refresh = async () => {
    await loadTodayEntries();
    await loadWeekEntries();
    // Non-today date list reloads automatically via dataVersion in the effect deps
    bumpDataVersion();
  };

  const goDay = (offset: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const next = toLocalDateStr(d);
    // Don't go into the future
    if (next <= toLocalDateStr()) setSelectedDate(next);
  };

  const formatDateLabel = (dateStr: string) => {
    if (dateStr === toLocalDateStr()) return "Today";
    const d = new Date(dateStr + "T00:00:00");
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    return `${month}/${day} (${dow})`;
  };

  const handleSaveEdit = async (updated: TimeEntry) => {
    if (!userId) return;
    await updateTimeEntry(userId, updated);
    setEditingEntry(null);
    await refresh();
  };

  const handleConfirmDelete = async () => {
    if (!userId || !deletingEntry) return;
    await deleteTimeEntry(userId, deletingEntry.id);
    setDeletingEntry(null);
    await refresh();
  };

  return (
    <div className="p-4">
      {/* Date nav + summary */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goDay(-1)}
            className="text-gray-400 hover:text-white text-lg px-1"
            aria-label="Previous day"
          >
            ‹
          </button>
          <h2 className="text-lg font-semibold text-gray-200">
            {formatDateLabel(selectedDate)}
          </h2>
          <button
            onClick={() => goDay(1)}
            disabled={isToday}
            className="text-gray-400 hover:text-white text-lg px-1 disabled:opacity-30"
            aria-label="Next day"
          >
            ›
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(toLocalDateStr())}
              className="text-xs text-blue-400 hover:text-blue-300 ml-1"
            >
              Today
            </button>
          )}
        </div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {formatDurationCompact(totalSec)}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="flex gap-4 mb-4 text-sm">
        {(["active", "passive", "anki"] as const).map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-gray-400">{CATEGORY_LABELS[cat]}</span>
            <span className="font-medium text-gray-300 tabular-nums">
              {formatDurationCompact(totalByCategory[cat] ?? 0)}
            </span>
          </div>
        ))}
      </div>

      {/* Daily goal progress bar */}
      {isToday && settings.dailyGoalMinutes > 0 && (
        <DailyGoalBar
          todaySec={totalSec}
          goalMinutes={settings.dailyGoalMinutes}
        />
      )}

      {/* Entry list */}
      {displayEntries.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-3xl mb-2">🎧</div>
          <p className="text-gray-500 text-sm text-pretty">No entries yet.</p>
          <p className="text-gray-600 text-xs mt-1 text-pretty">
            Tap Active or Passive above to start tracking.
          </p>
        </div>
      ) : (
        <div className="bg-[#1a1a2e] rounded-lg border border-[#2a2a4a]">
          {displayEntries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onEdit={setEditingEntry}
              onDelete={setDeletingEntry}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          onSave={handleSaveEdit}
          onCancel={() => setEditingEntry(null)}
        />
      )}

      {/* Delete confirmation */}
      {deletingEntry && (
        <DeleteConfirmDialog
          entry={deletingEntry}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEntry(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: TimeEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el) el.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="alertdialog"
      aria-modal="true"
      aria-label="Delete Entry"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-4 w-72 outline-none"
      >
        <h3 className="text-sm font-semibold text-gray-200 mb-2">
          Delete Entry?
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          {CATEGORY_LABELS[entry.category]} {formatTime(entry.startTime)} –{" "}
          {formatTime(entry.endTime)} ({formatDurationCompact(entry.duration)})
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#2a2a4a] text-gray-400 hover:bg-[#3a3a5a] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
