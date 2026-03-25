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
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e]">
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
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] px-4">
      <div className="w-full max-w-sm bg-[#16213e] rounded-xl shadow-md p-8 text-center border border-[#2a2a4a]">
        <h1 className="text-2xl font-bold text-white mb-2">🎧 Lang Tracker</h1>
        <p className="text-sm text-gray-400 mb-8">
          Track your English learning time
        </p>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export function UserMenu() {
  const { userId, setUserId } = useAppStore();
  const [open, setOpen] = useState(false);

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
            className="w-6 h-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-xs text-white">
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
