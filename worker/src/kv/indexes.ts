/**
 * Index Key Generation and Management
 *
 * Implements the deterministic key schema for KV indexes
 */

import type { BaseRecord } from './types';

/**
 * Key Schema:
 * - obj:<type>:<id> → primary record
 * - idx:<type>:<field>:<value>:<id> → equality index
 * - ts:<type>:<field>:<timestamp>:<id> → time index
 * - inv:<type>:<field>:<token>:<id> → inverted search index
 * - rel:<type>:<parentId>:<childId> → relationship index (future)
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
 * Strategy: Use a far future date (2099-12-31) and subtract the timestamp
 * This creates a reverse-sortable string
 */
function getReverseTimestamp(isoTimestamp: string): string {
  const futureDate = new Date('2099-12-31T23:59:59.999Z').getTime();
  const currentDate = new Date(isoTimestamp).getTime();
  const reverse = futureDate - currentDate;

  // Pad to ensure consistent length for sorting
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
 * Builds a list of KV operations to execute for index maintenance
 */
export interface IndexOperation {
  key: string;
  value: string | null; // null = delete
}

export class IndexBatch {
  private operations: IndexOperation[] = [];

  /** Add a key to be created/updated */
  put(key: string, value: string = '1'): void {
    this.operations.push({ key, value });
  }

  /** Add a key to be deleted */
  delete(key: string): void {
    this.operations.push({ key, value: null });
  }

  /** Get all operations */
  getOperations(): IndexOperation[] {
    return this.operations;
  }

  /** Execute all operations against KV */
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

    // Execute in parallel
    await Promise.all([
      ...puts.map(([key, value]) => kv.put(key, value)),
      ...deletes.map((key) => kv.delete(key)),
    ]);
  }
}
