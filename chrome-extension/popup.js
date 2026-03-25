import { signIn, signOut, getAuth } from "./auth.js";
import { GOOGLE_WEB_CLIENT_ID } from "./config.js";

const $ = (id) => document.getElementById(id);

function fmtHMS(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

async function render() {
  // OAuth Client ID 未設定チェック
  if (!GOOGLE_WEB_CLIENT_ID || GOOGLE_WEB_CLIENT_ID.includes("CHANGE_ME")) {
    $("setupView").style.display = "block";
    $("loginView").style.display = "none";
    $("mainView").style.display = "none";
    return;
  }

  const auth = await getAuth();
  if (!auth) {
    $("setupView").style.display = "none";
    $("loginView").style.display = "block";
    $("mainView").style.display = "none";
    return;
  }

  $("setupView").style.display = "none";
  $("loginView").style.display = "none";
  $("mainView").style.display = "block";
  $("email").textContent = auth.email;

  // Background からセッション情報取得
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
    const el = $("sessions");
    const dot = $("dot");
    if (!res?.sessions?.length) {
      el.innerHTML = '<div class="empty">No videos playing</div>';
      dot.className = "dot ok";
    } else {
      const hasPlaying = res.sessions.some((s) => s.playing);
      dot.className = hasPlaying ? "dot on" : "dot ok";
      el.innerHTML = res.sessions
        .map(
          (s) =>
            `<div class="row" style="padding:2px 0">
              <span class="title">${esc(s.title)}</span>
              <span class="time">${fmtHMS(s.duration)}</span>
            </div>`,
        )
        .join("");
    }
  });

  // 今日の合計
  const { todayDate, todayTotal = 0 } = await chrome.storage.local.get([
    "todayDate",
    "todayTotal",
  ]);
  const today = new Date().toISOString().slice(0, 10);
  $("today").textContent = fmtHMS(todayDate === today ? todayTotal : 0);
}

$("signInBtn")?.addEventListener("click", async () => {
  const btn = $("signInBtn");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  try {
    await signIn();
    render();
  } catch (e) {
    btn.textContent = "Error - Retry";
    console.error("Sign in failed:", e);
  } finally {
    btn.disabled = false;
    setTimeout(() => (btn.textContent = "Sign in with Google"), 3000);
  }
});

$("signOutBtn")?.addEventListener("click", async () => {
  await signOut();
  render();
});

render();
setInterval(render, 2000);
