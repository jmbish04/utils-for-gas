# Colby-GAS-Bridge

A dual-ecosystem platform connecting **Cloudflare Workers** and **Google Apps Script** for powerful serverless automation.

## Overview

**Colby-GAS-Bridge** provides a comprehensive infrastructure for building sophisticated Apps Script applications with modern backend capabilities:

- **AI Services**: Llama 3.3, Vision, and Scout models with transcript logging
- **Gmail Metadata**: Deduplication and semantic search using Vectorize
- **Doc Controller Agent**: Markdown-to-Doc conversion with natural language editing
- **KV Storage**: Production-grade SQL-ish layer with indexes, search, and bulk operations
- **Telemetry**: Comprehensive request tracking and analytics
- **Dashboard**: React-based UI with True Dark theme

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker (Core)                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   AI API     │  │  Gmail API   │  │   Doc Agent  │      │
│  │   (Llama)    │  │  (Vectorize) │  │  (Durable)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           KV-Enhanced (SQL-ish Storage Layer)        │   │
│  │     Indexes, Search, Bulk Ops, WHERE/AND/OR          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Telemetry Middleware (D1)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │     React Dashboard (Remix + Vite + Workers Assets)  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API
                        │ (authenticated)
┌───────────────────────┴─────────────────────────────────────┐
│              Google Apps Script (Clients)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WorkerClient.gs (Copy-Pasteable Utility Class)     │   │
│  │  - AI generation, Gmail sync, Doc operations        │   │
│  │  - Auto-injects telemetry headers                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DocController.gs (Web App for Doc Operations)      │   │
│  │  - Receives ops from DocAgent Durable Object        │   │
│  │  - Applies changes to Google Docs                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. AI Services

Access Cloudflare's Llama models from Apps Script:

```javascript
const client = new WorkerClient(WORKER_URL, API_KEY);

const response = client.generateAI([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Write a professional email.' },
]);

Logger.log(response.response);
```

**Supported Models**:
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (default)
- `@cf/meta/llama-3.2-11b-vision-instruct` (vision)
- `@cf/meta/llama-4-scout-17b-16e-instruct` (scout)

All prompts and responses are logged to D1 for auditing.

### 2. Gmail Metadata Service

Eliminate duplicate processing and enable semantic search:

```javascript
// Check what's already processed
const processed = client.getDistinctGmailIds('thread', '24h');
Logger.log(`Already processed: ${processed.count} threads`);

// Sync new threads
const threads = GmailApp.search('is:unread').slice(0, 10).map(thread => ({
  threadId: thread.getId(),
  subject: thread.getFirstMessageSubject(),
  snippet: thread.getMessages()[0].getPlainBody().slice(0, 200),
  firstMessageDate: thread.getMessages()[0].getDate().getTime(),
  lastMessageDate: thread.getLastMessageDate().getTime(),
}));

client.syncGmailThreads(threads);

// Semantic search
const results = client.searchGmail('project deadline', 'thread', 5);
```

### 3. Doc Controller Agent

Convert markdown to Google Docs with AI-powered natural language editing:

```javascript
// Configure (one-time setup)
client.configureDocController(DOC_CONTROLLER_WEB_APP_URL, AUTH_TOKEN);

// Convert markdown to doc
const markdown = `
# Project Proposal

## Overview
This is a **bold** new approach.
`;

client.markdownToDoc(markdown, DOC_ID);

// Natural language editing
client.chatWithDoc('Make all headers blue', DOC_ID);
```

### 4. KV-Enhanced Storage

Production-grade SQL-ish storage layer with automatic indexing, search, and bulk operations:

```javascript
// Create a prompt with automatic indexing
kvRequest('POST', '/prompt', {
  name: 'email-helper',
  category: 'email',
  version: 1,
  isActive: true,
  description: 'Helps write professional emails',
  content: 'You are an expert at writing clear, concise business emails.',
});

// Query with WHERE filters (AND)
const emailPrompts = kvRequest('GET', '/prompt?where=category:email&and=isActive:true');

// Full-text search
const results = kvRequest('GET', '/prompt?q=professional+business');

// Sort by time (descending)
const recent = kvRequest('GET', '/prompt?sort=createdAt:desc&limit=10');

// Bulk update
kvRequest('POST', '/task/bulk/updateWhere', {
  and: ['status:pending'],
  patch: { status: 'in-progress' },
  limit: 50,
});
```

**Features**:
- WHERE queries with AND/OR filters
- Full-text search with ranking
- Time-based sorting (ascending/descending)
- Bulk operations (upsert, patch, delete)
- Automatic index maintenance
- Type configuration system

See **[KV-ENHANCED.md](./KV-ENHANCED.md)** for complete documentation.

### 5. Telemetry Dashboard

Every API call is automatically logged with Apps Script context:

- Project name and ID
- Drive file URL
- Editor URL (one-click access)
- Request volume and latency
- Error tracking

Access the dashboard at: `https://your-worker.workers.dev`

## Technology Stack

### Cloudflare Worker

## 📚 Available API Endpoints

### Health Check
- **Endpoint:** `GET /health`
- **Description:** Check if the worker is running
- **Response:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2024-12-23T07:00:00.000Z"
  }
  ```

### Echo
- **Endpoint:** `POST /api/echo`
- **Description:** Echo back a message (useful for testing)
- **Request:**
  ```json
  {
    "message": "Hello World"
  }
  ```
- **Response:**
  ```json
  {
    "echo": "Hello World",
    "timestamp": "2024-12-23T07:00:00.000Z"
  }
  ```

### Text Analysis
- **Endpoint:** `POST /api/text-analysis`
- **Description:** Analyze text and return statistics
- **Request:**
  ```json
  {
    "text": "Your text here"
  }
  ```
- **Response:**
  ```json
  {
    "text": "Your text here",
    "wordCount": 3,
    "charCount": 14,
    "lineCount": 1,
    "timestamp": "2024-12-23T07:00:00.000Z"
  }
  ```

### OpenAPI Documentation
- **Endpoint:** `GET /doc`
- **Description:** OpenAPI specification for all endpoints

## 🎯 Apps Script Integration Examples

The repository includes several `.gs` files demonstrating different integration patterns:

### Config.gs
- Worker API configuration and connection helper
- Test function: `testWorkerConnection()`

### EchoAPI.gs
- Simple echo functionality
- Custom function: `=WORKER_ECHO("message")`
- Test function: `testEchoAPI()`

### TextAnalysisAPI.gs
- Text analysis utilities
- Custom functions: `=WORKER_WORD_COUNT("text")`, `=WORKER_CHAR_COUNT("text")`
- Batch processing: `batchAnalyzeTexts(range)`
- Test function: `testTextAnalysisAPI()`

### Main.gs
- Custom menu in Google Sheets
- `onOpen()` - Adds "Worker Utils" menu
- `runAllTests()` - Runs all API tests
- `processSheetData()` - Example batch processing

## 🔧 Development Workflow

### For Cloudflare Worker

1. Make changes to `worker/src/index.ts`
2. Test locally: `npm run worker:dev`
3. Deploy: `npm run worker:deploy`

### For Apps Script

1. Make changes to `.gs` files in `appsscript/src/`
2. Push to Apps Script: `npm run appsscript:push`
3. Test in the Apps Script editor or Google Sheets

## 🚀 CI/CD Automated Deployment

This repository includes GitHub Actions workflows for automated deployment of both the Cloudflare Worker and Google Apps Script.

### Workflows

#### 1. Deploy Cloudflare Worker (`deploy-worker.yml`)
- **Triggers:** 
  - Automatically on push to `main` branch when changes are made to `worker/`, `wrangler.toml`, or `package.json`
  - Manually via GitHub Actions UI (workflow_dispatch)
- **What it does:** Deploys the worker to Cloudflare Workers using Wrangler

#### 2. Deploy AppsScript (`deploy-appsscript.yml`)
- **Triggers:**
  - Automatically on push to `main` branch when changes are made to `appsscript/` or `.clasp.json`
  - Manually via GitHub Actions UI (workflow_dispatch)
- **What it does:** 
  - Pushes changes to Google Apps Script using clasp
  - Optionally creates a new deployment (manual trigger only)

### Setting Up GitHub Secrets

To enable automated deployments, you need to configure the following GitHub repository secrets:

#### For Cloudflare Worker Deployment

1. **CLOUDFLARE_API_TOKEN**: Your Cloudflare API token with Workers deployment permissions
   
   To create the token:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template or create a custom token with:
     - Permissions: `Account > Cloudflare Workers Scripts > Edit`
   - Copy the generated token
   - Add it to GitHub: Repository Settings > Secrets and variables > Actions > New repository secret
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Paste your token

#### For Google Apps Script Deployment

1. **CLASP_CREDENTIALS**: Your clasp authentication credentials

   To get your credentials:
   ```bash
   # Login to clasp locally
   npx clasp login
   
   # Copy the contents of the credentials file
   cat ~/.clasprc.json
   ```
   
   - Copy the entire JSON content from `~/.clasprc.json`
   - Add it to GitHub: Repository Settings > Secrets and variables > Actions > New repository secret
   - Name: `CLASP_CREDENTIALS`
   - Value: Paste the entire JSON object

   **Note:** The `.clasp.json` file in your repository should contain your script ID. Make sure this is committed:
   ```json
   {
     "scriptId": "your-script-id-here",
     "rootDir": "./appsscript"
   }
   ```

### Manual Deployment

To manually trigger a deployment:

1. Go to your repository on GitHub
2. Click on "Actions" tab
3. Select either "Deploy Cloudflare Worker" or "Deploy AppsScript" workflow
4. Click "Run workflow" button
5. Select the branch (usually `main`)
6. Click "Run workflow"

### Monitoring Deployments

- View deployment status in the "Actions" tab of your GitHub repository
- Click on any workflow run to see detailed logs
- Failed deployments will show error messages to help troubleshoot

## 📝 Adding New API Endpoints

### 1. Add to Worker (`worker/src/index.ts`)

```typescript
const newRoute = createRoute({
  method: 'post',
  path: '/api/new-endpoint',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            input: z.string()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Success response',
      content: {
        'application/json': {
          schema: z.object({
            result: z.string()
          })
        }
      }
    }
  }
});
- **Framework**: Hono v4+ with Zod validation
- **Database**: D1 (SQLite) with Drizzle ORM
- **Storage**: KV with custom indexing layer (SQL-ish operations)
- **Vector Search**: Vectorize (768-dimensional embeddings)
- **AI**: Workers AI (Llama models)
- **State**: Durable Objects (DocAgent orchestrator)
- **Assets**: Workers Assets (Remix frontend)

### Frontend

- **Framework**: Remix (React Router v7)
- **Build Tool**: Vite with `manualChunks` optimization
- **UI**: Shadcn UI with True Dark theme (Pure Black #000000)
- **Charts**: Recharts with neon-pastel palette
- **Styling**: Tailwind CSS with OKLCH color space

### Google Apps Script

- **Client Library**: `WorkerClient.gs` (copy-pasteable utility class)
- **Doc Controller**: `DocController.gs` (Web App for doc operations)
- **Headers**: Auto-injected telemetry context

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create colby-gas-bridge-db

# Create Vectorize index
wrangler vectorize create gmail-embeddings --dimensions=768 --metric=cosine

# Set API key
wrangler secret put WORKER_API_KEY
```

### 3. Apply Migrations

```bash
npm run db:migrate
```

### 4. Build and Deploy

```bash
# Build frontend
npm run build:frontend

# Deploy worker
npm run worker:deploy
```

### 5. Deploy Apps Script Components

1. Copy `appsscript/DocController.gs` to a new Apps Script project
2. Run `setupDocController()` to generate auth token
3. Deploy as Web App
4. Copy `appsscript/WorkerClient.gs` to your Apps Script projects

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete setup instructions.

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[KV-ENHANCED.md](./KV-ENHANCED.md)** - KV storage layer documentation
- **[EXAMPLES.md](./EXAMPLES.md)** - Usage examples
- **[WORKER_AI_GUIDE.md](./WORKER_AI_GUIDE.md)** - AI services reference
- **[QUICKSTART.md](./QUICKSTART.md)** - Getting started guide

## API Documentation

Once deployed, access the OpenAPI documentation at:
- `https://your-worker.workers.dev/doc`

Or test the health endpoint:
```bash
curl https://your-worker.workers.dev/health
```

## Project Structure

```
colby-gas-bridge/
├── worker/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle ORM schema
│   │   │   └── client.ts          # Database client
│   │   ├── kv/
│   │   │   ├── types.ts           # Type configuration
│   │   │   ├── indexes.ts         # Index key generators
│   │   │   ├── tokenizer.ts       # Text tokenization
│   │   │   ├── crud.ts            # CRUD operations
│   │   │   ├── query.ts           # Query engine
│   │   │   └── bulk.ts            # Bulk operations
│   │   ├── middleware/
│   │   │   ├── auth.ts            # API key validation
│   │   │   └── telemetry.ts       # Request logging
│   │   ├── routes/
│   │   │   ├── ai.ts              # AI generation endpoints
│   │   │   ├── gmail.ts           # Gmail metadata endpoints
│   │   │   ├── doc.ts             # Doc Controller endpoints
│   │   │   ├── kv.ts              # Basic KV endpoints
│   │   │   └── kv-enhanced.ts     # Enhanced KV endpoints
│   │   ├── durable-objects/
│   │   │   └── DocAgent.ts        # Document orchestrator
│   │   ├── types.ts               # TypeScript types
│   │   └── index.ts               # Main worker entry
│   └── migrations/                # D1 migrations
├── frontend/
│   └── app/
│       ├── routes/                # Remix routes
│       ├── components/            # React components
│       ├── lib/                   # Utilities
│       └── styles/                # Global CSS
├── appsscript/
│   ├── WorkerClient.gs            # Apps Script client library
│   ├── DocController.gs           # Doc Controller Web App
│   └── KV_Enhanced_Test.gs        # KV test harness
├── wrangler.toml                  # Cloudflare configuration
├── drizzle.config.ts              # Drizzle Kit configuration
├── vite.config.ts                 # Vite configuration
└── tailwind.config.ts             # Tailwind configuration
```

## Development

### Local Development

```bash
# Start worker (with local D1 and Vectorize)
npm run worker:dev

# Generate database migrations
npm run db:generate

# Open Drizzle Studio
npm run db:studio
```
utils-for-gas/
├── .github/               # GitHub Actions workflows
│   └── workflows/
│       ├── deploy-appsscript.yml  # AppsScript deployment
│       └── deploy-worker.yml      # Cloudflare Worker deployment
├── worker/                 # Cloudflare Worker
│   └── src/
│       └── index.ts       # Main worker application
├── appsscript/            # Google Apps Script
│   ├── src/
│   │   ├── Config.gs      # Configuration & API helper
│   │   ├── EchoAPI.gs     # Echo integration
│   │   ├── TextAnalysisAPI.gs  # Text analysis integration
│   │   └── Main.gs        # Menu & utilities
│   └── appsscript.json    # Apps Script manifest
├── .clasp.json            # Clasp configuration
├── wrangler.toml          # Wrangler configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

### Making Schema Changes

1. Edit `worker/src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Apply migration: `npm run db:migrate`

## Security

- **API Key Authentication**: All endpoints require `X-API-Key` header
- **Doc Controller Token**: Separate auth token for doc operations
- **Telemetry Headers**: Auto-injected by WorkerClient (no manual config)
- **CORS**: Enabled for cross-origin requests

## Cost

**Cloudflare Workers Paid Plan**: $5/mo includes:
- 10M requests/month
- 25 GB D1 storage
- 30M Vectorize queries/month
- 10K AI neurons/day

Typical usage for a small team: **$5-15/mo**

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For issues or questions:
- Open a GitHub issue
- Check the `/doc` endpoint for API documentation
- Review the deployment guide for troubleshooting

---

Built with Cloudflare Workers, Hono, Remix, Drizzle ORM, and Google Apps Script.
