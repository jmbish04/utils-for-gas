# Examples and Use Cases

This document provides practical examples of using the Worker API with Google Apps Script.

## Use Case 1: Automated Content Analysis in Google Sheets

Process a column of text entries and analyze them in bulk.

### Setup
1. Create a new Google Sheet
2. In column A, add text entries (one per row)
3. Add headers in row 1: Text | Word Count | Char Count | Lines

### Script
```javascript
function analyzeSheetContent() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  // Skip header row
  for (let i = 2; i <= lastRow; i++) {
    const text = sheet.getRange(i, 1).getValue();
    
    if (text) {
      try {
        const analysis = analyzeText(text);
        sheet.getRange(i, 2).setValue(analysis.wordCount);
        sheet.getRange(i, 3).setValue(analysis.charCount);
        sheet.getRange(i, 4).setValue(analysis.lineCount);
        
        // Add small delay to avoid rate limiting
        Utilities.sleep(100);
      } catch (error) {
        Logger.log('Error on row ' + i + ': ' + error.toString());
      }
    }
  }
  
  SpreadsheetApp.getUi().alert('Analysis complete!');
}
```

## Use Case 2: Email Processing with Text Analysis

Analyze email content and categorize by length.

### Script
```javascript
function analyzeEmails() {
  const threads = GmailApp.getInboxThreads(0, 10);
  const results = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      const body = message.getPlainBody();
      
      try {
        const analysis = analyzeText(body);
        results.push({
          subject: message.getSubject(),
          from: message.getFrom(),
          wordCount: analysis.wordCount,
          charCount: analysis.charCount,
          category: categorizeByLength(analysis.wordCount)
        });
      } catch (error) {
        Logger.log('Error analyzing email: ' + error.toString());
      }
    });
  });
  
  // Write results to sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Email Analysis');
  if (!sheet) {
    const newSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Email Analysis');
    newSheet.appendRow(['Subject', 'From', 'Word Count', 'Char Count', 'Category']);
  }
  
  results.forEach(result => {
    sheet.appendRow([
      result.subject,
      result.from,
      result.wordCount,
      result.charCount,
      result.category
    ]);
  });
}

function categorizeByLength(wordCount) {
  if (wordCount < 50) return 'Short';
  if (wordCount < 200) return 'Medium';
  if (wordCount < 500) return 'Long';
  return 'Very Long';
}
```

## Use Case 3: Document Generation with Templates

Use the echo endpoint to test template rendering.

### Script
```javascript
function generateFromTemplate(data) {
  const template = 'Hello {{name}}, your order #{{orderId}} is {{status}}.';
  
  // Simple template replacement
  let message = template;
  for (let key in data) {
    message = message.replace('{{' + key + '}}', data[key]);
  }
  
  // Echo it through the worker (could be replaced with more complex processing)
  const result = echoMessage(message);
  
  return result.echo;
}

function testTemplateGeneration() {
  const data = {
    name: 'John Doe',
    orderId: '12345',
    status: 'shipped'
  };
  
  const message = generateFromTemplate(data);
  Logger.log('Generated message: ' + message);
  
  // Send via email, write to doc, etc.
  GmailApp.sendEmail(
    'recipient@example.com',
    'Order Update',
    message
  );
}
```

## Use Case 4: Scheduled Content Monitoring

Use time-driven triggers to monitor and analyze content periodically.

### Setup
1. Go to Apps Script editor
2. Click on "Triggers" (clock icon)
3. Add new trigger for `monitorContent` function
4. Set to run hourly or daily

### Script
```javascript
function monitorContent() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Monitor');
  const urls = sheet.getRange('A2:A').getValues().flat().filter(url => url);
  
  const results = [];
  
  urls.forEach(url => {
    try {
      // Fetch content (example)
      const response = UrlFetchApp.fetch(url);
      const content = response.getContentText();
      
      // Analyze it
      const analysis = analyzeText(content);
      
      results.push({
        url: url,
        wordCount: analysis.wordCount,
        timestamp: new Date().toISOString(),
        status: 'Success'
      });
      
      Utilities.sleep(500);
    } catch (error) {
      results.push({
        url: url,
        wordCount: 0,
        timestamp: new Date().toISOString(),
        status: 'Error: ' + error.toString()
      });
    }
  });
  
  // Log results
  const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Monitor Log');
  results.forEach(result => {
    logSheet.appendRow([
      result.url,
      result.wordCount,
      result.timestamp,
      result.status
    ]);
  });
}
```

## Use Case 5: Data Validation and Cleaning

Use the worker for consistent validation across multiple apps.

### Script
```javascript
function validateAndCleanData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // Skip header
  for (let i = 1; i < data.length; i++) {
    const text = data[i][0];
    
    if (text) {
      // Analyze to check quality
      const analysis = analyzeText(text);
      
      // Flag entries that are too short or too long
      let flag = '';
      if (analysis.wordCount < 10) {
        flag = 'Too short';
      } else if (analysis.wordCount > 1000) {
        flag = 'Too long';
      } else {
        flag = 'OK';
      }
      
      sheet.getRange(i + 1, 2).setValue(flag);
    }
  }
}
```

## Use Case 6: Custom Menu for Power Users

Create a comprehensive menu system for frequent operations.

### Script
```javascript
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('⚡ Worker Utils')
    .addSubMenu(ui.createMenu('📊 Analysis')
      .addItem('Analyze Selection', 'analyzeSelection')
      .addItem('Analyze Sheet', 'analyzeSheetContent')
      .addItem('Batch Analyze', 'batchAnalyzeSelection'))
    .addSubMenu(ui.createMenu('🧪 Testing')
      .addItem('Test Connection', 'testWorkerConnection')
      .addItem('Test All APIs', 'runAllTests'))
    .addSubMenu(ui.createMenu('⚙️ Settings')
      .addItem('Configure Worker URL', 'showConfigDialog')
      .addItem('View API Documentation', 'openAPIDocs'))
    .addToUi();
}

function analyzeSelection() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  const values = range.getValues();
  
  let totalWords = 0;
  let totalChars = 0;
  
  values.forEach(row => {
    row.forEach(cell => {
      if (cell) {
        const analysis = analyzeText(cell.toString());
        totalWords += analysis.wordCount;
        totalChars += analysis.charCount;
      }
    });
  });
  
  SpreadsheetApp.getUi().alert(
    'Analysis Results',
    'Total Words: ' + totalWords + '\n' +
    'Total Characters: ' + totalChars,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showConfigDialog() {
  const html = HtmlService.createHtmlOutput(
    '<p>Current Worker URL: ' + CONFIG.WORKER_URL + '</p>' +
    '<p>To change, edit Config.gs</p>'
  ).setWidth(400).setHeight(200);
  
  SpreadsheetApp.getUi().showModalDialog(html, 'Worker Configuration');
}

function openAPIDocs() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'API Documentation',
    'Open in browser: ' + CONFIG.WORKER_URL + '/doc',
    ui.ButtonSet.OK
  );
}
```

## Use Case 7: Error Handling and Retry Logic

Implement robust error handling for production use.

### Script
```javascript
function callWithRetry(endpoint, method, payload, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      Logger.log('Attempt ' + attempt + ' of ' + maxRetries);
      return callWorkerAPI(endpoint, method, payload);
    } catch (error) {
      lastError = error;
      Logger.log('Attempt ' + attempt + ' failed: ' + error.toString());
      
      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        Logger.log('Retrying in ' + delay + 'ms...');
        Utilities.sleep(delay);
      }
    }
  }
  
  throw new Error('Failed after ' + maxRetries + ' attempts: ' + lastError.toString());
}

// Usage
function analyzeTextWithRetry(text) {
  const payload = { text: text };
  return callWithRetry('/api/text-analysis', 'POST', payload);
}
```

## Performance Tips

1. **Batch operations**: Process multiple items together when possible
2. **Add delays**: Use `Utilities.sleep()` to avoid rate limiting
3. **Cache results**: Store frequently accessed data in Script Properties
4. **Error handling**: Always wrap API calls in try-catch blocks
5. **Logging**: Use `Logger.log()` for debugging, but remove in production

## Security Best Practices

1. **Never log sensitive data**: Don't log API keys, user data, etc.
2. **Validate inputs**: Always validate data before sending to API
3. **Use HTTPS**: Worker URLs should always use HTTPS
4. **Implement authentication**: Add API keys for production
5. **Rate limiting**: Implement client-side rate limiting

## Next Steps

- Explore adding more complex endpoints to the worker
- Integrate with other Google Workspace apps (Docs, Forms, etc.)
- Add authentication and authorization
- Implement caching strategies
- Build custom UI with HTML Service
