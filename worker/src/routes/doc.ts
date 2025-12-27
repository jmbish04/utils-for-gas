import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env } from '../types';

/**
 * Doc Agent Routes
 * Provides access to the DocAgent Durable Object
 */
export const docRoutes = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /api/doc/configure
 * Configure the Doc Controller endpoint
 */
const configureRoute = createRoute({
  method: 'post',
  path: '/configure',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            gasWebAppUrl: z.string().url(),
            authToken: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Configuration successful',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            sessionId: z.string(),
          }),
        },
      },
    },
  },
});

docRoutes.openapi(configureRoute, async (c) => {
  const body = c.req.valid('json');

  // Get or create Durable Object instance
  const id = c.env.DOC_AGENT.idFromName('default');
  const stub = c.env.DOC_AGENT.get(id);

  // Forward request to Durable Object
  const response = await stub.fetch('https://doc-agent.internal/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

/**
 * POST /api/doc/md-to-doc
 * Convert markdown to Google Doc
 */
const mdToDocRoute = createRoute({
  method: 'post',
  path: '/md-to-doc',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            markdown: z.string(),
            docId: z.string(),
            gasWebAppUrl: z.string().url().optional(),
            authToken: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Markdown converted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            sessionId: z.string(),
            docId: z.string(),
            opsExecuted: z.number(),
            verificationsPerformed: z.number(),
            finalState: z.any(),
          }),
        },
      },
    },
  },
});

docRoutes.openapi(mdToDocRoute, async (c) => {
  const body = c.req.valid('json');

  // Get or create Durable Object instance
  const id = c.env.DOC_AGENT.idFromName('default');
  const stub = c.env.DOC_AGENT.get(id);

  // Forward request to Durable Object
  const response = await stub.fetch('https://doc-agent.internal/md-to-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

/**
 * POST /api/doc/chat
 * Chat interface for natural language doc edits
 */
const chatRoute = createRoute({
  method: 'post',
  path: '/chat',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            docId: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Chat response',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            opsExecuted: z.number(),
            response: z.string(),
          }),
        },
      },
    },
  },
});

docRoutes.openapi(chatRoute, async (c) => {
  const body = c.req.valid('json');

  // Get or create Durable Object instance
  const id = c.env.DOC_AGENT.idFromName('default');
  const stub = c.env.DOC_AGENT.get(id);

  // Forward request to Durable Object
  const response = await stub.fetch('https://doc-agent.internal/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
});

/**
 * GET /api/doc/status
 * Get agent status
 */
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  responses: {
    200: {
      description: 'Agent status',
      content: {
        'application/json': {
          schema: z.object({
            sessionId: z.string(),
            currentDocId: z.string().nullable(),
            configured: z.boolean(),
          }),
        },
      },
    },
  },
});

docRoutes.openapi(statusRoute, async (c) => {
  // Get or create Durable Object instance
  const id = c.env.DOC_AGENT.idFromName('default');
  const stub = c.env.DOC_AGENT.get(id);

  // Forward request to Durable Object
  const response = await stub.fetch('https://doc-agent.internal/status', {
    method: 'GET',
  });

  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
