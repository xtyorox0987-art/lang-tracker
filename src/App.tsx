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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAppStore } from "./store/useAppStore";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";

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

  useKeyboardShortcuts();

  useEffect(() => {
    if (!userId) return;
    initTimer();
    // Eager: needed for first paint (header, today list, week chart default)
    Promise.all([
      loadTodayEntries(),
      loadWeekEntries(),
      loadAnkiSnapshots(),
    ]);

    // Deferred: month/year/all are only needed for Streak + extended chart ranges
    type IdleCb = (cb: () => void) => number;
    const schedule: IdleCb =
      (window as unknown as { requestIdleCallback?: IdleCb })
        .requestIdleCallback ?? ((cb) => window.setTimeout(cb, 200));
    const handle = schedule(() => {
      Promise.all([
        loadMonthEntries(),
        loadYearEntries(),
        loadAllEntries(),
        loadMonthAnkiSnapshots(),
        loadYearAnkiSnapshots(),
        loadAllAnkiSnapshots(),
      ]);
    });
    return () => {
      const cancel = (
        window as unknown as { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback;
      if (cancel) cancel(handle);
      else window.clearTimeout(handle);
    };
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
          <ErrorBoundary>
            <TimerPanel />
          </ErrorBoundary>
        </div>

        {/* Today's Entries */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <ErrorBoundary>
            <EntryList />
          </ErrorBoundary>
        </div>

        {/* Anki */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <ErrorBoundary>
            <AnkiStatus />
          </ErrorBoundary>
        </div>

        {/* Week Chart */}
        <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="p-4 text-center text-gray-500 text-sm">
                  Loading chart…
                </div>
              }
            >
              <WeekChart />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Settings / Data Manager */}
        {showSettings && (
          <div className="bg-[#16213e] mt-2 border-y border-[#2a2a4a]">
            <ErrorBoundary>
              <DataManager />
            </ErrorBoundary>
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
