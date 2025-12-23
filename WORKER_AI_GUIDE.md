# Adding Cloudflare Worker AI Integration

This guide shows how to extend the worker with Cloudflare's AI capabilities.

## Step 1: Configure AI Binding in wrangler.toml

Uncomment the AI binding in `wrangler.toml`:

```toml
[ai]
binding = "AI"
```

## Step 2: Add AI Endpoint to Worker

Add this to `worker/src/index.ts`:

```typescript
// Add after other imports
const aiTextGenerationRoute = createRoute({
  method: 'post',
  path: '/api/ai/generate-text',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            prompt: z.string().describe('Text prompt for AI generation'),
            model: z.string().optional().describe('Model to use (default: @cf/meta/llama-3-8b-instruct)')
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Generated text response',
      content: {
        'application/json': {
          schema: z.object({
            prompt: z.string(),
            response: z.string(),
            model: z.string(),
            timestamp: z.string()
          })
        }
      }
    }
  }
});

app.openapi(aiTextGenerationRoute, async (c) => {
  const { prompt, model = '@cf/meta/llama-3-8b-instruct' } = c.req.valid('json');
  
  // Check if AI binding is available
  if (!c.env.AI) {
    return c.json({ error: 'AI binding not configured' }, 500);
  }
  
  try {
    const response = await c.env.AI.run(model, {
      prompt: prompt
    });
    
    return c.json({
      prompt,
      response: response.response || 'No response generated',
      model,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({ 
      error: 'AI generation failed', 
      details: error.message 
    }, 500);
  }
});
```

## Step 3: Deploy Updated Worker

```bash
npm run worker:deploy
```

## Step 4: Add Apps Script Integration

Create `appsscript/src/WorkerAI.gs`:

```javascript
/**
 * Worker AI Integration
 * Demonstrates AI text generation through Cloudflare Workers AI
 */

/**
 * Generates text using Cloudflare Workers AI
 * @param {string} prompt - The prompt for text generation
 * @param {string} model - Optional model name (default: @cf/meta/llama-3-8b-instruct)
 * @returns {Object} - Generated text response
 */
function generateTextWithAI(prompt, model) {
  if (!prompt) {
    throw new Error('Prompt is required');
  }
  
  const payload = {
    prompt: prompt
  };
  
  if (model) {
    payload.model = model;
  }
  
  try {
    const result = callWorkerAPI('/api/ai/generate-text', 'POST', payload);
    Logger.log('AI generation result: ' + JSON.stringify(result));
    return result;
  } catch (error) {
    Logger.log('AI generation failed: ' + error.toString());
    throw error;
  }
}

/**
 * Test function for Worker AI
 */
function testWorkerAI() {
  const prompt = 'Write a short greeting message for a new user.';
  const result = generateTextWithAI(prompt);
  
  if (result && result.response) {
    Logger.log('✓ Worker AI test passed');
    Logger.log('Response: ' + result.response);
    return true;
  } else {
    Logger.log('✗ Worker AI test failed');
    return false;
  }
}

/**
 * Custom function for Google Sheets - Generate text with AI
 * Usage in sheet: =WORKER_AI_GENERATE("Write a tagline for a coffee shop")
 * @param {string} prompt - Prompt for AI generation
 * @returns {string} - Generated text
 * @customfunction
 */
function WORKER_AI_GENERATE(prompt) {
  try {
    const result = generateTextWithAI(prompt);
    return result.response;
  } catch (error) {
    return 'Error: ' + error.toString();
  }
}

/**
 * Batch generates text for multiple prompts from a range
 * @param {Array<Array<string>>} promptRange - 2D array of prompts from sheet
 * @returns {Array<Array<string>>} - 2D array of generated responses
 */
function batchGenerateWithAI(promptRange) {
  const results = [];
  
  for (let i = 0; i < promptRange.length; i++) {
    const rowResults = [];
    for (let j = 0; j < promptRange[i].length; j++) {
      const prompt = promptRange[i][j];
      if (prompt) {
        try {
          const generation = generateTextWithAI(prompt);
          rowResults.push(generation.response);
        } catch (error) {
          rowResults.push('Error: ' + error.toString());
        }
        // Add delay to avoid rate limiting
        Utilities.sleep(1000);
      } else {
        rowResults.push('');
      }
    }
    results.push(rowResults);
  }
  
  return results;
}

/**
 * Example: Summarize text using AI
 * @param {string} text - Text to summarize
 * @returns {string} - Summary
 */
function summarizeText(text) {
  const prompt = `Please summarize the following text in 2-3 sentences:\n\n${text}`;
  const result = generateTextWithAI(prompt);
  return result.response;
}

/**
 * Example: Generate ideas based on a topic
 * @param {string} topic - Topic to generate ideas for
 * @param {number} count - Number of ideas to generate
 * @returns {Array<string>} - Array of ideas
 */
function generateIdeas(topic, count = 5) {
  const prompt = `Generate ${count} creative ideas related to: ${topic}. List them as numbered items.`;
  const result = generateTextWithAI(prompt);
  
  // Parse the response into an array
  const ideas = result.response.split('\n').filter(line => line.trim().length > 0);
  return ideas;
}
```

## Step 5: Update Main Menu

Add AI test to `appsscript/src/Main.gs`:

```javascript
// Add to onOpen() menu
.addItem('Test Worker AI', 'testWorkerAI')

// Add to runAllTests()
Logger.log('\n4. Testing Worker AI...');
const aiTest = testWorkerAI();
Logger.log('Worker AI: ' + (aiTest ? '✓ PASSED' : '✗ FAILED'));
```

## Step 6: Push and Test

```bash
npm run appsscript:push
```

Then in Google Sheets:
1. Refresh the page
2. Try: `=WORKER_AI_GENERATE("Write a fun fact about cats")`
3. Or use menu: "Worker Utils" > "Test Worker AI"

## Available AI Models

Cloudflare Workers AI supports many models:

### Text Generation
- `@cf/meta/llama-3-8b-instruct` (default)
- `@cf/meta/llama-2-7b-chat-int8`
- `@cf/mistral/mistral-7b-instruct-v0.1`

### Text Embeddings
- `@cf/baai/bge-base-en-v1.5`
- `@cf/baai/bge-small-en-v1.5`

### Translation
- `@cf/meta/m2m100-1.2b`

### Image Generation
- `@cf/stabilityai/stable-diffusion-xl-base-1.0`

## Rate Limits

Cloudflare Workers AI has usage limits:
- Free tier: Limited requests per day
- Paid plans: Higher limits

Consider:
- Adding delays between batch requests
- Implementing caching for repeated queries
- Rate limiting in the worker

## Cost Considerations

- Workers AI is included in Workers Paid plan
- Free tier available with limits
- Check Cloudflare pricing for current rates

## Security Best Practices

1. **Validate inputs**: Always validate and sanitize prompts
2. **Content filtering**: Consider adding content filters
3. **Rate limiting**: Implement rate limits to prevent abuse
4. **Authentication**: Add API keys for production use
5. **Logging**: Log requests for monitoring

Example with API key:

```typescript
// In worker
app.use('/api/ai/*', async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey || apiKey !== c.env.API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
```

## Further Reading

- [Cloudflare Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Available Models](https://developers.cloudflare.com/workers-ai/models/)
- [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
