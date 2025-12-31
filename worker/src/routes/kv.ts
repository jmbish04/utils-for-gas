import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env, KVRecord, KVListOptions, KVSearchOptions } from '../types';

/**
 * KV Routes
 * Schema-less key-value storage API
 *
 * A flexible alternative to using Google Sheets as a database.
 * No schema required - store any JSON data with automatic metadata.
 */
export const kvRoutes = new OpenAPIHono<{ Bindings: Env }>();

/**
 * Helper: Get Apps Script context for metadata
 */
function getCreatedBy(c: any): string {
  const appsScriptHeaders = c.get('appsScriptHeaders');
  return appsScriptHeaders?.appsscriptName || appsScriptHeaders?.appsscriptId || 'unknown';
}

/**
 * POST /api/kv/set
 * Create or update a key-value pair
 */
const setRoute = createRoute({
  method: 'post',
  path: '/set',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            key: z.string().min(1).describe('Unique key identifier'),
            value: z.any().describe('Any JSON-serializable value'),
            metadata: z.object({
              tags: z.array(z.string()).optional(),
            }).optional().describe('Optional metadata'),
            expirationTtl: z.number().optional().describe('TTL in seconds'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Value set successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            key: z.string(),
            operation: z.enum(['created', 'updated']),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(setRoute, async (c) => {
  const { key, value, metadata, expirationTtl } = c.req.valid('json');

  try {
    // Check if key exists to determine operation type
    const existing = await c.env.KV.get(key, 'json');
    const operation = existing ? 'updated' : 'created';

    // Build metadata
    const now = Date.now();
    const fullMetadata = {
      createdAt: existing?.metadata?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.metadata?.createdBy || getCreatedBy(c),
      tags: metadata?.tags || [],
      ...metadata,
    };

    // Store the record with metadata
    const record: KVRecord = {
      key,
      value,
      metadata: fullMetadata,
    };

    // Set with optional expiration
    if (expirationTtl) {
      await c.env.KV.put(key, JSON.stringify(record), { expirationTtl });
    } else {
      await c.env.KV.put(key, JSON.stringify(record));
    }

    return c.json({
      success: true,
      key,
      operation,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to set value',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/kv/get
 * Get a value by key
 */
const getRoute = createRoute({
  method: 'get',
  path: '/get',
  request: {
    query: z.object({
      key: z.string().min(1),
      withMetadata: z.enum(['true', 'false']).optional().default('true'),
    }),
  },
  responses: {
    200: {
      description: 'Value retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            key: z.string(),
            value: z.any().nullable(),
            metadata: z.any().optional(),
            exists: z.boolean(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(getRoute, async (c) => {
  const { key, withMetadata } = c.req.valid('query');

  try {
    const record = await c.env.KV.get<KVRecord>(key, 'json');

    if (!record) {
      return c.json({
        key,
        value: null,
        exists: false,
      });
    }

    return c.json({
      key,
      value: record.value,
      metadata: withMetadata === 'true' ? record.metadata : undefined,
      exists: true,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get value',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv/get-bulk
 * Get multiple values by keys
 */
const getBulkRoute = createRoute({
  method: 'post',
  path: '/get-bulk',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            keys: z.array(z.string()),
            withMetadata: z.boolean().optional().default(true),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Values retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            records: z.array(z.any()),
            count: z.number(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(getBulkRoute, async (c) => {
  const { keys, withMetadata } = c.req.valid('json');

  try {
    const results = await Promise.all(
      keys.map(async (key) => {
        const record = await c.env.KV.get<KVRecord>(key, 'json');
        if (!record) return null;

        return {
          key,
          value: record.value,
          metadata: withMetadata ? record.metadata : undefined,
        };
      })
    );

    const records = results.filter((r) => r !== null);

    return c.json({
      records,
      count: records.length,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get bulk values',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/kv/list
 * List keys with optional prefix filtering
 */
const listRoute = createRoute({
  method: 'get',
  path: '/list',
  request: {
    query: z.object({
      prefix: z.string().optional(),
      limit: z.string().optional().default('100'),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Keys listed successfully',
      content: {
        'application/json': {
          schema: z.object({
            keys: z.array(z.string()),
            cursor: z.string().nullable(),
            hasMore: z.boolean(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(listRoute, async (c) => {
  const { prefix, limit: limitStr, cursor } = c.req.valid('query');
  const limit = parseInt(limitStr);

  try {
    const options: KVNamespaceListOptions = {
      limit: Math.min(limit, 1000),
    };

    if (prefix) options.prefix = prefix;
    if (cursor) options.cursor = cursor;

    const result = await c.env.KV.list(options);

    return c.json({
      keys: result.keys.map((k) => k.name),
      cursor: result.cursor || null,
      hasMore: !result.list_complete,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list keys',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv/list-values
 * List keys with their values (expensive - use sparingly)
 */
const listValuesRoute = createRoute({
  method: 'post',
  path: '/list-values',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            prefix: z.string().optional(),
            limit: z.number().optional().default(50).describe('Max 100'),
            withMetadata: z.boolean().optional().default(true),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Values listed successfully',
      content: {
        'application/json': {
          schema: z.object({
            records: z.array(z.any()),
            count: z.number(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(listValuesRoute, async (c) => {
  const { prefix, limit, withMetadata } = c.req.valid('json');

  try {
    const listResult = await c.env.KV.list({
      prefix,
      limit: Math.min(limit || 50, 100),
    });

    const records = await Promise.all(
      listResult.keys.map(async (kvKey) => {
        const record = await c.env.KV.get<KVRecord>(kvKey.name, 'json');
        if (!record) return null;

        return {
          key: kvKey.name,
          value: record.value,
          metadata: withMetadata ? record.metadata : undefined,
        };
      })
    );

    const filteredRecords = records.filter((r) => r !== null);

    return c.json({
      records: filteredRecords,
      count: filteredRecords.length,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list values',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv/search
 * Search values by pattern matching (expensive - use sparingly)
 */
const searchRoute = createRoute({
  method: 'post',
  path: '/search',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            query: z.string().describe('Search query'),
            field: z.string().optional().describe('Specific field to search'),
            prefix: z.string().optional(),
            limit: z.number().optional().default(50),
            caseSensitive: z.boolean().optional().default(false),
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
            results: z.array(z.any()),
            count: z.number(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(searchRoute, async (c) => {
  const { query, field, prefix, limit, caseSensitive } = c.req.valid('json');

  try {
    // List all keys with prefix
    const listResult = await c.env.KV.list({
      prefix,
      limit: Math.min(limit || 50, 100),
    });

    // Fetch and search
    const results = [];
    for (const kvKey of listResult.keys) {
      const record = await c.env.KV.get<KVRecord>(kvKey.name, 'json');
      if (!record) continue;

      // Convert to string for searching
      const searchTarget = field
        ? JSON.stringify(record.value[field])
        : JSON.stringify(record.value);

      const searchQuery = caseSensitive ? query : query.toLowerCase();
      const searchIn = caseSensitive ? searchTarget : searchTarget.toLowerCase();

      if (searchIn.includes(searchQuery)) {
        results.push({
          key: kvKey.name,
          value: record.value,
          metadata: record.metadata,
        });
      }
    }

    return c.json({
      results,
      count: results.length,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to search',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * DELETE /api/kv/delete
 * Delete a key
 */
const deleteRoute = createRoute({
  method: 'delete',
  path: '/delete',
  request: {
    query: z.object({
      key: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Key deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            key: z.string(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(deleteRoute, async (c) => {
  const { key } = c.req.valid('query');

  try {
    await c.env.KV.delete(key);

    return c.json({
      success: true,
      key,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete key',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv/delete-bulk
 * Delete multiple keys
 */
const deleteBulkRoute = createRoute({
  method: 'post',
  path: '/delete-bulk',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            keys: z.array(z.string()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Keys deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            deleted: z.number(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(deleteBulkRoute, async (c) => {
  const { keys } = c.req.valid('json');

  try {
    await Promise.all(keys.map((key) => c.env.KV.delete(key)));

    return c.json({
      success: true,
      deleted: keys.length,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete keys',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv/delete-prefix
 * Delete all keys with a given prefix
 */
const deletePrefixRoute = createRoute({
  method: 'post',
  path: '/delete-prefix',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            prefix: z.string().min(1),
            confirm: z.boolean().describe('Must be true to execute'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Keys deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            deleted: z.number(),
          }),
        },
      },
    },
  },
});

kvRoutes.openapi(deletePrefixRoute, async (c) => {
  const { prefix, confirm } = c.req.valid('json');

  if (!confirm) {
    return c.json(
      {
        error: 'Confirmation required',
        message: 'Set confirm: true to delete all keys with this prefix',
      },
      400
    );
  }

  try {
    let deleted = 0;
    let cursor: string | undefined;

    // Delete in batches
    do {
      const listResult = await c.env.KV.list({
        prefix,
        limit: 100,
        cursor,
      });

      await Promise.all(listResult.keys.map((k) => c.env.KV.delete(k.name)));
      deleted += listResult.keys.length;

      cursor = listResult.cursor || undefined;
    } while (cursor);

    return c.json({
      success: true,
      deleted,
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete prefix',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
