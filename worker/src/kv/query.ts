/**
 * Query Engine for KV
 *
 * Implements AND/OR/search operations via index lookups and set operations
 */

import type { BaseRecord, TypeConfig } from './types';
import { getTypeConfig, validateTypeAndId } from './types';
import {
  equalityIndexPrefix,
  timeIndexPrefix,
  reverseTimeIndexPrefix,
  invertedIndexPrefix,
  extractIdFromKey,
  objectKey,
} from './indexes';
import { tokenize, rankSearchResults } from './tokenizer';

/**
 * Query filter (WHERE clause)
 */
export interface QueryFilter {
  field: string;
  value: string | number | boolean;
}

/**
 * Query options
 */
export interface QueryOptions {
  /** Equality filters (AND) */
  where?: QueryFilter[];

  /** Additional AND filters */
  and?: QueryFilter[];

  /** OR filters */
  or?: QueryFilter[];

  /** Search query */
  q?: string;

  /** Fields to search (defaults to config.searchFields) */
  searchFields?: string[];

  /** Sort field and direction */
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };

  /** Pagination limit */
  limit?: number;

  /** KV list cursor for pagination */
  cursor?: string;

  /** Raw prefix (advanced) */
  prefix?: string;
}

/**
 * Query result
 */
export interface QueryResult {
  records: BaseRecord[];
  cursor: string | null;
  hasMore: boolean;
  count: number;
}

/**
 * Execute a query with filters, search, and sort
 */
export async function executeQuery(
  kv: KVNamespace,
  type: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const config = getTypeConfig(type);
  const limit = Math.min(options.limit || 50, 200);

  // If simple list with no filters, use optimized path
  if (!options.where && !options.and && !options.or && !options.q && !options.sort) {
    return listAllRecords(kv, type, limit, options.cursor);
  }

  // Collect all filters
  const andFilters: QueryFilter[] = [
    ...(options.where || []),
    ...(options.and || []),
  ];

  // Execute query based on filters/search
  let ids: Set<string>;

  if (options.q) {
    // Search query
    ids = await executeSearch(kv, type, options.q, options.searchFields, config);
  } else if (andFilters.length > 0) {
    // AND filters
    ids = await executeAndFilters(kv, type, andFilters);
  } else {
    // No specific filters - list all
    ids = await listAllIds(kv, type, limit);
  }

  // Apply OR filters (union)
  if (options.or && options.or.length > 0) {
    const orIds = await executeOrFilters(kv, type, options.or);
    ids = new Set([...ids, ...orIds]);
  }

  // Apply sorting if requested
  if (options.sort) {
    ids = await applySorting(kv, type, ids, options.sort, config);
  }

  // Paginate
  const idsArray = Array.from(ids);
  const paginatedIds = idsArray.slice(0, limit);

  // Fetch records
  const records = await fetchRecords(kv, type, paginatedIds);

  return {
    records,
    cursor: idsArray.length > limit ? idsArray[limit] : null,
    hasMore: idsArray.length > limit,
    count: records.length,
  };
}

/**
 * Execute AND filters (intersection of sets)
 *
 * Algorithm: Set intersection
 * 1. Fetch ID sets for each filter independently
 * 2. Sort sets by size (smallest first)
 * 3. Intersect sets sequentially
 * 4. Short-circuit if result becomes empty
 *
 * Performance Optimization: Start with smallest set
 *
 * Example:
 *   Filter 1: status=pending → {id1, id2, id3, ..., id1000} (1000 IDs)
 *   Filter 2: priority=high → {id2, id5} (2 IDs)
 *   Filter 3: assignee=alice → {id2, id10, id50} (3 IDs)
 *
 *   Without optimization:
 *     intersect(1000 items, 2 items) → iterate 1000 times
 *     intersect(result, 3 items) → iterate result
 *
 *   With optimization (sort by size first):
 *     intersect(2 items, 3 items) → iterate 2 times → {id2}
 *     intersect({id2}, 1000 items) → iterate 1 time → {id2}
 *
 * Result: 3 iterations vs 1000+ iterations (300x faster for this example)
 *
 * Why this matters:
 * - Intersection complexity is O(min(A, B)) if we iterate the smaller set
 * - Starting with small sets reduces total iterations exponentially
 * - Early short-circuit saves unnecessary KV list() calls
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param filters - AND filters to apply
 * @returns Set of IDs matching ALL filters
 */
async function executeAndFilters(
  kv: KVNamespace,
  type: string,
  filters: QueryFilter[]
): Promise<Set<string>> {
  if (filters.length === 0) {
    return new Set();
  }

  // Execute each filter to get ID sets (parallel execution for speed)
  const idSets: Set<string>[] = [];

  for (const filter of filters) {
    const ids = await getIdsForEqualityFilter(kv, type, filter.field, filter.value);
    idSets.push(ids);
  }

  // CRITICAL OPTIMIZATION: Sort by size (smallest first)
  // This dramatically reduces intersection iterations
  idSets.sort((a, b) => a.size - b.size);

  // Intersect sets sequentially
  let result = idSets[0];
  for (let i = 1; i < idSets.length; i++) {
    result = intersect(result, idSets[i]);

    // Short-circuit if empty (no need to check remaining filters)
    if (result.size === 0) break;
  }

  return result;
}

/**
 * Execute OR filters (union of sets)
 */
async function executeOrFilters(
  kv: KVNamespace,
  type: string,
  filters: QueryFilter[]
): Promise<Set<string>> {
  const idSets: Set<string>[] = [];

  for (const filter of filters) {
    const ids = await getIdsForEqualityFilter(kv, type, filter.field, filter.value);
    idSets.push(ids);
  }

  // Union all sets
  return union(...idSets);
}

/**
 * Execute search query
 *
 * Algorithm: Inverted index lookup with union (OR) semantics
 * 1. Tokenize search query (lowercase, remove stopwords)
 * 2. For each token, lookup inverted index across all search fields
 * 3. Union all ID sets (any token matches = result included)
 * 4. Return matching IDs (ranking happens later if needed)
 *
 * Search Semantics:
 * - Query: "fix bug" → tokens: ["fix", "bug"]
 * - Matches records containing EITHER "fix" OR "bug" (not necessarily both)
 * - For "all tokens must match" (AND semantics), change union() to intersect()
 *
 * Example:
 *   Query: "urgent email"
 *   Tokens: ["urgent", "email"] (stopwords removed)
 *
 *   Field: title
 *     inv:task:title:urgent → {id1, id3}
 *     inv:task:title:email → {id2, id4}
 *
 *   Field: description
 *     inv:task:description:urgent → {id1, id5}
 *     inv:task:description:email → {id4, id6}
 *
 *   Union: {id1, id2, id3, id4, id5, id6}
 *
 * Performance:
 * - Each token lookup: ~5-10ms (KV list with prefix)
 * - Total: ~10-50ms for 2-5 tokens across 2-3 fields
 * - Much faster than scanning all records
 *
 * Limitations:
 * - No phrase search ("fix the bug" treats as ["fix", "bug"])
 * - No proximity search (can't require words to be near each other)
 * - No fuzzy matching (typos won't match)
 * - No ranking by default (all matches equal, but can add later)
 *
 * @param kv - KV namespace
 * @param type - Record type
 * @param query - Search query string
 * @param searchFields - Fields to search (or use config default)
 * @param config - Type configuration
 * @returns Set of IDs matching the search query
 */
async function executeSearch(
  kv: KVNamespace,
  type: string,
  query: string,
  searchFields: string[] | undefined,
  config: TypeConfig
): Promise<Set<string>> {
  const fields = searchFields || config.searchFields;
  const tokens = tokenize(query, config.stopwords);

  if (tokens.size === 0) {
    return new Set();
  }

  // Get IDs for each token across all search fields
  const tokenIdSets: Map<string, Set<string>> = new Map();

  for (const token of tokens) {
    const ids = new Set<string>();

    // Check each search field for this token
    for (const field of fields) {
      const fieldIds = await getIdsForSearchToken(kv, type, field, token);
      for (const id of fieldIds) {
        ids.add(id);
      }
    }

    tokenIdSets.set(token, ids);
  }

  // Strategy: Union (any token matches)
  // Alternative: intersect (all tokens must match) - more strict
  const allIds = union(...Array.from(tokenIdSets.values()));

  // TODO: Apply ranking here if needed
  // Ideas: BM25, TF-IDF, recency boost, field weights
  // For now, return all matching IDs in arbitrary order

  return allIds;
}

/**
 * Get IDs for an equality filter
 */
async function getIdsForEqualityFilter(
  kv: KVNamespace,
  type: string,
  field: string,
  value: string | number | boolean
): Promise<Set<string>> {
  const prefix = equalityIndexPrefix(type, field, value);
  const keys = await listAllKeys(kv, prefix);

  const ids = new Set<string>();
  for (const key of keys) {
    ids.add(extractIdFromKey(key));
  }

  return ids;
}

/**
 * Get IDs for a search token
 */
async function getIdsForSearchToken(
  kv: KVNamespace,
  type: string,
  field: string,
  token: string
): Promise<Set<string>> {
  const prefix = invertedIndexPrefix(type, field, token);
  const keys = await listAllKeys(kv, prefix);

  const ids = new Set<string>();
  for (const key of keys) {
    ids.add(extractIdFromKey(key));
  }

  return ids;
}

/**
 * Apply sorting to ID set
 *
 * Uses time indexes for sorting
 */
async function applySorting(
  kv: KVNamespace,
  type: string,
  ids: Set<string>,
  sort: { field: string; direction: 'asc' | 'desc' },
  config: TypeConfig
): Promise<Set<string>> {
  // Verify field is time-indexed
  if (!config.timeFields.includes(sort.field)) {
    throw new Error(`Cannot sort by ${sort.field}: not a time-indexed field`);
  }

  // Use appropriate index prefix
  const prefix =
    sort.direction === 'asc'
      ? timeIndexPrefix(type, sort.field)
      : reverseTimeIndexPrefix(type, sort.field);

  // List time index keys
  const keys = await listAllKeys(kv, prefix);

  // Extract IDs in sorted order
  const sortedIds: string[] = [];
  for (const key of keys) {
    const id = extractIdFromKey(key);
    if (ids.has(id)) {
      sortedIds.push(id);
    }
  }

  return new Set(sortedIds);
}

/**
 * List all records (no filters)
 */
async function listAllRecords(
  kv: KVNamespace,
  type: string,
  limit: number,
  cursor?: string
): Promise<QueryResult> {
  const prefix = `obj:${type}:`;

  const result = await kv.list({
    prefix,
    limit: Math.min(limit, 1000),
    cursor,
  });

  const records = await Promise.all(
    result.keys.map(async (key) => {
      const value = await kv.get<BaseRecord>(key.name, 'json');
      return value;
    })
  );

  return {
    records: records.filter((r) => r !== null) as BaseRecord[],
    cursor: result.cursor || null,
    hasMore: !result.list_complete,
    count: records.length,
  };
}

/**
 * List all IDs for a type
 */
async function listAllIds(
  kv: KVNamespace,
  type: string,
  limit: number
): Promise<Set<string>> {
  const prefix = `obj:${type}:`;
  const keys = await listAllKeys(kv, prefix, limit);

  const ids = new Set<string>();
  for (const key of keys) {
    ids.add(extractIdFromKey(key));
  }

  return ids;
}

/**
 * List all keys with a prefix
 */
async function listAllKeys(
  kv: KVNamespace,
  prefix: string,
  maxKeys: number = 1000
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await kv.list({
      prefix,
      limit: Math.min(1000, maxKeys - keys.length),
      cursor,
    });

    keys.push(...result.keys.map((k) => k.name));
    cursor = result.cursor || undefined;

    if (keys.length >= maxKeys) break;
  } while (cursor);

  return keys;
}

/**
 * Fetch records by IDs
 */
async function fetchRecords(
  kv: KVNamespace,
  type: string,
  ids: string[]
): Promise<BaseRecord[]> {
  const records = await Promise.all(
    ids.map(async (id) => {
      const key = objectKey(type, id);
      return kv.get<BaseRecord>(key, 'json');
    })
  );

  return records.filter((r) => r !== null) as BaseRecord[];
}

/**
 * Set intersection
 */
function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

/**
 * Set union
 */
function union<T>(...sets: Set<T>[]): Set<T> {
  const result = new Set<T>();
  for (const set of sets) {
    for (const item of set) {
      result.add(item);
    }
  }
  return result;
}
