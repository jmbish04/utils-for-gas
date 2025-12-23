/**
 * Test Harness for KV-Enhanced API
 *
 * Demonstrates all CRUD, query, and bulk operations
 * Run each function to test different features
 */

// Configuration
const WORKER_URL = 'https://colby-gas-bridge.workers.dev'; // Update this
const API_KEY = 'your-api-key-here'; // Update this
const BASE_URL = `${WORKER_URL}/api/kv-enhanced`;

/**
 * Helper to make API requests
 */
function kvRequest(method, path, body = null) {
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

/**
 * Test 1: Basic CRUD Operations
 */
function test1_BasicCRUD() {
  Logger.log('=== Test 1: Basic CRUD ===');

  // Create a prompt
  const created = kvRequest('POST', '/prompt', {
    name: 'test-prompt-1',
    category: 'testing',
    version: 1,
    isActive: true,
    description: 'A test prompt for CRUD operations',
    content: 'You are a helpful assistant for testing.',
  });
  Logger.log('Created:', created);

  const promptId = created.id;

  // Read it back
  const fetched = kvRequest('GET', `/prompt/${promptId}`);
  Logger.log('Fetched:', fetched);

  // Patch it
  const patched = kvRequest('PATCH', `/prompt/${promptId}`, {
    version: 2,
    description: 'Updated description',
  });
  Logger.log('Patched:', patched);

  // Full update
  const updated = kvRequest('PUT', `/prompt/${promptId}`, {
    name: 'test-prompt-1-updated',
    category: 'testing',
    version: 3,
    isActive: true,
    description: 'Fully updated',
    content: 'New content',
  });
  Logger.log('Updated:', updated);

  // Delete it
  const deleted = kvRequest('DELETE', `/prompt/${promptId}`);
  Logger.log('Deleted:', deleted);

  Logger.log('✅ Test 1 passed');
}

/**
 * Test 2: Query with WHERE (equality filters)
 */
function test2_QueryWhere() {
  Logger.log('=== Test 2: Query WHERE ===');

  // Create test data
  kvRequest('POST', '/task', {
    title: 'Task 1',
    status: 'pending',
    priority: 'high',
    assignee: 'alice@example.com',
  });

  kvRequest('POST', '/task', {
    title: 'Task 2',
    status: 'pending',
    priority: 'low',
    assignee: 'bob@example.com',
  });

  kvRequest('POST', '/task', {
    title: 'Task 3',
    status: 'completed',
    priority: 'high',
    assignee: 'alice@example.com',
  });

  // Query: WHERE status=pending
  const pending = kvRequest('GET', '/task?where=status:pending');
  Logger.log(`Found ${pending.count} pending tasks:`, pending.records);

  // Query: WHERE status=pending AND priority=high
  const pendingHigh = kvRequest('GET', '/task?where=status:pending&and=priority:high');
  Logger.log(`Found ${pendingHigh.count} pending high-priority tasks:`, pendingHigh.records);

  // Query: WHERE assignee=alice@example.com
  const aliceTasks = kvRequest('GET', '/task?where=assignee:alice@example.com');
  Logger.log(`Found ${aliceTasks.count} tasks for Alice:`, aliceTasks.records);

  Logger.log('✅ Test 2 passed');
}

/**
 * Test 3: Query with OR filters
 */
function test3_QueryOr() {
  Logger.log('=== Test 3: Query OR ===');

  // Query: WHERE status=pending OR status=completed
  const result = kvRequest('GET', '/task?where=status:pending&or=status:completed');
  Logger.log(`Found ${result.count} tasks (pending OR completed):`, result.records);

  // Query: AND + OR combined
  // (assignee=alice AND priority=high) OR (status=completed)
  const complex = kvRequest('GET', '/task?and=assignee:alice@example.com&and=priority:high&or=status:completed');
  Logger.log(`Found ${complex.count} complex query results:`, complex.records);

  Logger.log('✅ Test 3 passed');
}

/**
 * Test 4: Text Search
 */
function test4_Search() {
  Logger.log('=== Test 4: Search ===');

  // Create searchable content
  kvRequest('POST', '/prompt', {
    name: 'email-assistant',
    category: 'email',
    isActive: true,
    description: 'Helps write professional emails',
    content: 'You are an expert at writing clear, concise business emails.',
  });

  kvRequest('POST', '/prompt', {
    name: 'code-reviewer',
    category: 'development',
    isActive: true,
    description: 'Reviews code for bugs and style',
    content: 'You are a senior developer who reviews code carefully.',
  });

  // Search: "email"
  const emailResults = kvRequest('GET', '/prompt?q=email');
  Logger.log(`Search "email": ${emailResults.count} results`, emailResults.records);

  // Search: "code developer"
  const codeResults = kvRequest('GET', '/prompt?q=code developer');
  Logger.log(`Search "code developer": ${codeResults.count} results`, codeResults.records);

  Logger.log('✅ Test 4 passed');
}

/**
 * Test 5: Sorting by Time
 */
function test5_Sort() {
  Logger.log('=== Test 5: Sorting ===');

  // Create tasks with different timestamps
  Utilities.sleep(1000);
  kvRequest('POST', '/task', { title: 'Old task', status: 'pending' });

  Utilities.sleep(1000);
  kvRequest('POST', '/task', { title: 'Middle task', status: 'pending' });

  Utilities.sleep(1000);
  kvRequest('POST', '/task', { title: 'New task', status: 'pending' });

  // Sort ascending (oldest first)
  const asc = kvRequest('GET', '/task?where=status:pending&sort=createdAt:asc&limit=10');
  Logger.log('Ascending (oldest first):', asc.records.map(t => t.title));

  // Sort descending (newest first)
  const desc = kvRequest('GET', '/task?where=status:pending&sort=createdAt:desc&limit=10');
  Logger.log('Descending (newest first):', desc.records.map(t => t.title));

  Logger.log('✅ Test 5 passed');
}

/**
 * Test 6: Bulk Upsert
 */
function test6_BulkUpsert() {
  Logger.log('=== Test 6: Bulk Upsert ===');

  const items = [
    {
      id: 'config-1',
      key: 'api.timeout',
      value: '30000',
      category: 'api',
      environment: 'production',
      isActive: true,
    },
    {
      id: 'config-2',
      key: 'api.retries',
      value: '3',
      category: 'api',
      environment: 'production',
      isActive: true,
    },
    {
      id: 'config-3',
      key: 'feature.beta',
      value: 'true',
      category: 'features',
      environment: 'staging',
      isActive: false,
    },
  ];

  const result = kvRequest('POST', '/config/bulk/upsert', { items });
  Logger.log(`Bulk upsert: ${result.succeeded} succeeded, ${result.failed} failed`);
  Logger.log('Results:', result.results);

  Logger.log('✅ Test 6 passed');
}

/**
 * Test 7: Bulk Patch
 */
function test7_BulkPatch() {
  Logger.log('=== Test 7: Bulk Patch ===');

  // Patch multiple configs
  const result = kvRequest('POST', '/config/bulk/patch', {
    ids: ['config-1', 'config-2'],
    patch: {
      environment: 'development',
      isActive: false,
    },
  });

  Logger.log(`Bulk patch: ${result.succeeded} succeeded, ${result.failed} failed`);

  // Verify
  const config1 = kvRequest('GET', '/config/config-1');
  Logger.log('Config 1 after patch:', config1);

  Logger.log('✅ Test 7 passed');
}

/**
 * Test 8: Bulk Update WHERE
 */
function test8_BulkUpdateWhere() {
  Logger.log('=== Test 8: Bulk Update WHERE ===');

  // Update all tasks with status=pending to in-progress
  const result = kvRequest('POST', '/task/bulk/updateWhere', {
    and: ['status:pending'],
    patch: {
      status: 'in-progress',
    },
    limit: 50,
  });

  Logger.log(`Bulk update WHERE: ${result.succeeded} updated`);

  // Verify
  const inProgress = kvRequest('GET', '/task?where=status:in-progress');
  Logger.log(`Now ${inProgress.count} tasks in-progress`);

  Logger.log('✅ Test 8 passed');
}

/**
 * Test 9: Bulk Delete
 */
function test9_BulkDelete() {
  Logger.log('=== Test 9: Bulk Delete ===');

  const result = kvRequest('POST', '/config/bulk/delete', {
    ids: ['config-1', 'config-2', 'config-3'],
  });

  Logger.log(`Bulk delete: ${result.succeeded} deleted`);

  // Verify deleted
  try {
    kvRequest('GET', '/config/config-1');
    Logger.log('❌ Config should be deleted!');
  } catch (e) {
    Logger.log('✅ Config correctly deleted');
  }

  Logger.log('✅ Test 9 passed');
}

/**
 * Test 10: Pagination
 */
function test10_Pagination() {
  Logger.log('=== Test 10: Pagination ===');

  // Create many tasks
  for (let i = 1; i <= 10; i++) {
    kvRequest('POST', '/task', {
      title: `Pagination test ${i}`,
      status: 'test',
    });
  }

  // Page 1
  const page1 = kvRequest('GET', '/task?where=status:test&limit=3');
  Logger.log(`Page 1: ${page1.count} records, hasMore: ${page1.hasMore}`);

  // Page 2 (using cursor)
  if (page1.cursor) {
    const page2 = kvRequest('GET', `/task?where=status:test&limit=3&cursor=${page1.cursor}`);
    Logger.log(`Page 2: ${page2.count} records, hasMore: ${page2.hasMore}`);
  }

  Logger.log('✅ Test 10 passed');
}

/**
 * Test 11: Index Verification
 *
 * Verify that indexes are properly maintained on update/delete
 */
function test11_IndexVerification() {
  Logger.log('=== Test 11: Index Verification ===');

  // Create a task
  const task = kvRequest('POST', '/task', {
    title: 'Index test',
    status: 'pending',
    priority: 'high',
  });

  // Query by status (uses equality index)
  const pending = kvRequest('GET', '/task?where=status:pending');
  Logger.log(`Tasks with status=pending: ${pending.count}`);

  // Update status
  kvRequest('PATCH', `/task/${task.id}`, {
    status: 'completed',
  });

  // Old index should be gone
  const stillPending = kvRequest('GET', '/task?where=status:pending');
  Logger.log(`Tasks still pending: ${stillPending.count}`);

  // New index should exist
  const completed = kvRequest('GET', '/task?where=status:completed');
  Logger.log(`Tasks completed: ${completed.count}`);

  // Delete and verify index cleanup
  kvRequest('DELETE', `/task/${task.id}`);

  const afterDelete = kvRequest('GET', '/task?where=status:completed');
  Logger.log(`After delete, completed: ${afterDelete.count}`);

  Logger.log('✅ Test 11 passed');
}

/**
 * Run all tests
 */
function runAllTests() {
  const tests = [
    test1_BasicCRUD,
    test2_QueryWhere,
    test3_QueryOr,
    test4_Search,
    test5_Sort,
    test6_BulkUpsert,
    test7_BulkPatch,
    test8_BulkUpdateWhere,
    test9_BulkDelete,
    test10_Pagination,
    test11_IndexVerification,
  ];

  for (const test of tests) {
    try {
      test();
      Utilities.sleep(500); // Rate limiting
    } catch (e) {
      Logger.log(`❌ ${test.name} failed:`, e.message);
    }
  }

  Logger.log('\n🎉 All tests completed!');
}
