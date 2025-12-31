/**
 * Configuration for the Worker API
 * IMPORTANT: Update WORKER_URL with your deployed Cloudflare Worker URL
 */
const CONFIG = {
  WORKER_URL: 'https://your-worker.your-subdomain.workers.dev'
};

/**
 * Collect Apps Script + Drive metadata
 */
function getAppsScriptContext() {
  const scriptId = ScriptApp.getScriptId();

  let driveId = '';
  let driveUrl = '';
  let name = '';

  try {
    const file = DriveApp.getFileById(scriptId);
    driveId = file.getId();
    driveUrl = file.getUrl();
    name = file.getName();
  } catch (e) {
    // Common for container-bound scripts
    name = 'Unknown Apps Script Project';
  }

  return {
    scriptId,
    name,
    driveId,
    driveUrl,
    editorUrl: `https://script.google.com/d/${scriptId}/edit`
  };
}

/**
 * Makes an HTTP request to the Worker API
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} payload - Request payload for POST/PUT
 * @returns {Object|null} - Parsed JSON response
 */
function callWorkerAPI(endpoint, method, payload) {
  const url = CONFIG.WORKER_URL + endpoint;
  const context = getAppsScriptContext();

  const options = {
    method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'X-Appsscript-Id': context.scriptId,
      'X-Appsscript-Name': context.name,
      'X-Appsscript-Drive-Id': context.driveId,
      'X-Appsscript-Drive-Url': context.driveUrl,
      'X-Appsscript-Editor-Url': context.editorUrl
    }
  };

  // Only attach body for non-GET requests
  if (method !== 'GET' && payload !== undefined) {
    options.payload = JSON.stringify(payload);
  }

  try {
    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const text = response.getContentText();

    if (status >= 200 && status < 300) {
      return text ? JSON.parse(text) : null;
    }

    throw new Error(`Worker API error ${status}: ${text}`);
  } catch (err) {
    Logger.log('Error calling Worker API: ' + err);
    throw err;
  }
}

/**
 * Test function to check worker connectivity
 */
function testWorkerConnection() {
  try {
    const result = callWorkerAPI('/health', 'GET');
    Logger.log('Worker health check: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('Failed to connect to worker: ' + error);
    return null;
  }
}
