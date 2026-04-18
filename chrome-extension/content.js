// YouTube動画の再生/一時停止を検出し、視聴時間を追跡するContent Script
(function () {
  const MIN_DURATION = 30; // 秒
  let video = null;
  let state = null; // { vid, title, t0, sec, on, tick }
  let tickTimer = null;

  const getVideoId = () =>
    new URLSearchParams(location.search).get("v") ||
    location.pathname.match(/\/shorts\/([^/?]+)/)?.[1] ||
    null;

  const isAd = () =>
    document
      .querySelector(".html5-video-player")
      ?.classList.contains("ad-showing") ?? false;

  const getTitle = () =>
    document
      .querySelector("h1.ytd-watch-metadata yt-formatted-string")
      ?.textContent?.trim() || document.title.replace(" - YouTube", "");

  const send = (type, data) =>
    chrome.runtime.sendMessage({ type, ...data }).catch(() => {});

  function saveCurrent() {
    if (!state) return;
    // 再生中なら未計上の時間をフラッシュ
    if (state.on) {
      state.sec += (Date.now() - state.tick) / 1000;
      state.on = false;
    }
    if (state.sec < MIN_DURATION) {
      state = null;
      return;
    }
    send("SAVE_ENTRY", {
      title: state.title,
      startTime: state.t0,
      endTime: Date.now(),
      duration: Math.round(state.sec),
    });
    state = null;
  }

  function ensure(vid) {
    if (state?.vid === vid) return;
    saveCurrent();
    state = {
      vid,
      title: getTitle(),
      t0: Date.now(),
      sec: 0,
      on: false,
      tick: 0,
    };
  }

  function onPlay() {
    const id = getVideoId();
    if (!id || isAd()) return;
    const isNew = state?.vid !== id;
    ensure(id);
    state.on = true;
    state.tick = Date.now();
    state.title = getTitle();
    // YouTube SPA: タイトルDOMの更新が再生開始より遅れることがあるため再取得
    if (isNew) {
      setTimeout(() => {
        if (state?.vid === id) {
          state.title = getTitle();
          report();
        }
      }, 2000);
    }
    if (!tickTimer) tickTimer = setInterval(tick, 2_000);
    report();
  }

  function onPause() {
    if (!state?.on) return;
    state.sec += (Date.now() - state.tick) / 1000;
    state.on = false;
    report();
  }

  function onEnded() {
    onPause();
    saveCurrent();
  }

  function tick() {
    if (!state?.on) return;
    const now = Date.now();
    state.sec += (now - state.tick) / 1000;
    state.tick = now;
    report();
  }

  function report() {
    if (!state) return;
    const d = state.on
      ? state.sec + (Date.now() - state.tick) / 1000
      : state.sec;
    send("STATUS", {
      playing: state.on,
      title: state.title,
      duration: Math.round(d),
      startTime: state.t0,
    });
  }

  function attach(v) {
    if (video === v) return;
    if (video) {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    }
    video = v;
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    if (!v.paused) onPlay();
  }

  // DOM変更を監視してvideo要素を検出
  new MutationObserver(() => {
    const v = document.querySelector("video");
    if (v) attach(v);
  }).observe(document.body, { childList: true, subtree: true });

  // 広告の開始/終了を検出
  (function watchAds() {
    const p = document.querySelector(".html5-video-player");
    if (!p) return setTimeout(watchAds, 1000);
    new MutationObserver(() => {
      if (!state) return;
      if (isAd() && state.on) onPause();
      else if (!isAd() && video && !video.paused && !state?.on) onPlay();
    }).observe(p, { attributes: true, attributeFilter: ["class"] });
  })();

  // YouTube SPA ナビゲーション
  document.addEventListener("yt-navigate-finish", () => {
    saveCurrent();
    setTimeout(() => {
      const v = document.querySelector("video");
      if (v) attach(v);
    }, 500);
  });

  // タブを閉じるとき
  window.addEventListener("beforeunload", () => {
    saveCurrent();
  });

  // 初期化
  const v = document.querySelector("video");
  if (v) attach(v);
})();
