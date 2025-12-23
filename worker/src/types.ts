import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Cloudflare Worker Environment Bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;

  // Vectorize for semantic search
  VECTORIZE: VectorizeIndex;

  // AI Binding for Llama models
  AI: Ai;

  // KV Namespace for schema-less storage
  KV: KVNamespace;

  // Durable Object for DocAgent
  DOC_AGENT: DurableObjectNamespace;

  // Workers Assets binding (for serving frontend)
  ASSETS: Fetcher;

  // Environment variables
  ENVIRONMENT: 'development' | 'production';

  // Secrets
  WORKER_API_KEY?: string;
}

/**
 * Apps Script Request Headers
 * Extracted from incoming requests for telemetry
 */
export interface AppsScriptHeaders {
  appsscriptId: string;
  appsscriptName: string;
  appsscriptDriveId: string;
  appsscriptDriveUrl: string;
  appsscriptEditorUrl: string;
}

/**
 * AI Model Types
 */
export type AIModel =
  | '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  | '@cf/meta/llama-3.2-11b-vision-instruct'
  | '@cf/meta/llama-4-scout-17b-16e-instruct';

/**
 * Doc Operation Types for the DocAgent
 */
export interface DocOp {
  type: 'insertText' | 'setAttributes' | 'replaceText' | 'insertTable' | 'deleteRange';
  payload: Record<string, any>;
}

/**
 * Doc State Response from Apps Script
 */
export interface DocState {
  docId: string;
  elements: Array<{
    type: 'PARAGRAPH' | 'TABLE' | 'LIST_ITEM' | 'HORIZONTAL_RULE';
    text?: string;
    attributes?: Record<string, any>;
    children?: any[];
  }>;
}

/**
 * Vectorize Metadata Structure
 */
export interface VectorMetadata {
  id: string;
  type: 'thread' | 'message';
  threadId?: string;
  messageId?: string;
  subject?: string;
  from?: string;
  timestamp: number;
}

/**
 * KV Record Structure
 * Schema-less storage with automatic metadata
 */
export interface KVRecord<T = any> {
  key: string;
  value: T;
  metadata?: {
    createdAt: number;
    updatedAt: number;
    createdBy?: string;
    tags?: string[];
    [key: string]: any;
  };
}

/**
 * KV List Options
 */
export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

/**
 * KV Search Options
 */
export interface KVSearchOptions {
  pattern?: string;
  field?: string;
  limit?: number;
}
