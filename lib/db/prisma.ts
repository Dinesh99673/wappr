import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads / route invocations.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Ensures the singleton Session row (id = 1) exists. Called lazily by the
 * SessionManager so a fresh clone works with no manual seeding step.
 */
export async function ensureSessionRow() {
  const existing = await prisma.session.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.session.create({
      data: { id: 1, status: "UNLINKED" },
    });
  }
}
