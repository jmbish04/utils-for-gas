# Quick Start Guide

This guide will help you get up and running quickly with both infrastructures.

## Part 1: Deploy Cloudflare Worker (5 minutes)

### Step 1: Install dependencies
```bash
npm install
```

### Step 2: Login to Cloudflare
```bash
npx wrangler login
```

### Step 3: Deploy the worker
```bash
npm run worker:deploy
```

### Step 4: Note your worker URL
After deployment, Wrangler will output your worker URL:
```
Published utils-for-gas-worker (X.XX sec)
  https://utils-for-gas-worker.YOUR-SUBDOMAIN.workers.dev
```

**Copy this URL - you'll need it for Apps Script setup!**

### Step 5: Test the worker
```bash
curl https://your-worker-url.workers.dev/health
```

You should see:
```json
{"status":"healthy","timestamp":"..."}
```

## Part 2: Setup Google Apps Script (5 minutes)

### Step 1: Login to Google
```bash
npx clasp login
```

### Step 2: Create a new Google Sheet
1. Go to https://sheets.google.com
2. Create a new blank spreadsheet
3. Name it "Worker Utils Demo"

### Step 3: Create Apps Script project
```bash
npx clasp create --title "Utils for GAS" --type sheets --rootDir ./appsscript
```

When prompted for "Clone which script?", select "Create a new script"

### Step 4: Update worker URL
Edit `appsscript/src/Config.gs` and replace the placeholder URL with your actual worker URL from Part 1:

```javascript
const CONFIG = {
  WORKER_URL: 'https://your-actual-worker-url.workers.dev',
};
```

### Step 5: Push code to Apps Script
```bash
npm run appsscript:push
```

### Step 6: Open and test
```bash
npm run appsscript:open
```

This opens the Apps Script editor. Now:
1. Go back to your Google Sheet
2. Refresh the page
3. You should see a new menu: "Worker Utils"
4. Click "Worker Utils" > "Run All Tests"

## Part 3: Try It Out!

### In Google Sheets:

1. In any cell, type:
   ```
   =WORKER_ECHO("Hello World")
   ```

2. In another cell, type:
   ```
   =WORKER_WORD_COUNT("The quick brown fox jumps")
   ```

3. Try the menu: "Worker Utils" > "Test Echo API"

### Test with curl:

```bash
# Echo test
curl -X POST https://your-worker-url.workers.dev/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from terminal"}'

# Text analysis test
curl -X POST https://your-worker-url.workers.dev/api/text-analysis \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a test message with multiple words"}'
```

## Troubleshooting

### "Script not found" error
- Make sure you ran `npx clasp create` successfully
- Check that `.clasp.json` has a `scriptId` value

### Worker not responding
- Verify your worker URL is correct in `Config.gs`
- Test the worker directly with curl
- Check Cloudflare dashboard for deployment status

### "Authorization required" in Apps Script
- Run any function once from the Apps Script editor
- Grant permissions when prompted
- Try again

## Next Steps

- Explore the code in `worker/src/index.ts` to see how APIs are defined
- Look at the `.gs` files in `appsscript/src/` to see integration patterns
- Add your own custom endpoints!
- Check out the full README.md for more details

## Need Help?

- Check the logs in Apps Script: View > Logs
- Check worker logs: `npx wrangler tail`
- Review the full documentation in README.md
