// Reusable Prisma `select` shapes that omit sensitive fields (pinHash, passwordHash)
export const safeDriverSelect = {
  id: true,
  name: true,
  employeeCode: true,
  phone: true,
  active: true,
} as const;
