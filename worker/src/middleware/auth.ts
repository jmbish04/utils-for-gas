import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Auth Middleware
 *
 * Validates WORKER_API_KEY for API routes
 * Bypasses for frontend asset routes
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const path = new URL(c.req.url).pathname;

  // Bypass auth for frontend assets, health check, and documentation
  if (
    !path.startsWith('/api/') ||
    path === '/health' ||
    path === '/doc'
  ) {
    return next();
  }

  // Check for API key
  const providedKey = c.req.header('Authorization')?.replace('Bearer ', '') ||
                      c.req.header('X-API-Key');

  if (!c.env.WORKER_API_KEY) {
    console.warn('WORKER_API_KEY not configured - allowing all requests in development');
    return next();
  }

  if (providedKey !== c.env.WORKER_API_KEY) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or missing API key',
      },
      401
    );
  }

  await next();
}
