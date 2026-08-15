import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // On the OPD server this is the local Postgres; on Vercel it is Neon.
    // Same schema, same migrations, different target.
    url: process.env['DATABASE_URL'],
  },
});
