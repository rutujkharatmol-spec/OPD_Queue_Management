import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Supports DATABASE_URL, NEON_DATABASE_URL, POSTGRES_PRISMA_URL, or LOCAL_DATABASE_URL
    url:
      process.env['DATABASE_URL'] ||
      process.env['NEON_DATABASE_URL'] ||
      process.env['POSTGRES_PRISMA_URL'] ||
      process.env['POSTGRES_URL'] ||
      process.env['LOCAL_DATABASE_URL'] ||
      '',
  },
});
