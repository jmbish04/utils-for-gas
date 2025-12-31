import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { telemetryMiddleware } from './middleware/telemetry';
import { aiRoutes } from './routes/ai';
import { gmailRoutes } from './routes/gmail';
import { docRoutes } from './routes/doc';
import { kvRoutes } from './routes/kv';
import { kvEnhancedRoutes } from './routes/kv-enhanced';

/**
 * Colby-GAS-Bridge Worker
 *
 * A dual-ecosystem utility hub:
 * - Cloudflare Worker: REST APIs, AI Agents, React Frontend
 * - Google Apps Script: Copy-pasteable utilities and Doc Controller
 */

// Create main app with OpenAPI support
const app = new OpenAPIHono<{ Bindings: Env }>();

// Apply global middleware
app.use('*', cors());
app.use('*', authMiddleware);

// Apply telemetry middleware to API routes only
app.use('/api/*', telemetryMiddleware);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Colby-GAS-Bridge',
    version: '1.0.0',
    description: 'Cloudflare Worker utilities for Google Apps Script',
    endpoints: {
      health: '/health',
      documentation: '/doc',
      api: {
        ai: {
          generate: 'POST /api/ai/generate',
          models: 'GET /api/ai/models',
        },
        gmail: {
          sync: 'POST /api/gmail/sync',
          distinct: 'GET /api/gmail/distinct',
          search: 'POST /api/gmail/search',
        },
        doc: {
          configure: 'POST /api/doc/configure',
          mdToDoc: 'POST /api/doc/md-to-doc',
          chat: 'POST /api/doc/chat',
          status: 'GET /api/doc/status',
        },
        kv: {
          set: 'POST /api/kv/set',
          get: 'GET /api/kv/get',
          getBulk: 'POST /api/kv/get-bulk',
          list: 'GET /api/kv/list',
          listValues: 'POST /api/kv/list-values',
          search: 'POST /api/kv/search',
          delete: 'DELETE /api/kv/delete',
          deleteBulk: 'POST /api/kv/delete-bulk',
          deletePrefix: 'POST /api/kv/delete-prefix',
        },
      },
    },
    frontend: {
      dashboard: '/',
      telemetry: '/telemetry',
      prompts: '/prompts',
    },
  });
});

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

// Mount API routes
app.route('/api/ai', aiRoutes);
app.route('/api/gmail', gmailRoutes);
app.route('/api/doc', docRoutes);
app.route('/api/kv', kvRoutes);
app.route('/api/kv-enhanced', kvEnhancedRoutes);

// OpenAPI documentation
app.doc('/doc', {
  openapi: '3.1.0',
  info: {
    title: 'Colby-GAS-Bridge API',
    version: '1.0.0',
    description: `
# Colby-GAS-Bridge

A dual-repo ecosystem for Cloudflare Workers and Google Apps Script:

## Features

- **AI Services**: Llama 3.3, Vision, and Scout models with transcript logging
- **Gmail Metadata**: Deduplication and RAG for email processing
- **Doc Controller Agent**: Markdown-to-Doc conversion with natural language editing
- **KV Storage**: Schema-less key-value storage as a Sheets alternative
- **Telemetry**: Comprehensive request tracking and analytics
- **Frontend Dashboard**: React-based UI for monitoring and configuration

## Authentication

All API endpoints (except frontend assets) require authentication via:
- \`Authorization: Bearer YOUR_API_KEY\`
- \`X-API-Key: YOUR_API_KEY\`

## Apps Script Integration

Apps Script clients should include these headers for telemetry:
- \`X-Appsscript-Id\`
- \`X-Appsscript-Name\`
- \`X-Appsscript-Drive-Id\`
- \`X-Appsscript-Drive-Url\`
- \`X-Appsscript-Editor-Url\`
    `.trim(),
  },
  servers: [
    {
      url: 'https://colby-gas-bridge.workers.dev',
      description: 'Production',
    },
    {
      url: 'http://localhost:8787',
      description: 'Development',
    },
  ],
});

// Serve frontend assets (Remix)
// This will be handled by Workers Assets binding automatically
// Any unmatched routes will fall through to the assets handler

// Export the worker
export default app;

// Export Durable Object
export { DocAgent } from './durable-objects/DocAgent';
