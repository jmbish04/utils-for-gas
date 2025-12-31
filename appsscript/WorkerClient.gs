/**
 * WorkerClient - Cloudflare Worker API Client for Google Apps Script
 *
 * A simple class to interact with the Colby-GAS-Bridge Worker
 * Automatically injects Apps Script context headers for telemetry
 */
class WorkerClient {
  /**
   * @param {string} workerUrl - The base URL of your Worker (e.g., https://colby-gas-bridge.workers.dev)
   * @param {string} apiKey - Your WORKER_API_KEY
   */
  constructor(workerUrl, apiKey) {
    this.workerUrl = workerUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  /**
   * Get Apps Script context headers for telemetry
   * @private
   */
  _getContextHeaders() {
    const scriptId = ScriptApp.getScriptId();

    // Try to get Drive context
    let driveId = '';
    let driveUrl = '';
    let editorUrl = `https://script.google.com/home/projects/${scriptId}/edit`;

    try {
      // If running from a container-bound script
      const file = DriveApp.getFileById(scriptId);
      driveId = file.getId();
      driveUrl = file.getUrl();
    } catch (e) {
      // Standalone script - use defaults
    }

    return {
      'X-Appsscript-Id': scriptId,
      'X-Appsscript-Name': ScriptApp.getProjectName() || 'Unknown',
      'X-Appsscript-Drive-Id': driveId,
      'X-Appsscript-Drive-Url': driveUrl,
      'X-Appsscript-Editor-Url': editorUrl,
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make a request to the Worker
   * @private
   */
  _request(method, path, payload = null) {
    const url = `${this.workerUrl}${path}`;
    const headers = this._getContextHeaders();

    const options = {
      method: method,
      headers: headers,
      muteHttpExceptions: true,
    };

    if (payload) {
      options.payload = JSON.stringify(payload);
    }

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode >= 400) {
      throw new Error(`Worker request failed (${responseCode}): ${responseText}`);
    }

    return JSON.parse(responseText);
  }

  // ========================================
  // AI Services
  // ========================================

  /**
   * Generate AI completion using Llama models
   * @param {Array<{role: string, content: string}>} messages - Conversation messages
   * @param {string} model - Model name or alias (default: 'default')
   * @param {Object} options - Additional options (temperature, max_tokens)
   * @returns {Object} AI response
   */
  generateAI(messages, model = 'default', options = {}) {
    return this._request('post', '/api/ai/generate', {
      messages: messages,
      model: model,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1024,
    });
  }

  /**
   * Get available AI models
   * @returns {Object} List of models
   */
  getAIModels() {
    return this._request('get', '/api/ai/models');
  }

  // ========================================
  // Gmail Services
  // ========================================

  /**
   * Sync Gmail threads to Worker
   * @param {Array<Object>} threads - Array of thread objects
   * @param {boolean} generateEmbeddings - Whether to generate embeddings (default: true)
   * @returns {Object} Sync result
   */
  syncGmailThreads(threads, generateEmbeddings = true) {
    return this._request('post', '/api/gmail/sync', {
      type: 'thread',
      threads: threads,
      generateEmbeddings: generateEmbeddings,
    });
  }

  /**
   * Sync Gmail messages to Worker
   * @param {Array<Object>} messages - Array of message objects
   * @param {boolean} generateEmbeddings - Whether to generate embeddings (default: true)
   * @returns {Object} Sync result
   */
  syncGmailMessages(messages, generateEmbeddings = true) {
    return this._request('post', '/api/gmail/sync', {
      type: 'message',
      messages: messages,
      generateEmbeddings: generateEmbeddings,
    });
  }

  /**
   * Get distinct thread or message IDs
   * @param {string} type - 'thread' or 'message'
   * @param {string} since - ISO timestamp or "24h" format
   * @returns {Object} List of IDs
   */
  getDistinctGmailIds(type, since = null) {
    let url = `/api/gmail/distinct?type=${type}`;
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }
    return this._request('get', url);
  }

  /**
   * Search Gmail threads/messages using semantic search
   * @param {string} query - Search query
   * @param {string} type - 'thread', 'message', or 'both'
   * @param {number} limit - Max results (default: 10)
   * @returns {Object} Search results
   */
  searchGmail(query, type = 'both', limit = 10) {
    return this._request('post', '/api/gmail/search', {
      query: query,
      type: type,
      limit: limit,
    });
  }

  // ========================================
  // Doc Controller Services
  // ========================================

  /**
   * Configure Doc Controller endpoint
   * @param {string} gasWebAppUrl - URL of the Doc Controller Web App
   * @param {string} authToken - Optional auth token
   * @returns {Object} Configuration result
   */
  configureDocController(gasWebAppUrl, authToken = null) {
    return this._request('post', '/api/doc/configure', {
      gasWebAppUrl: gasWebAppUrl,
      authToken: authToken,
    });
  }

  /**
   * Convert markdown to Google Doc
   * @param {string} markdown - Markdown content
   * @param {string} docId - Google Doc ID
   * @returns {Object} Conversion result
   */
  markdownToDoc(markdown, docId) {
    return this._request('post', '/api/doc/md-to-doc', {
      markdown: markdown,
      docId: docId,
    });
  }

  /**
   * Chat with Doc Agent (natural language editing)
   * @param {string} message - Natural language instruction
   * @param {string} docId - Google Doc ID
   * @returns {Object} Chat response
   */
  chatWithDoc(message, docId) {
    return this._request('post', '/api/doc/chat', {
      message: message,
      docId: docId,
    });
  }

  /**
   * Get Doc Agent status
   * @returns {Object} Agent status
   */
  getDocAgentStatus() {
    return this._request('get', '/api/doc/status');
  }

  // ========================================
  // KV Storage (Schema-less Database)
  // ========================================

  /**
   * Set a key-value pair
   * @param {string} key - Unique key
   * @param {*} value - Any JSON-serializable value
   * @param {Object} options - Optional metadata and TTL
   * @returns {Object} Set result
   */
  kvSet(key, value, options = {}) {
    return this._request('post', '/api/kv/set', {
      key: key,
      value: value,
      metadata: options.metadata,
      expirationTtl: options.expirationTtl,
    });
  }

  /**
   * Get a value by key
   * @param {string} key - Key to retrieve
   * @param {boolean} withMetadata - Include metadata (default: true)
   * @returns {Object} Value and metadata
   */
  kvGet(key, withMetadata = true) {
    const url = `/api/kv/get?key=${encodeURIComponent(key)}&withMetadata=${withMetadata}`;
    return this._request('get', url);
  }

  /**
   * Get multiple values by keys
   * @param {Array<string>} keys - Array of keys
   * @param {boolean} withMetadata - Include metadata (default: true)
   * @returns {Object} Records array
   */
  kvGetBulk(keys, withMetadata = true) {
    return this._request('post', '/api/kv/get-bulk', {
      keys: keys,
      withMetadata: withMetadata,
    });
  }

  /**
   * List all keys (optionally filtered by prefix)
   * @param {string} prefix - Optional key prefix filter
   * @param {number} limit - Max keys to return (default: 100)
   * @returns {Object} Keys array and pagination cursor
   */
  kvList(prefix = null, limit = 100) {
    let url = `/api/kv/list?limit=${limit}`;
    if (prefix) {
      url += `&prefix=${encodeURIComponent(prefix)}`;
    }
    return this._request('get', url);
  }

  /**
   * List keys with their values (expensive - use sparingly)
   * @param {string} prefix - Optional key prefix filter
   * @param {number} limit - Max records to return (default: 50, max: 100)
   * @param {boolean} withMetadata - Include metadata (default: true)
   * @returns {Object} Records array
   */
  kvListValues(prefix = null, limit = 50, withMetadata = true) {
    return this._request('post', '/api/kv/list-values', {
      prefix: prefix,
      limit: limit,
      withMetadata: withMetadata,
    });
  }

  /**
   * Search values by pattern matching
   * @param {string} query - Search query
   * @param {Object} options - Search options (field, prefix, limit, caseSensitive)
   * @returns {Object} Search results
   */
  kvSearch(query, options = {}) {
    return this._request('post', '/api/kv/search', {
      query: query,
      field: options.field,
      prefix: options.prefix,
      limit: options.limit || 50,
      caseSensitive: options.caseSensitive || false,
    });
  }

  /**
   * Delete a key
   * @param {string} key - Key to delete
   * @returns {Object} Delete result
   */
  kvDelete(key) {
    return this._request('delete', `/api/kv/delete?key=${encodeURIComponent(key)}`);
  }

  /**
   * Delete multiple keys
   * @param {Array<string>} keys - Array of keys to delete
   * @returns {Object} Delete result
   */
  kvDeleteBulk(keys) {
    return this._request('post', '/api/kv/delete-bulk', {
      keys: keys,
    });
  }

  /**
   * Delete all keys with a prefix
   * @param {string} prefix - Key prefix
   * @param {boolean} confirm - Must be true to execute
   * @returns {Object} Delete result
   */
  kvDeletePrefix(prefix, confirm = false) {
    return this._request('post', '/api/kv/delete-prefix', {
      prefix: prefix,
      confirm: confirm,
    });
  }

  // ========================================
  // KV Helper Methods (Sheets-like Interface)
  // ========================================

  /**
   * Store a "row" of data (like appending to a Sheet)
   * Uses auto-incrementing IDs with a prefix
   * @param {string} namespace - Namespace/table name (e.g., "users", "tasks")
   * @param {Object} data - Row data
   * @returns {Object} Result with generated ID
   */
  kvAppendRow(namespace, data) {
    // Generate a timestamp-based ID for ordering
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    const key = `${namespace}:${timestamp}-${randomSuffix}`;

    const result = this.kvSet(key, data);
    return {
      success: result.success,
      key: key,
      id: key,
    };
  }

  /**
   * Get all rows from a namespace (like reading a Sheet)
   * @param {string} namespace - Namespace/table name
   * @param {number} limit - Max rows to return
   * @returns {Array} Array of row objects with keys
   */
  kvGetAllRows(namespace, limit = 100) {
    const result = this.kvListValues(`${namespace}:`, limit);
    return result.records.map(record => ({
      id: record.key,
      ...record.value,
      _metadata: record.metadata,
    }));
  }

  /**
   * Update a row by ID
   * @param {string} id - Row ID (the full key)
   * @param {Object} data - Updated data
   * @returns {Object} Update result
   */
  kvUpdateRow(id, data) {
    return this.kvSet(id, data);
  }

  /**
   * Delete a row by ID
   * @param {string} id - Row ID (the full key)
   * @returns {Object} Delete result
   */
  kvDeleteRow(id) {
    return this.kvDelete(id);
  }

  /**
   * Find rows matching a search query (like filtering a Sheet)
   * @param {string} namespace - Namespace/table name
   * @param {string} query - Search query
   * @param {string} field - Optional specific field to search
   * @returns {Array} Matching rows
   */
  kvFindRows(namespace, query, field = null) {
    const result = this.kvSearch(query, {
      prefix: `${namespace}:`,
      field: field,
    });
    return result.results.map(record => ({
      id: record.key,
      ...record.value,
      _metadata: record.metadata,
    }));
  }

  /**
   * Clear all data in a namespace (like clearing a Sheet)
   * @param {string} namespace - Namespace/table name
   * @param {boolean} confirm - Must be true to execute
   * @returns {Object} Delete result
   */
  kvClearNamespace(namespace, confirm = false) {
    return this.kvDeletePrefix(`${namespace}:`, confirm);
  }
}

// ========================================
// Example Usage
// ========================================

function exampleUsage() {
  const WORKER_URL = 'https://colby-gas-bridge.workers.dev';
  const API_KEY = 'your-api-key-here';

  const client = new WorkerClient(WORKER_URL, API_KEY);

  // Example 1: AI Generation
  const aiResponse = client.generateAI([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ]);
  Logger.log(aiResponse.response);

  // Example 2: Gmail Deduplication
  const processedIds = client.getDistinctGmailIds('thread', '24h');
  Logger.log(`Already processed: ${processedIds.count} threads`);

  // Example 3: Sync Gmail Threads
  const threads = [
    {
      threadId: 'thread123',
      subject: 'Project Update',
      snippet: 'The project is on track...',
      firstMessageDate: Date.now(),
      lastMessageDate: Date.now(),
    },
  ];
  const syncResult = client.syncGmailThreads(threads);
  Logger.log(`Synced ${syncResult.synced} threads`);

  // Example 4: Semantic Search
  const searchResults = client.searchGmail('project deadline', 'thread', 5);
  Logger.log(`Found ${searchResults.count} matching threads`);

  // Example 5: Markdown to Doc
  const markdown = '# Hello World\n\nThis is a **bold** statement.';
  const docId = 'your-doc-id-here';
  const conversionResult = client.markdownToDoc(markdown, docId);
  Logger.log(`Executed ${conversionResult.opsExecuted} operations`);

  // Example 6: KV Storage - Replace Sheets as Database
  // Store a user record
  client.kvSet('user:123', {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin',
  });

  // Get the user
  const user = client.kvGet('user:123');
  Logger.log(user.value.name);

  // Example 7: KV Sheets-like Interface
  // Append rows (like adding to a Sheet)
  client.kvAppendRow('tasks', {
    title: 'Review proposal',
    status: 'pending',
    assignee: 'jane@example.com',
  });

  client.kvAppendRow('tasks', {
    title: 'Update documentation',
    status: 'in-progress',
    assignee: 'john@example.com',
  });

  // Get all rows (like reading a Sheet)
  const allTasks = client.kvGetAllRows('tasks');
  Logger.log(`Found ${allTasks.length} tasks`);
  allTasks.forEach(task => {
    Logger.log(`${task.title} - ${task.status}`);
  });

  // Search rows (like filtering a Sheet)
  const pendingTasks = client.kvFindRows('tasks', 'pending', 'status');
  Logger.log(`Found ${pendingTasks.length} pending tasks`);

  // Update a row
  if (allTasks.length > 0) {
    const taskId = allTasks[0].id;
    client.kvUpdateRow(taskId, {
      title: allTasks[0].title,
      status: 'completed',
      assignee: allTasks[0].assignee,
    });
  }

  // Clear all tasks (like clearing a Sheet)
  // client.kvClearNamespace('tasks', true);
}
