import { useState, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { CATEGORY_COLORS } from "../types";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TimerPanel() {
  const { activeTimer, startTimer, stopTimer } = useAppStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeTimer?.isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(0);
      document.title = "Lang Tracker";
      return;
    }
    const tick = () => {
      const ms = Date.now() - activeTimer.startTime;
      setElapsed(ms);
      document.title = `${formatDuration(ms)} - ${activeTimer.category === "active" ? "Active" : "Passive"} | Lang Tracker`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      document.title = "Lang Tracker";
    };
  }, [activeTimer]);

  const handleToggle = async (category: "active" | "passive") => {
    if (activeTimer?.isRunning) {
      if (activeTimer.category === category) {
        await stopTimer();
      } else {
        await stopTimer();
        startTimer(category);
      }
    } else {
      startTimer(category);
    }
  };

  return (
    <div className="p-4">
      {/* Timer display */}
      {activeTimer?.isRunning ? (
        <div className="mb-4 text-center">
          <div
            className="text-5xl font-mono font-bold tracking-tight tabular-nums"
            style={{ color: CATEGORY_COLORS[activeTimer.category] }}
          >
            {formatDuration(elapsed)}
          </div>
          <div className="mt-1 text-sm text-gray-400">
            {activeTimer.category === "active"
              ? "🎧 Active Listening"
              : "📻 Passive Listening"}
          </div>
        </div>
      ) : (
        <div className="mb-4 text-center">
          <div className="text-4xl font-mono font-bold text-gray-600 tabular-nums">
            0:00
          </div>
          <div className="mt-1 text-sm text-gray-500 text-pretty">
            Ready to learn
          </div>
        </div>
      )}

      {/* Timer buttons */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => handleToggle("active")}
          className={`flex-1 max-w-48 py-4 px-6 rounded-xl text-lg font-semibold transition-all
            ${
              activeTimer?.category === "active" && activeTimer.isRunning
                ? "text-white shadow-lg scale-105"
                : "bg-[#2a2a4a] text-[#e57cd8] hover:bg-[#3a3a5a] border border-[#3a3a5a]"
            }`}
          style={
            activeTimer?.category === "active" && activeTimer.isRunning
              ? {
                  backgroundColor: "#e57cd8",
                  boxShadow: "0 10px 25px rgba(229,124,216,0.3)",
                }
              : undefined
          }
        >
          🎧 Active
        </button>
        <button
          onClick={() => handleToggle("passive")}
          className={`flex-1 max-w-48 py-4 px-6 rounded-xl text-lg font-semibold transition-all
            ${
              activeTimer?.category === "passive" && activeTimer.isRunning
                ? "text-white shadow-lg scale-105"
                : "bg-[#2a2a4a] text-[#4bc0c8] hover:bg-[#3a3a5a] border border-[#3a3a5a]"
            }`}
          style={
            activeTimer?.category === "passive" && activeTimer.isRunning
              ? {
                  backgroundColor: "#4bc0c8",
                  boxShadow: "0 10px 25px rgba(75,192,200,0.3)",
                }
              : undefined
          }
        >
          📻 Passive
        </button>
      </div>

      {/* Stop button */}
      {activeTimer?.isRunning && (
        <div className="mt-3 text-center">
          <button
            onClick={() => stopTimer()}
            className="px-6 py-2 rounded-lg bg-[#2a2a4a] text-gray-300 hover:bg-[#3a3a5a] transition-colors text-sm"
          >
            ⏹ 停止
          </button>
        </div>
      )}
    </div>
  );
}
