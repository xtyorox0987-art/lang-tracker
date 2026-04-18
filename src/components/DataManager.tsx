import { useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  exportAllData,
  importData,
  deduplicateEntries,
  addTimeEntry,
} from "../store/repository";
import { parseTogglCSV, parseTogglPDF } from "../lib/toggl";
import type { Category } from "../types";

export function DataManager() {
  const {
    userId,
    settings,
    setSettings,
    loadTodayEntries,
    loadWeekEntries,
    loadAnkiSnapshots,
    bumpDataVersion,
  } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const togglRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const handleExport = async () => {
    if (!userId) return;
    const data = await exportAllData(userId);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lang-tracker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Export complete");
    setTimeout(() => setMsg(null), 3000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { added, skipped: duped } = await importData(userId, data);
      await loadTodayEntries();
      await loadWeekEntries();
      await loadAnkiSnapshots();
      bumpDataVersion();
      setMsg(
        `Import complete: ${added} added${duped > 0 ? `, ${duped} duplicates skipped` : ""}`,
      );
    } catch {
      setMsg("Import failed: invalid file format");
    }
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setMsg(null), 5000);
  };

  const handleTogglImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    try {
      let result;
      if (file.name.endsWith(".pdf")) {
        const buffer = await file.arrayBuffer();
        result = await parseTogglPDF(buffer);
      } else {
        const text = await file.text();
        result = parseTogglCSV(text);
      }

      if (result.entries.length === 0) {
        setMsg(
          `Toggl: No entries to import.${result.skipped > 0 ? ` Skipped ${result.skipped} (${result.skippedProjects.join(", ")})` : ""}`,
        );
        setTimeout(() => setMsg(null), 5000);
        return;
      }

      const { added, skipped: duped } = await importData(userId, {
        timeEntries: result.entries,
      });
      await loadTodayEntries();
      await loadWeekEntries();
      bumpDataVersion();
      const parts: string[] = [];
      parts.push(`Toggl: ${added} entries added`);
      if (duped > 0) parts.push(`${duped} duplicates skipped`);
      if (result.skipped > 0)
        parts.push(
          `${result.skipped} unmapped (${result.skippedProjects.join(", ")})`,
        );
      setMsg(parts.join(" / "));
    } catch (err) {
      setMsg(
        `Toggl import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
    if (togglRef.current) togglRef.current.value = "";
    setTimeout(() => setMsg(null), 8000);
  };

  const handleDedup = async () => {
    if (!userId) return;
    const removed = await deduplicateEntries(userId);
    await loadTodayEntries();
    await loadWeekEntries();
    bumpDataVersion();
    setMsg(
      removed > 0
        ? `Removed ${removed} duplicate entries`
        : "No duplicates found",
    );
    setTimeout(() => setMsg(null), 5000);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-200 mb-3 text-balance">
        ⚙️ Data Management
      </h2>

      {/* Toggl Track Import */}
      <div className="mb-4 p-3 bg-[#2a2a4a] border border-[#3a3a5a] rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-[#ff6bcb]">
            Import from Toggl Track
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-2 text-pretty">
          Toggl Track → Reports → Detailed → Export → PDF (free plan) or CSV.
          Imports entries with Project names: Active / Passive / Anki.
        </p>
        <button
          onClick={() => togglRef.current?.click()}
          className="px-4 py-2 text-sm rounded-lg bg-[#ff6bcb]/10 hover:bg-[#ff6bcb]/20 text-[#ff6bcb] font-medium transition-colors border border-[#ff6bcb]/30"
        >
          Select Toggl PDF / CSV
        </button>
        <input
          ref={togglRef}
          type="file"
          accept=".pdf,.csv"
          onChange={handleTogglImport}
          className="hidden"
        />
      </div>

      {/* Standard Export / Import */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleExport}
          className="px-4 py-2 text-sm rounded-lg bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 transition-colors"
        >
          JSON Export
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 text-sm rounded-lg bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 transition-colors"
        >
          JSON Import
        </button>
        <button
          onClick={handleDedup}
          className="px-4 py-2 text-sm rounded-lg bg-[#2a2a4a] hover:bg-[#3a3a5a] text-red-400 transition-colors"
        >
          Dedup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
      {msg && (
        <p
          className="mt-3 text-sm text-gray-400"
          role="status"
          aria-live="polite"
        >
          {msg}
        </p>
      )}

      {/* Daily Goal Setting */}
      <div className="mt-4 p-3 bg-[#2a2a4a] border border-[#3a3a5a] rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#34d399]">
            Daily Goal (minutes)
          </span>
          <input
            type="number"
            min="0"
            max="1440"
            step="5"
            value={settings.dailyGoalMinutes}
            onChange={(e) => {
              const val = Math.max(
                0,
                Math.min(1440, Number(e.target.value) || 0),
              );
              setSettings({ ...settings, dailyGoalMinutes: val });
            }}
            className="w-20 px-2 py-1 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200 text-right"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-pretty">
          Set to 0 to disable. Shows progress bar on Today panel.
        </p>
      </div>

      {/* Manual Entry */}
      <ManualEntryForm
        userId={userId}
        onAdded={async () => {
          await loadTodayEntries();
          await loadWeekEntries();
          bumpDataVersion();
        }}
      />
    </div>
  );
}

function ManualEntryForm({
  userId,
  onAdded,
}: {
  userId: string | null;
  onAdded: () => Promise<void>;
}) {
  const [category, setCategory] = useState<Category>("anki");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("23:50");
  const [endTime, setEndTime] = useState("00:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (!userId) return;

    const start = new Date(`${date}T${startTime}:00`).getTime();
    let end = new Date(`${date}T${endTime}:00`).getTime();
    // 日をまたぐ場合 (endTime < startTime)
    if (end <= start) end += 86400000;

    const duration = Math.round((end - start) / 1000);
    if (duration < 1 || duration > 86400) {
      setMsg("Invalid time range");
      setTimeout(() => setMsg(null), 3000);
      return;
    }

    await addTimeEntry(userId, {
      id: crypto.randomUUID(),
      category,
      startTime: start,
      endTime: end,
      duration,
      source: "manual",
      createdAt: Date.now(),
    });

    await onAdded();
    const h = Math.floor(duration / 3600);
    const m = Math.floor((duration % 3600) / 60);
    const s = duration % 60;
    setMsg(
      `Added: ${category} ${date} ${startTime}–${endTime} (${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")})`,
    );
    setTimeout(() => setMsg(null), 5000);
  };

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm rounded-lg bg-[#2a2a4a] hover:bg-[#3a3a5a] text-[#4bc0c8] transition-colors border border-[#4bc0c8]/30"
        >
          + Manual Entry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 bg-[#2a2a4a] border border-[#3a3a5a] rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[#4bc0c8]">
          Add Manual Entry
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Category */}
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

        {/* Date */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
          />
        </div>

        {/* Start Time */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded bg-[#1a1a2e] border border-[#3a3a5a] text-gray-200"
          />
        </div>

        {/* End Time */}
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

      <button
        onClick={handleAdd}
        className="w-full px-4 py-2 text-sm rounded-lg bg-[#4bc0c8]/10 hover:bg-[#4bc0c8]/20 text-[#4bc0c8] font-medium transition-colors border border-[#4bc0c8]/30"
      >
        Add Entry
      </button>
      {msg && <p className="mt-2 text-xs text-gray-400">{msg}</p>}
    </div>
  );
}
