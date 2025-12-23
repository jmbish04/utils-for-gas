/**
 * Echo API Integration
 * Demonstrates simple message echoing through the worker
 */

/**
 * Echoes a message through the worker API
 * @param {string} message - Message to echo
 * @returns {Object} - Echo response with timestamp
 */
function echoMessage(message) {
  if (!message) {
    throw new Error('Message is required');
  }
  
  const payload = {
    message: message
  };
  
  try {
    const result = callWorkerAPI('/api/echo', 'POST', payload);
    Logger.log('Echo result: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('Echo failed: ' + error.toString());
    throw error;
  }
}

/**
 * Test function for echo API
 */
function testEchoAPI() {
  const testMessage = 'Hello from Google Apps Script!';
  const result = echoMessage(testMessage);
  
  if (result && result.echo === testMessage) {
    Logger.log('✓ Echo API test passed');
    return true;
  } else {
    Logger.log('✗ Echo API test failed');
    return false;
  }
}

/**
 * Custom function for Google Sheets
 * Usage in sheet: =WORKER_ECHO("Hello World")
 * @param {string} message - Message to echo
 * @returns {string} - Echoed message
 * @customfunction
 */
function WORKER_ECHO(message) {
  try {
    const result = echoMessage(message);
    return result.echo;
  } catch (error) {
    return 'Error: ' + error.toString();
  }
}
