import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Telemetry Logs
 * Tracks all incoming requests from Apps Script clients
 */
export const telemetryLogs = sqliteTable('telemetry_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Request metadata
  cfRequestId: text('cf_request_id').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),

  // Apps Script context headers
  appsscriptId: text('appsscript_id').notNull().default(''),
  appsscriptName: text('appsscript_name').notNull().default(''),
  appsscriptDriveId: text('appsscript_drive_id').notNull().default(''),
  appsscriptDriveUrl: text('appsscript_drive_url').notNull().default(''),
  appsscriptEditorUrl: text('appsscript_editor_url').notNull().default(''),

  // Performance metrics
  durationMs: integer('duration_ms'),
  statusCode: integer('status_code'),
});

/**
 * AI Transcripts
 * Stores every prompt and response for auditing and analysis
 */
export const aiTranscripts = sqliteTable('ai_transcripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Request tracking
  cfRequestId: text('cf_request_id').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),

  // Model information
  model: text('model').notNull(),

  // Conversation data (stored as JSON)
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),

  // Token usage
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),

  // Metadata
  metadata: text('metadata'), // JSON string for additional context
});

/**
 * Gmail Thread Metadata
 * Stores thread-level metadata for deduplication
 */
export const gmailThreads = sqliteTable('gmail_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Gmail identifiers
  threadId: text('thread_id').notNull().unique(),

  // Thread metadata
  subject: text('subject').notNull(),
  snippet: text('snippet'),
  firstMessageDate: integer('first_message_date', { mode: 'timestamp' }),
  lastMessageDate: integer('last_message_date', { mode: 'timestamp' }),

  // Processing tracking
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  processedBy: text('processed_by'), // Apps Script ID that processed it

  // Labels and categories
  labels: text('labels'), // JSON array of label IDs

  // Metadata for RAG
  embedding: text('embedding'), // JSON array of floats (for local storage reference)
  vectorizeId: text('vectorize_id'), // ID in Vectorize index

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

/**
 * Gmail Message Metadata
 * Stores message-level metadata for deduplication
 */
export const gmailMessages = sqliteTable('gmail_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Gmail identifiers
  messageId: text('message_id').notNull().unique(),
  threadId: text('thread_id').notNull(),

  // Message metadata
  from: text('from').notNull(),
  to: text('to'),
  cc: text('cc'),
  subject: text('subject'),
  snippet: text('snippet'),
  bodyPreview: text('body_preview'), // First 500 chars

  // Timestamps
  internalDate: integer('internal_date', { mode: 'timestamp' }),
  receivedDate: integer('received_date', { mode: 'timestamp' }),

  // Processing tracking
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  processedBy: text('processed_by'),

  // Metadata for RAG
  embedding: text('embedding'),
  vectorizeId: text('vectorize_id'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

/**
 * System Prompts
 * Stores configurable prompts for AI agents
 */
export const systemPrompts = sqliteTable('system_prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Prompt identification
  name: text('name').notNull().unique(),
  description: text('description'),

  // Prompt content
  content: text('content').notNull(),

  // Versioning
  version: integer('version').notNull().default(1),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  // Metadata
  tags: text('tags'), // JSON array
  category: text('category'), // e.g., "doc-controller", "gmail-assistant"

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

/**
 * Doc Operations Log
 * Tracks all document operations performed by the DocAgent
 */
export const docOperations = sqliteTable('doc_operations', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Session tracking
  sessionId: text('session_id').notNull(),
  durableObjectId: text('durable_object_id').notNull(),

  // Document context
  docId: text('doc_id').notNull(),

  // Operation details
  operation: text('operation').notNull(), // e.g., "insertText", "setAttributes", "replaceText"
  payload: text('payload').notNull(), // JSON of the operation details

  // Results
  status: text('status').notNull(), // "pending", "success", "failed", "retrying"
  result: text('result'), // JSON response from Apps Script
  errorMessage: text('error_message'),

  // Timing
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  durationMs: integer('duration_ms'),
});

// Export types for use in the application
export type TelemetryLog = typeof telemetryLogs.$inferSelect;
export type NewTelemetryLog = typeof telemetryLogs.$inferInsert;

export type AiTranscript = typeof aiTranscripts.$inferSelect;
export type NewAiTranscript = typeof aiTranscripts.$inferInsert;

export type GmailThread = typeof gmailThreads.$inferSelect;
export type NewGmailThread = typeof gmailThreads.$inferInsert;

export type GmailMessage = typeof gmailMessages.$inferSelect;
export type NewGmailMessage = typeof gmailMessages.$inferInsert;

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type NewSystemPrompt = typeof systemPrompts.$inferInsert;

export type DocOperation = typeof docOperations.$inferSelect;
export type NewDocOperation = typeof docOperations.$inferInsert;
