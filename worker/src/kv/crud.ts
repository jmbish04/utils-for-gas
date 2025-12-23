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
 * Update indexes when a record changes
 *
 * Strategy: Compare old and new, only update what changed
 */
async function updateIndexes(
  kv: KVNamespace,
  oldRecord: BaseRecord,
  newRecord: BaseRecord,
  config: TypeConfig
): Promise<void> {
  const batch = new IndexBatch();
  const { type, id } = newRecord;

  // Equality indexes - update if value changed
  for (const field of config.indexedFields) {
    const oldValue = oldRecord[field];
    const newValue = newRecord[field];

    if (oldValue !== newValue) {
      // Delete old index
      if (oldValue !== undefined && oldValue !== null) {
        const oldValueStr = String(oldValue).substring(0, config.maxValueLength || 1000);
        batch.delete(equalityIndexKey(type, field, oldValueStr, id));
      }

      // Create new index
      if (newValue !== undefined && newValue !== null) {
        const newValueStr = String(newValue).substring(0, config.maxValueLength || 1000);
        batch.put(equalityIndexKey(type, field, newValueStr, id));
      }
    }
  }

  // Time indexes - updatedAt always changes, others might
  for (const field of config.timeFields) {
    const oldTimestamp = oldRecord[field] as string | undefined;
    const newTimestamp = newRecord[field] as string | undefined;

    if (oldTimestamp !== newTimestamp) {
      // Delete old indexes
      if (oldTimestamp) {
        batch.delete(timeIndexKey(type, field, oldTimestamp, id));
        batch.delete(reverseTimeIndexKey(type, field, oldTimestamp, id));
      }

      // Create new indexes
      if (newTimestamp) {
        batch.put(timeIndexKey(type, field, newTimestamp, id));
        batch.put(reverseTimeIndexKey(type, field, newTimestamp, id));
      }
    }
  }

  // Search indexes - compute token diff
  const oldTokens = tokenizeFields(oldRecord, config.searchFields, config.stopwords);
  const newTokens = tokenizeFields(newRecord, config.searchFields, config.stopwords);

  for (const field of config.searchFields) {
    const oldFieldTokens = oldTokens.get(field) || new Set();
    const newFieldTokens = newTokens.get(field) || new Set();

    const { added, removed } = diffTokenSets(oldFieldTokens, newFieldTokens);

    // Delete removed tokens
    for (const token of removed) {
      batch.delete(invertedIndexKey(type, field, token, id));
    }

    // Add new tokens
    for (const token of added) {
      batch.put(invertedIndexKey(type, field, token, id));
    }
  }

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
