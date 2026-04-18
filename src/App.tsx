import { useEffect, useState, lazy, Suspense } from "react";
import { AuthGate, UserMenu } from "./components/Auth";
import { TimerPanel } from "./components/TimerPanel";
import { EntryList } from "./components/EntryList";
import { AnkiStatus } from "./components/AnkiStatus";
const WeekChart = lazy(() =>
  import("./components/WeekChart").then((m) => ({ default: m.WeekChart })),
);
import { DataManager } from "./components/DataManager";
import { StreakBadge } from "./components/Streak";
import { useAppStore } from "./store/useAppStore";

function Dashboard() {
  const {
    userId,
    initTimer,
    loadTodayEntries,
    loadWeekEntries,
    loadMonthEntries,
    loadYearEntries,
    loadAllEntries,
    loadAnkiSnapshots,
    loadMonthAnkiSnapshots,
    loadYearAnkiSnapshots,
    loadAllAnkiSnapshots,
  } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!userId) return;
    initTimer();
    // Load all data ranges in parallel
    Promise.all([
      loadTodayEntries(),
      loadWeekEntries(),
      loadMonthEntries(),
      loadYearEntries(),
      loadAllEntries(),
      loadAnkiSnapshots(),
      loadMonthAnkiSnapshots(),
      loadYearAnkiSnapshots(),
      loadAllAnkiSnapshots(),
    ]);
  }, [
    userId,
    initTimer,
    loadTodayEntries,
    loadWeekEntries,
    loadMonthEntries,
    loadYearEntries,
    loadAllEntries,
    loadAnkiSnapshots,
    loadMonthAnkiSnapshots,
    loadYearAnkiSnapshots,
    loadAllAnkiSnapshots,
  ]);

  return (
    <div className="min-h-dvh bg-[#1a1a2e]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#16213e]/95 backdrop-blur-sm border-b border-[#2a2a4a] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-white text-balance">
            🎧 Lang Tracker
          </h1>
          <div className="flex items-center gap-3">
            <StreakBadge />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-gray-400 hover:text-gray-200 text-sm"
              aria-label="Settings"
              aria-expanded={showSettings}
            >
              ⚙️
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto pb-8">
        {/* Timer */}
        <div className="bg-[#16213e] border-b border-[#2a2a4a]">
          <TimerPanel />
        </div>

        {/* Today's Entries */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <EntryList />
        </div>

        {/* Anki */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <AnkiStatus />
        </div>

        {/* Week Chart */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <Suspense
            fallback={
              <div className="p-4 text-center text-gray-500 text-sm">
                Loading chart…
              </div>
            }
          >
            <WeekChart />
          </Suspense>
        </div>

        {/* Settings / Data Manager */}
        {showSettings && (
          <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
            <DataManager />
          </div>
        )}

        {/* Version */}
        <div className="py-4 text-center text-[10px] text-gray-600 tabular-nums">
          v{__APP_VERSION__}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

export default App;
