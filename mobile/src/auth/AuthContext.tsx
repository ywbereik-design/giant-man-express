import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { api, setAuthToken, setSessionExpiredHandler } from "../api/client";
import { SESSION_STORAGE_KEY } from "./storage";
import { stopShiftTracking } from "../location/shiftTracking";

export type Role = "ADMIN" | "DISPATCH" | "DRIVER";

interface Session {
  token: string;
  role: Role;
  name: string;
  // The logged-in account's own id — lets screens like Staff Accounts detect
  // "this row is me" (e.g. to hide the deactivate/delete buttons on yourself).
  id?: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  loginAsStaff: (email: string, password: string) => Promise<void>;
  loginAsDriver: (employeeCode: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = SESSION_STORAGE_KEY;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const parsed: Session = JSON.parse(raw);
          setAuthToken(parsed.token);
          setSession(parsed);
        }
      } catch {
        // SecureStore is unavailable in some environments (e.g. Expo web preview) — start logged out.
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (s: Session) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // SecureStore is unavailable in some environments (e.g. Expo web preview) — session stays in-memory only.
    }
    setAuthToken(s.token);
    setSession(s);
  }, []);

  // Used for both the "Admin" and "Dispatch" login tabs — they're both staff
  // accounts hitting the same endpoint. The account's actual role (returned
  // by the server, not which tab was tapped) determines what the app shows
  // after login.
  const loginAsStaff = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ token: string; name: string; role: Role; id: string }>(
        "/api/auth/staff/login",
        { email, password }
      );
      await persist({ token: res.token, role: res.role, name: res.name, id: res.id });
    },
    [persist]
  );

  const loginAsDriver = useCallback(
    async (employeeCode: string, pin: string) => {
      const res = await api.post<{ token: string; name: string }>("/api/auth/driver/login", {
        employeeCode,
        pin,
      });
      await persist({ token: res.token, role: "DRIVER", name: res.name });
    },
    [persist]
  );

  const logout = useCallback(async () => {
    // Belt-and-suspenders: clock-out already stops tracking, but logging out
    // (e.g. force-logout on a 401) shouldn't leave a location task running
    // against a session that's about to disappear.
    try {
      await stopShiftTracking();
    } catch {
      // best-effort — a stuck tracking task shouldn't block logout
    }
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // SecureStore is unavailable in some environments (e.g. Expo web preview)
    }
    setAuthToken(null);
    setSession(null);
  }, []);

  // Any request that comes back 401 while we have a token attached means the
  // session is no longer valid server-side (expired, or the account was
  // deactivated) — force back to the login screen instead of leaving every
  // screen stuck showing a stale error.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      logout();
    });
    return () => setSessionExpiredHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ session, loading, loginAsStaff, loginAsDriver, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
