/**
 * Main menu and utilities for the Apps Script integration
 */

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Worker Utils')
    .addItem('Test Connection', 'testWorkerConnection')
    .addSeparator()
    .addItem('Test Echo API', 'testEchoAPI')
    .addItem('Test Text Analysis API', 'testTextAnalysisAPI')
    .addSeparator()
    .addItem('Run All Tests', 'runAllTests')
    .addToUi();
}

/**
 * Runs all API tests
 */
function runAllTests() {
  Logger.log('=== Running All Worker API Tests ===');
  
  Logger.log('\n1. Testing worker connection...');
  const healthCheck = testWorkerConnection();
  
  Logger.log('\n2. Testing Echo API...');
  const echoTest = testEchoAPI();
  
  Logger.log('\n3. Testing Text Analysis API...');
  const textAnalysisTest = testTextAnalysisAPI();
  
  Logger.log('\n=== Test Summary ===');
  Logger.log('Health Check: ' + (healthCheck ? '✓ PASSED' : '✗ FAILED'));
  Logger.log('Echo API: ' + (echoTest ? '✓ PASSED' : '✗ FAILED'));
  Logger.log('Text Analysis API: ' + (textAnalysisTest ? '✓ PASSED' : '✗ FAILED'));
  
  SpreadsheetApp.getUi().alert(
    'Test Results',
    'Check the Logs (View > Logs) for detailed test results.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Example function showing how to process data from a sheet
 * This can be called from a button or trigger
 */
function processSheetData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  
  // Skip header row
  for (let i = 1; i < values.length; i++) {
    const text = values[i][0]; // Assume text is in first column
    
    if (text) {
      try {
        const analysis = analyzeText(text);
        // Write results to adjacent columns
        sheet.getRange(i + 1, 2).setValue(analysis.wordCount);
        sheet.getRange(i + 1, 3).setValue(analysis.charCount);
        sheet.getRange(i + 1, 4).setValue(analysis.lineCount);
      } catch (error) {
        Logger.log('Error processing row ' + (i + 1) + ': ' + error.toString());
      }
    }
  }
  
  SpreadsheetApp.getUi().alert('Processing complete!');
}
