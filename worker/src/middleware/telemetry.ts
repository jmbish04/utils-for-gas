import type { Context, Next } from 'hono';
import type { Env, AppsScriptHeaders } from '../types';
import { createDbClient } from '../db/client';
import { telemetryLogs } from '../db/schema';

/**
 * Extracts Apps Script headers from the request
 */
export function extractAppsScriptHeaders(c: Context): AppsScriptHeaders {
  return {
    appsscriptId: c.req.header('X-Appsscript-Id') || '',
    appsscriptName: c.req.header('X-Appsscript-Name') || '',
    appsscriptDriveId: c.req.header('X-Appsscript-Drive-Id') || '',
    appsscriptDriveUrl: c.req.header('X-Appsscript-Drive-Url') || '',
    appsscriptEditorUrl: c.req.header('X-Appsscript-Editor-Url') || '',
  };
}

/**
 * Telemetry Middleware
 *
 * BLOCKING middleware that:
 * 1. Extracts Apps Script context headers
 * 2. Logs request metadata to D1
 * 3. Tracks performance metrics
 *
 * Note: Does NOT fail the request if headers are missing - stores empty strings
 */
export async function telemetryMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const startTime = Date.now();
  const cfRequestId = c.req.header('cf-request-id') || crypto.randomUUID();

  // Extract Apps Script headers
  const appsScriptHeaders = extractAppsScriptHeaders(c);

  // Store in context for later use
  c.set('appsScriptHeaders', appsScriptHeaders);
  c.set('cfRequestId', cfRequestId);

  try {
    // Execute the request
    await next();

    // Calculate duration
    const durationMs = Date.now() - startTime;

    // Log to D1 (blocking - must complete before response)
    const db = createDbClient(c.env.DB);
    await db.insert(telemetryLogs).values({
      cfRequestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      appsscriptId: appsScriptHeaders.appsscriptId,
      appsscriptName: appsScriptHeaders.appsscriptName,
      appsscriptDriveId: appsScriptHeaders.appsscriptDriveId,
      appsscriptDriveUrl: appsScriptHeaders.appsscriptDriveUrl,
      appsscriptEditorUrl: appsScriptHeaders.appsscriptEditorUrl,
      durationMs,
      statusCode: c.res.status,
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error('Telemetry middleware error:', error);

    // Still try to log the failed request
    try {
      const db = createDbClient(c.env.DB);
      await db.insert(telemetryLogs).values({
        cfRequestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        appsscriptId: appsScriptHeaders.appsscriptId,
        appsscriptName: appsScriptHeaders.appsscriptName,
        appsscriptDriveId: appsScriptHeaders.appsscriptDriveId,
        appsscriptDriveUrl: appsScriptHeaders.appsscriptDriveUrl,
        appsscriptEditorUrl: appsScriptHeaders.appsscriptEditorUrl,
        durationMs: Date.now() - startTime,
        statusCode: 500,
      });
    } catch (logError) {
      console.error('Failed to log telemetry:', logError);
    }

    throw error;
  }
}
