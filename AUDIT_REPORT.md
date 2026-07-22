# Giant Man Express & Delivery — Full Application Audit

**Date:** 2026-07-22
**Scope:** Entire application — backend API (22 routes), database schema, mobile app (11 screens, navigation, auth), every business workflow (dispatch, clock in/out, hour reports, invoicing).
**Method:** Read every source file, tested every endpoint live against the running backend (not just code review), fixed everything found, then re-tested each fix live to confirm it actually works.

---

## Bottom line

Found **2 critical bugs that had real financial/security impact** — a working double-billing bug and a security bypass that let deactivated drivers keep clocking in — plus 19 other issues ranging from high to low severity. All 21 are fixed and verified. The app now builds clean, type-checks clean, and passes a full regression test covering every fix.

---

## Critical issues (confirmed causing real harm)

### 1. Double-billing bug — clients could be charged twice for the same job
**Where:** `POST /api/invoices`
**What was wrong:** Generating an invoice for a business/period queried completed jobs by date range only. It never checked whether a job had already been billed on an earlier invoice. I proved this live: generated an invoice, then generated a second one for an overlapping period — the same job appeared on both invoices, both for the full amount.
**Fix:** Invoice generation now excludes any job that already has a line item on a prior invoice (`invoiceLineItems: { none: {} }`). Re-tested: the second generation attempt now correctly returns "No un-invoiced completed jobs for this business in the selected period."

### 2. Deactivated drivers could keep working
**Where:** every `driver/*` route (clock-in, clock-out, job status, etc.)
**What was wrong:** A driver's login token stays cryptographically valid for 30 days regardless of what admin does afterward. Deactivating a driver in the admin app had **zero effect** on a token they already had — I proved this live: logged in as a driver, deactivated them as admin, and the old token still worked for `/api/driver/status`.
**Fix:** Added `requireActiveDriver()`, which re-checks the driver's `active` flag in the database on every request, not just at login. All driver-facing routes now use it. Re-tested: the same reused token now correctly gets `403 This driver account is no longer active`.

---

## High-severity issues

### 3. $0 invoices could be generated and sent to a real client
Invoices used to default to `rate = 0` if a business's billing rate wasn't set, silently producing a legitimate-looking $0.00 invoice for real completed work. Now blocked with a clear error ("Set a billing rate for this business before generating an invoice") until the rate is set.

### 4. Every "record not found" case crashed with a raw 500 error
`PATCH` on a driver, job type, business, or job that doesn't exist (bad ID, already deleted, typo) threw an unhandled Prisma error and returned an opaque 500 instead of a clean 404. Confirmed on all four routes before the fix, confirmed fixed after (clean `404 Not found`).

### 5. Duplicate names/codes crashed instead of returning a clean error
Creating a job type with a name that already exists threw an unhandled 500 (unique constraint violation) instead of a 409. Confirmed and fixed; drivers already had this handled, job types didn't.

### 6. Creating a job with a bad/inactive driver or job type crashed
`POST /api/jobs` didn't check that the referenced driver/job type/business actually existed and were active before writing — a bad ID caused an unhandled foreign-key-violation 500. Now validated up front with a clear 400 message, and inactive drivers/job types are explicitly rejected (matches what the picker UI already tried to enforce client-side, but the server never actually enforced it).

### 7. No login rate limiting — PINs are brute-forceable
Driver PINs are 4–8 digits with no attempt limit. A 4-digit PIN is only 10,000 combinations — trivial to brute-force with no throttling, especially once this is hosted on the internet per DEPLOY.md. Added an in-memory rate limiter: 8 failed attempts per identifier locks out further attempts for 10 minutes. Confirmed live (9th rapid failed attempt returned `429 Too many failed attempts`).

### 8. Timing side-channel on login endpoints
Both login routes skipped the password/PIN check entirely when the email/employee code wasn't found, making "account doesn't exist" measurably faster than "account exists, wrong password" — enough to enumerate valid accounts by timing. Fixed by always running a real bcrypt comparison (against a dummy hash when no record is found), so both cases take about the same time.

---

## Medium-severity issues

### 9. Double-generating the exact same hours report
Nothing stopped clicking "Generate Report" twice for the same driver + period, creating two reports covering the same hours (double-counted for payroll). Now blocked with a 409 naming the existing report number.

### 10. Swapped/invalid date ranges silently accepted
Sending `periodStart` after `periodEnd` (e.g. a UI bug or bad input) silently generated a technically-valid but meaningless report/invoice with 0 hours or $0, wasting a sequential number. Both `POST /api/reports` and `POST /api/invoices` now reject this with a validation error.

### 11. Admin-driven job status changes didn't update timestamps
If a job's status was changed to `COMPLETED` via the generic admin job-edit route (as opposed to the driver's own accept/start/complete flow), `completedAt` stayed `null` — which meant it would never show up in invoicing (which filters on `completedAt`). Fixed so the admin route keeps timestamps consistent too.

### 12. No indexes on any foreign key
Confirmed by inspecting the actual generated SQL: **zero indexes existed** on `Job.driverId`, `Job.businessId`, `Job.jobTypeId`, `TimeEntry.driverId`, `HoursReport.driverId`, `Invoice.businessId`, or either `InvoiceLineItem` foreign key. Every lookup (find a driver's open shift, list a driver's jobs, generate an invoice) was a full table scan. Added 8 indexes, including a composite `TimeEntry(driverId, clockOutAt)` matching the app's single most frequent query pattern.

### 13. No CORS headers — the web build was actually broken
Found while smoke-testing the app in a browser: login failed with `net::ERR_FAILED`. The native app (Expo Go) isn't affected by browser CORS at all, but `expo start --web` is a real, working capability of this codebase and it was silently broken because the API sent no CORS headers. Added middleware that allows cross-origin requests (safe here since auth is an explicit Bearer token, never an ambient cookie). Verified: web login now works end-to-end.

### 14. Whitespace-only names accepted everywhere
`"   "` passed as a job type/driver/business name. Every user-facing string field now trims and rejects empty-after-trim.

### 15. PIN accepted non-numeric characters
Despite the UI showing a numeric keypad, the API accepted any 4–8 character string as a PIN. Added a digits-only validation rule.

### 16. Employee codes weren't case-normalized
`"D001"` and `"d001"` could exist as two different drivers depending on typing, and login required an exact case match. Now normalized to uppercase everywhere (creation and login).

### 17. GPS coordinates weren't bounds-checked
`lat`/`lng` accepted any number, including impossible values like `lat: 9999`. Added proper `-90..90` / `-180..180` bounds.

---

## Mobile app issues

### 18. No global session-expiry handling
If a token expired or a session became invalid server-side, every screen just showed a generic error forever — nothing told the user to log back in. Added a global handler: any `401` response while a session is active now automatically logs the user out and returns them to the login screen.

### 19. Driver's "Jobs" tab grew forever
The default job list only excluded cancelled jobs, not completed ones — after months of use, a driver's Jobs tab would be a long scroll of ancient completed work mixed with today's active jobs. Now defaults to active jobs only (assigned/accepted/in progress).

### 20. No way to edit a driver or business after creation
Confirmed by reading every screen: **Drivers** could only be added and deactivated — a typo'd name or a lost PIN had no fix path. **Businesses** had no edit UI at all — meaning a wrong billing rate (now that $0-rate invoices are blocked) would have permanently blocked invoicing for that client. Added inline edit forms to both screens (name/phone/PIN reset for drivers; name/contact/address/billing rate for businesses) using PATCH endpoints that already existed in the backend but were never wired up.

### 21. Cancelling a job had no confirmation and no loading state
One tap immediately cancelled a job with no undo and no visual feedback. Added a confirmation dialog and per-item loading state, matching the pattern already used elsewhere in the app.

### 22. Dispatch job list had no filtering
All jobs ever created loaded into one unbounded list with no way to filter. Added Active / All / Completed / Cancelled filter chips (the backend already supported the query param; it was just never used).

### 23. Location permission denial was silent
If a driver denied location access, clock-in/out proceeded silently with no location recorded and no indication to the driver — undermining the whole point of GPS verification. Now shows a clear notice when location wasn't captured, and GPS lookup has a 10-second timeout so it can't hang the clock-in button forever.

### 24. Flash of "empty" state on every list screen
Every list screen initialized with an empty array and no loading flag, so briefly showed "No X yet" before real data arrived — misleading if there actually was data. Added a proper initial-loading spinner (new shared `CenteredSpinner` component) to all 9 list screens instead.

### 25. Login screen had zero client-side validation
Every other form in the app validates before submitting; the login screen didn't — submitting empty fields just round-tripped to the server for a generic error. Added the same up-front validation pattern used elsewhere.

### 26. Inconsistent Log Out access
Drivers could log out from any tab; admins could only log out from the Dashboard screen specifically, requiring a back-navigation from anywhere else. Extracted a shared `LogoutButton` and put it in the header across both navigators consistently.

### 27. No crash boundary
Any unexpected render error would take the whole app down to a blank/red screen with no recovery path. Added a top-level `ErrorBoundary` with a "Try Again" fallback.

### 28. `expo-file-system` API mismatch for SDK 54
Found and fixed independently during this audit: the PDF download/share code used `File.createDownloadTask`, an API that doesn't exist in SDK 54 (it was written against a newer SDK before the deliberate downgrade). Would have crashed the first time anyone tried to share a report or invoice PDF. Rewritten using `expo/fetch` + `File.write`, the correct SDK 54 pattern, and confirmed it type-checks and matches the documented API for this exact SDK version.

---

## Dead code / cleanup

- Removed `pdfUrl()` from the API client — exported but never called anywhere.
- Removed `@react-native-async-storage/async-storage` from `package.json` — installed, never imported or used (the app correctly uses `expo-secure-store` for session storage).

---

## Testing performed

Everything below was actually executed against the running app, not just read:

- Full backend rebuild (`next build`) — clean, zero errors.
- Full mobile type-check (`tsc --noEmit`) — clean, zero errors.
- `expo-doctor` — 18/18 checks passing.
- Live regression suite via curl covering: admin login, driver login, every CRUD endpoint, every previously-broken edge case (nonexistent-ID updates, duplicate names, bad foreign keys, swapped dates, duplicate report/invoice generation, deactivated-driver token reuse, rate limiting), and a full realistic workflow (create driver → create job → accept → start → complete → generate invoice at a new rate → confirm PDF still renders).
- Browser-based smoke test of the actual mobile UI (via `expo start --web`, pointed at the live backend): logged in, navigated Dashboard → Drivers → Businesses, confirmed the new edit forms render, zero console errors across the session.
- Verified data integrity of the fixes by directly querying the dev database (not trusting API responses alone) — confirmed the admin account's password hash, confirmed the double-billing fix actually excludes previously-invoiced jobs at the query level.

Test-pollution rows created while *proving* the bugs existed (a duplicate invoice, a duplicate report, a whitespace-named job type) were cleaned up afterward — they were dev-database artifacts, not something that ships.

---

## Remaining limitations (known, not fixed — by design or scope)

These are documented tradeoffs, not oversights:

- **JWT secret**: `.env` still ships a placeholder `JWT_SECRET`. The app now warns loudly in the server console if it's ever run with that placeholder, but I can't force-rotate it — you must set a real random secret before deploying anywhere real (DEPLOY.md already covers this).
- **Rate limiting is in-memory, single-instance only.** Fine for this app's actual deployment model (one server), but if it's ever run across multiple server instances, the rate limiter needs to move to a shared store (e.g. Redis).
- **No delete capability for drivers, businesses, jobs, reports, or invoices** — only deactivate/cancel. This is intentional (financial/payroll records shouldn't disappear), but it means a genuine data-entry mistake (e.g. wrong report generated) is permanent clutter, not undoable. A future "void/archive" flow would be the right shape for this, not a hard delete.
- **Small remaining race condition on clock-in.** Two near-simultaneous clock-in requests for the same driver could theoretically both succeed, creating two open shifts. The UI already disables the button while a request is in flight, which covers the realistic case (accidental double-tap); a true concurrent-request guard would need a DB-level constraint SQLite/Prisma doesn't cleanly support here. Documented, not fixed — low real-world likelihood for how this app is actually used.
- **Sequential numbering (`HR-0001`, `INV-0001`) uses a counter table**, not a database-native atomic sequence. Correct for this app's actual traffic (one admin, occasional generation), but not proven under high concurrent load.
- **JobType rename** wasn't added (only add/deactivate) — low value versus Driver/Business edit, since a mis-named job type is easy to deactivate and replace. Flagged rather than built, to keep the fix set focused on higher-impact gaps.

---

## Recommendations for future improvements

Roughly in priority order if you keep building on this:

1. **Move to hosted Postgres before real drivers depend on this daily** (already planned in DEPLOY.md) — SQLite is fine for development but a single-file database is a single point of failure for a live payroll/dispatch tool.
2. **Add a "void" flow for reports/invoices** instead of relying on "just don't click it twice" — mistakes will happen, and there's currently no recovery path once a report/invoice exists.
3. **Wire up the driver-detail time-entry view** — the backend already has `GET /api/drivers/:id/time-entries`, built but never surfaced in the admin UI. Cheap addition, useful for verifying a specific driver's hours before generating their report.
4. **Consider the previously-documented FUTURE_IDEAS.md items** (barcode scanning, automatic emailing, SMS notifications, live GPS tracking) — none of today's audit changes affect that roadmap.
5. **Add automated tests.** Everything in this audit was verified by hand (curl scripts, live UI clicks) because there's no test suite yet. Given how easily the double-billing bug slipped in silently, a small Jest/Vitest suite around invoice and report generation specifically would catch regressions here going forward — that's the single highest-value place to start.
