# Deploying Giant Man Express & Delivery to the Internet

Right now the app runs locally on your computer — your phone reaches the
backend over your home Wi-Fi. To make it work from anywhere (drivers out on
the road, not just at home), you need to host the backend somewhere on the
internet and point the app at it. This is a one-time setup.

You'll need to create the accounts and enter payment info yourself (a
coding assistant can't do that step for you) — everything below is exact
steps to follow.

## 1. Move the database from SQLite to a hosted Postgres

SQLite (the local `dev.db` file) only works when the app runs on one
machine. For a real hosted server you need a real database.

1. Create a free account at [neon.tech](https://neon.tech) (or any hosted
   Postgres provider — Neon has a generous free tier and is simple to set
   up).
2. Create a new project/database. Copy the connection string it gives you
   (looks like `postgresql://user:password@host/dbname?sslmode=require`).
3. In `backend/prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   to:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. In `backend/.env`, replace `DATABASE_URL="file:./dev.db"` with the Neon
   connection string.
5. Run `npx prisma migrate deploy` (from `backend/`) to create the tables
   on the hosted database, then `npm run prisma:seed` to seed the default
   job types and admin account.

## 2. Host the backend

1. Create a free account at [vercel.com](https://vercel.com) (or Railway/
   Render — Vercel is the simplest for a Next.js app like this one).
2. Push this project to a GitHub repository (Vercel deploys from GitHub).
3. In Vercel, "Import Project" and point it at the `backend/` folder.
4. In the Vercel project's Environment Variables, set:
   - `DATABASE_URL` — the Neon connection string from step 1
   - `JWT_SECRET` — generate a long random string (don't reuse the
     placeholder from local dev)
5. Deploy. Vercel gives you a URL like `https://giant-man-express.vercel.app`.

## 3. Point the mobile app at the hosted backend

1. In `mobile/.env`, change `EXPO_PUBLIC_API_BASE_URL` to your Vercel URL.
2. Restart `npx expo start` so the app picks up the new value.

At this point the app works from anywhere with internet, not just your
home Wi-Fi — good enough for you and your drivers to use day to day via
Expo Go, without needing to publish to the app stores yet.

## 4. Publishing to the Apple App Store / Google Play (optional, later)

Only needed once you want drivers to install the app permanently instead
of through Expo Go.

1. Apple: enroll in the
   [Apple Developer Program](https://developer.apple.com/programs/)
   ($99 USD/year). Google: create a
   [Google Play Console](https://play.google.com/console/) account ($25
   USD one-time).
2. Install EAS CLI: `npm install -g eas-cli`, then `eas login`.
3. From `mobile/`, run `eas build:configure` to set up the project.
4. Run `eas build --platform ios` and `eas build --platform android` to
   produce store-ready builds.
5. Run `eas submit` to upload the builds to App Store Connect / Google
   Play Console, then follow their review submission steps.

Expo's own guide (kept current for whatever SDK version you're on) is at
https://docs.expo.dev/submit/introduction/ — worth reading through before
this step since store requirements (screenshots, privacy policy, etc.)
change over time.
