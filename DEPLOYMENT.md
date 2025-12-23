# Colby-GAS-Bridge Deployment Guide

Complete guide to deploying the Colby-GAS-Bridge infrastructure.

## Architecture Overview

**Colby-GAS-Bridge** is a dual-ecosystem platform:

- **Cloudflare Worker (The Core)**: REST APIs, AI Agents, Durable Objects, and a React frontend
- **Google Apps Script (The Client)**: Copy-pasteable utilities and Doc Controller Web App

## Prerequisites

- Cloudflare account with Workers Paid Plan ($5/mo)
- Node.js 18+ and npm
- Wrangler CLI (`npm install -g wrangler`)
- Google account for Apps Script

## Part 1: Cloudflare Worker Setup

### 1.1 Install Dependencies

```bash
npm install
```

### 1.2 Create D1 Database

```bash
# Production database
wrangler d1 create colby-gas-bridge-db

# Development database
wrangler d1 create colby-gas-bridge-db-dev
```

Copy the `database_id` from each output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "colby-gas-bridge-db"
database_id = "YOUR_PRODUCTION_DATABASE_ID"  # Replace this

[[env.dev.d1_databases]]
binding = "DB"
database_name = "colby-gas-bridge-db-dev"
database_id = "YOUR_DEV_DATABASE_ID"  # Replace this
```

### 1.3 Apply Database Migrations

```bash
# Production
wrangler d1 migrations apply colby-gas-bridge-db

# Development
wrangler d1 migrations apply colby-gas-bridge-db-dev --env dev
```

### 1.4 Create Vectorize Index

```bash
wrangler vectorize create gmail-embeddings --dimensions=768 --metric=cosine
```

### 1.5 Set Secrets

```bash
# Generate a secure API key
openssl rand -hex 32

# Set the secret
wrangler secret put WORKER_API_KEY
# Paste the generated key when prompted
```

### 1.6 Build Frontend

```bash
npm run build:frontend
```

This will:
1. Build the Remix frontend with Vite
2. Apply `manualChunks` optimization to prevent hydration white-screens
3. Output to `frontend/build/client` (configured in wrangler.toml as assets directory)

### 1.7 Deploy to Cloudflare

```bash
# Development
npm run worker:dev

# Production
npm run worker:deploy
```

Your Worker will be available at: `https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev`

## Part 2: Google Apps Script Setup

### 2.1 Deploy Doc Controller Web App

1. Open [Google Apps Script](https://script.google.com)
2. Create a new project: "Colby-GAS-Bridge Doc Controller"
3. Copy the contents of `appsscript/DocController.gs` into `Code.gs`
4. Run the `setupDocController()` function once:
   - This generates an auth token and saves it to Script Properties
   - Copy the auth token from the logs
5. Deploy as Web App:
   - Click **Deploy** > **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or restrict to service account)
   - Click **Deploy**
   - Copy the **Web App URL**

### 2.2 Configure Worker to Use Doc Controller

```bash
curl -X POST https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev/api/doc/configure \
  -H "X-API-Key: YOUR_WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "gasWebAppUrl": "YOUR_WEB_APP_URL",
    "authToken": "YOUR_AUTH_TOKEN"
  }'
```

### 2.3 Use WorkerClient in Your Apps Script Projects

1. Copy `appsscript/WorkerClient.gs` into your Apps Script project
2. Use the client:

```javascript
function myScript() {
  const WORKER_URL = 'https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev';
  const API_KEY = 'YOUR_WORKER_API_KEY';

  const client = new WorkerClient(WORKER_URL, API_KEY);

  // Example: AI Generation
  const response = client.generateAI([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Write a professional email.' },
  ]);

  Logger.log(response.response);
}
```

## Part 3: Testing

### Test Health Check

```bash
curl https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-23T10:30:00.000Z",
  "environment": "production"
}
```

### Test AI Generation

```bash
curl -X POST https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev/api/ai/generate \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 2+2?"}
    ]
  }'
```

### Test Gmail Sync

```bash
curl -X POST https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev/api/gmail/sync \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "thread",
    "threads": [{
      "threadId": "thread123",
      "subject": "Test",
      "snippet": "Testing",
      "firstMessageDate": 1640000000000,
      "lastMessageDate": 1640000000000
    }]
  }'
```

## Part 4: Frontend Access

Visit `https://colby-gas-bridge.YOUR_SUBDOMAIN.workers.dev` to access the dashboard.

Features:
- **Dashboard**: Telemetry visualization and project ledger
- **API Documentation**: Available at `/doc`
- **True Dark Theme**: Pure black (#000000) background with OKLCH colors

## Part 5: Development Workflow

### Local Development

```bash
# Start Worker in dev mode
npm run worker:dev

# In another terminal, start frontend dev server
npm run dev

# Database changes
npm run db:generate  # Generate migrations
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio
```

### Making Schema Changes

1. Edit `worker/src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review the generated SQL in `worker/migrations/`
4. Apply migration: `npm run db:migrate`

## Troubleshooting

### Worker Deployment Fails

- Ensure all secrets are set: `wrangler secret list`
- Check database IDs in `wrangler.toml`
- Verify Vectorize index exists: `wrangler vectorize list`

### Frontend White Screen

- Ensure `manualChunks` is configured in `vite.config.ts`
- Rebuild frontend: `npm run build:frontend`
- Clear browser cache

### Doc Controller Not Working

- Verify auth token is set in Script Properties
- Check Web App is deployed with correct permissions
- Test Web App URL directly in browser

### Telemetry Not Logging

- Verify D1 database exists and migrations are applied
- Check Apps Script is sending headers: `X-Appsscript-Id`, etc.
- Review Worker logs: `wrangler tail`

## Cost Estimates

**Cloudflare Workers Paid Plan**: $5/mo includes:
- 10 million requests/month
- D1: 25 GB storage, 50 million reads
- Vectorize: 30 million queries/month
- Workers AI: 10,000 neurons/day
- Durable Objects: 1 million requests/month

**Typical Usage**:
- Small team (5-10 scripts): ~$5-10/mo
- Medium team (20-50 scripts): ~$15-25/mo
- Large deployment: ~$50-100/mo

## Security Best Practices

1. **Rotate API Keys Regularly**
   ```bash
   wrangler secret put WORKER_API_KEY
   ```

2. **Use Environment-Specific Keys**
   - Different keys for dev and production
   - Different tokens for each Doc Controller deployment

3. **Restrict Doc Controller Access**
   - Deploy with "Anyone with the link" or service account only
   - Never expose auth tokens in client-side code

4. **Monitor Telemetry**
   - Review unusual request patterns
   - Check for unauthorized Apps Script IDs

## Next Steps

- Add Cloudflare Access for authentication
- Implement WebSocket support for chat interface
- Create additional UI components (Prompt Manager, etc.)
- Set up monitoring and alerting

## Support

For issues or questions:
- Check `/doc` endpoint for API documentation
- Review `EXAMPLES.md` for usage examples
- Open an issue on GitHub
