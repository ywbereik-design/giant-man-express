const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

// Called whenever a request fails with 401 while we believe we're logged in
// (i.e. an authToken was attached). Lets AuthContext force a logout so the
// user lands back on the login screen instead of seeing stale error text on
// every screen when their session expires or is revoked.
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

const REQUEST_TIMEOUT_MS = 15000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hadToken = !!authToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (e) {
    // fetch() itself throws on no network, DNS failure, TLS error, or the
    // abort triggered above — none of these produce a Response to inspect,
    // so without this catch they'd propagate as a raw TypeError/AbortError
    // instead of the app's consistent ApiError, and any call site that
    // forgot its own try/catch would see an unhandled rejection.
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "The request timed out. Check your connection and try again."
        : "Could not reach the server. Check your connection and try again.";
    throw new ApiError(message, 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    if (res.status === 401 && hadToken) {
      onSessionExpired?.();
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function apiBaseUrl(): string {
  return API_BASE_URL;
}
