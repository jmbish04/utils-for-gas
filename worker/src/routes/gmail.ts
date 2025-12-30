import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { Env, VectorMetadata } from '../types';
import { createDbClient } from '../db/client';
import { gmailThreads, gmailMessages } from '../db/schema';

/**
 * Gmail Metadata Routes
 * Provides deduplication and RAG services for Gmail processing
 */
export const gmailRoutes = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /api/gmail/sync
 * Sync thread/message metadata to D1 and Vectorize
 */
const syncRoute = createRoute({
  method: 'post',
  path: '/sync',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            type: z.enum(['thread', 'message']),
            threads: z.array(
              z.object({
                threadId: z.string(),
                subject: z.string(),
                snippet: z.string().optional(),
                firstMessageDate: z.number(),
                lastMessageDate: z.number(),
                labels: z.array(z.string()).optional(),
              })
            ).optional(),
            messages: z.array(
              z.object({
                messageId: z.string(),
                threadId: z.string(),
                from: z.string(),
                to: z.string().optional(),
                cc: z.string().optional(),
                subject: z.string().optional(),
                snippet: z.string().optional(),
                bodyPreview: z.string().optional(),
                internalDate: z.number(),
              })
            ).optional(),
            processedBy: z.string().optional(),
            generateEmbeddings: z.boolean().optional().default(true),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Sync successful',
      content: {
        'application/json': {
          schema: z.object({
            synced: z.number(),
            type: z.string(),
            vectorized: z.number(),
          }),
        },
      },
    },
  },
});

gmailRoutes.openapi(syncRoute, async (c) => {
  const { type, threads, messages, processedBy, generateEmbeddings } = c.req.valid('json');
  const db = createDbClient(c.env.DB);
  const appsScriptHeaders = c.get('appsScriptHeaders');
  const processor = processedBy || appsScriptHeaders?.appsscriptId || 'unknown';

  let synced = 0;
  let vectorized = 0;

  try {
    if (type === 'thread' && threads) {
      for (const thread of threads) {
        // Insert or update thread
        await db
          .insert(gmailThreads)
          .values({
            threadId: thread.threadId,
            subject: thread.subject,
            snippet: thread.snippet,
            firstMessageDate: new Date(thread.firstMessageDate),
            lastMessageDate: new Date(thread.lastMessageDate),
            labels: JSON.stringify(thread.labels || []),
            processedAt: new Date(),
            processedBy: processor,
          })
          .onConflictDoUpdate({
            target: gmailThreads.threadId,
            set: {
              subject: thread.subject,
              lastMessageDate: new Date(thread.lastMessageDate),
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

        synced++;

        // Generate embeddings and insert into Vectorize
        if (generateEmbeddings) {
          try {
            const embeddingText = `${thread.subject} ${thread.snippet || ''}`;
            const embedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
              text: embeddingText,
            });

            if (embedding && Array.isArray(embedding.data) && embedding.data.length > 0) {
              const vectorId = `thread:${thread.threadId}`;
              const metadata: VectorMetadata = {
                id: vectorId,
                type: 'thread',
                threadId: thread.threadId,
                subject: thread.subject,
                timestamp: thread.lastMessageDate,
              };

              await c.env.VECTORIZE.upsert([
                {
                  id: vectorId,
                  values: embedding.data[0],
                  metadata,
                },
              ]);

              // Update D1 with vectorize ID
              await db
                .update(gmailThreads)
                .set({ vectorizeId: vectorId })
                .where(eq(gmailThreads.threadId, thread.threadId));

              vectorized++;
            }
          } catch (embeddingError) {
            console.error('Error generating embedding for thread:', embeddingError);
          }
        }
      }
    }

    if (type === 'message' && messages) {
      for (const message of messages) {
        // Insert or update message
        await db
          .insert(gmailMessages)
          .values({
            messageId: message.messageId,
            threadId: message.threadId,
            from: message.from,
            to: message.to,
            cc: message.cc,
            subject: message.subject,
            snippet: message.snippet,
            bodyPreview: message.bodyPreview,
            internalDate: new Date(message.internalDate),
            processedAt: new Date(),
            processedBy: processor,
          })
          .onConflictDoUpdate({
            target: gmailMessages.messageId,
            set: {
              processedAt: new Date(),
              updatedAt: new Date(),
            },
          });

        synced++;

        // Generate embeddings
        if (generateEmbeddings) {
          try {
            const embeddingText = `${message.subject || ''} ${message.snippet || ''} ${message.bodyPreview || ''}`;
            const embedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
              text: embeddingText,
            });

            if (embedding && Array.isArray(embedding.data) && embedding.data.length > 0) {
              const vectorId = `message:${message.messageId}`;
              const metadata: VectorMetadata = {
                id: vectorId,
                type: 'message',
                threadId: message.threadId,
                messageId: message.messageId,
                subject: message.subject,
                from: message.from,
                timestamp: message.internalDate,
              };

              await c.env.VECTORIZE.upsert([
                {
                  id: vectorId,
                  values: embedding.data[0],
                  metadata,
                },
              ]);

              await db
                .update(gmailMessages)
                .set({ vectorizeId: vectorId })
                .where(eq(gmailMessages.messageId, message.messageId));

              vectorized++;
            }
          } catch (embeddingError) {
            console.error('Error generating embedding for message:', embeddingError);
          }
        }
      }
    }

    return c.json({ synced, type, vectorized });
  } catch (error) {
    console.error('Gmail sync error:', error);
    return c.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/gmail/distinct
 * Get distinct thread or message IDs with optional filters
 */
const distinctRoute = createRoute({
  method: 'get',
  path: '/distinct',
  request: {
    query: z.object({
      type: z.enum(['thread', 'message']),
      since: z.string().optional().describe('ISO timestamp or "24h" format'),
      processedBy: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of distinct IDs',
      content: {
        'application/json': {
          schema: z.object({
            type: z.string(),
            ids: z.array(z.string()),
            count: z.number(),
          }),
        },
      },
    },
  },
});

gmailRoutes.openapi(distinctRoute, async (c) => {
  const { type, since, processedBy } = c.req.valid('query');
  const db = createDbClient(c.env.DB);

  try {
    let sinceDate: Date | null = null;

    if (since) {
      if (since.endsWith('h')) {
        const hours = parseInt(since.slice(0, -1));
        sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      } else {
        sinceDate = new Date(since);
      }
    }

    let results: Array<{ id: string }> = [];

    if (type === 'thread') {
      const conditions = [];
      if (sinceDate) {
        conditions.push(gte(gmailThreads.processedAt, sinceDate));
      }
      if (processedBy) {
        conditions.push(eq(gmailThreads.processedBy, processedBy));
      }

      const threads = await db
        .select({ id: gmailThreads.threadId })
        .from(gmailThreads)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      results = threads;
    } else {
      const conditions = [];
      if (sinceDate) {
        conditions.push(gte(gmailMessages.processedAt, sinceDate));
      }
      if (processedBy) {
        conditions.push(eq(gmailMessages.processedBy, processedBy));
      }

      const messages = await db
        .select({ id: gmailMessages.messageId })
        .from(gmailMessages)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      results = messages;
    }

    return c.json({
      type,
      ids: results.map((r) => r.id),
      count: results.length,
    });
  } catch (error) {
    console.error('Gmail distinct query error:', error);
    return c.json(
      {
        error: 'Query failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/gmail/search
 * Semantic search using Vectorize
 */
const searchRoute = createRoute({
  method: 'post',
  path: '/search',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            query: z.string(),
            type: z.enum(['thread', 'message', 'both']).optional().default('both'),
            limit: z.number().min(1).max(100).optional().default(10),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Search results',
      content: {
        'application/json': {
          schema: z.object({
            results: z.array(
              z.object({
                id: z.string(),
                score: z.number(),
                metadata: z.any(),
              })
            ),
            count: z.number(),
          }),
        },
      },
    },
  },
});

gmailRoutes.openapi(searchRoute, async (c) => {
  const { query, type, limit } = c.req.valid('json');

  try {
    // Generate embedding for the query
    const embedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: query,
    });

    if (!embedding || !Array.isArray(embedding.data) || embedding.data.length === 0) {
      throw new Error('Failed to generate embedding for query');
    }

    // Search Vectorize
    const searchResults = await c.env.VECTORIZE.query(embedding.data[0], {
      topK: limit,
      returnMetadata: 'all',
    });

    // Filter by type if specified
    let results = searchResults.matches || [];
    if (type !== 'both') {
      results = results.filter((match: any) => match.metadata?.type === type);
    }

    return c.json({
      results: results.map((match: any) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata,
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('Gmail search error:', error);
    return c.json(
      {
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
