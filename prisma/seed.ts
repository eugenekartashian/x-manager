// Local development data: two isolated users, each with their own workspace.
// They cannot sign in (no Google account link) — they exist to exercise isolation.
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });

const url = process.env["DATABASE_URL"];
if (!url || !/x_manager_dev/.test(url)) {
  throw new Error("Seed runs only against the local dev database (x_manager_dev).");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const seedUsers = [
  { id: "seed-user-a", email: "seed-a@example.test", name: "Seed User A" },
  { id: "seed-user-b", email: "seed-b@example.test", name: "Seed User B" },
];

async function main(): Promise<void> {
  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: { ...user, emailVerified: true },
      update: {},
    });
    await prisma.workspace.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, name: `${user.name} workspace` },
      update: {},
    });
  }
  console.log(`Seeded ${seedUsers.length} users with workspaces.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
