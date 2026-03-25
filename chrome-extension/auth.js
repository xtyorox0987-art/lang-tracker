import { FIREBASE_API_KEY, GOOGLE_WEB_CLIENT_ID } from "./config.js";

/** Google OAuth → Firebase ID Token 交換でサインイン */
export async function signIn() {
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_WEB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("scope", "openid email profile");

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  const params = new URLSearchParams(responseUrl.split("#")[1]);
  const accessToken = params.get("access_token");
  if (!accessToken) throw new Error("Failed to get access token");

  // Google token → Firebase ID token
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `access_token=${accessToken}&providerId=google.com`,
        requestUri: redirectUri,
        returnSecureToken: true,
      }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const authData = {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    userId: data.localId,
    email: data.email,
    displayName: data.displayName,
    expiresAt: Date.now() + 3600_000,
  };
  await chrome.storage.local.set({ authData });
  return authData;
}

/** 有効な認証情報を取得（期限切れなら自動リフレッシュ） */
export async function getAuth() {
  const { authData } = await chrome.storage.local.get("authData");
  if (!authData) return null;

  // 期限の1分前までは有効
  if (Date.now() < authData.expiresAt - 60_000) return authData;

  // トークンリフレッシュ
  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: authData.refreshToken,
        }),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const updated = {
      ...authData,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in) * 1000,
    };
    await chrome.storage.local.set({ authData: updated });
    return updated;
  } catch {
    await chrome.storage.local.remove("authData");
    return null;
  }
}

/** サインアウト */
export async function signOut() {
  await chrome.storage.local.remove("authData");
}
