import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const g = globalThis as unknown as { prisma?: PrismaClient };

/** Prisma CLI resolves `file:` URLs relative to prisma/; libsql resolves relative to cwd. Normalize to prisma/. */
function resolveUrl(url: string) {
  const m = url.match(/^file:(?!\/)(.*)$/);
  return m ? `file:${path.resolve(process.cwd(), "prisma", m[1])}` : url;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaLibSQL({ url: resolveUrl(url), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma = g.prisma ?? create();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
