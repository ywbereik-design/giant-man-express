# Giant Man Express & Delivery — Operations App

A mobile app for Giant Man Express & Delivery (Ottawa): drivers clock in/out
with GPS, dispatch assigns and tracks jobs, admin generates bi-weekly driver
hour reports and client invoices as shareable PDFs.

- `backend/` — the API server (Next.js + Prisma + SQLite). Everyone's data
  lives here.
- `mobile/` — the phone app (Expo/React Native). One app, three roles:
  - **Admin** (email + password) — full access: drivers, businesses, job
    types, dispatch, hours reports, invoices, and staff accounts.
  - **Dispatch** (email + password) — can view/assign jobs and monitor
    which drivers are currently clocked in, but can't touch reports,
    invoices, billing rates, or driver/staff accounts.
  - **Driver** (employee code + PIN) — clock in/out and manage assigned
    jobs.

## Running it locally

**1. Start the backend** (on your computer):
```bash
cd backend
npm install          # first time only
npm run dev
```
This runs on port 4000. Two accounts are seeded automatically for you to try each role:
- Admin — `admin@giantmanexpress.ca` / `ChangeMe123!`
- Dispatch — `dispatch@giantmanexpress.ca` / `ChangeMe123!`

**Change both passwords after your first login** (Admin → Staff Accounts →
Edit → Reset Password).

**2. Find your computer's LAN IP address** so your phone can reach the
backend over Wi-Fi:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' }
```
Put that IP in `mobile/.env`:
```
EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_IP:4000
```
(This IP can change if your router reassigns it — if the app stops
connecting, re-check it and update `mobile/.env`.)

If the app can't reach the backend from your phone, check that Windows
Firewall is allowing inbound connections on port 4000 for Node.js — Windows
sometimes prompts for this the first time a phone connects.

**3. Start the mobile app**:
```bash
cd mobile
npm install           # first time only
npx expo start
```
Scan the QR code with the **Expo Go** app (free, on the App Store / Google
Play) on your phone. Your phone and computer need to be on the same Wi-Fi
network.

## Adding your drivers

Log in as admin → Drivers → add each driver's name, an employee code (e.g.
`D001`), and a PIN. Give the driver their code + PIN — that's what they use
to log into the app (Driver toggle on the login screen).

## Day-to-day use

- **Drivers**: log in with employee code + PIN → Home tab to clock in/out →
  Jobs tab to accept/start/complete assigned jobs.
- **Dispatch**: log in with email/password → Jobs & Dispatch to create and
  assign jobs, track status, cancel if needed → Drivers to see who's active
  and currently clocked in. No access to reports, invoices, or billing.
- **Admin**: log in with email/password → everything Dispatch has, plus
  Businesses (including billing rates), Hours Reports, Invoices, and Staff
  Accounts. Reports and Invoices generate a PDF you can share straight from
  your phone (email, text, AirDrop, Slack, etc.) — including straight to
  your accountant.

## Managing staff accounts

Admin → Staff Accounts → **Add Staff Account** to create more Admin or
Dispatch logins. Each existing account can be **Edited** (change role, reset
password), **Deactivated/Reactivated** (blocks login immediately, reversible),
or **Deleted** (permanent). A few safety rules are enforced automatically:
you can't deactivate or delete your own account, and you can't deactivate,
demote, or delete the last remaining Admin account — there always has to be
at least one Admin who can get back in.

## Going live on the internet / publishing to app stores

See [DEPLOY.md](./DEPLOY.md) — this app currently only works over your home
Wi-Fi; that file walks through hosting the backend and, later, publishing
to the App Store / Google Play.

## What's next

See [FUTURE_IDEAS.md](./FUTURE_IDEAS.md) for barcode scanning, automatic
emailing, SMS notifications, and other ideas that were discussed but
deliberately left out of this first version.
