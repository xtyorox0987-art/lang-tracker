// Firebase project settings (lang-tracker app と同じ)
export const FIREBASE_API_KEY = "AIzaSyAaDpK9GxIFbHJVMXKNNVc55jY2RiCdDi0";
export const FIREBASE_PROJECT_ID = "lang-tracker";

// ★ 要設定: Google OAuth Web Client ID
// 取得方法:
//   Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration → Web client ID
// 設定後:
//   Google Cloud Console → APIs & Credentials → そのClient ID → Authorized redirect URIs に追加:
//   https://<拡張機能ID>.chromiumapp.org/
//   (拡張機能IDは chrome://extensions で確認)
export const GOOGLE_WEB_CLIENT_ID =
  "264944909495-5f56r6e8647jm01ommoag4aql0he7vmm.apps.googleusercontent.com";

// 記録する最小視聴時間（秒）
export const MIN_DURATION_SECONDS = 30;
