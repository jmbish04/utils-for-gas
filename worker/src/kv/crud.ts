/**
 * CRUD Operations with Index Maintenance
 *
 * Implements create, read, update, delete with automatic index management
 */

import type { BaseRecord, TypeConfig } from './types';
import { getTypeConfig, validateTypeAndId, generateId, getCurrentTimestamp } from './types';
import {
  objectKey,
  equalityIndexKey,
  timeIndexKey,
  reverseTimeIndexKey,
  invertedIndexKey,
  getAllIndexKeys,
  IndexBatch,
} from './indexes';
import { tokenizeFields, diffTokenSets } from './tokenizer';

/**
 * Get a record by ID
 */
export async function getRecord(
  kv: KVNamespace,
  type: string,
  id: string
): Promise<BaseRecord | null> {
  validateTypeAndId(type, id);

  const key = objectKey(type, id);
  const value = await kv.get<BaseRecord>(key, 'json');

  return value;
}

/**
 * Create a new record
 *
 * Process:
 * 1. Generate ID if not provided
 * 2. Add createdAt/updatedAt timestamps
 * 3. Write primary record
 * 4. Create all indexes
 */
export async function createRecord(
  kv: KVNamespace,
  type: string,
  data: Partial<BaseRecord>,
  providedId?: string
): Promise<BaseRecord> {
  const config = getTypeConfig(type);
  const id = providedId || generateId();

  validateTypeAndId(type, id);

  // Check if already exists
  const existing = await getRecord(kv, type, id);
  if (existing) {
    throw new Error(`Record already exists: ${type}:${id}`);
  }

  // Build complete record
  const now = getCurrentTimestamp();
  const record: BaseRecord = {
    ...data,
    id,
    type,
    createdAt: now,
    updatedAt: now,
  };

  // Validate size
  const recordSize = JSON.stringify(record).length;
  if (config.maxRecordSize && recordSize > config.maxRecordSize) {
    throw new Error(`Record too large: ${recordSize} bytes (max ${config.maxRecordSize})`);
  }

  // Write primary record
  await kv.put(objectKey(type, id), JSON.stringify(record));

  // Create indexes
  await createIndexes(kv, record, config);

  return record;
}

/**
 * Update a record (full replacement)
 *
 * Process:
 * 1. Get old record
 * 2. Create new record with updated timestamp
 * 3. Write primary record
 * 4. Update indexes (delete old, create new)
 */
export async function updateRecord(
  kv: KVNamespace,
  type: string,
  id: string,
  data: Partial<BaseRecord>
): Promise<BaseRecord> {
  const config = getTypeConfig(type);
  validateTypeAndId(type, id);

  // Get old record
  const oldRecord = await getRecord(kv, type, id);
  if (!oldRecord) {
    throw new Error(`Record not found: ${type}:${id}`);
  }

  // Build new record (preserve createdAt)
  const newRecord: BaseRecord = {
    ...data,
    id,
    type,
    createdAt: oldRecord.createdAt,
    updatedAt: getCurrentTimestamp(),
  };

  // Validate size
  const recordSize = JSON.stringify(newRecord).length;
  if (config.maxRecordSize && recordSize > config.maxRecordSize) {
    throw new Error(`Record too large: ${recordSize} bytes (max ${config.maxRecordSize})`);
  }

  // Write primary record
  await kv.put(objectKey(type, id), JSON.stringify(newRecord));

  // Update indexes
  await updateIndexes(kv, oldRecord, newRecord, config);

  return newRecord;
}

/**
 * Patch a record (partial update)
 *
 * Same as update but merges with existing record
 */
export async function patchRecord(
  kv: KVNamespace,
  type: string,
  id: string,
  patch: Partial<BaseRecord>
): Promise<BaseRecord> {
  const oldRecord = await getRecord(kv, type, id);
  if (!oldRecord) {
    throw new Error(`Record not found: ${type}:${id}`);
  }

  // Merge patch with existing record
  const merged = {
    ...oldRecord,
    ...patch,
  };

  return updateRecord(kv, type, id, merged);
}

/**
 * Delete a record
 *
 * Process:
 * 1. Get record (to know what indexes to delete)
 * 2. Delete primary record
 * 3. Delete all indexes
 */
export async function deleteRecord(
  kv: KVNamespace,
  type: string,
  id: string
): Promise<void> {
  const config = getTypeConfig(type);
  validateTypeAndId(type, id);

  // Get record to know what indexes to delete
  const record = await getRecord(kv, type, id);
  if (!record) {
    // Already deleted - idempotent
    return;
  }

  // Delete primary record
  await kv.delete(objectKey(type, id));

  // Delete all indexes
  await deleteIndexes(kv, record, config);
}

/**
 * Upsert a record (create if not exists, update if exists)
 */
export async function upsertRecord(
  kv: KVNamespace,
  type: string,
  id: string,
  data: Partial<BaseRecord>
): Promise<{ record: BaseRecord; operation: 'created' | 'updated' }> {
  const existing = await getRecord(kv, type, id);

  if (existing) {
    const record = await updateRecord(kv, type, id, data);
    return { record, operation: 'updated' };
  } else {
    const record = await createRecord(kv, type, data, id);
    return { record, operation: 'created' };
  }
}

/**
 * Create all indexes for a record
 */
async function createIndexes(
  kv: KVNamespace,
  record: BaseRecord,
  config: TypeConfig
): Promise<void> {
  const batch = new IndexBatch();
  const { type, id } = record;

  // Equality indexes
  for (const field of config.indexedFields) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      // Truncate if needed
      const valueStr = String(value).substring(0, config.maxValueLength || 1000);
      batch.put(equalityIndexKey(type, field, valueStr, id));
    }
  }

  // Time indexes (both ascending and descending)
  for (const field of config.timeFields) {
    const timestamp = record[field] as string | undefined;
    if (timestamp) {
      batch.put(timeIndexKey(type, field, timestamp, id));
      batch.put(reverseTimeIndexKey(type, field, timestamp, id));
    }
  }

  // Search indexes
  const searchTokens = tokenizeFields(record, config.searchFields, config.stopwords);
  for (const [field, tokens] of searchTokens.entries()) {
    for (const token of tokens) {
      batch.put(invertedIndexKey(type, field, token, id));
    }
  }

  await batch.execute(kv);
}

/**
 * Update indexes when a record changes (incremental maintenance)
 *
 * Problem: Rebuilding all indexes on every update is expensive (100+ KV writes)
 * Solution: Diff old vs new, only update indexes that actually changed
 *
 * Strategy:
 * 1. For each indexed field, check if value changed
 * 2. If changed: delete old index, create new index
 * 3. If unchanged: do nothing (saves KV writes)
 *
 * Performance Impact:
 * - Full rebuild: ~100 KV writes per update (delete all + create all)
 * - Incremental: ~5-10 KV writes per update (only changed fields)
 * - Result: 10-20x faster updates
 *
 * Example Scenario:
 *   Record: { status: "pending", priority: "high", description: "Fix bug in login" }
 *   Update: { status: "completed" } (only status changed)
 *
 *   Without diff (full rebuild):
 *     - Delete 3 equality indexes (status, priority, assignee)
 *     - Delete 2 time indexes × 2 (createdAt, updatedAt)
 *     - Delete ~20 search tokens (description)
 *     - Create 3 equality indexes
 *     - Create 4 time indexes
 *     - Create ~20 search tokens
 *     Total: ~54 KV operations
 *
 *   With diff (incremental):
 *     - Delete 1 equality index (old status)
 *     - Create 1 equality index (new status)
 *     - Delete 2 time indexes (old updatedAt)
 *     - Create 2 time indexes (new updatedAt)
 *     Total: 6 KV operations
 *
 * Tradeoff: Slightly more complex code, but 10x performance improvement
 */
async function updateIndexes(
  kv: KVNamespace,
  oldRecord: BaseRecord,
  newRecord: BaseRecord,
  config: TypeConfig
): Promise<void> {
  const batch = new IndexBatch();
  const { type, id } = newRecord;

  // Equality indexes - update ONLY if value changed
  for (const field of config.indexedFields) {
    const oldValue = oldRecord[field];
    const newValue = newRecord[field];

    if (oldValue !== newValue) {
      // Delete old index (if it existed)
      if (oldValue !== undefined && oldValue !== null) {
        const oldValueStr = String(oldValue).substring(0, config.maxValueLength || 1000);
        batch.delete(equalityIndexKey(type, field, oldValueStr, id));
      }

      // Create new index (if new value exists)
      if (newValue !== undefined && newValue !== null) {
        const newValueStr = String(newValue).substring(0, config.maxValueLength || 1000);
        batch.put(equalityIndexKey(type, field, newValueStr, id));
      }
    }
    // else: value unchanged, skip (saves 2 KV operations)
  }

  // Time indexes - updatedAt ALWAYS changes (set by updateRecord),
  // but other time fields (createdAt, dueDate, etc.) rarely change
  for (const field of config.timeFields) {
    const oldTimestamp = oldRecord[field] as string | undefined;
    const newTimestamp = newRecord[field] as string | undefined;

    if (oldTimestamp !== newTimestamp) {
      // Delete old indexes (both ascending and descending)
      if (oldTimestamp) {
        batch.delete(timeIndexKey(type, field, oldTimestamp, id));
        batch.delete(reverseTimeIndexKey(type, field, oldTimestamp, id));
      }

      // Create new indexes (both directions)
      if (newTimestamp) {
        batch.put(timeIndexKey(type, field, newTimestamp, id));
        batch.put(reverseTimeIndexKey(type, field, newTimestamp, id));
      }
    }
  }

  // Search indexes - compute token diff (most complex case)
  // A field like "description" might have 50 tokens, but only 5 changed
  const oldTokens = tokenizeFields(oldRecord, config.searchFields, config.stopwords);
  const newTokens = tokenizeFields(newRecord, config.searchFields, config.stopwords);

  for (const field of config.searchFields) {
    const oldFieldTokens = oldTokens.get(field) || new Set();
    const newFieldTokens = newTokens.get(field) || new Set();

    // Compute diff: which tokens were added/removed?
    const { added, removed } = diffTokenSets(oldFieldTokens, newFieldTokens);

    // Delete removed tokens only (not all tokens)
    for (const token of removed) {
      batch.delete(invertedIndexKey(type, field, token, id));
    }

    // Add new tokens only (not all tokens)
    for (const token of added) {
      batch.put(invertedIndexKey(type, field, token, id));
    }

    // Unchanged tokens: do nothing (saves many KV operations)
  }

  // Execute all index updates in parallel
  await batch.execute(kv);
}

/**
 * Delete all indexes for a record
 */
async function deleteIndexes(
  kv: KVNamespace,
  record: BaseRecord,
  config: TypeConfig
): Promise<void> {
  const batch = new IndexBatch();
  const { type, id } = record;

  // Equality indexes
  for (const field of config.indexedFields) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      const valueStr = String(value).substring(0, config.maxValueLength || 1000);
      batch.delete(equalityIndexKey(type, field, valueStr, id));
    }
  }

  // Time indexes
  for (const field of config.timeFields) {
    const timestamp = record[field] as string | undefined;
    if (timestamp) {
      batch.delete(timeIndexKey(type, field, timestamp, id));
      batch.delete(reverseTimeIndexKey(type, field, timestamp, id));
    }
  }

  // Search indexes
  const searchTokens = tokenizeFields(record, config.searchFields, config.stopwords);
  for (const [field, tokens] of searchTokens.entries()) {
    for (const token of tokens) {
      batch.delete(invertedIndexKey(type, field, token, id));
    }
  }

  await batch.execute(kv);
}
