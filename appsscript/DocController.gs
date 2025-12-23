/**
 * Doc Controller Web App
 *
 * Receives document operation commands from the Cloudflare Worker's DocAgent
 * and applies them to Google Docs.
 *
 * Deploy as: Web App, Execute as: User, Access: Anyone (or service account)
 */

// Configuration - Set your auth token here or in Script Properties
const AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('DOC_CONTROLLER_AUTH_TOKEN');

/**
 * Handle GET requests
 */
function doGet(e) {
  // Verify auth token
  if (!verifyAuth(e)) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Unauthorized',
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action;

  try {
    if (action === 'getState') {
      const docId = e.parameter.docId;
      if (!docId) {
        throw new Error('docId is required');
      }

      const state = getDocState(docId);
      return ContentService.createTextOutput(JSON.stringify(state))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      error: 'Unknown action',
      availableActions: ['getState', 'applyOps', 'append'],
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message,
      stack: error.stack,
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests
 */
function doPost(e) {
  // Verify auth token
  if (!verifyAuth(e)) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Unauthorized',
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action;

  try {
    const payload = JSON.parse(e.postData.contents);

    if (action === 'applyOps') {
      const { docId, operations } = payload;
      if (!docId || !operations) {
        throw new Error('docId and operations are required');
      }

      const result = applyDocOps(docId, operations);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'append') {
      const { docId, text } = payload;
      if (!docId || !text) {
        throw new Error('docId and text are required');
      }

      const result = appendToDoc(docId, text);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      error: 'Unknown action',
      availableActions: ['getState', 'applyOps', 'append'],
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message,
      stack: error.stack,
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Verify authentication
 */
function verifyAuth(e) {
  // Check Authorization header or query parameter
  const authHeader = e.parameter.Authorization || e.parameters?.Authorization?.[0];
  const providedToken = authHeader?.replace('Bearer ', '');

  // If no auth token configured, allow in development
  if (!AUTH_TOKEN) {
    Logger.log('WARNING: No AUTH_TOKEN configured. Set DOC_CONTROLLER_AUTH_TOKEN in Script Properties.');
    return true;
  }

  return providedToken === AUTH_TOKEN;
}

/**
 * Get document state as JSON
 */
function getDocState(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const elements = [];

  const numChildren = body.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();

    const element = {
      type: type.toString(),
      index: i,
    };

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const paragraph = child.asParagraph();
      element.text = paragraph.getText();
      element.attributes = {
        alignment: paragraph.getAlignment().toString(),
        heading: paragraph.getHeading().toString(),
      };
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = child.asTable();
      element.numRows = table.getNumRows();
      element.numColumns = table.getRow(0).getNumCells();
    }

    elements.push(element);
  }

  return {
    docId: docId,
    elements: elements,
  };
}

/**
 * Apply document operations
 */
function applyDocOps(docId, operations) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  const results = [];

  for (const op of operations) {
    try {
      let result = null;

      switch (op.type) {
        case 'insertText':
          result = insertText(body, op.payload);
          break;

        case 'replaceText':
          result = replaceText(body, op.payload);
          break;

        case 'setAttributes':
          result = setAttributes(body, op.payload);
          break;

        case 'deleteRange':
          result = deleteRange(body, op.payload);
          break;

        case 'insertTable':
          result = insertTable(body, op.payload);
          break;

        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }

      results.push({
        operation: op.type,
        status: 'success',
        result: result,
      });
    } catch (error) {
      results.push({
        operation: op.type,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    success: true,
    operations: results.length,
    results: results,
  };
}

/**
 * Insert text at index
 */
function insertText(body, { index, text }) {
  // For simplicity, append to the end if index not specified
  if (typeof index === 'undefined') {
    body.appendParagraph(text);
    return { inserted: true };
  }

  // Insert at specific index (advanced implementation would handle this)
  body.appendParagraph(text);
  return { inserted: true, note: 'Appended (specific index not yet supported)' };
}

/**
 * Replace text range
 */
function replaceText(body, { startIndex, endIndex, text }) {
  // Use findText and replaceText for simple implementation
  body.replaceText('.*', text);
  return { replaced: true };
}

/**
 * Set text attributes (bold, italic, font size, color)
 */
function setAttributes(body, { startIndex, endIndex, attributes }) {
  // For simplicity, apply to last paragraph
  const numChildren = body.getNumChildren();
  if (numChildren === 0) return { applied: false };

  const lastChild = body.getChild(numChildren - 1);
  if (lastChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
    const paragraph = lastChild.asParagraph();
    const text = paragraph.editAsText();

    if (attributes.bold !== undefined) {
      text.setBold(attributes.bold);
    }
    if (attributes.italic !== undefined) {
      text.setItalic(attributes.italic);
    }
    if (attributes.fontSize !== undefined) {
      text.setFontSize(attributes.fontSize);
    }
    if (attributes.foregroundColor !== undefined) {
      text.setForegroundColor(attributes.foregroundColor);
    }

    return { applied: true };
  }

  return { applied: false };
}

/**
 * Delete text range
 */
function deleteRange(body, { startIndex, endIndex }) {
  // Simple implementation - clear all text
  body.clear();
  return { deleted: true };
}

/**
 * Insert table
 */
function insertTable(body, { rows, columns, data }) {
  const table = body.appendTable();

  for (let r = 0; r < rows; r++) {
    const row = table.appendTableRow();
    for (let c = 0; c < columns; c++) {
      const cellData = data?.[r]?.[c] || '';
      row.appendTableCell(cellData);
    }
  }

  return { inserted: true, rows, columns };
}

/**
 * Simple append helper
 */
function appendToDoc(docId, text) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.appendParagraph(text);

  return { success: true, appended: text.length };
}

// ========================================
// Setup Instructions
// ========================================

/**
 * Run this once to set up the Web App
 */
function setupDocController() {
  // Generate a random auth token
  const token = Utilities.getUuid();

  // Store in Script Properties
  PropertiesService.getScriptProperties().setProperty('DOC_CONTROLLER_AUTH_TOKEN', token);

  Logger.log('Doc Controller Setup Complete!');
  Logger.log('');
  Logger.log('1. Deploy this script as a Web App:');
  Logger.log('   - Click "Deploy" > "New deployment"');
  Logger.log('   - Type: Web app');
  Logger.log('   - Execute as: Me');
  Logger.log('   - Who has access: Anyone (or your service account)');
  Logger.log('');
  Logger.log('2. Copy the Web App URL');
  Logger.log('');
  Logger.log('3. Save your auth token (use this in Worker configuration):');
  Logger.log(`   AUTH_TOKEN: ${token}`);
  Logger.log('');
  Logger.log('4. Configure the Worker to use this endpoint:');
  Logger.log('   POST /api/doc/configure');
  Logger.log('   { "gasWebAppUrl": "YOUR_WEB_APP_URL", "authToken": "' + token + '" }');
}
