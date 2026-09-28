import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

afterAll(() => prisma.$disconnect());

// Supabase's Data API exposes public tables; RLS without policies keeps them private.
describe("row level security", () => {
  it("is enabled on every app table in the public schema", async () => {
    const tables = await prisma.$queryRaw<{ tablename: string; rls: boolean }[]>`
      SELECT c.relname AS tablename, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname <> '_prisma_migrations'`; // secured in scripts/supabase-setup.sql

    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((table) => !table.rls).map((table) => table.tablename)).toEqual([]);
  });
});
