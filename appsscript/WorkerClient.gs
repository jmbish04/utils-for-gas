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
}
