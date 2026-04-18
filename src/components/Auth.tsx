import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "../lib/firebase";
import { useAppStore } from "../store/useAppStore";
import { hasLocalData, migrateLocalData } from "../store/repository";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { userId, setUserId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    entries: number;
    snapshots: number;
  } | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // Firebase未設定: ローカルモード
      setUserId("local-user");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // Auto-migrate local data if it exists
        if (hasLocalData()) {
          setMigrating(true);
          try {
            const result = await migrateLocalData(user.uid);
            setMigrationResult(result);
          } finally {
            setMigrating(false);
          }
        }
      } else {
        setUserId(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [setUserId]);

  if (loading || migrating) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-gray-400 text-sm">
          {migrating ? "Migrating local data to cloud..." : "Loading…"}
        </div>
      </div>
    );
  }

  if (!userId) {
    return <LoginScreen />;
  }

  return (
    <>
      {migrationResult && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-900/90 text-green-200 px-4 py-2 rounded-lg text-sm shadow-lg border border-green-700">
          Migrated {migrationResult.entries} entries &{" "}
          {migrationResult.snapshots} snapshots to cloud
          <button
            onClick={() => setMigrationResult(null)}
            className="ml-3 text-green-400 hover:text-white"
            aria-label="Close migration notification"
          >
            ✕
          </button>
        </div>
      )}
      {children}
    </>
  );
}

function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#1a1a2e] px-4">
      <div className="w-full max-w-sm bg-[#16213e] rounded-2xl shadow-xl p-8 text-center border border-[#2a2a4a]">
        <div className="text-5xl mb-4">🎧</div>
        <h1 className="text-2xl font-bold text-white mb-1 text-balance">
          Lang Tracker
        </h1>
        <p className="text-sm text-gray-400 mb-8 text-pretty">
          Track your English learning time
        </p>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl font-medium transition-colors disabled:opacity-50 border border-white/10 flex items-center justify-center gap-2"
        >
          <svg className="size-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && (
          <p className="mt-3 text-xs text-red-400 text-pretty">{error}</p>
        )}
      </div>
    </div>
  );
}

export function UserMenu() {
  const { userId, setUserId } = useAppStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!isFirebaseConfigured || !auth) {
    return (
      <span className="text-xs text-gray-500 px-2 py-1 bg-[#2a2a4a] rounded">
        ローカルモード
      </span>
    );
  }

  const user = auth.currentUser;

  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
    setUserId(null);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="size-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="size-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-white">
            {user?.displayName?.[0] ?? "?"}
          </span>
        )}
        <span className="hidden sm:inline">{user?.displayName ?? userId}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-36 bg-[#16213e] rounded-lg shadow-lg border border-[#2a2a4a] z-20 py-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#2a2a4a]"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
