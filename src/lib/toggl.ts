import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Category, TimeEntry } from "../types";

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Toggl Track の CSV エクスポートを TimeEntry[] に変換する。
 *
 * Toggl CSV の代表的なカラム:
 *   User, Email, Client, Project, Task, Description, Billable,
 *   Start date, Start time, End date, End time, Duration, Tags, Amount
 *
 * Project 名を Category にマッピング:
 *   "Active" / "active" / "アクティブ" → active
 *   "Passive" / "passive" / "パッシブ" → passive
 *   "Anki" / "anki"                    → anki
 */

const PROJECT_MAP: Record<string, Category> = {
  active: "active",
  "active listening": "active",
  アクティブ: "active",
  passive: "passive",
  "passive listening": "passive",
  パッシブ: "passive",
  anki: "anki",
};

function mapProject(project: string): Category | null {
  const key = project.trim().toLowerCase();
  for (const [pattern, cat] of Object.entries(PROJECT_MAP)) {
    if (key === pattern.toLowerCase()) return cat;
  }
  // Partial match fallback
  if (key.includes("active") && !key.includes("passive")) return "active";
  if (key.includes("passive")) return "passive";
  if (key.includes("anki")) return "anki";
  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDuration(duration: string): number {
  // "HH:MM:SS" → seconds
  const parts = duration.trim().split(":");
  if (parts.length === 3) {
    return (
      parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
    );
  }
  if (parts.length === 2) {
    // Toggl durations are always H:MM:SS, but if seconds are lost → H:MM
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
  }
  return parseInt(parts[0]) || 0;
}

function parseDateTime(date: string, time: string): number {
  // date: "2024-01-15" or "2024/01/15", time: "09:30:00"
  const normalized = date.trim().replace(/\//g, "-");
  const dt = new Date(`${normalized}T${time.trim()}`);
  return dt.getTime();
}

export interface TogglImportResult {
  imported: number;
  skipped: number;
  skippedProjects: string[];
  entries: TimeEntry[];
}

export function parseTogglCSV(csvText: string): TogglImportResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { imported: 0, skipped: 0, skippedProjects: [], entries: [] };
  }

  // Parse header to find column indices
  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    project: header.findIndex((h) => h === "project"),
    description: header.findIndex((h) => h === "description"),
    startDate: header.findIndex(
      (h) => h === "start date" || h === "start_date",
    ),
    startTime: header.findIndex(
      (h) => h === "start time" || h === "start_time",
    ),
    endDate: header.findIndex((h) => h === "end date" || h === "end_date"),
    endTime: header.findIndex((h) => h === "end time" || h === "end_time"),
    duration: header.findIndex((h) => h === "duration"),
  };

  if (idx.project === -1) {
    throw new Error(
      'CSV に "Project" カラムが見つかりません。Toggl Track からエクスポートした CSV を使用してください。',
    );
  }

  const entries: TimeEntry[] = [];
  const skippedProjectSet = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const project = cols[idx.project] ?? "";
    const category = mapProject(project);

    if (!category) {
      skipped++;
      if (project.trim()) skippedProjectSet.add(project.trim());
      continue;
    }

    let startTime = 0;
    let endTime = 0;
    let duration = 0;

    // Try to parse start/end times
    if (idx.startDate !== -1 && idx.startTime !== -1) {
      startTime = parseDateTime(
        cols[idx.startDate] ?? "",
        cols[idx.startTime] ?? "",
      );
    }
    if (idx.endDate !== -1 && idx.endTime !== -1) {
      endTime = parseDateTime(cols[idx.endDate] ?? "", cols[idx.endTime] ?? "");
    }

    // Duration
    if (idx.duration !== -1 && cols[idx.duration]) {
      duration = parseDuration(cols[idx.duration]);
    } else if (startTime && endTime) {
      duration = Math.round((endTime - startTime) / 1000);
    }

    if (!endTime && startTime && duration) {
      endTime = startTime + duration * 1000;
    }

    if (duration < 1) continue;

    const description =
      idx.description !== -1 ? cols[idx.description]?.trim() : undefined;

    entries.push({
      id: crypto.randomUUID(),
      category,
      startTime,
      endTime,
      duration,
      source: "manual",
      note: description || undefined,
      createdAt: Date.now(),
    });
  }

  return {
    imported: entries.length,
    skipped,
    skippedProjects: [...skippedProjectSet],
    entries,
  };
}

// ---- Toggl Track PDF パーサー (フラグメント対応) ----

/**
 * Toggl Track Detailed Report PDF からテーブルデータを抽出。
 *
 * PDF テーブル:
 *   DESCRIPTION | DURATION | MEMBER | PROJECT | TAGS | TIME | DATE
 *
 * PDF内の ":" と "-" は \x00 (null文字) として個別テキストアイテムに分割される。
 * 例: "0:22:23" → "0", "\x00", "22", "\x00", "23" の5アイテム
 *     "2026-03-23" → "2026", "\x00", "03", "\x00", "23" の5アイテム
 *
 * 各エントリは3行のY座標で構成:
 *   Y-5: TIME列の時刻範囲 (HH:MM - HH:MM)
 *   Y:   メインデータ (description, duration, member, project, tags)
 *   Y+5: DATE列の日付 (YYYY-MM-DD)
 */

type TItem = { x: number; y: number; str: string };

interface PDFRow {
  duration: string;
  project: string;
  timeRange: string;
  date: string;
}

/** フラグメントを結合し \x00 を指定セパレータに置換 */
function joinFragments(items: TItem[], separator: string): string {
  return items
    .sort((a, b) => a.x - b.x)
    .map((it) => (it.str === "\x00" ? separator : it.str))
    .join("");
}

async function extractTableRows(data: ArrayBuffer): Promise<PDFRow[]> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allItems: TItem[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!("str" in it)) continue;
      // \x00 は保持する (セパレータ文字)
      if (!it.str || (!it.str.trim() && it.str !== "\x00")) continue;
      const globalY = (p - 1) * vp.height + (vp.height - it.transform[5]);
      allItems.push({
        x: it.transform[4],
        y: globalY,
        str: it.str.trim() || it.str,
      });
    }
  }

  // ヘッダー行を検出
  const durHeader = allItems.find((it) => it.str.toUpperCase() === "DURATION");
  const memberHeader = allItems.find((it) => it.str.toUpperCase() === "MEMBER");
  const projHeader = allItems.find((it) => it.str.toUpperCase() === "PROJECT");
  const timeHeader = allItems.find((it) => it.str.toUpperCase() === "TIME");
  const tagsHeader = allItems.find((it) => it.str.toUpperCase() === "TAGS");

  if (!durHeader || !projHeader) {
    console.warn("Toggl PDF: 必須ヘッダーが見つかりません");
    return [];
  }

  const headerY = durHeader.y;
  const colX = {
    duration: durHeader.x,
    // MEMBER header is right boundary for DURATION column
    member: memberHeader?.x ?? durHeader.x + 60,
    project: projHeader.x,
    tags: tagsHeader?.x ?? projHeader.x + 100,
    time: timeHeader?.x ?? 476,
  };

  // ヘッダーより下のデータアイテムのみ
  const dataItems = allItems
    .filter((it) => it.y > headerY + 10)
    .sort((a, b) => a.y - b.y);

  // エントリ行の検出: DURATION列(x±10)にある1桁の数字 = H:MM:SS の時間部分
  const entryAnchors = dataItems.filter(
    (it) => /^\d$/.test(it.str) && Math.abs(it.x - colX.duration) < 10,
  );

  const rows: PDFRow[] = [];

  for (const anchor of entryAnchors) {
    const y = anchor.y;

    // -- DURATION: アンカー(時間の1桁)から右方向にH:MM:SSのフラグメントを収集 --
    const durItems = dataItems.filter(
      (it) =>
        Math.abs(it.y - y) < 4 && it.x >= anchor.x - 2 && it.x < anchor.x + 55,
    );
    const duration = joinFragments(durItems, ":");

    // -- PROJECT: メイン行Y(±4), project列X範囲 (tags列の手前まで) --
    const projItems = dataItems.filter(
      (it) =>
        Math.abs(it.y - y) < 4 &&
        it.x >= colX.project - 10 &&
        it.x < colX.tags - 5,
    );
    const project = projItems
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .filter((s) => s !== "\x00" && s !== "•" && s !== "-")
      .join(" ")
      .trim();

    // -- TIME: メイン行より上 (Y-14 〜 Y-2), time列X以降 --
    const timeItems = dataItems.filter(
      (it) => it.y >= y - 14 && it.y < y - 2 && it.x >= colX.time - 15,
    );
    // 数字のみ取り出し: [HH, MM, HH, MM] → "HH:MM - HH:MM"
    const timeNums = timeItems
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .filter((s) => /^\d+$/.test(s));
    let timeRange = "";
    if (timeNums.length >= 4) {
      timeRange = `${timeNums[0]}:${timeNums[1]} - ${timeNums[2]}:${timeNums[3]}`;
    }

    // -- DATE: メイン行(Y±4) またはその下 (Y+2 〜 Y+14), time列X以降 --
    // 日またぎエントリでは日付がメイン行と同じYに配置される
    const dateItems = dataItems.filter(
      (it) =>
        (Math.abs(it.y - y) < 4 || (it.y > y + 2 && it.y <= y + 14)) &&
        it.x >= colX.time - 15,
    );
    // \x00 → "-" で結合し、最初の YYYY-MM-DD パターンを抽出
    const dateRaw = joinFragments(dateItems, "-");
    const dateMatch = dateRaw.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    rows.push({ duration, project, timeRange, date });
  }

  // 日付が空のエントリに隣接エントリの日付を継承
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].date) {
      // 前後のエントリから日付を探す (Toggl PDF は時系列降順)
      const prev = rows[i - 1]?.date;
      const next = rows[i + 1]?.date;
      rows[i].date = prev || next || "";
    }
  }

  return rows;
}

export async function parseTogglPDF(
  data: ArrayBuffer,
): Promise<TogglImportResult> {
  const rows = await extractTableRows(data);

  const entries: TimeEntry[] = [];
  const skippedProjectSet = new Set<string>();
  let skipped = 0;

  for (const row of rows) {
    const category = mapProject(row.project);
    if (!category) {
      skipped++;
      if (row.project) skippedProjectSet.add(row.project);
      continue;
    }

    const duration = parseDuration(row.duration);
    if (duration < 1) continue;

    let startTime = 0;
    let endTime = 0;

    const rangeMatch = row.timeRange.match(
      /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
    );
    if (rangeMatch && row.date) {
      const pad = (s: string) => (s.length === 5 ? `${s}:00` : s);
      startTime = new Date(`${row.date}T${pad(rangeMatch[1])}`).getTime();
      endTime = new Date(`${row.date}T${pad(rangeMatch[2])}`).getTime();
      if (endTime < startTime) endTime += 86400000;
    } else if (row.date) {
      startTime = new Date(`${row.date}T00:00:00`).getTime();
      endTime = startTime + duration * 1000;
    }

    entries.push({
      id: crypto.randomUUID(),
      category,
      startTime,
      endTime,
      duration,
      source: "manual",
      note: undefined,
      createdAt: Date.now(),
    });
  }

  return {
    imported: entries.length,
    skipped,
    skippedProjects: [...skippedProjectSet],
    entries,
  };
}
