# Deploying Giant Man Express & Delivery to the Internet + Play Store

Right now the app runs locally on your computer — your phone reaches the
backend over your home Wi-Fi. This guide covers the two remaining steps to
go live: hosting the backend on the internet, and building the Android app
for the Play Store.

**What's already done** (as of this writing):
- The database is already Postgres (not SQLite) — both local dev and
  production use it, so there's no schema conversion step left to do.
- Login-attempt rate limiting is stored in the database, not in memory —
  this matters because the hosted backend runs as serverless functions
  (see "Why Postgres-backed rate limiting" below).
- `git init` has been run on the project; `mobile/eas.json` and the Android
  package name (`ca.giantmanexpress.app`) are already configured.

**What you need to do** — every step below marked **YOU** requires an
account/payment only you can create. Everything else, tell me and I'll run
it directly.

---

## 1. Neon (hosted Postgres) — **YOU**

1. Sign up free at [neon.tech](https://neon.tech).
2. Create a project (e.g. "giant-man-express").
3. Inside that project, create **two databases**: `production` and
   `development` (Neon calls these databases or branches depending on the
   UI — either works, just keep them separate). Keeping them separate means
   your testing never touches real driver/client data once the app is live.
4. For each database, copy the **pooled** connection string (Neon labels
   one specifically for serverless/pooled use — that's the one to use,
   not the "direct" one). It looks like:
   `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
5. Give me both connection strings. I'll:
   - Point local `backend/.env` at the `development` one, run
     `npx prisma migrate deploy` + the seed script against it, and confirm
     everything still works locally.
   - Use the `production` one when deploying to Vercel (step 2).

## 2. Vercel (hosting) — mostly me, one step from **YOU**

1. **YOU**: sign up free at [vercel.com](https://vercel.com).
2. I'll run `npx vercel login` from `backend/` — this opens a login link
   you complete in your browser (or confirms via email). Let me know once
   you've clicked through.
3. Once logged in, I'll run `vercel --prod` to deploy directly from this
   machine (no GitHub repo needed) and set the environment variables:
   - `DATABASE_URL` — the **production** Neon connection string from step 1
   - `JWT_SECRET` — a real random secret I've already generated for this
     (not the local dev placeholder)
4. Vercel gives back a URL like `https://giant-man-express.vercel.app`. I'll
   run `npx prisma migrate deploy` against the production database (creates
   the tables) and the seed script (creates default job types + your admin/
   dispatch logins) before anyone uses it.
5. I'll verify the live URL with the same test suite used throughout this
   build — login for all 3 roles, job dispatch lifecycle, report/invoice
   generation — before calling it done.

## 3. Point the mobile app at the hosted backend — me

Once step 2 is live, I'll update `mobile/.env`'s `EXPO_PUBLIC_API_BASE_URL`
to the Vercel URL and restart Expo. From this point, the app works from
anywhere with internet — not just your home Wi-Fi — for you and your
drivers using it via Expo Go, without needing the Play Store yet.

## 4. Expo/EAS account (for building the Android app) — **YOU**, then me

1. **YOU**: sign up free at [expo.dev](https://expo.dev).
2. I'll run `eas login` — same pattern as Vercel, you complete the browser
   confirmation, then tell me you're done.
3. I'll run `eas build:configure` to link this project to your account
   (this adds a `projectId` under `extra.eas` in `mobile/app.config.js` —
   normal, not a secret. The mobile app uses a dynamic `app.config.js`
   instead of a static `app.json` so build-time values can be pulled from
   `.env`; EAS CLI can't auto-write into a JS config file the way it does
   with plain JSON, so I may need to add the projectId by hand instead of it
   happening automatically).
4. I'll run `eas build --platform android --profile preview` first — this
   produces a plain `.apk` you can sideload straight onto your own Android
   phone (no Play Store needed) to sanity-check the real build before
   anything goes public.
5. Once that looks good, `eas build --platform android --profile production`
   produces the `.aab` file the Play Store actually wants.

## 5. Google Play Console — **YOU**, then me for the upload

1. **YOU**: sign up at [play.google.com/console](https://play.google.com/console)
   ($25 USD one-time). This can happen any time in parallel with steps 1–4 —
   it's not needed until you're ready to actually submit.
2. Play requires, even for a small/private app: a store listing (name,
   description, icon — already have one), a handful of screenshots (I can
   help you capture these from the running app), and a privacy policy URL
   (a simple one is fine given what this app collects — driver GPS at
   clock-in/out, names, contact info — I can draft the text, you'll need to
   host it somewhere with a URL, e.g. a simple page on your business
   website).
3. Once the listing is ready and you have the `.aab` from step 4, I'll walk
   you through uploading it (`eas submit` can automate this once you've
   generated a Play Console API key, or we do it manually through the Play
   Console UI — whichever you prefer).
4. Google reviews new apps before publishing — this can take anywhere from
   a few hours to a few days the first time.

---

## Why Postgres-backed rate limiting

Vercel runs the backend as **serverless functions** — each request can be
handled by a different, short-lived process instance rather than one
long-running server. An in-memory login-attempt counter (a plain
JavaScript `Map`) wouldn't reliably persist between requests in that model,
which would make the login throttle inconsistent. Since the whole project
had already moved to Postgres for the main database, the attempt counter
was moved there too (`RateLimitAttempt` table) — same protection, works
correctly under serverless.

## Why two Neon databases instead of one

Local development regularly creates and deletes test drivers, jobs,
reports, and invoices (this happened constantly throughout building this
app). If local dev pointed at the same database as production, that
testing would corrupt real data once drivers and clients are actually
using it. Two databases (same free Neon account, no extra cost) keeps them
fully separate.
