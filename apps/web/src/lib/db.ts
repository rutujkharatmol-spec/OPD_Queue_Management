import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * One Prisma client for the whole app.
 *
 * The same code serves both deployments, so pool sizing is the one thing that has to
 * differ. On the OPD server this is a long-lived `next start` process that owns the
 * local Postgres and can hold a real pool. On Vercel each function instance gets its
 * own pool against Neon's pooler, so a large pool per instance would multiply into
 * connection exhaustion — keep it small there and let the pooler do the work.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. On the OPD server point it at the local Postgres; ' +
        'on Vercel use the pooled Neon connection string. See .env.example.'
    );
  }

  const isServerless = Boolean(process.env.VERCEL);

  const adapter = new PrismaPg({
    connectionString,
    max: isServerless ? 1 : 10,
  });

  return new PrismaClient({ adapter });
}

// Next.js clears the module cache on every hot reload in development, which would
// otherwise leak a new pool per edit until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
