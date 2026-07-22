import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_JOB_TYPES = [
  "Same-Day Delivery",
  "Scheduled Route",
  "Rush/Express",
  "Warehouse Pickup",
  "Freight",
];

async function seedStaff(email: string, name: string, password: string, role: "ADMIN" | "DISPATCH") {
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) return;
  await prisma.staffUser.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Seeded ${role.toLowerCase()} account: ${email} / ${password} (change this password after first login)`);
}

async function main() {
  for (const name of DEFAULT_JOB_TYPES) {
    await prisma.jobType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await seedStaff("admin@giantmanexpress.ca", "Giant Man Admin", "ChangeMe123!", "ADMIN");
  await seedStaff("dispatch@giantmanexpress.ca", "Giant Man Dispatch", "ChangeMe123!", "DISPATCH");

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
