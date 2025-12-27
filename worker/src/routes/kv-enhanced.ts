/**
 * Enhanced KV API Routes
 *
 * SQL-like API layer over Cloudflare KV with indexes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { getRecord, createRecord, updateRecord, patchRecord, deleteRecord } from '../kv/crud';
import { executeQuery, type QueryFilter } from '../kv/query';
import { bulkUpsert, bulkPatch, bulkDelete, bulkUpdateWhere, bulkDeleteWhere } from '../kv/bulk';
import { TYPE_CONFIGS } from '../kv/types';

export const kvEnhancedRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/kv-enhanced/:type/:id
 * Get a single record by ID
 */
kvEnhancedRoutes.get('/:type/:id', async (c) => {
  const { type, id } = c.req.param();

  try {
    const record = await getRecord(c.env.KV, type, id);

    if (!record) {
      return c.json({ error: 'Not found' }, 404);
    }

    return c.json(record);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get record',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      error instanceof Error && error.message.includes('Unknown type') ? 400 : 500
    );
  }
});

/**
 * POST /api/kv-enhanced/:type
 * Create a new record (server generates ID)
 */
kvEnhancedRoutes.post('/:type', async (c) => {
  const { type } = c.req.param();

  try {
    const data = await c.req.json();

    // Remove id if provided (server generates)
    delete data.id;

    const record = await createRecord(c.env.KV, type, data);

    return c.json(record, 201);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to create record',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * PUT /api/kv-enhanced/:type/:id
 * Upsert a record by ID (full replacement)
 */
kvEnhancedRoutes.put('/:type/:id', async (c) => {
  const { type, id } = c.req.param();

  try {
    const data = await c.req.json();

    const existing = await getRecord(c.env.KV, type, id);

    if (existing) {
      const record = await updateRecord(c.env.KV, type, id, data);
      return c.json(record);
    } else {
      const record = await createRecord(c.env.KV, type, data, id);
      return c.json(record, 201);
    }
  } catch (error) {
    return c.json(
      {
        error: 'Failed to upsert record',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * PATCH /api/kv-enhanced/:type/:id
 * Partial update a record
 */
kvEnhancedRoutes.patch('/:type/:id', async (c) => {
  const { type, id } = c.req.param();

  try {
    const patch = await c.req.json();

    const record = await patchRecord(c.env.KV, type, id, patch);

    return c.json(record);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to patch record',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      error instanceof Error && error.message.includes('not found') ? 404 : 500
    );
  }
});

/**
 * DELETE /api/kv-enhanced/:type/:id
 * Delete a record
 */
kvEnhancedRoutes.delete('/:type/:id', async (c) => {
  const { type, id } = c.req.param();

  try {
    await deleteRecord(c.env.KV, type, id);

    return c.json({ success: true, id });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete record',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/kv-enhanced/:type
 * List/query records with filters, search, sort
 *
 * Query params:
 * - limit: number (default 50, max 200)
 * - cursor: string (pagination cursor)
 * - where: field:value (can repeat for AND)
 * - and: field:value (same as where)
 * - or: field:value (can repeat for OR)
 * - q: search string
 * - searchFields: comma-separated list
 * - sort: field:asc or field:desc
 */
kvEnhancedRoutes.get('/:type', async (c) => {
  const { type } = c.req.param();
  const params = c.req.query();

  try {
    // Parse query parameters
    const limit = params.limit ? parseInt(params.limit) : 50;
    const cursor = params.cursor;
    const q = params.q;
    const searchFields = params.searchFields?.split(',');

    // Parse filters
    const whereParams = params.where ? (Array.isArray(params.where) ? params.where : [params.where]) : [];
    const andParams = params.and ? (Array.isArray(params.and) ? params.and : [params.and]) : [];
    const orParams = params.or ? (Array.isArray(params.or) ? params.or : [params.or]) : [];

    const where: QueryFilter[] = [...whereParams, ...andParams].map((f) => {
      const [field, value] = f.split(':');
      return { field, value };
    });

    const or: QueryFilter[] = orParams.map((f) => {
      const [field, value] = f.split(':');
      return { field, value };
    });

    // Parse sort
    let sort: { field: string; direction: 'asc' | 'desc' } | undefined;
    if (params.sort) {
      const [field, direction] = params.sort.split(':');
      sort = { field, direction: (direction as 'asc' | 'desc') || 'asc' };
    }

    // Execute query
    const result = await executeQuery(c.env.KV, type, {
      where,
      or,
      q,
      searchFields,
      sort,
      limit,
      cursor,
    });

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to query records',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv-enhanced/:type/bulk/upsert
 * Bulk upsert records
 *
 * Body: { items: [ {id, ...data}, ... ] }
 */
kvEnhancedRoutes.post('/:type/bulk/upsert', async (c) => {
  const { type } = c.req.param();

  try {
    const body = await c.req.json();

    if (!body.items || !Array.isArray(body.items)) {
      return c.json({ error: 'Missing items array' }, 400);
    }

    const result = await bulkUpsert(c.env.KV, type, body.items);

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: 'Bulk upsert failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv-enhanced/:type/bulk/patch
 * Bulk patch records by IDs
 *
 * Body: { ids: [...], patch: {...} }
 */
kvEnhancedRoutes.post('/:type/bulk/patch', async (c) => {
  const { type } = c.req.param();

  try {
    const body = await c.req.json();

    if (!body.ids || !Array.isArray(body.ids)) {
      return c.json({ error: 'Missing ids array' }, 400);
    }

    if (!body.patch || typeof body.patch !== 'object') {
      return c.json({ error: 'Missing patch object' }, 400);
    }

    const result = await bulkPatch(c.env.KV, type, body.ids, body.patch);

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: 'Bulk patch failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv-enhanced/:type/bulk/delete
 * Bulk delete records by IDs
 *
 * Body: { ids: [...] }
 */
kvEnhancedRoutes.post('/:type/bulk/delete', async (c) => {
  const { type } = c.req.param();

  try {
    const body = await c.req.json();

    if (!body.ids || !Array.isArray(body.ids)) {
      return c.json({ error: 'Missing ids array' }, 400);
    }

    const result = await bulkDelete(c.env.KV, type, body.ids);

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: 'Bulk delete failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/kv-enhanced/:type/bulk/updateWhere
 * Bulk update records matching AND filters
 *
 * Body: { and: ["field:value", ...], patch: {...}, limit?: number }
 */
kvEnhancedRoutes.post('/:type/bulk/updateWhere', async (c) => {
  const { type } = c.req.param();

  try {
    const body = await c.req.json();

    if (!body.and || !Array.isArray(body.and)) {
      return c.json({ error: 'Missing and filters array' }, 400);
    }

    if (!body.patch || typeof body.patch !== 'object') {
      return c.json({ error: 'Missing patch object' }, 400);
    }

    const andFilters: QueryFilter[] = body.and.map((f: string) => {
      const [field, value] = f.split(':');
      return { field, value };
    });

    const limit = body.limit || 100;

    const result = await bulkUpdateWhere(c.env.KV, type, andFilters, body.patch, limit);

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: 'Bulk update WHERE failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/kv-enhanced/types
 * List available types and their configurations
 */
kvEnhancedRoutes.get('/types', async (c) => {
  const types = Object.keys(TYPE_CONFIGS).map((type) => {
    const config = TYPE_CONFIGS[type];
    return {
      type,
      indexedFields: config.indexedFields,
      timeFields: config.timeFields,
      searchFields: config.searchFields,
    };
  });

  return c.json({ types });
});
