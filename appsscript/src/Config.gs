/**
 * Configuration for the Worker API
 * IMPORTANT: Update WORKER_URL with your deployed Cloudflare Worker URL
 */
const CONFIG = {
  WORKER_URL: 'https://your-worker.your-subdomain.workers.dev',
  // Add API keys or authentication tokens here if needed
  // API_KEY: 'your-api-key'
};

/**
 * Makes an HTTP request to the worker API
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} payload - Request payload for POST requests
 * @returns {Object} - Parsed JSON response
 */
function callWorkerAPI(endpoint, method, payload) {
  const url = CONFIG.WORKER_URL + endpoint;
  
  const options = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  
  // Add headers if API key is configured
  // if (CONFIG.API_KEY) {
  //   options.headers = {
  //     'Authorization': 'Bearer ' + CONFIG.API_KEY
  //   };
  // }
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(responseText);
    } else {
      throw new Error('API Error: ' + responseCode + ' - ' + responseText);
    }
  } catch (error) {
    Logger.log('Error calling Worker API: ' + error.toString());
    throw error;
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
    Logger.log('Failed to connect to worker: ' + error.toString());
    return null;
  }
}
