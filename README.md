# Utils for Google Apps Script

A dual-infrastructure repository that provides utility functions for Google Apps Script via a Cloudflare Worker REST API. The worker exposes a Hono + Zod OpenAPI REST API that Apps Script can leverage using UrlFetch commands for more complex tasks like Worker AI, text processing, and other utilities.

## 🏗️ Architecture

This repository contains two interconnected infrastructures:

1. **Cloudflare Worker** (`/worker`) - REST API built with Hono and Zod OpenAPI
2. **Google Apps Script** (`/appsscript`) - Demo integrations that consume the worker API

```
┌─────────────────────────┐
│  Google Apps Script     │
│  (Spreadsheet/Docs)     │
└───────────┬─────────────┘
            │ UrlFetch
            ↓
┌─────────────────────────┐
│  Cloudflare Worker      │
│  (Hono + Zod OpenAPI)   │
└─────────────────────────┘
```

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Google Account (for Apps Script)
- Cloudflare Account (for Workers)

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Cloudflare Worker

#### Configure Wrangler

First, authenticate with Cloudflare:

```bash
npx wrangler login
```

#### Deploy the Worker

```bash
npm run worker:deploy
```

After deployment, note your worker URL (e.g., `https://utils-for-gas-worker.your-subdomain.workers.dev`)

#### Local Development

To run the worker locally:

```bash
npm run worker:dev
```

### 3. Setup Google Apps Script

#### Initialize Clasp

First, login to Google:

```bash
npx clasp login
```

#### Create a New Apps Script Project

```bash
npx clasp create --title "Utils for GAS" --type sheets --rootDir ./appsscript
```

This will update `.clasp.json` with your script ID.

#### Configure Worker URL

Edit `appsscript/src/Config.gs` and update the `WORKER_URL`:

```javascript
const CONFIG = {
  WORKER_URL: 'https://your-worker.your-subdomain.workers.dev',
};
```

#### Push to Apps Script

```bash
npm run appsscript:push
```

#### Open in Apps Script Editor

```bash
npm run appsscript:open
```

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

app.openapi(newRoute, (c) => {
  const { input } = c.req.valid('json');
  return c.json({ result: `Processed: ${input}` });
});
```

### 2. Create Apps Script Integration

Create a new `.gs` file in `appsscript/src/`:

```javascript
function callNewEndpoint(input) {
  const payload = { input: input };
  return callWorkerAPI('/api/new-endpoint', 'POST', payload);
}
```

## 🧪 Testing

### Test Worker Endpoints

Use curl or any HTTP client:

```bash
# Health check
curl https://your-worker.workers.dev/health

# Echo
curl -X POST https://your-worker.workers.dev/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Text analysis
curl -X POST https://your-worker.workers.dev/api/text-analysis \
  -H "Content-Type: application/json" \
  -d '{"text": "Some text to analyze"}'
```

### Test Apps Script Integration

In Google Sheets:
1. Open the spreadsheet
2. Go to Extensions > Apps Script
3. Run test functions from the Apps Script editor
4. Or use the "Worker Utils" menu in the sheet

## 🔐 Environment Variables & Secrets

### For Worker

Add secrets using Wrangler:

```bash
npx wrangler secret put API_KEY
```

Or use `.dev.vars` for local development (not committed):

```
API_KEY=your-api-key-here
```

### For Apps Script

Use Script Properties:

```javascript
const scriptProperties = PropertiesService.getScriptProperties();
scriptProperties.setProperty('API_KEY', 'your-api-key');
```

## 📦 Project Structure

```
utils-for-gas/
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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test both worker and Apps Script integrations
5. Submit a pull request

## 📄 License

MIT

## 🆘 Troubleshooting

### Worker not responding
- Check deployment status: `npx wrangler deployments list`
- Check logs: `npx wrangler tail`

### Apps Script errors
- Verify worker URL in `Config.gs`
- Check Apps Script logs: View > Logs in the editor
- Ensure worker is deployed and accessible

### CORS errors
- Ensure worker returns proper CORS headers if needed
- Check worker logs for request details

## 🚀 Future Enhancements

Potential features to add:
- Cloudflare AI integration (text generation, embeddings, etc.)
- Data transformation utilities
- Integration with other Cloudflare products (R2, KV, D1)
- More complex Apps Script examples
- Authentication/authorization
- Rate limiting
- Caching strategies