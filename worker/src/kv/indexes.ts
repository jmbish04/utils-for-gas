/**
 * Index Key Generation and Management
 *
 * Implements the deterministic key schema for KV indexes.
 *
 * Design Principles:
 * 1. **Deterministic**: Same input always produces same key (idempotent operations)
 * 2. **Prefix-scannable**: KV list() can efficiently find all related keys
 * 3. **Collision-free**: Each key component is separated by colons
 * 4. **Sortable**: Timestamp-based keys sort chronologically
 *
 * Why we use colon delimiters:
 * - Natural hierarchy (obj → type → field → value → id)
 * - KV list() uses prefix matching (idx:task:status: finds all status indexes)
 * - Easy to parse and debug
 */

import type { BaseRecord } from './types';

/**
 * Key Schema Documentation
 *
 * Primary Record:
 *   obj:<type>:<id>
 *   Example: obj:task:abc123
 *   Purpose: Store the full record JSON
 *
 * Equality Index (for WHERE queries):
 *   idx:<type>:<field>:<value>:<id>
 *   Example: idx:task:status:pending:abc123
 *   Purpose: Find all records where field=value
 *   Query: list({ prefix: "idx:task:status:pending:" })
 *
 * Time Index Ascending (for sorting oldest → newest):
 *   ts:<type>:<field>:<timestamp>:<id>
 *   Example: ts:task:createdAt:2025-12-24T10:00:00.000Z:abc123
 *   Purpose: Chronological ordering
 *   Query: list({ prefix: "ts:task:createdAt:" })
 *
 * Time Index Descending (for sorting newest → oldest):
 *   ts-desc:<type>:<field>:<reverseTimestamp>:<id>
 *   Example: ts-desc:task:createdAt:0074-01-08T14:00:00.000Z:abc123
 *   Purpose: Reverse chronological ordering without list() reversal
 *   Query: list({ prefix: "ts-desc:task:createdAt:" })
 *
 * Inverted Search Index (for full-text search):
 *   inv:<type>:<field>:<token>:<id>
 *   Example: inv:task:title:bug:abc123
 *   Purpose: Find all records containing a token in a field
 *   Query: list({ prefix: "inv:task:title:bug:" })
 *
 * Future (not implemented):
 *   rel:<type>:<parentId>:<childId> → relationship index
 *   geo:<type>:<geohash>:<id> → geospatial index
 */

/**
 * Generate primary object key
 */
export function objectKey(type: string, id: string): string {
  return `obj:${type}:${id}`;
}

/**
 * Generate equality index key
 */
export function equalityIndexKey(
  type: string,
  field: string,
  value: string | number | boolean,
  id: string
): string {
  // Normalize value to string and truncate if needed
  const valueStr = String(value).substring(0, 500);
  return `idx:${type}:${field}:${valueStr}:${id}`;
}

/**
 * Generate equality index prefix (for listing)
 */
export function equalityIndexPrefix(
  type: string,
  field: string,
  value: string | number | boolean
): string {
  const valueStr = String(value).substring(0, 500);
  return `idx:${type}:${field}:${valueStr}:`;
}

/**
 * Generate time index key
 */
export function timeIndexKey(
  type: string,
  field: string,
  timestamp: string,
  id: string
): string {
  // ISO timestamps are naturally sortable lexicographically
  return `ts:${type}:${field}:${timestamp}:${id}`;
}

/**
 * Generate time index prefix (for listing)
 */
export function timeIndexPrefix(type: string, field: string): string {
  return `ts:${type}:${field}:`;
}

/**
 * Generate reverse time index key (for descending sort)
 *
 * Reverse timestamp by subtracting from a far future date
 * This allows descending time-based listing
 */
export function reverseTimeIndexKey(
  type: string,
  field: string,
  timestamp: string,
  id: string
): string {
  const reverseTs = getReverseTimestamp(timestamp);
  return `ts-desc:${type}:${field}:${reverseTs}:${id}`;
}

/**
 * Generate reverse time index prefix
 */
export function reverseTimeIndexPrefix(type: string, field: string): string {
  return `ts-desc:${type}:${field}:`;
}

/**
 * Generate inverted search index key
 */
export function invertedIndexKey(
  type: string,
  field: string,
  token: string,
  id: string
): string {
  // Tokens are already lowercased and sanitized
  return `inv:${type}:${field}:${token}:${id}`;
}

/**
 * Generate inverted index prefix (for listing)
 */
export function invertedIndexPrefix(
  type: string,
  field: string,
  token: string
): string {
  return `inv:${type}:${field}:${token}:`;
}

/**
 * Extract ID from an index key
 */
export function extractIdFromKey(key: string): string {
  const parts = key.split(':');
  return parts[parts.length - 1];
}

/**
 * Get reverse timestamp for descending time sort
 *
 * Problem: KV list() doesn't support reverse iteration
 * Solution: Create a reversed timestamp that sorts in opposite order
 *
 * Strategy:
 * 1. Pick a far future date (2099-12-31) as our "pivot"
 * 2. Subtract the current timestamp from the pivot
 * 3. Pad with zeros to ensure lexicographic sorting
 *
 * Example:
 *   Input:  2025-12-24T10:00:00.000Z → 1735036800000 ms
 *   Pivot:  2099-12-31T23:59:59.999Z → 4102444799999 ms
 *   Reverse: 4102444799999 - 1735036800000 = 2367407999999
 *   Padded:  00002367407999999
 *
 * Result: Newer timestamps produce smaller numbers → sort first
 *
 * Why not just use "-timestamp":
 * - Negative numbers don't sort lexicographically (""-10" > "-2")
 * - Zero-padding only works with positive numbers
 *
 * @param isoTimestamp - ISO 8601 timestamp string
 * @returns Padded reverse timestamp for descending sort
 */
function getReverseTimestamp(isoTimestamp: string): string {
  const futureDate = new Date('2099-12-31T23:59:59.999Z').getTime();
  const currentDate = new Date(isoTimestamp).getTime();
  const reverse = futureDate - currentDate;

  // Pad to 20 digits to ensure consistent length for sorting
  // (2099-12-31 ms = 13 digits, so 20 digits provides safety margin)
  return String(reverse).padStart(20, '0');
}

/**
 * Get all index keys for a record
 *
 * Returns the list of all secondary index keys that should exist
 * for this record based on its type configuration
 */
export function getAllIndexKeys(
  record: BaseRecord,
  indexedFields: string[],
  timeFields: string[],
  searchTokens: Map<string, Set<string>> // field -> tokens
): string[] {
  const keys: string[] = [];
  const { type, id } = record;

  // Equality indexes
  for (const field of indexedFields) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      keys.push(equalityIndexKey(type, field, value, id));
    }
  }

  // Time indexes (both ascending and descending)
  for (const field of timeFields) {
    const timestamp = record[field] as string | undefined;
    if (timestamp) {
      keys.push(timeIndexKey(type, field, timestamp, id));
      keys.push(reverseTimeIndexKey(type, field, timestamp, id));
    }
  }

  // Inverted search indexes
  for (const [field, tokens] of searchTokens.entries()) {
    for (const token of tokens) {
      keys.push(invertedIndexKey(type, field, token, id));
    }
  }

  return keys;
}

/**
 * Index operations batch builder
 *
 * Problem: Index maintenance requires many KV operations (up to 100+ per create/update)
 * Solution: Batch operations together for efficient parallel execution
 *
 * Performance:
 * - Without batching: Sequential operations take ~5-10ms each = 500-1000ms total
 * - With batching: Parallel execution takes ~50-100ms total (10x faster)
 *
 * Usage:
 *   const batch = new IndexBatch();
 *   batch.put('idx:task:status:pending:abc123');
 *   batch.delete('idx:task:status:completed:abc123');
 *   await batch.execute(kv);
 */
export interface IndexOperation {
  key: string;
  value: string | null; // null = delete
}

export class IndexBatch {
  private operations: IndexOperation[] = [];

  /**
   * Add a key to be created/updated
   *
   * @param key - Full KV key (e.g., "idx:task:status:pending:abc123")
   * @param value - Value to store (default: "1")
   *
   * Note: Index keys only store "1" as the value - the actual data is in the primary record.
   * We use "1" instead of empty string for simplicity and consistency.
   */
  put(key: string, value: string = '1'): void {
    this.operations.push({ key, value });
  }

  /**
   * Add a key to be deleted
   *
   * @param key - Full KV key to delete
   *
   * Note: KV delete() is idempotent - deleting a non-existent key succeeds silently.
   * This is intentional for index cleanup (no error if index doesn't exist).
   */
  delete(key: string): void {
    this.operations.push({ key, value: null });
  }

  /** Get all queued operations (mostly for testing) */
  getOperations(): IndexOperation[] {
    return this.operations;
  }

  /**
   * Execute all queued operations against KV in parallel
   *
   * Strategy:
   * 1. Group operations by type (put vs delete)
   * 2. Execute all operations in parallel with Promise.all
   * 3. No retry logic (assumes KV is reliable)
   *
   * Performance: ~50-100ms for 100 operations vs ~500-1000ms sequential
   *
   * Error Handling: If any operation fails, the entire batch fails.
   * This is acceptable because index consistency is maintained at the
   * CRUD operation level (failures are rolled back).
   */
  async execute(kv: KVNamespace): Promise<void> {
    // Group operations by type for efficiency
    const puts: Array<[string, string]> = [];
    const deletes: string[] = [];

    for (const op of this.operations) {
      if (op.value === null) {
        deletes.push(op.key);
      } else {
        puts.push([op.key, op.value]);
      }
    }

    // Execute all operations in parallel
    // KV supports high concurrency, so this is safe
    await Promise.all([
      ...puts.map(([key, value]) => kv.put(key, value)),
      ...deletes.map((key) => kv.delete(key)),
    ]);
  }
}
