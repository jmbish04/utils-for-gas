# KV Storage Guide

Schema-less key-value storage as a high-performance alternative to using Google Sheets as a database.

## Why Use KV Instead of Sheets?

### ✅ When to Use KV

- **High-frequency reads/writes**: KV is 100-1000x faster than Sheets
- **Simple data structures**: JSON objects without complex relational needs
- **API-driven access**: No need for manual spreadsheet editing
- **No schema changes**: Add/remove fields without updating structure
- **Automatic metadata**: Created/updated timestamps tracked automatically
- **Temporary data**: Optional TTL for auto-expiring records

### ⚠️ When to Use Sheets Instead

- **Human editing**: Users need to manually edit data in a UI
- **Complex formulas**: Need Sheets built-in formula capabilities
- **Data visualization**: Want to use Sheets charts and pivot tables
- **Large reports**: Generating reports with thousands of rows
- **Audit trails**: Need version history and edit tracking

## Basic Usage

### 1. Simple Key-Value Operations

```javascript
const client = new WorkerClient(WORKER_URL, API_KEY);

// Set a value
client.kvSet('config:app-version', '1.2.3');

// Get a value
const result = client.kvGet('config:app-version');
Logger.log(result.value); // "1.2.3"

// Delete a value
client.kvDelete('config:app-version');
```

### 2. Storing Complex Objects

```javascript
// Store a user profile
client.kvSet('user:alice@example.com', {
  name: 'Alice Smith',
  role: 'admin',
  department: 'Engineering',
  preferences: {
    theme: 'dark',
    notifications: true,
  },
});

// Retrieve it
const user = client.kvGet('user:alice@example.com');
Logger.log(user.value.name); // "Alice Smith"
Logger.log(user.value.preferences.theme); // "dark"
```

### 3. Metadata and TTL

```javascript
// Set with metadata and expiration
client.kvSet('session:abc123', {
  userId: 'alice@example.com',
  loginTime: Date.now(),
}, {
  metadata: {
    tags: ['active', 'web'],
    ipAddress: '192.168.1.1',
  },
  expirationTtl: 3600, // Expire in 1 hour
});

// Metadata is automatically included
const session = client.kvGet('session:abc123');
Logger.log(session.metadata.createdAt);
Logger.log(session.metadata.tags);
```

## Sheets-Like Interface

The most powerful feature: use KV like a spreadsheet with namespaces (tables) and rows.

### Append Rows (Like Adding to a Sheet)

```javascript
// Create a "tasks" table
client.kvAppendRow('tasks', {
  title: 'Review proposal',
  status: 'pending',
  assignee: 'jane@example.com',
  priority: 'high',
});

client.kvAppendRow('tasks', {
  title: 'Update documentation',
  status: 'in-progress',
  assignee: 'john@example.com',
  priority: 'medium',
});

// Each row gets a unique, auto-generated ID
// Format: namespace:timestamp-random
// Example: tasks:1703347200000-abc123
```

### Read All Rows (Like Reading a Sheet)

```javascript
// Get all tasks
const allTasks = client.kvGetAllRows('tasks');

allTasks.forEach(task => {
  Logger.log(`[${task.status}] ${task.title} - ${task.assignee}`);
  Logger.log(`  ID: ${task.id}`);
  Logger.log(`  Created: ${new Date(task._metadata.createdAt)}`);
});
```

### Search/Filter Rows

```javascript
// Find all pending tasks
const pendingTasks = client.kvFindRows('tasks', 'pending', 'status');
Logger.log(`Found ${pendingTasks.length} pending tasks`);

// Search across all fields
const janeTasks = client.kvFindRows('tasks', 'jane@example.com');
Logger.log(`Found ${janeTasks.length} tasks for Jane`);
```

### Update Rows

```javascript
// Get all tasks
const tasks = client.kvGetAllRows('tasks');

// Update the first task
if (tasks.length > 0) {
  const task = tasks[0];

  client.kvUpdateRow(task.id, {
    title: task.title,
    status: 'completed', // Updated!
    assignee: task.assignee,
    priority: task.priority,
    completedAt: Date.now(),
  });
}
```

### Delete Rows

```javascript
// Delete a specific task
const tasks = client.kvGetAllRows('tasks');
if (tasks.length > 0) {
  client.kvDeleteRow(tasks[0].id);
}

// Clear entire namespace (like clearing a sheet)
client.kvClearNamespace('tasks', true); // confirm = true required
```

## Real-World Examples

### Example 1: Email Processing Tracker

Replace a tracking spreadsheet with KV:

```javascript
function processEmails() {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  // Get threads from Gmail
  const threads = GmailApp.search('is:unread label:to-process', 0, 50);

  for (const thread of threads) {
    const threadId = thread.getId();

    // Check if already processed (faster than Sheets lookup)
    const processed = client.kvGet(`processed:${threadId}`);

    if (processed.exists) {
      Logger.log(`Skipping already processed: ${threadId}`);
      continue;
    }

    // Process the thread
    processThread(thread);

    // Mark as processed
    client.kvSet(`processed:${threadId}`, {
      processedAt: Date.now(),
      subject: thread.getFirstMessageSubject(),
      messageCount: thread.getMessageCount(),
    }, {
      expirationTtl: 86400 * 30, // Keep for 30 days
    });
  }
}
```

### Example 2: User Preferences Storage

Store user preferences without a database:

```javascript
function saveUserPreference(email, key, value) {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  // Get existing preferences
  const result = client.kvGet(`prefs:${email}`);
  const prefs = result.exists ? result.value : {};

  // Update preference
  prefs[key] = value;

  // Save back
  client.kvSet(`prefs:${email}`, prefs);
}

function getUserPreference(email, key, defaultValue = null) {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  const result = client.kvGet(`prefs:${email}`);
  if (!result.exists) return defaultValue;

  return result.value[key] || defaultValue;
}

// Usage
saveUserPreference('alice@example.com', 'theme', 'dark');
saveUserPreference('alice@example.com', 'language', 'en');

const theme = getUserPreference('alice@example.com', 'theme', 'light');
Logger.log(`Theme: ${theme}`); // "dark"
```

### Example 3: Task Queue

Implement a simple task queue:

```javascript
function addTask(taskData) {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  const result = client.kvAppendRow('queue', {
    ...taskData,
    status: 'pending',
    addedAt: Date.now(),
  });

  Logger.log(`Task added: ${result.id}`);
  return result.id;
}

function getNextTask() {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  // Get all pending tasks
  const tasks = client.kvFindRows('queue', 'pending', 'status');

  if (tasks.length === 0) {
    return null;
  }

  // Get oldest task (auto-sorted by timestamp in ID)
  const task = tasks[0];

  // Mark as in-progress
  client.kvUpdateRow(task.id, {
    ...task,
    status: 'in-progress',
    startedAt: Date.now(),
  });

  return task;
}

function completeTask(taskId, result) {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  const task = client.kvGet(taskId).value;

  client.kvUpdateRow(taskId, {
    ...task,
    status: 'completed',
    completedAt: Date.now(),
    result: result,
  });
}

// Usage
addTask({ action: 'send-email', to: 'user@example.com' });
addTask({ action: 'generate-report', reportId: '123' });

// Process tasks
const task = getNextTask();
if (task) {
  Logger.log(`Processing: ${task.action}`);
  // ... do work ...
  completeTask(task.id, { success: true });
}
```

### Example 4: Rate Limiting / Throttling

Track API usage per user:

```javascript
function checkRateLimit(email, maxRequestsPerHour = 100) {
  const client = new WorkerClient(WORKER_URL, API_KEY);

  const now = Date.now();
  const hourAgo = now - 3600000;

  // Get request count
  const result = client.kvGet(`ratelimit:${email}`);

  if (!result.exists) {
    // First request
    client.kvSet(`ratelimit:${email}`, {
      count: 1,
      resetAt: now + 3600000,
    }, {
      expirationTtl: 3600, // Auto-reset after 1 hour
    });
    return true;
  }

  const data = result.value;

  if (data.count >= maxRequestsPerHour) {
    Logger.log(`Rate limit exceeded for ${email}`);
    return false;
  }

  // Increment count
  client.kvSet(`ratelimit:${email}`, {
    count: data.count + 1,
    resetAt: data.resetAt,
  }, {
    expirationTtl: 3600,
  });

  return true;
}

// Usage
if (checkRateLimit('alice@example.com')) {
  // Proceed with request
} else {
  // Deny request
}
```

## Advanced Operations

### Bulk Operations

```javascript
// Get multiple keys at once
const users = client.kvGetBulk([
  'user:alice@example.com',
  'user:bob@example.com',
  'user:charlie@example.com',
]);

// Delete multiple keys at once
client.kvDeleteBulk([
  'temp:session1',
  'temp:session2',
  'temp:session3',
]);
```

### List Operations

```javascript
// List all keys with a prefix
const configKeys = client.kvList('config:', 100);
Logger.log(`Found ${configKeys.keys.length} config keys`);

// List keys with values (more expensive)
const allConfigs = client.kvListValues('config:', 50);
allConfigs.records.forEach(record => {
  Logger.log(`${record.key}: ${JSON.stringify(record.value)}`);
});
```

### Search with Options

```javascript
// Case-sensitive search
const results = client.kvSearch('Important', {
  prefix: 'tasks:',
  field: 'title',
  caseSensitive: true,
  limit: 20,
});

// Search across all fields
const results = client.kvSearch('urgent', {
  prefix: 'tasks:',
  limit: 50,
});
```

## Performance Tips

1. **Use prefixes for namespacing**: `users:`, `tasks:`, `config:` - makes listing faster
2. **Limit list operations**: KV list is fast, but don't fetch thousands of records
3. **Use TTL for temporary data**: Auto-cleanup reduces storage costs
4. **Batch operations**: Use bulk get/delete when possible
5. **Cache locally**: If reading same data multiple times, cache in memory

## Cost Comparison

**Sheets API:**
- Read quota: 100 requests/100 seconds (36,000/hour)
- Write quota: 100 requests/100 seconds
- Latency: 500-2000ms per request

**Cloudflare KV (Paid Plan $5/mo):**
- Read quota: Unlimited (eventually consistent)
- Write quota: Unlimited
- Latency: <50ms for reads, <100ms for writes
- Storage: Included in plan

**Bottom line**: For high-frequency operations, KV is 10-100x faster and more reliable.

## Migration from Sheets

### Before (Sheets):

```javascript
function getUser(email) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Users');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return {
        email: data[i][0],
        name: data[i][1],
        role: data[i][2],
      };
    }
  }

  return null;
}
```

### After (KV):

```javascript
function getUser(email) {
  const client = new WorkerClient(WORKER_URL, API_KEY);
  const result = client.kvGet(`user:${email}`);
  return result.exists ? result.value : null;
}
```

**Performance improvement: 10-100x faster! 🚀**

## Troubleshooting

### "Key not found"

```javascript
const result = client.kvGet('missing-key');
if (!result.exists) {
  Logger.log('Key does not exist');
}
```

### "Rate limit exceeded"

KV has very high limits, but if you hit them:
- Use bulk operations instead of individual requests
- Implement client-side caching
- Consider upgrading plan

### "Eventual consistency"

KV is eventually consistent globally:
- Writes are immediately visible in the same region
- May take 60 seconds to propagate globally
- For strong consistency, use D1 instead

## Next Steps

- See `WorkerClient.gs` for full API reference
- Check `DEPLOYMENT.md` for setup instructions
- Review `EXAMPLES.md` for more use cases

---

**Pro Tip**: Start by replacing your most-queried Sheet lookups with KV, then gradually migrate more use cases as you see the performance benefits!
