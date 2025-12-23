/**
 * KV Type Configuration System
 *
 * Defines indexing rules for each "table" type in the KV datastore
 */

/**
 * Configuration for a KV type (table)
 */
export interface TypeConfig {
  /** Fields to create equality indexes for (WHERE field=value) */
  indexedFields: string[];

  /** Time fields for sorting/pagination (createdAt, updatedAt) */
  timeFields: string[];

  /** Text fields to create inverted search indexes for */
  searchFields: string[];

  /** Stopwords to exclude from search tokens */
  stopwords?: string[];

  /** Maximum length for indexed field values */
  maxValueLength?: number;

  /** Maximum record size in bytes */
  maxRecordSize?: number;
}

/**
 * Base record structure - all records must include these
 */
export interface BaseRecord {
  id: string;
  type: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  [key: string]: any;
}

/**
 * Type registry - configure each type here
 */
export const TYPE_CONFIGS: Record<string, TypeConfig> = {
  /**
   * Demo type: System Prompts
   */
  prompt: {
    indexedFields: ['category', 'isActive', 'version'],
    timeFields: ['createdAt', 'updatedAt'],
    searchFields: ['name', 'description', 'content'],
    stopwords: ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'],
    maxValueLength: 1000,
    maxRecordSize: 100 * 1024, // 100KB
  },

  /**
   * Configuration items (key-value config storage)
   */
  config: {
    indexedFields: ['environment', 'category', 'isActive'],
    timeFields: ['createdAt', 'updatedAt'],
    searchFields: ['key', 'description'],
    maxValueLength: 500,
    maxRecordSize: 50 * 1024,
  },

  /**
   * User profiles
   */
  user: {
    indexedFields: ['email', 'role', 'status', 'department'],
    timeFields: ['createdAt', 'updatedAt', 'lastLoginAt'],
    searchFields: ['name', 'email', 'bio'],
    stopwords: ['the', 'a', 'an'],
    maxValueLength: 500,
    maxRecordSize: 50 * 1024,
  },

  /**
   * Tasks/todos
   */
  task: {
    indexedFields: ['status', 'priority', 'assignee', 'project'],
    timeFields: ['createdAt', 'updatedAt', 'dueDate', 'completedAt'],
    searchFields: ['title', 'description'],
    stopwords: ['the', 'a', 'an', 'to', 'for'],
    maxValueLength: 1000,
    maxRecordSize: 100 * 1024,
  },
};

/**
 * Get configuration for a type, with validation
 */
export function getTypeConfig(type: string): TypeConfig {
  const config = TYPE_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown type: ${type}. Valid types: ${Object.keys(TYPE_CONFIGS).join(', ')}`);
  }
  return config;
}

/**
 * Validate type and id are safe for use in keys
 */
export function validateTypeAndId(type: string, id: string): void {
  const safePattern = /^[a-zA-Z0-9_-]+$/;

  if (!safePattern.test(type)) {
    throw new Error(`Invalid type: ${type}. Must match [a-zA-Z0-9_-]+`);
  }

  if (!safePattern.test(id)) {
    throw new Error(`Invalid id: ${id}. Must match [a-zA-Z0-9_-]+`);
  }

  if (type.length > 50) {
    throw new Error(`Type too long: ${type.length} chars (max 50)`);
  }

  if (id.length > 200) {
    throw new Error(`ID too long: ${id.length} chars (max 200)`);
  }
}

/**
 * Generate unique ID for a new record
 */
export function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Default stopwords (can be overridden per type)
 */
export const DEFAULT_STOPWORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was',
  'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'should', 'could', 'may',
  'might', 'must', 'can', 'this', 'that', 'these', 'those',
];
