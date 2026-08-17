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
function getConnectionString(): string | undefined {
  // 1. Explicit DATABASE_URL
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  // 2. Cloud / Neon Database URLs
  if (process.env.NEON_DATABASE_URL?.trim()) {
    return process.env.NEON_DATABASE_URL.trim();
  }

  if (process.env.POSTGRES_PRISMA_URL?.trim()) {
    return process.env.POSTGRES_PRISMA_URL.trim();
  }

  if (process.env.POSTGRES_URL?.trim()) {
    return process.env.POSTGRES_URL.trim();
  }

  // 3. Fallback to Local Hospital Database URL
  if (process.env.LOCAL_DATABASE_URL?.trim()) {
    return process.env.LOCAL_DATABASE_URL.trim();
  }

  return undefined;
}

function createClient() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error(
      'No DATABASE_URL found. Set DATABASE_URL, NEON_DATABASE_URL, or LOCAL_DATABASE_URL in .env.'
    );
  }

  const isServerless = Boolean(process.env.VERCEL);

  const adapter = new PrismaPg({
    connectionString,
    max: isServerless ? 1 : 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return new PrismaClient({ adapter });
}

// Next.js clears the module cache on every hot reload in development, which would
// otherwise leak a new pool per edit until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Connects on first use, not at import.
 *
 * `next build` imports every route module to collect its metadata, so constructing the
 * client at module scope would make a missing DATABASE_URL a build failure — on Vercel,
 * a red deploy rather than a clear runtime error. Deferring it means the build never
 * needs database credentials and a misconfigured environment reports itself on the
 * first request, where the message is actionable.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, property, receiver);
    // Model delegates are plain objects; only top-level methods ($transaction,
    // $queryRaw, …) need their receiver preserved.
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
