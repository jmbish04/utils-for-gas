/**
 * Bulk Operations
 *
 * Batch create/update/delete with per-item error handling
 */

import type { BaseRecord, TypeConfig } from './types';
import { getTypeConfig } from './types';
import { createRecord, updateRecord, patchRecord, deleteRecord, upsertRecord } from './crud';
import type { QueryFilter } from './query';
import { executeQuery } from './query';

/**
 * Result for a single bulk operation
 */
export interface BulkItemResult {
  ok: boolean;
  id: string;
  operation?: 'created' | 'updated' | 'deleted';
  error?: string;
}

/**
 * Bulk upsert result
 */
export interface BulkUpsertResult {
  results: BulkItemResult[];
  succeeded: number;
  failed: number;
}

/**
 * Bulk upsert - create or update multiple records
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param items - Records to upsert (must include 'id')
 * @returns Results for each item
 */
export async function bulkUpsert(
  kv: KVNamespace,
  type: string,
  items: Array<Partial<BaseRecord> & { id: string }>
): Promise<BulkUpsertResult> {
  const config = getTypeConfig(type);

  // Validate item count
  if (items.length > 100) {
    throw new Error(`Too many items: ${items.length} (max 100 per bulk operation)`);
  }

  const results: BulkItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  // Process each item independently
  for (const item of items) {
    try {
      if (!item.id) {
        throw new Error('Missing id field');
      }

      const { record, operation } = await upsertRecord(kv, type, item.id, item);

      results.push({
        ok: true,
        id: record.id,
        operation,
      });
      succeeded++;
    } catch (error) {
      results.push({
        ok: false,
        id: item.id || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  return {
    results,
    succeeded,
    failed,
  };
}

/**
 * Bulk patch - partial update multiple records by IDs
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param ids - Record IDs to update
 * @param patch - Partial record to merge
 * @returns Results for each item
 */
export async function bulkPatch(
  kv: KVNamespace,
  type: string,
  ids: string[],
  patch: Partial<BaseRecord>
): Promise<BulkUpsertResult> {
  const config = getTypeConfig(type);

  // Validate
  if (ids.length > 100) {
    throw new Error(`Too many IDs: ${ids.length} (max 100 per bulk operation)`);
  }

  const results: BulkItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await patchRecord(kv, type, id, patch);

      results.push({
        ok: true,
        id,
        operation: 'updated',
      });
      succeeded++;
    } catch (error) {
      results.push({
        ok: false,
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  return {
    results,
    succeeded,
    failed,
  };
}

/**
 * Bulk delete - delete multiple records by IDs
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param ids - Record IDs to delete
 * @returns Results for each item
 */
export async function bulkDelete(
  kv: KVNamespace,
  type: string,
  ids: string[]
): Promise<BulkUpsertResult> {
  const config = getTypeConfig(type);

  // Validate
  if (ids.length > 100) {
    throw new Error(`Too many IDs: ${ids.length} (max 100 per bulk operation)`);
  }

  const results: BulkItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await deleteRecord(kv, type, id);

      results.push({
        ok: true,
        id,
        operation: 'deleted',
      });
      succeeded++;
    } catch (error) {
      results.push({
        ok: false,
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  return {
    results,
    succeeded,
    failed,
  };
}

/**
 * Bulk update WHERE - update records matching AND filters
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param andFilters - AND filters to match
 * @param patch - Partial record to merge
 * @param limit - Max records to update (safety limit)
 * @returns Results
 */
export async function bulkUpdateWhere(
  kv: KVNamespace,
  type: string,
  andFilters: QueryFilter[],
  patch: Partial<BaseRecord>,
  limit: number = 100
): Promise<BulkUpsertResult> {
  const config = getTypeConfig(type);

  // Find matching records
  const queryResult = await executeQuery(kv, type, {
    and: andFilters,
    limit,
  });

  if (queryResult.records.length === 0) {
    return {
      results: [],
      succeeded: 0,
      failed: 0,
    };
  }

  // Extract IDs
  const ids = queryResult.records.map((r) => r.id);

  // Use bulk patch
  return bulkPatch(kv, type, ids, patch);
}

/**
 * Bulk delete WHERE - delete records matching AND filters
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param andFilters - AND filters to match
 * @param limit - Max records to delete (safety limit)
 * @returns Results
 */
export async function bulkDeleteWhere(
  kv: KVNamespace,
  type: string,
  andFilters: QueryFilter[],
  limit: number = 100
): Promise<BulkUpsertResult> {
  const config = getTypeConfig(type);

  // Find matching records
  const queryResult = await executeQuery(kv, type, {
    and: andFilters,
    limit,
  });

  if (queryResult.records.length === 0) {
    return {
      results: [],
      succeeded: 0,
      failed: 0,
    };
  }

  // Extract IDs
  const ids = queryResult.records.map((r) => r.id);

  // Use bulk delete
  return bulkDelete(kv, type, ids);
}
