-- Backstops POST /api/driver/clock-in's own findFirst-then-create check
-- against a race: two nearly-simultaneous clock-ins from the same driver
-- could both pass the "no open shift" read before either write commits,
-- creating two open TimeEntry rows for one driver. A plain @@unique in
-- schema.prisma can't express "unique while clockOutAt IS NULL" (Prisma's
-- schema DSL has no partial-index syntax), so this is added by hand —
-- Prisma still maps a violation of it to the same P2002 error code as any
-- other unique constraint.
CREATE UNIQUE INDEX "TimeEntry_driverId_open_shift_key" ON "TimeEntry" ("driverId") WHERE "clockOutAt" IS NULL;
