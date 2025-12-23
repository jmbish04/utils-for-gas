import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { createRoute } from '@hono/zod-openapi';

// Define Cloudflare Worker bindings
type Bindings = {
  AI?: any; // Cloudflare AI binding (optional)
};

// Create the app with OpenAPI support
const app = new OpenAPIHono<{ Bindings: Bindings }>();

// Root endpoint
app.get('/', (c) => {
  return c.json({
    message: 'Utils for Google Apps Script - Worker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      echo: '/api/echo',
      textAnalysis: '/api/text-analysis',
      documentation: '/doc'
    }
  });
});

// Health check endpoint
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Health check response',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string(),
            timestamp: z.string()
          })
        }
      }
    }
  }
});

app.openapi(healthRoute, (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Echo endpoint - simple utility for testing
const echoRoute = createRoute({
  method: 'post',
  path: '/api/echo',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().describe('Message to echo back')
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Echoed message',
      content: {
        'application/json': {
          schema: z.object({
            echo: z.string(),
            timestamp: z.string()
          })
        }
      }
    }
  }
});

app.openapi(echoRoute, (c) => {
  const { message } = c.req.valid('json');
  return c.json({
    echo: message,
    timestamp: new Date().toISOString()
  });
});

// Text analysis endpoint - demonstrates more complex processing
const textAnalysisRoute = createRoute({
  method: 'post',
  path: '/api/text-analysis',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            text: z.string().describe('Text to analyze')
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Text analysis results',
      content: {
        'application/json': {
          schema: z.object({
            text: z.string(),
            wordCount: z.number(),
            charCount: z.number(),
            lineCount: z.number(),
            timestamp: z.string()
          })
        }
      }
    }
  }
});

app.openapi(textAnalysisRoute, (c) => {
  const { text } = c.req.valid('json');
  
  const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
  const charCount = text.length;
  const lineCount = text ? text.split('\n').length : 0;
  
  return c.json({
    text,
    wordCount,
    charCount,
    lineCount,
    timestamp: new Date().toISOString()
  });
});

// OpenAPI documentation endpoint
app.doc('/doc', {
  openapi: '3.1.0',
  info: {
    title: 'Utils for Google Apps Script API',
    version: '1.0.0',
    description: 'REST API providing utilities for Google Apps Script via Cloudflare Workers'
  }
});

export default app;
