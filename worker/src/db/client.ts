import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Creates a Drizzle database client from Cloudflare D1 binding
 */
export function createDbClient(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
