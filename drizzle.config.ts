import type { Config } from 'drizzle-kit';

export default {
  schema: './worker/src/db/schema.ts',
  out: './worker/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
} satisfies Config;
