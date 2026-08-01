# Future Ideas — Giant Man Express & Delivery App

Ideas discussed but intentionally left out of v1 so the core (clock in/out,
dispatch, hour reports, invoices) could ship solid first. None of these
require re-architecting anything — they layer on top of what's already
built.

## Barcode / QR scanning for proof of delivery
Use the phone camera (`expo-camera` + a barcode-scanning library, or the
newer built-in `expo-camera` barcode scanning API) so a driver — or a
client — can scan a package barcode/QR code at pickup or drop-off. Would
add a `scannedCode` field to `Job` and a scan screen in the driver app.
Could later extend to a client-facing scan-to-track page.

## Automatic emailing of reports & invoices
Right now hour reports and invoices are generated in-app and shared as a
PDF (email, text, AirDrop, Slack, whatever the phone's share sheet offers).
To send them automatically on a schedule (e.g. every other Friday), wire up
a transactional email service — Resend or Postmark are both simple to
integrate — and add a scheduled job (e.g. a Vercel Cron or a small
node-cron process) that generates and emails the current period's reports.
Requires the business to have that email service account set up.

## SMS notifications to drivers
Text a driver when a new job is assigned, using a service like Twilio.
Would need each driver's phone number (already collected) and a Twilio
account.

## Live GPS tracking
Currently location is only captured at the moment of clock-in and
clock-out. Continuous tracking while a driver is on a job (for a live map
view) would need background location permissions and a much more careful
battery/privacy tradeoff — worth doing deliberately, not as an add-on.

## Editable invoice line items
Invoices are currently generated automatically from completed jobs at the
business's flat per-job rate. Adding an edit screen (adjust quantity/rate/
description before finalizing) would give more billing flexibility, e.g.
different rates for different job types.

## Multi-admin accounts / permissions
Right now there's a single admin account. If more than one person needs to
dispatch or manage the account, add proper multi-admin support with roles
(e.g. dispatcher vs. full admin).
