import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const DEFAULT_JOB_TYPES = [
  "Same-Day Delivery",
  "Scheduled Route",
  "Rush/Express",
  "Warehouse Pickup",
  "Freight",
];

// Not a hardcoded literal — a fixed default password here would end up
// committed to source control and reused verbatim as the real production
// admin/dispatch login on first deploy (this script is the documented
// production bootstrap step in DEPLOY.md). Printed once at seed time and
// never persisted anywhere else.
function randomPassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function seedStaff(email: string, name: string, role: "ADMIN" | "DISPATCH") {
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) return;
  const password = randomPassword();
  await prisma.staffUser.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Seeded ${role.toLowerCase()} account: ${email} / ${password}`);
  console.log(`  Save this now — it will not be shown again. Change it after first login.`);
}

async function main() {
  for (const name of DEFAULT_JOB_TYPES) {
    await prisma.jobType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await seedStaff("admin@giantmanexpress.ca", "Giant Man Admin", "ADMIN");
  await seedStaff("dispatch@giantmanexpress.ca", "Giant Man Dispatch", "DISPATCH");

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
