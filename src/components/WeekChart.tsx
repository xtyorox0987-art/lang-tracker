import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { useAppStore } from "../store/useAppStore";
import {
  getTimeEntriesForRange,
  getAnkiSnapshotsForRange,
} from "../store/repository";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  toLocalDateStr,
  type TimeEntry,
  type AnkiSnapshot,
} from "../types";

interface DayData {
  date: string;
  label: string;
  active: number;
  passive: number;
  anki: number;
  total: number;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Period = "week" | "month" | "year" | "all";

/** Format seconds as "H:MM:SS" like Toggl */
function fmtHMS(sec: number): string {
  if (sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Label for chart Y axis: show "0h", "0h 30", "1h" etc. from seconds */
function yTickFormatter(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}`;
}

/** Top-of-bar label formatter (value in seconds) */
function barLabel(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const value = Number(props.value ?? 0);
  if (value <= 0) return null;
  const text = fmtHMS(Math.round(value));
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      fill="#9ca3af"
      textAnchor="middle"
      fontSize={9}
    >
      {text}
    </text>
  );
}

function AnkiMatureTrend({
  snaps,
  period,
}: {
  snaps: AnkiSnapshot[];
  period: Period;
}) {
  const data = useMemo(() => {
    const sorted = [...snaps]
      .filter((s) => s.matureCount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    // For year/all, aggregate to monthly (last snapshot per month)
    if (period === "year" || period === "all") {
      const monthMap = new Map<string, { label: string; mature: number }>();
      for (const s of sorted) {
        const d = new Date(s.date + "T00:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label =
          period === "year"
            ? MONTH_SHORT[d.getMonth()]
            : `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
        monthMap.set(key, { label, mature: s.matureCount });
      }
      return [...monthMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
    }

    return sorted.map((s) => {
      const d = new Date(s.date + "T00:00:00");
      const label =
        period === "week" ? DAY_SHORT[d.getDay()] : `${d.getDate()}`;
      return { date: s.date, label, mature: s.matureCount };
    });
  }, [snaps, period]);

  if (data.length === 0) return null;

  const latestMature = data[data.length - 1].mature;
  const firstMature = data[0].mature;
  const diff = latestMature - firstMature;

  // Compute interval to avoid label overlap
  const interval = data.length > 15 ? Math.ceil(data.length / 10) - 1 : 0;

  return (
    <div className="mt-3 bg-[#1a1a2e] rounded-lg border border-[#2a2a4a] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#34d399]">
          Anki Mature Cards
        </span>
        <span className="text-xs text-gray-400">
          {latestMature.toLocaleString()}
          {diff > 0 && <span className="text-green-400 ml-1">+{diff}</span>}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            height={20}
            interval={interval}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            width={45}
            domain={["dataMin - 10", "dataMax + 10"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#16213e",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              color: "#e5e7eb",
              fontSize: 12,
            }}
            formatter={(value) => [Number(value).toLocaleString(), "Mature"]}
          />
          <Line
            type="monotone"
            dataKey="mature"
            stroke="#34d399"
            strokeWidth={2}
            dot={{ r: 2, fill: "#34d399" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekChart() {
  const { userId, settings, dataVersion } = useAppStore();
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0); // 0 = current, -1 = previous, etc.
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [snaps, setSnaps] = useState<AnkiSnapshot[]>([]);

  // Reset offset when period changes
  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    setOffset(0);
  }, []);

  // Compute date range based on period + offset
  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = today.getDay();
      const diff = (day - settings.weekStartsOn + 7) % 7;
      const weekStart = new Date(
        today.getTime() - diff * 86400000 + offset * 7 * 86400000,
      );
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      return { start: weekStart, end: weekEnd };
    }
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
      return { start, end };
    }
    if (period === "year") {
      const start = new Date(now.getFullYear() + offset, 0, 1);
      const end = new Date(now.getFullYear() + offset + 1, 0, 1);
      return { start, end };
    }
    // all
    return {
      start: new Date(0),
      end: new Date(now.getTime() + 86400000),
    };
  }, [period, offset, settings.weekStartsOn]);

  // Load data for the computed range
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const [e, s] = await Promise.all([
        getTimeEntriesForRange(
          userId,
          dateRange.start.getTime(),
          dateRange.end.getTime(),
        ),
        getAnkiSnapshotsForRange(
          userId,
          toLocalDateStr(dateRange.start),
          toLocalDateStr(dateRange.end),
        ),
      ]);
      if (!cancelled) {
        setEntries(e);
        setSnaps(s);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, dateRange, dataVersion]);

  const rawData = useMemo(() => {
    const now = new Date();

    // For year/all we aggregate into buckets (months or years)
    if (period === "year" || period === "all") {
      const bucketMap = new Map<
        string,
        { label: string; active: number; passive: number; anki: number }
      >();

      if (period === "year") {
        const yr = dateRange.start.getFullYear();
        for (let m = 0; m < 12; m++) {
          const key = `${yr}-${String(m + 1).padStart(2, "0")}`;
          bucketMap.set(key, {
            label: MONTH_SHORT[m],
            active: 0,
            passive: 0,
            anki: 0,
          });
        }
      } else {
        // "all" — derive year range from entries + snaps
        let minYear = now.getFullYear();
        let maxYear = now.getFullYear();
        for (const e of entries) {
          const y = new Date(e.startTime).getFullYear();
          if (y < minYear) minYear = y;
          if (y > maxYear) maxYear = y;
        }
        for (const s of snaps) {
          const y = parseInt(s.date.slice(0, 4), 10);
          if (y < minYear) minYear = y;
          if (y > maxYear) maxYear = y;
        }
        // If span <= 2 years, show monthly buckets; otherwise yearly
        if (maxYear - minYear <= 1) {
          for (let y = minYear; y <= maxYear; y++) {
            for (let m = 0; m < 12; m++) {
              const key = `${y}-${String(m + 1).padStart(2, "0")}`;
              bucketMap.set(key, {
                label: `${y}/${String(m + 1).padStart(2, "0")}`,
                active: 0,
                passive: 0,
                anki: 0,
              });
            }
          }
        } else {
          for (let y = minYear; y <= maxYear; y++) {
            bucketMap.set(String(y), {
              label: String(y),
              active: 0,
              passive: 0,
              anki: 0,
            });
          }
        }
      }

      const isMonthlyBuckets = [...bucketMap.keys()].some((k) =>
        k.includes("-"),
      );

      for (const entry of entries) {
        const d = new Date(entry.startTime);
        const key = isMonthlyBuckets
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          : String(d.getFullYear());
        const bucket = bucketMap.get(key);
        if (bucket) {
          if (entry.category === "anki") {
            bucket.anki += entry.duration;
          } else {
            bucket[entry.category as "active" | "passive"] += entry.duration;
          }
        }
      }

      for (const snap of snaps) {
        const y = parseInt(snap.date.slice(0, 4), 10);
        const m = parseInt(snap.date.slice(5, 7), 10);
        const key = isMonthlyBuckets
          ? `${y}-${String(m).padStart(2, "0")}`
          : String(y);
        const bucket = bucketMap.get(key);
        if (bucket) {
          bucket.anki += Math.round(snap.reviewTimeMs / 1000);
        }
      }

      const days: DayData[] = [];
      for (const [date, b] of bucketMap) {
        const total = b.active + b.passive + b.anki;
        days.push({ date, ...b, total });
      }
      return days;
    }

    // Week / Month — daily buckets
    const startDate = dateRange.start;
    const numDays = Math.round(
      (dateRange.end.getTime() - dateRange.start.getTime()) / 86400000,
    );

    const days: DayData[] = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDate.getTime() + i * 86400000);
      const dateStr = toLocalDateStr(d);
      const dayOfWeek = DAY_SHORT[d.getDay()];
      const label = period === "week" ? dayOfWeek : `${d.getDate()}`;
      days.push({
        date: dateStr,
        label,
        active: 0,
        passive: 0,
        anki: 0,
        total: 0,
      });
    }

    for (const entry of entries) {
      const dateStr = toLocalDateStr(new Date(entry.startTime));
      const dayData = days.find((d) => d.date === dateStr);
      if (dayData) {
        if (entry.category === "anki") {
          dayData.anki += entry.duration;
        } else {
          dayData[entry.category as "active" | "passive"] += entry.duration;
        }
      }
    }

    for (const snap of snaps) {
      const dayData = days.find((d) => d.date === snap.date);
      if (dayData) {
        dayData.anki += Math.round(snap.reviewTimeMs / 1000);
      }
    }

    for (const d of days) {
      d.total = d.active + d.passive + d.anki;
    }

    return days;
  }, [entries, snaps, period, dateRange]);

  // Stable copy for Recharts (avoid infinite re-render loop)
  const chartData = useMemo(() => rawData.map((d) => ({ ...d })), [rawData]);

  const totalSec = rawData.reduce((s, d) => s + d.total, 0);

  // Compute the number of days in the period
  const dayCount = useMemo(() => {
    if (period === "all") {
      // Find actual min/max dates from entries and snaps
      let minTs = Infinity;
      let maxTs = -Infinity;
      for (const e of entries) {
        if (e.startTime < minTs) minTs = e.startTime;
        if (e.startTime > maxTs) maxTs = e.startTime;
      }
      for (const s of snaps) {
        const ts = new Date(s.date + "T00:00:00").getTime();
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
      if (minTs === Infinity) return 0;
      return Math.max(1, Math.round((maxTs - minTs) / 86400000) + 1);
    }
    return Math.round(
      (dateRange.end.getTime() - dateRange.start.getTime()) / 86400000,
    );
  }, [period, dateRange, entries, snaps]);

  // Compute category totals for the distribution badges
  const catTotals = rawData.reduce(
    (acc, d) => {
      acc.active += d.active;
      acc.passive += d.passive;
      acc.anki += d.anki;
      return acc;
    },
    { active: 0, passive: 0, anki: 0 },
  );

  const periodLabel = useMemo(() => {
    const s = dateRange.start;
    if (period === "all") return "All Time";
    if (period === "year") return `${s.getFullYear()}`;
    if (period === "month") {
      return `${MONTH_SHORT[s.getMonth()]} ${s.getFullYear()}`;
    }
    // week
    const e = new Date(dateRange.end.getTime() - 86400000);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${fmt(s)} – ${fmt(e)}`;
  }, [period, dateRange]);

  // Donut chart data
  const pieData = useMemo(() => {
    const cats = [
      {
        key: "active" as const,
        name: CATEGORY_LABELS.active,
        color: CATEGORY_COLORS.active,
        value: catTotals.active,
      },
      {
        key: "passive" as const,
        name: CATEGORY_LABELS.passive,
        color: CATEGORY_COLORS.passive,
        value: catTotals.passive,
      },
      {
        key: "anki" as const,
        name: CATEGORY_LABELS.anki,
        color: CATEGORY_COLORS.anki,
        value: catTotals.anki,
      },
    ].filter((c) => c.value > 0);
    const total = cats.reduce((s, c) => s + c.value, 0);
    return cats.map((c) => ({
      ...c,
      pct: total > 0 ? ((c.value / total) * 100).toFixed(1) : "0.0",
    }));
  }, [catTotals]);

  return (
    <div className="p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {period !== "all" && (
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="text-gray-400 hover:text-white text-lg px-1"
              aria-label="Previous period"
            >
              ‹
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-200">{periodLabel}</h2>
          {dayCount > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">
              {dayCount} days
            </span>
          )}
          {period !== "all" && (
            <>
              <button
                onClick={() => setOffset((o) => o + 1)}
                disabled={offset >= 0}
                className="text-gray-400 hover:text-white text-lg px-1 disabled:opacity-30"
                aria-label="Next period"
              >
                ›
              </button>
              {offset !== 0 && (
                <button
                  onClick={() => setOffset(0)}
                  className="text-xs text-blue-400 hover:text-blue-300 ml-1"
                >
                  Today
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-[#2a2a4a] rounded-lg p-0.5 text-xs">
            {(["week", "month", "year", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  period === p
                    ? "bg-[#3a3a5a] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {p === "week"
                  ? "Week"
                  : p === "month"
                    ? "Month"
                    : p === "year"
                      ? "Year"
                      : "All"}
              </button>
            ))}
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {fmtHMS(totalSec) || "0:00:00"}
          </div>
        </div>
      </div>

      {/* Category distribution */}
      <div className="flex gap-3 mb-3 text-xs">
        {(["active", "passive", "anki"] as const).map((cat) => (
          <div key={cat} className="flex items-center gap-1">
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-gray-500">{CATEGORY_LABELS[cat]}</span>
            <span className="text-gray-400 font-medium tabular-nums">
              {fmtHMS(catTotals[cat]) || "0:00:00"}
            </span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[#1a1a2e] rounded-lg border border-[#2a2a4a] p-3">
        <div className="flex gap-3">
          {/* Bar chart */}
          <div className="flex-1 min-w-0">
            <ResponsiveContainer
              width="100%"
              height={period === "week" ? 220 : 280}
            >
              <BarChart
                data={chartData}
                barCategoryGap={period === "week" ? "20%" : "10%"}
              >
                <XAxis
                  dataKey="label"
                  tick={{
                    fontSize: period === "week" ? 12 : 9,
                    fill: "#9ca3af",
                  }}
                  height={period === "all" ? 35 : 25}
                  angle={period === "all" ? -45 : 0}
                  textAnchor={period === "all" ? "end" : "middle"}
                  interval={
                    period === "week"
                      ? 0
                      : period === "month"
                        ? 4
                        : Math.max(0, Math.ceil(chartData.length / 12) - 1)
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  width={40}
                  tickFormatter={yTickFormatter}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#16213e",
                    border: "1px solid #2a2a4a",
                    borderRadius: 8,
                    color: "#e5e7eb",
                  }}
                  labelStyle={{ color: "#9ca3af" }}
                  labelFormatter={(label, payload) => {
                    if (period === "year" || period === "all") {
                      const dateKey = payload?.[0]?.payload?.date as
                        | string
                        | undefined;
                      if (dateKey && dateKey.includes("-")) {
                        const [y, m] = dateKey.split("-");
                        return `${y}/${m}`;
                      }
                      return String(label);
                    }
                    return String(label);
                  }}
                  formatter={(value, name) => {
                    const sec = Number(value);
                    return [
                      fmtHMS(Math.round(sec)) || "0:00:00",
                      CATEGORY_LABELS[
                        String(name) as keyof typeof CATEGORY_LABELS
                      ] ?? name,
                    ];
                  }}
                />
                <Legend
                  formatter={(value: string) =>
                    CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ??
                    value
                  }
                />
                <Bar
                  dataKey="active"
                  stackId="a"
                  fill={CATEGORY_COLORS.active}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="passive"
                  stackId="a"
                  fill={CATEGORY_COLORS.passive}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="anki"
                  stackId="a"
                  fill={CATEGORY_COLORS.anki}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                >
                  {/* Duration labels on top of stacked bars */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <LabelList dataKey="total" content={barLabel as any} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut chart */}
          {totalSec > 0 && (
            <div
              className="flex flex-col items-center justify-center"
              style={{ width: 160 }}
            >
              <div className="relative">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      wrapperStyle={{ zIndex: 10 }}
                      contentStyle={{
                        backgroundColor: "#16213e",
                        border: "1px solid #2a2a4a",
                        borderRadius: 8,
                        fontSize: 13,
                        padding: "8px 12px",
                      }}
                      itemStyle={{ color: "#ffffff", fontWeight: 600 }}
                      formatter={(value, name) => [
                        fmtHMS(Number(value)) || "0:00:00",
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-white font-bold text-xs">
                    {fmtHMS(totalSec)}
                  </span>
                  <span className="text-gray-500 text-[9px] uppercase">
                    Category
                  </span>
                </div>
              </div>
              {/* Percentages */}
              <div className="flex flex-col gap-1 mt-1 text-[10px]">
                {pieData.map((d) => (
                  <div key={d.key} className="flex items-center gap-1">
                    <div
                      className="size-2 rounded-sm"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-gray-400">{d.pct}%</span>
                    <span className="text-gray-500">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anki Mature Trend */}
      {snaps.length > 0 && snaps.some((s) => s.matureCount > 0) && (
        <AnkiMatureTrend snaps={snaps} period={period} />
      )}
    </div>
  );
}
