import { NextRequest, NextResponse } from "next/server";

// The native app (Expo Go / a built iOS/Android app) isn't subject to browser
// CORS at all, but `expo start --web` serves the app from its own origin and
// needs the API to allow cross-origin requests. Auth here is a Bearer token
// the client sets explicitly (never an ambient cookie), so an open origin
// policy doesn't expose anything a same-origin policy would have protected.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Standard defensive headers — this API is never rendered as HTML and never
// carries an ambient cookie, so most of the classic browser-security header
// surface (CSP, HSTS-for-cookies, etc.) doesn't apply, but these three are
// cheap, have no downside for a JSON/PDF API, and stop a browser from doing
// something unexpected if a response is ever loaded directly (e.g. someone
// pastes a PDF route URL into a browser tab).
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries({ ...CORS_HEADERS, ...SECURITY_HEADERS })) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
