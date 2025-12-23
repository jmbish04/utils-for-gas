# KV-Enhanced: Production-Grade SQL-ish Storage Layer

A sophisticated indexing and query system built on Cloudflare Workers KV, providing SQL-like operations with automatic index maintenance.

## Overview

**KV-Enhanced** transforms schema-less KV storage into a queryable database with:

- **Secondary Indexes**: Equality filters, time-based sorting, full-text search
- **SQL-like Operations**: WHERE (AND/OR), search, sort, pagination
- **Automatic Index Maintenance**: Indexes are updated transparently on all CRUD operations
- **Type Configuration**: Define "tables" with indexing behavior
- **Bulk Operations**: Batch create/update/delete with per-item error handling
- **Production-Ready**: Proper validation, error handling, efficiency optimizations

## Key Schema

All data uses a deterministic key schema with prefixes:

### Primary Record
```
obj:<type>:<id>
```
Stores the full record JSON.

**Example**: `obj:prompt:abc123` → `{ id: "abc123", name: "email-helper", category: "email", ... }`

### Equality Index
```
idx:<type>:<field>:<value>:<id>
```
Enables WHERE queries on indexed fields.

**Example**: `idx:prompt:category:email:abc123` → `1`

**Query**: Find all prompts where `category=email` by listing keys with prefix `idx:prompt:category:email:`

### Time Index (Ascending)
```
ts:<type>:<field>:<ISO-timestamp>:<id>
```
Enables sorting by time fields (oldest first).

**Example**: `ts:prompt:createdAt:2025-12-23T10:00:00.000Z:abc123` → `1`

**Query**: Sort by `createdAt` ascending by listing keys with prefix `ts:prompt:createdAt:` (lexicographic order = chronological order)

### Time Index (Descending)
```
ts-desc:<type>:<field>:<reverse-timestamp>:<id>
```
Enables sorting by time fields (newest first).

**Example**: `ts-desc:prompt:createdAt:7974-01-08T14:00:00.000Z:abc123` → `1`

**Query**: Sort by `createdAt` descending by listing keys with prefix `ts-desc:prompt:createdAt:`

(Reverse timestamp = `9999-12-31T23:59:59.999Z - original timestamp`)

### Inverted Search Index
```
inv:<type>:<field>:<token>:<id>
```
Enables full-text search on text fields.

**Example**: `inv:prompt:description:email:abc123` → `1`

**Query**: Search for "email" in `description` by listing keys with prefix `inv:prompt:description:email:`

## Type Configuration

Types define how records are indexed. Each type specifies:

- **indexedFields**: Fields with equality indexes (for WHERE queries)
- **timeFields**: Fields with time indexes (for sorting)
- **searchFields**: Fields with inverted indexes (for text search)
- **stopwords**: Optional custom stopwords for search tokenization
- **maxValueLength**: Max length for indexed field values (default: 1000)
- **maxRecordSize**: Max total record size in bytes (default: 100KB)

### Built-in Types

#### `prompt` - AI Prompt Templates
```typescript
{
  indexedFields: ['category', 'isActive', 'version'],
  timeFields: ['createdAt', 'updatedAt'],
  searchFields: ['name', 'description', 'content'],
  maxRecordSize: 100 * 1024,
}
```

**Fields**: `id`, `name`, `category`, `version`, `isActive`, `description`, `content`, `createdAt`, `updatedAt`

#### `config` - Configuration Settings
```typescript
{
  indexedFields: ['key', 'category', 'environment', 'isActive'],
  timeFields: ['createdAt', 'updatedAt'],
  searchFields: ['key', 'description'],
  maxRecordSize: 10 * 1024,
}
```

**Fields**: `id`, `key`, `value`, `category`, `environment`, `isActive`, `description`, `createdAt`, `updatedAt`

#### `user` - User Profiles
```typescript
{
  indexedFields: ['email', 'role', 'status'],
  timeFields: ['createdAt', 'lastLogin'],
  searchFields: ['name', 'email'],
  maxRecordSize: 50 * 1024,
}
```

**Fields**: `id`, `email`, `name`, `role`, `status`, `lastLogin`, `metadata`, `createdAt`, `updatedAt`

#### `task` - Task/Todo Items
```typescript
{
  indexedFields: ['status', 'priority', 'assignee'],
  timeFields: ['createdAt', 'updatedAt', 'dueDate'],
  searchFields: ['title', 'description'],
  maxRecordSize: 50 * 1024,
}
```

**Fields**: `id`, `title`, `description`, `status`, `priority`, `assignee`, `dueDate`, `completedAt`, `createdAt`, `updatedAt`

### Adding a New Type

1. **Edit** `worker/src/kv/types.ts`
2. **Add** your type to `TYPE_CONFIGS`:

```typescript
export const TYPE_CONFIGS: Record<string, TypeConfig> = {
  // ... existing types

  article: {
    indexedFields: ['author', 'category', 'published'],
    timeFields: ['createdAt', 'publishedAt'],
    searchFields: ['title', 'summary', 'content'],
    stopwords: DEFAULT_STOPWORDS, // or custom list
    maxValueLength: 1000,
    maxRecordSize: 500 * 1024, // 500KB for long articles
  },
};
```

3. **Deploy**: `npm run worker:deploy`

That's it! The system will automatically:
- Create indexes for `indexedFields` on create/update
- Maintain time indexes for `timeFields`
- Tokenize and index `searchFields` for full-text search
- Clean up indexes on delete

## API Reference

All endpoints are under `/api/kv-enhanced`.

### Authentication

All requests require the Worker API key:

```bash
-H "X-API-Key: YOUR_API_KEY"
```

### CRUD Operations

#### Get by ID
```bash
GET /api/kv-enhanced/:type/:id

curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt/abc123" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response**:
```json
{
  "id": "abc123",
  "name": "email-helper",
  "category": "email",
  "version": 1,
  "isActive": true,
  "description": "Helps write professional emails",
  "content": "You are an expert at writing clear, concise business emails.",
  "createdAt": "2025-12-23T10:00:00.000Z",
  "updatedAt": "2025-12-23T10:00:00.000Z"
}
```

#### Create (Server-Generated ID)
```bash
POST /api/kv-enhanced/:type

curl -X POST "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "email-helper",
    "category": "email",
    "version": 1,
    "isActive": true,
    "description": "Helps write professional emails",
    "content": "You are an expert at writing clear, concise business emails."
  }'
```

**Response**: Same as Get by ID (with generated ID)

#### Upsert (Client-Provided ID)
```bash
PUT /api/kv-enhanced/:type/:id

curl -X PUT "https://colby-gas-bridge.workers.dev/api/kv-enhanced/config/api-timeout" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "api.timeout",
    "value": "30000",
    "category": "api",
    "environment": "production",
    "isActive": true
  }'
```

Creates if doesn't exist, updates if it does.

#### Partial Update (Patch)
```bash
PATCH /api/kv-enhanced/:type/:id

curl -X PATCH "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt/abc123" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 2,
    "description": "Updated description"
  }'
```

Merges provided fields with existing record.

#### Delete
```bash
DELETE /api/kv-enhanced/:type/:id

curl -X DELETE "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt/abc123" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response**:
```json
{
  "success": true
}
```

### Query Operations

#### Query with WHERE (AND filters)
```bash
GET /api/kv-enhanced/:type?where=field:value&and=field2:value2

# Find all active prompts in the "email" category
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt?where=category:email&and=isActive:true" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response**:
```json
{
  "records": [
    { "id": "abc123", "name": "email-helper", ... },
    { "id": "def456", "name": "email-formatter", ... }
  ],
  "count": 2,
  "hasMore": false
}
```

#### Query with OR filters
```bash
GET /api/kv-enhanced/:type?where=field:value&or=field:value2

# Find tasks that are either pending or in-progress
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?where=status:pending&or=status:in-progress" \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Combined AND + OR
```bash
# (assignee=alice AND priority=high) OR (status=completed)
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?and=assignee:alice@example.com&and=priority:high&or=status:completed" \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Full-Text Search
```bash
GET /api/kv-enhanced/:type?q=search+terms

# Search prompts for "email professional"
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/prompt?q=email+professional" \
  -H "X-API-Key: YOUR_API_KEY"
```

Searches across all `searchFields` defined in the type config.

#### Search Specific Fields
```bash
GET /api/kv-enhanced/:type?q=search+terms&searchFields=field1,field2

# Search only in title and description
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?q=bug+fix&searchFields=title,description" \
  -H "X-API-Key: YOUR_API_KEY"
```

#### Sorting
```bash
GET /api/kv-enhanced/:type?sort=field:asc
GET /api/kv-enhanced/:type?sort=field:desc

# Get newest tasks first
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?sort=createdAt:desc&limit=10" \
  -H "X-API-Key: YOUR_API_KEY"
```

Sorting only works on `timeFields` defined in the type config.

#### Pagination
```bash
GET /api/kv-enhanced/:type?limit=10
GET /api/kv-enhanced/:type?limit=10&cursor=CURSOR_TOKEN

# Page 1
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?where=status:pending&limit=10" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response**:
```json
{
  "records": [ /* 10 records */ ],
  "count": 10,
  "hasMore": true,
  "cursor": "dHM6dGFzazpjcmVhdGVkQXQ6MjAyNS0xMi0yM1QxMDowMDowMC4wMDBaOnh5ejc4OQ=="
}
```

**Page 2**:
```bash
curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task?where=status:pending&limit=10&cursor=dHM6dGFzazpjcmVhdGVkQXQ6MjAyNS0xMi0yM1QxMDowMDowMC4wMDBaOnh5ejc4OQ==" \
  -H "X-API-Key: YOUR_API_KEY"
```

### Bulk Operations

#### Bulk Upsert
```bash
POST /api/kv-enhanced/:type/bulk/upsert

curl -X POST "https://colby-gas-bridge.workers.dev/api/kv-enhanced/config/bulk/upsert" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "config-1",
        "key": "api.timeout",
        "value": "30000",
        "category": "api",
        "environment": "production",
        "isActive": true
      },
      {
        "id": "config-2",
        "key": "api.retries",
        "value": "3",
        "category": "api",
        "environment": "production",
        "isActive": true
      }
    ]
  }'
```

**Response**:
```json
{
  "results": [
    { "ok": true, "id": "config-1", "operation": "created" },
    { "ok": true, "id": "config-2", "operation": "updated" }
  ],
  "succeeded": 2,
  "failed": 0
}
```

#### Bulk Patch (by IDs)
```bash
POST /api/kv-enhanced/:type/bulk/patch

curl -X POST "https://colby-gas-bridge.workers.dev/api/kv-enhanced/config/bulk/patch" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["config-1", "config-2"],
    "patch": {
      "environment": "staging",
      "isActive": false
    }
  }'
```

#### Bulk Update WHERE
```bash
POST /api/kv-enhanced/:type/bulk/updateWhere

# Update all pending tasks to in-progress
curl -X POST "https://colby-gas-bridge.workers.dev/api/kv-enhanced/task/bulk/updateWhere" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "and": ["status:pending"],
    "patch": {
      "status": "in-progress"
    },
    "limit": 50
  }'
```

#### Bulk Delete (by IDs)
```bash
POST /api/kv-enhanced/:type/bulk/delete

curl -X POST "https://colby-gas-bridge.workers.dev/api/kv-enhanced/config/bulk/delete" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["config-1", "config-2", "config-3"]
  }'
```

### List Types
```bash
GET /api/kv-enhanced/types

curl "https://colby-gas-bridge.workers.dev/api/kv-enhanced/types" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Response**:
```json
{
  "types": ["prompt", "config", "user", "task"]
}
```

## Apps Script Integration

### Setup

Copy the test harness from `appsscript/KV_Enhanced_Test.gs` and update:

```javascript
const WORKER_URL = 'https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev';
const API_KEY = 'your-api-key-here';
```

### Helper Function

```javascript
function kvRequest(method, path, body = null) {
  const BASE_URL = `${WORKER_URL}/api/kv-enhanced`;

  const options = {
    method: method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  };

  if (body) {
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(`${BASE_URL}${path}`, options);
  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code >= 400) {
    throw new Error(`Request failed (${code}): ${text}`);
  }

  return JSON.parse(text);
}
```

### Examples

#### Create a Task
```javascript
function createTask() {
  const task = kvRequest('POST', '/task', {
    title: 'Fix bug in login flow',
    description: 'Users are unable to log in with SSO',
    status: 'pending',
    priority: 'high',
    assignee: 'alice@example.com',
  });

  Logger.log('Created task:', task.id);
}
```

#### Query Pending Tasks
```javascript
function getPendingTasks() {
  const result = kvRequest('GET', '/task?where=status:pending&sort=createdAt:desc&limit=10');

  Logger.log(`Found ${result.count} pending tasks`);

  result.records.forEach(task => {
    Logger.log(`- [${task.priority}] ${task.title}`);
  });
}
```

#### Search Prompts
```javascript
function searchPrompts(query) {
  const result = kvRequest('GET', `/prompt?q=${encodeURIComponent(query)}`);

  Logger.log(`Found ${result.count} prompts matching "${query}"`);

  return result.records;
}
```

#### Bulk Update
```javascript
function markTasksAsCompleted(taskIds) {
  const result = kvRequest('POST', '/task/bulk/patch', {
    ids: taskIds,
    patch: {
      status: 'completed',
      completedAt: new Date().toISOString(),
    },
  });

  Logger.log(`Updated ${result.succeeded} tasks`);

  if (result.failed > 0) {
    result.results.forEach(r => {
      if (!r.ok) {
        Logger.log(`Failed to update ${r.id}: ${r.error}`);
      }
    });
  }
}
```

## Query Patterns

### Simple Equality
```
WHERE field=value
→ /type?where=field:value
```

### Multiple AND Conditions
```
WHERE field1=value1 AND field2=value2
→ /type?where=field1:value1&and=field2:value2
```

### OR Conditions
```
WHERE field=value1 OR field=value2
→ /type?where=field:value1&or=field:value2
```

### Combined AND + OR
```
WHERE (field1=value1 AND field2=value2) OR field3=value3
→ /type?and=field1:value1&and=field2:value2&or=field3:value3
```

**Note**: All `and` filters are evaluated first (intersection), then combined with `or` filters (union).

### Search
```
WHERE text CONTAINS 'search terms'
→ /type?q=search+terms
```

### Search + Filter
```
WHERE category='email' AND text CONTAINS 'professional'
→ /type?where=category:email&q=professional
```

### Sort
```
ORDER BY createdAt DESC
→ /type?sort=createdAt:desc
```

### Limit
```
LIMIT 20
→ /type?limit=20
```

### Pagination
```
LIMIT 20 OFFSET cursor
→ /type?limit=20&cursor=CURSOR_TOKEN
```

## Tradeoffs vs SQL

### What You Gain

✅ **No Connection Overhead**: KV operations are extremely fast (single-digit milliseconds)

✅ **Serverless Simplicity**: No database server to manage, no connection pools

✅ **Global Edge Distribution**: Data is replicated to Cloudflare's edge network

✅ **Cost-Effective**: Included in Workers Paid plan ($5/mo), scales automatically

✅ **Schema Flexibility**: Add fields anytime without migrations

### What You Lose

❌ **No JOINs**: Each type is independent, no foreign keys or relations

❌ **No Transactions**: Operations are eventually consistent, no ACID guarantees

❌ **Limited Query Complexity**: No nested queries, subqueries, or computed fields

❌ **No Aggregations**: No COUNT(*), SUM(), AVG(), GROUP BY, etc.

❌ **Index Overhead**: Every indexed field creates additional KV writes (index maintenance)

❌ **Storage Limits**:
- Max key size: 512 bytes
- Max value size: 25 MB
- Recommended record size: < 100 KB

### When to Use KV-Enhanced

**Good Use Cases**:
- Configuration storage (feature flags, settings)
- User profiles and metadata
- Content management (articles, prompts, templates)
- Task/todo lists
- Activity logs (with time-based queries)
- Simple catalogs (products, resources)

**Bad Use Cases**:
- Financial transactions (need ACID)
- Complex relational data (need JOINs)
- Analytics queries (need aggregations)
- Real-time collaboration (need immediate consistency)
- Large datasets (> 10,000 records per type)

### When to Use D1 (SQL) Instead

Use D1 if you need:
- ACID transactions
- Complex queries with JOINs
- Aggregations (COUNT, SUM, GROUP BY)
- Immediate consistency
- Traditional relational modeling

**You can use both!** D1 for transactional data, KV-Enhanced for flexible metadata.

## Performance Characteristics

### Read Operations

- **Get by ID**: ~5-10ms (single KV read)
- **Query with WHERE**: ~20-50ms (index scan + object fetches)
- **Search**: ~50-100ms (inverted index scans + ranking + object fetches)
- **Sort**: ~30-60ms (time index scan + object fetches)

### Write Operations

- **Create**: ~50-100ms (1 primary write + N index writes)
- **Update**: ~50-150ms (1 primary write + diff-based index updates)
- **Delete**: ~50-100ms (1 primary delete + N index deletes)

**Index Overhead**:
- Each indexed field: +1 KV write on create
- Each time field: +2 KV writes (ascending + descending)
- Each search field: +M KV writes (M = number of unique tokens)

**Example**: Creating a `prompt` with 3 indexed fields, 2 time fields, and 3 search fields with 20 unique tokens:
- Primary: 1 write
- Indexed fields: 3 writes
- Time fields: 4 writes (2 ascending + 2 descending)
- Search tokens: 60 writes (3 fields × 20 tokens)
- **Total: ~68 KV writes per create**

### Limits

- **Max query results**: 200 records
- **Max bulk operation size**: 100 items
- **Max cursor lifetime**: 1 hour (cursors expire)
- **Max token length**: 50 characters
- **Min token length**: 2 characters
- **Default stopwords**: ~50 common words filtered out

### Optimization Tips

1. **Index Sparingly**: Only index fields you'll query on
2. **Limit Search Fields**: Text search is expensive (many KV writes)
3. **Use Pagination**: Don't fetch all results at once
4. **Batch Writes**: Use bulk operations when updating multiple records
5. **Filter Early**: Use WHERE filters before search to reduce result set
6. **Consider D1**: If you need complex queries or aggregations

## How It Works

### Index Maintenance on Create

1. **Generate ID** (if not provided)
2. **Add timestamps** (`createdAt`, `updatedAt`)
3. **Write primary record**: `obj:<type>:<id>`
4. **Create equality indexes** for each indexed field: `idx:<type>:<field>:<value>:<id>`
5. **Create time indexes** for each time field:
   - Ascending: `ts:<type>:<field>:<timestamp>:<id>`
   - Descending: `ts-desc:<type>:<field>:<reverseTimestamp>:<id>`
6. **Tokenize and index** each search field: `inv:<type>:<field>:<token>:<id>`

### Index Maintenance on Update

1. **Fetch old record**
2. **Merge with updates**, update `updatedAt`
3. **Write primary record**
4. **Diff indexed fields**: remove old indexes, add new indexes
5. **Diff time fields**: remove old time indexes, add new time indexes
6. **Diff search tokens**: remove old token indexes, add new token indexes

**Optimization**: Only indexes that changed are updated (incremental maintenance).

### Index Cleanup on Delete

1. **Fetch record** (to know which indexes exist)
2. **Delete primary record**
3. **Delete all equality indexes**
4. **Delete all time indexes** (both ascending and descending)
5. **Delete all inverted search indexes**

### Query Execution

**WHERE (AND filters)**:
1. For each filter, list keys with prefix `idx:<type>:<field>:<value>:`
2. Extract IDs from each set
3. Intersect all ID sets (smallest first for efficiency)
4. Fetch records for remaining IDs

**OR filters**:
1. Union of ID sets from each OR condition

**Search**:
1. Tokenize query string
2. For each token, list keys with prefix `inv:<type>:<field>:<token>:`
3. Union all ID sets
4. Rank by: token matches × field weight + recency bonus
5. Fetch top N records

**Sort**:
1. List keys with prefix `ts:<type>:<field>:` (ascending) or `ts-desc:<type>:<field>:` (descending)
2. Extract IDs in order
3. Fetch records

**Combined**:
1. Execute AND filters → ID set A
2. Execute OR filters → ID set B
3. Union A and B → ID set C
4. If search query: execute search → ID set D, intersect with C
5. If sort: apply time index ordering
6. Paginate and fetch

## Testing

A comprehensive test harness is available in `appsscript/KV_Enhanced_Test.gs`.

### Run Individual Tests

```javascript
test1_BasicCRUD();          // Create, Read, Update, Patch, Delete
test2_QueryWhere();         // WHERE with AND filters
test3_QueryOr();            // OR filters
test4_Search();             // Full-text search
test5_Sort();               // Time-based sorting
test6_BulkUpsert();         // Bulk create/update
test7_BulkPatch();          // Bulk patch by IDs
test8_BulkUpdateWhere();    // Bulk update matching filters
test9_BulkDelete();         // Bulk delete by IDs
test10_Pagination();        // Cursor-based pagination
test11_IndexVerification(); // Verify index maintenance
```

### Run All Tests

```javascript
runAllTests();
```

**Expected output**: All tests should pass with ✅

## Migration from Basic KV

If you're using the basic KV API (`/api/kv/`), here's how to migrate:

### Basic KV (Old)
```javascript
// Set a value
client.kvSet('users:alice', { name: 'Alice', role: 'admin' });

// Get a value
const user = client.kvGet('users:alice');

// List keys
const keys = client.kvList('users:');
```

### KV-Enhanced (New)
```javascript
// Create a user (with automatic indexing)
kvRequest('POST', '/user', {
  id: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
  status: 'active',
});

// Get by ID
const user = kvRequest('GET', '/user/alice');

// Query by role
const admins = kvRequest('GET', '/user?where=role:admin');
```

**Benefits**:
- Automatic timestamp management
- Queryable fields (no need to fetch all records and filter)
- Full-text search
- Bulk operations
- Proper validation and error handling

## Security

### API Key Protection

- Store API keys in Script Properties: `PropertiesService.getScriptProperties().setProperty('WORKER_API_KEY', 'your-key')`
- Never hardcode keys in scripts
- Rotate keys regularly: `wrangler secret put WORKER_API_KEY`

### Field Validation

- Max field value length: 1000 characters (configurable per type)
- Max record size: 100 KB (configurable per type)
- Type validation: Unknown types are rejected
- ID validation: Alphanumeric, dash, underscore only (max 100 chars)

### Rate Limiting

KV-Enhanced uses Cloudflare Workers' built-in rate limiting (1000 req/min default).

For additional protection:
- Implement rate limiting in auth middleware
- Use Cloudflare Access for authentication
- Monitor telemetry for unusual patterns

## Support

- **API Documentation**: `/doc` endpoint
- **Test Harness**: `appsscript/KV_Enhanced_Test.gs`
- **Type Definitions**: `worker/src/kv/types.ts`
- **Query Engine**: `worker/src/kv/query.ts`

For issues or feature requests, open an issue on GitHub.
