import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import type { VideoResource } from "../types";
import { extractYouTubeVideoId, recommendVideos } from "../lib/recommendations";

function formatDurationCompact(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function focusLabel(focus: string): string {
  if (focus === "foundation") return "Foundation deck";
  if (focus === "foundationRemaining") return "Foundation remaining";
  if (focus === "youtubeChannel") return "YouTube deck";
  return "Deck";
}

export function RecommendedContent() {
  const {
    userId,
    todayEntries,
    ankiSnapshots,
    settings,
    setSettings,
    videoResources,
    videoWatchSessions,
    deckProgressSnapshots,
    loadRecommendationData,
    saveVideoResource,
    markVideoWatched,
    dismissVideoResource,
  } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [deckNumber, setDeckNumber] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [coverage, setCoverage] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    loadRecommendationData();
  }, [userId, loadRecommendationData]);

  const recommendationOutput = useMemo(
    () =>
      recommendVideos({
        resources: videoResources,
        watchSessions: videoWatchSessions,
        deckProgressSnapshots,
        todayEntries,
        ankiSnapshots,
        settings,
      }),
    [
      ankiSnapshots,
      deckProgressSnapshots,
      settings,
      todayEntries,
      videoResources,
      videoWatchSessions,
    ],
  );

  const { context, recommendations, emptyReason } = recommendationOutput;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setMsg("Add a YouTube URL first.");
      return;
    }
    const now = Date.now();
    const videoId = extractYouTubeVideoId(url.trim()) ?? undefined;
    const parsedDuration = Number(durationMin);
    const parsedCoverage = Number(coverage);
    const parsedDifficulty = Number(difficulty);
    const resource: VideoResource = {
      id: videoId ? `yt-${videoId}` : crypto.randomUUID(),
      url: url.trim(),
      videoId,
      title: title.trim() || "Untitled candidate",
      channel: channel.trim() || "Unknown channel",
      deckNumber: deckNumber ? Math.max(1, Number(deckNumber)) : undefined,
      durationSec:
        Number.isFinite(parsedDuration) && parsedDuration > 0
          ? Math.round(parsedDuration * 60)
          : undefined,
      source: "manual",
      manualDifficulty:
        parsedDifficulty >= 1 && parsedDifficulty <= 5
          ? (parsedDifficulty as 1 | 2 | 3 | 4 | 5)
          : undefined,
      comprehensibilityPct:
        Number.isFinite(parsedCoverage) && parsedCoverage > 0
          ? Math.min(100, Math.max(1, Math.round(parsedCoverage)))
          : undefined,
      status: "candidate",
      createdAt: now,
      updatedAt: now,
    };
    await saveVideoResource(resource);
    setUrl("");
    setTitle("");
    setChannel("");
    setDeckNumber("");
    setDurationMin("");
    setCoverage("");
    setDifficulty("3");
    setAdding(false);
    setMsg("Candidate added.");
    window.setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-200 text-balance">
            Next video
          </h2>
          <p className="text-xs text-gray-500 text-pretty">
            Day {context.routineDay}/3 · {focusLabel(context.focus)} · New Anki{" "}
            {context.newCardsTarget}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className="shrink-0 px-3 py-1.5 text-xs rounded-md bg-[#2a2a4a] text-[#22d3ee] hover:bg-[#3a3a5a] border border-[#22d3ee]/30 transition-colors"
          aria-expanded={adding}
        >
          {adding ? "Close" : "Add"}
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-[#1a1a2e] border border-[#2a2a4a] p-2">
          <div className="text-[10px] text-gray-500">Active today</div>
          <div className="text-sm text-gray-200 font-semibold tabular-nums">
            {formatDurationCompact(context.activeSecondsToday)}
          </div>
        </div>
        <div className="rounded-md bg-[#1a1a2e] border border-[#2a2a4a] p-2">
          <div className="text-[10px] text-gray-500">Goal basis</div>
          <div className="text-sm text-gray-200 font-semibold tabular-nums">
            {formatDurationCompact(context.activeGoalSeconds)}
          </div>
        </div>
        <div className="rounded-md bg-[#1a1a2e] border border-[#2a2a4a] p-2">
          <div className="text-[10px] text-gray-500">Deck sync</div>
          <div className="text-sm text-gray-200 font-semibold">
            {context.hasDeckProgress ? "Ready" : "Estimate"}
          </div>
        </div>
      </div>

      <details className="mb-3 rounded-md bg-[#1a1a2e] border border-[#2a2a4a] p-3">
        <summary className="cursor-pointer text-xs font-medium text-gray-300">
          Recommendation tuning
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-xs text-gray-400">
            Routine start
            <input
              type="date"
              value={settings.recommendationRoutineStartDate}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  recommendationRoutineStartDate: e.target.value,
                })
              }
              className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
            />
          </label>
          <label className="block text-xs text-gray-400">
            Channel filter
            <input
              type="text"
              value={settings.recommendationSelectedChannel}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  recommendationSelectedChannel: e.target.value,
                })
              }
              placeholder="Optional"
              className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
            />
          </label>
        </div>
      </details>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="mb-3 rounded-lg bg-[#1a1a2e] border border-[#2a2a4a] p-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block text-xs text-gray-400">
              YouTube URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="col-span-2 block text-xs text-gray-400">
              Title
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Channel
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="Channel"
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Deck no.
              <input
                type="number"
                min="1"
                value={deckNumber}
                onChange={(e) => setDeckNumber(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Minutes
              <input
                type="number"
                min="1"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Coverage %
              <input
                type="number"
                min="1"
                max="100"
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded bg-[#16213e] border border-[#3a3a5a] text-gray-200"
              />
            </label>
            <label className="col-span-2 block text-xs text-gray-400">
              Difficulty
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-2 w-full accent-[#22d3ee]"
              />
              <span className="text-gray-500 tabular-nums">{difficulty}/5</span>
            </label>
          </div>
          <button
            type="submit"
            className="mt-3 w-full px-4 py-2 text-sm rounded-lg bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] font-medium transition-colors border border-[#22d3ee]/30"
          >
            Save candidate
          </button>
        </form>
      )}

      {msg && (
        <p
          className="mb-3 text-xs text-gray-400"
          role="status"
          aria-live="polite"
        >
          {msg}
        </p>
      )}

      {recommendations.length === 0 ? (
        <div className="py-8 text-center rounded-lg bg-[#1a1a2e] border border-[#2a2a4a]">
          <p className="text-sm text-gray-400 text-pretty">
            {emptyReason ?? "No recommendation yet."}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 px-4 py-2 text-sm rounded-lg bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30 transition-colors"
          >
            Add first candidate
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {recommendations.map((recommendation, index) => (
            <article
              key={recommendation.resource.id}
              className="rounded-lg bg-[#1a1a2e] border border-[#2a2a4a] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#22d3ee]/10 text-[#22d3ee] text-sm font-bold tabular-nums">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-100">
                      {recommendation.resource.title}
                    </h3>
                    <span className="shrink-0 text-[10px] uppercase text-gray-500">
                      {recommendation.confidence}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {recommendation.resource.channel}
                    {recommendation.resource.durationSec
                      ? ` · ${formatDurationCompact(recommendation.resource.durationSec)}`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs text-gray-300 text-pretty">
                    {recommendation.nextAction}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {recommendation.reasons.map((reason) => (
                  <span
                    key={`${recommendation.resource.id}-${reason.kind}-${reason.label}`}
                    title={reason.detail}
                    className="rounded-full bg-[#2a2a4a] px-2 py-1 text-[10px] text-gray-300"
                  >
                    {reason.label}
                  </span>
                ))}
              </div>

              {recommendation.risks.length > 0 && (
                <p className="mt-2 text-xs text-yellow-300/90 text-pretty">
                  {recommendation.risks[0]}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <a
                  href={recommendation.resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center px-3 py-2 text-xs rounded-md bg-[#22d3ee]/10 hover:bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30 transition-colors"
                >
                  Open
                </a>
                <button
                  type="button"
                  onClick={() => markVideoWatched(recommendation.resource)}
                  className="px-3 py-2 text-xs rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 transition-colors"
                >
                  Watched
                </button>
                <button
                  type="button"
                  onClick={() => dismissVideoResource(recommendation.resource)}
                  className="px-3 py-2 text-xs rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-500 transition-colors"
                >
                  Skip
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
