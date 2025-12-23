/**
 * Text Analysis API Integration
 * Demonstrates text processing capabilities through the worker
 */

/**
 * Analyzes text using the worker API
 * @param {string} text - Text to analyze
 * @returns {Object} - Analysis results including word count, character count, etc.
 */
function analyzeText(text) {
  if (!text) {
    throw new Error('Text is required');
  }
  
  const payload = {
    text: text
  };
  
  try {
    const result = callWorkerAPI('/api/text-analysis', 'POST', payload);
    Logger.log('Text analysis result: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('Text analysis failed: ' + error.toString());
    throw error;
  }
}

/**
 * Test function for text analysis API
 */
function testTextAnalysisAPI() {
  const testText = 'This is a test.\nIt has multiple lines.\nAnd some words.';
  const result = analyzeText(testText);
  
  if (result && result.wordCount > 0) {
    Logger.log('✓ Text Analysis API test passed');
    Logger.log('Words: ' + result.wordCount);
    Logger.log('Characters: ' + result.charCount);
    Logger.log('Lines: ' + result.lineCount);
    return true;
  } else {
    Logger.log('✗ Text Analysis API test failed');
    return false;
  }
}

/**
 * Custom function for Google Sheets - Get word count
 * Usage in sheet: =WORKER_WORD_COUNT("Some text here")
 * @param {string} text - Text to count words
 * @returns {number} - Word count
 * @customfunction
 */
function WORKER_WORD_COUNT(text) {
  try {
    const result = analyzeText(text);
    return result.wordCount;
  } catch (error) {
    return 'Error: ' + error.toString();
  }
}

/**
 * Custom function for Google Sheets - Get character count
 * Usage in sheet: =WORKER_CHAR_COUNT("Some text here")
 * @param {string} text - Text to count characters
 * @returns {number} - Character count
 * @customfunction
 */
function WORKER_CHAR_COUNT(text) {
  try {
    const result = analyzeText(text);
    return result.charCount;
  } catch (error) {
    return 'Error: ' + error.toString();
  }
}

/**
 * Batch analyzes multiple texts from a range
 * @param {Array<Array<string>>} textRange - 2D array of text values from sheet
 * @returns {Array<Array<Object>>} - 2D array of analysis results
 */
function batchAnalyzeTexts(textRange) {
  const results = [];
  
  for (let i = 0; i < textRange.length; i++) {
    const rowResults = [];
    for (let j = 0; j < textRange[i].length; j++) {
      const text = textRange[i][j];
      if (text) {
        try {
          const analysis = analyzeText(text);
          rowResults.push([
            analysis.wordCount,
            analysis.charCount,
            analysis.lineCount
          ]);
        } catch (error) {
          rowResults.push(['Error', 'Error', 'Error']);
        }
      } else {
        rowResults.push(['', '', '']);
      }
    }
    results.push(rowResults);
  }
  
  return results;
}
