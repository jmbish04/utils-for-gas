/**
 * Text Tokenization for Search Indexing
 *
 * Converts text into searchable tokens with stopword filtering
 */

import { DEFAULT_STOPWORDS } from './types';

/**
 * Tokenize text for search indexing
 *
 * Process:
 * 1. Lowercase
 * 2. Split on non-alphanumeric characters
 * 3. Remove empty strings
 * 4. Remove stopwords
 * 5. Remove duplicates
 * 6. Limit token length
 *
 * @param text - Text to tokenize
 * @param stopwords - Optional custom stopwords list
 * @param minLength - Minimum token length (default: 2)
 * @param maxLength - Maximum token length (default: 50)
 * @returns Set of unique tokens
 */
export function tokenize(
  text: string,
  stopwords: string[] = DEFAULT_STOPWORDS,
  minLength: number = 2,
  maxLength: number = 50
): Set<string> {
  if (!text) return new Set();

  // Lowercase and split on non-alphanumeric
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      // Remove empty
      if (!token) return false;

      // Length check
      if (token.length < minLength || token.length > maxLength) return false;

      // Stopword check
      if (stopwords.includes(token)) return false;

      return true;
    });

  return new Set(tokens);
}

/**
 * Tokenize multiple fields from a record
 *
 * @param record - Record with text fields
 * @param fields - Fields to tokenize
 * @param stopwords - Optional stopwords list
 * @returns Map of field name to tokens
 */
export function tokenizeFields(
  record: Record<string, any>,
  fields: string[],
  stopwords?: string[]
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string') {
      const tokens = tokenize(value, stopwords);
      if (tokens.size > 0) {
        result.set(field, tokens);
      }
    }
  }

  return result;
}

/**
 * Compare two token sets to find additions and removals
 *
 * Used for incremental index updates on record modification
 */
export function diffTokenSets(
  oldTokens: Set<string>,
  newTokens: Set<string>
): {
  added: Set<string>;
  removed: Set<string>;
} {
  const added = new Set<string>();
  const removed = new Set<string>();

  // Find added tokens
  for (const token of newTokens) {
    if (!oldTokens.has(token)) {
      added.add(token);
    }
  }

  // Find removed tokens
  for (const token of oldTokens) {
    if (!newTokens.has(token)) {
      removed.add(token);
    }
  }

  return { added, removed };
}

/**
 * Rank search results by relevance
 *
 * Simple scoring:
 * - Number of matched tokens
 * - Recency bonus (if timestamp provided)
 * - Field weighting (title > description > content)
 */
export interface SearchResult {
  id: string;
  score: number;
  matchedTokens: number;
}

export function rankSearchResults(
  results: Array<{ id: string; field: string; tokens: Set<string> }>,
  queryTokens: Set<string>,
  records?: Array<{ id: string; createdAt?: string }>,
  fieldWeights: Record<string, number> = { title: 3, name: 3, description: 2, content: 1 }
): SearchResult[] {
  const scoreMap = new Map<string, { score: number; matchedTokens: number }>();

  // Calculate base scores from token matches
  for (const result of results) {
    const existing = scoreMap.get(result.id) || { score: 0, matchedTokens: 0 };

    // Count matched tokens
    let matches = 0;
    for (const token of result.tokens) {
      if (queryTokens.has(token)) {
        matches++;
      }
    }

    // Apply field weight
    const fieldWeight = fieldWeights[result.field] || 1;
    const fieldScore = matches * fieldWeight;

    scoreMap.set(result.id, {
      score: existing.score + fieldScore,
      matchedTokens: existing.matchedTokens + matches,
    });
  }

  // Apply recency bonus if records provided
  if (records) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const record of records) {
      if (record.createdAt) {
        const age = now - new Date(record.createdAt).getTime();
        const dayAge = age / dayMs;

        // Boost recent items (exponential decay)
        const recencyBonus = Math.exp(-dayAge / 30); // 30-day half-life

        const existing = scoreMap.get(record.id);
        if (existing) {
          existing.score += recencyBonus;
        }
      }
    }
  }

  // Convert to sorted array
  const ranked: SearchResult[] = [];
  for (const [id, { score, matchedTokens }] of scoreMap.entries()) {
    ranked.push({ id, score, matchedTokens });
  }

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);

  return ranked;
}

/**
 * Highlight matched tokens in text (for preview)
 *
 * @param text - Original text
 * @param tokens - Tokens to highlight
 * @param maxLength - Maximum preview length
 * @returns Highlighted text preview
 */
export function highlightMatches(
  text: string,
  tokens: Set<string>,
  maxLength: number = 200
): string {
  if (!text) return '';

  // Find first match position
  const lowerText = text.toLowerCase();
  let firstMatch = -1;

  for (const token of tokens) {
    const pos = lowerText.indexOf(token);
    if (pos !== -1 && (firstMatch === -1 || pos < firstMatch)) {
      firstMatch = pos;
    }
  }

  // Extract preview around first match
  let preview = text;
  if (firstMatch !== -1 && text.length > maxLength) {
    const start = Math.max(0, firstMatch - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);
    preview = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
  } else if (text.length > maxLength) {
    preview = text.substring(0, maxLength) + '...';
  }

  return preview;
}
