# Lang Tracker - YouTube Timer (Chrome/Brave拡張機能)

YouTubeの動画視聴時間を自動的にLang Trackerに「Passive」カテゴリとして記録する拡張機能です。

## 機能

- YouTube動画の再生/一時停止を自動検出
- 広告中は時間をカウントしない
- 30秒以上の視聴をFirestoreに自動記録
- タブを閉じても記録が失われない（バックアップ保存）
- ポップアップで現在の視聴状況と今日の合計を表示
- バッジアイコンで状態表示（▶ 再生中 / ✓ 保存完了）

## セットアップ

### 1. Google OAuth Web Client ID を取得

1. [Firebase Console](https://console.firebase.google.com/) → lang-tracker プロジェクト
2. **Authentication** → **Sign-in method** → **Google**
3. **Web SDK configuration** の **Web client ID** をコピー

### 2. 拡張機能をインストール

1. Brave/Chrome で `chrome://extensions` を開く
2. **デベロッパーモード** を ON
3. **パッケージ化されていない拡張機能を読み込む** → この `chrome-extension` フォルダを選択
4. 拡張機能の **ID** をメモ（例: `abcdefghijklmnop...`）

### 3. OAuth リダイレクト URI を追加

1. [Google Cloud Console](https://console.cloud.google.com/) → lang-tracker プロジェクト
2. **APIs & Services** → **Credentials**
3. 手順1でコピーした Web Client ID をクリック
4. **Authorized redirect URIs** に追加:
   ```
   https://<拡張機能ID>.chromiumapp.org/
   ```
   （`<拡張機能ID>` は手順2でメモしたID）
5. **Save**

### 4. config.js を設定

`config.js` の `GOOGLE_WEB_CLIENT_ID` を手順1の Web Client ID に変更:

```javascript
export const GOOGLE_WEB_CLIENT_ID =
  "264944909495-xxxxx.apps.googleusercontent.com";
```

### 5. 拡張機能をリロード

`chrome://extensions` で拡張機能の更新ボタンをクリック。

## 使い方

1. 拡張機能アイコンをクリック → **Sign in with Google**
2. YouTubeで動画を再生すると自動でトラッキング開始
3. 動画を一時停止/閉じると30秒以上なら自動保存
4. Lang Trackerアプリで「Passive」カテゴリのエントリとして表示

## 記録の詳細

- **カテゴリ**: Passive
- **ソース**: manual
- **メモ**: `YouTube: <動画タイトル>`（最大100文字）
- **最小記録時間**: 30秒（config.jsで変更可能）
