import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashSecret, signSession, Role } from "@/lib/auth";

const BASE_URL = "http://localhost:4000";

let counter = 0;
// Unique per call (not just per-process-start) so re-running the suite
// without a fresh globalSetup truncation still can't collide with a
// leftover row from a previous run.
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createStaff(
  overrides: Partial<{ role: Role; active: boolean; password: string }> = {}
) {
  const password = overrides.password ?? "test-password-123";
  const staff = await prisma.staffUser.create({
    data: {
      email: `${unique("staff")}@example.com`,
      name: "Test Staff",
      role: overrides.role ?? "ADMIN",
      active: overrides.active ?? true,
      passwordHash: await hashSecret(password),
    },
  });
  return { staff, password };
}

export async function createDriver(overrides: Partial<{ active: boolean; pin: string }> = {}) {
  const pin = overrides.pin ?? "1234";
  const driver = await prisma.driver.create({
    data: {
      name: "Test Driver",
      employeeCode: unique("D"),
      active: overrides.active ?? true,
      pinHash: await hashSecret(pin),
    },
  });
  return { driver, pin };
}

export async function createJobType() {
  return prisma.jobType.create({ data: { name: unique("JobType"), active: true } });
}

export async function createBusiness(
  overrides: Partial<{ billingRate: number | null; billingType: string }> = {}
) {
  return prisma.business.create({
    data: {
      name: unique("Business"),
      billingRate: overrides.billingRate === undefined ? 50 : overrides.billingRate,
      ...(overrides.billingType ? { billingType: overrides.billingType } : {}),
    },
  });
}

export async function createJob(overrides: {
  driverId: string;
  jobTypeId: string;
  businessId?: string;
  status?: string;
  pickupAddress?: string;
  pickedUpAt?: Date;
  deliveredAt?: Date;
}) {
  return prisma.job.create({
    data: {
      title: unique("Job"),
      jobTypeId: overrides.jobTypeId,
      driverId: overrides.driverId,
      businessId: overrides.businessId,
      status: overrides.status ?? "ASSIGNED",
      pickupAddress: overrides.pickupAddress,
      pickedUpAt: overrides.pickedUpAt,
      deliveredAt: overrides.deliveredAt,
    },
  });
}

// The test DB is only truncated once per whole `vitest run`, not per test —
// so by the time a "last active admin" test runs, other tests may have
// already created plenty of other ADMIN rows. That guard is a genuinely
// global invariant (it counts every StaffUser row, not a per-test subset),
// so any test asserting it needs to first make that precondition actually
// true rather than assume test-file isolation that doesn't exist here.
export async function deactivateAllOtherAdmins(...exceptIds: string[]): Promise<void> {
  await prisma.staffUser.updateMany({
    where: { role: "ADMIN", active: true, id: { notIn: exceptIds } },
    data: { active: false },
  });
}

export async function tokenFor(sub: string, role: Role, name: string, tokenVersion = 0): Promise<string> {
  return signSession({ sub, role, name, tokenVersion });
}

// Builds a real NextRequest so route handlers can be called exactly as
// Next.js would call them — no HTTP server needed, since these handlers
// are plain functions over the standard Request/Response Web APIs.
export function jsonRequest(path: string, method: string, body?: unknown, token?: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function getRequest(path: string, token?: string): NextRequest {
  return new NextRequest(`${BASE_URL}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// A tiny valid data URL — well under MAX_SELFIE_DATA_URL_LENGTH, just needs
// to start with "data:image/" to pass the photo-shape check on routes that
// require one.
export const FAKE_PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wA=";
