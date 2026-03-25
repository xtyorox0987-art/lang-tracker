import { FIREBASE_PROJECT_ID } from "./config.js";
import { getAuth } from "./auth.js";

const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

let status = { playing: false, title: "", duration: 0 };
const tabState = new Map(); // tabId → 最新セッション情報
const savedTabs = new Set(); // 重複保存防止

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === "SAVE_ENTRY") {
    writeEntry(msg);
    if (tabId) {
      savedTabs.add(tabId);
      tabState.delete(tabId);
    }
    return;
  }

  if (msg.type === "STATUS") {
    status = {
      playing: msg.playing,
      title: msg.title,
      duration: msg.duration,
    };
    if (tabId) {
      tabState.set(tabId, {
        ...msg,
        startTime: msg.startTime || Date.now() - msg.duration * 1000,
      });
    }
    updateBadge(msg.playing);
    return;
  }

  if (msg.type === "GET_STATUS") {
    const sessions = [...tabState.entries()].map(([id, s]) => ({
      tabId: id,
      ...s,
    }));
    sendResponse({ sessions, status });
    return true;
  }
});

// タブが閉じられたとき → beforeunload が失敗した場合のバックアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  if (savedTabs.has(tabId)) {
    savedTabs.delete(tabId);
    tabState.delete(tabId);
    return;
  }
  const s = tabState.get(tabId);
  if (s && s.duration >= 30) {
    writeEntry({
      title: s.title,
      startTime: s.startTime || Date.now() - s.duration * 1000,
      endTime: Date.now(),
      duration: s.duration,
    });
  }
  tabState.delete(tabId);
  if (tabState.size === 0) {
    status = { playing: false, title: "", duration: 0 };
    updateBadge(false);
  }
});

async function writeEntry(data) {
  console.log("[LT] writeEntry called:", data);
  const auth = await getAuth();
  if (!auth) {
    console.log("[LT] No auth, skipping");
    return;
  }

  const doc = {
    fields: {
      id: { stringValue: crypto.randomUUID() },
      category: { stringValue: "active" },
      startTime: { integerValue: String(data.startTime) },
      endTime: { integerValue: String(data.endTime) },
      duration: { integerValue: String(data.duration) },
      source: { stringValue: "manual" },
      note: { stringValue: `YouTube: ${(data.title || "").slice(0, 100)}` },
      createdAt: { integerValue: String(Date.now()) },
    },
  };

  try {
    const res = await fetch(
      `${FIRESTORE_URL}/users/${auth.userId}/time_entries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.idToken}`,
        },
        body: JSON.stringify(doc),
      },
    );

    if (res.ok) {
      console.log("[LT] Firestore write OK, duration:", data.duration);
      // 今日の合計を更新
      const today = new Date().toISOString().slice(0, 10);
      const { todayDate, todayTotal = 0 } = await chrome.storage.local.get([
        "todayDate",
        "todayTotal",
      ]);
      const newTotal = (todayDate === today ? todayTotal : 0) + data.duration;
      await chrome.storage.local.set({
        todayDate: today,
        todayTotal: newTotal,
      });

      // 成功表示
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#06d6a0" });
      setTimeout(() => updateBadge(false), 3000);
    } else {
      console.error(
        "[LT] Firestore write failed:",
        res.status,
        await res.text(),
      );
    }
  } catch (e) {
    console.error("Failed to save entry:", e);
  }
}

function updateBadge(playing) {
  if (playing) {
    chrome.action.setBadgeText({ text: "▶" });
    chrome.action.setBadgeBackgroundColor({ color: "#4bc0c8" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}
