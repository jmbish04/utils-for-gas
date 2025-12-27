import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env, AIModel } from '../types';
import { createDbClient } from '../db/client';
import { aiTranscripts } from '../db/schema';

/**
 * AI Routes
 * Provides AI generation endpoints with transcript logging
 */
export const aiRoutes = new OpenAPIHono<{ Bindings: Env }>();

/**
 * Model aliases mapping
 */
const MODEL_ALIASES: Record<string, AIModel> = {
  'default': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'llama-3.3': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'llama-vision': '@cf/meta/llama-3.2-11b-vision-instruct',
  'llama-scout': '@cf/meta/llama-4-scout-17b-16e-instruct',
  'gpt-oss': '@cf/meta/llama-3.3-70b-instruct-fp8-fast', // Best-fit mapping
};

/**
 * POST /api/ai/generate
 * Generate AI completions with various models
 */
const generateRoute = createRoute({
  method: 'post',
  path: '/generate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            model: z.string().optional().default('default').describe('Model name or alias'),
            messages: z.array(
              z.object({
                role: z.enum(['system', 'user', 'assistant']),
                content: z.string(),
              })
            ).describe('Conversation messages'),
            temperature: z.number().min(0).max(2).optional().default(0.7),
            max_tokens: z.number().optional().default(1024),
            stream: z.boolean().optional().default(false),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'AI generation response',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            model: z.string(),
            response: z.string(),
            usage: z.object({
              prompt_tokens: z.number().optional(),
              completion_tokens: z.number().optional(),
              total_tokens: z.number().optional(),
            }).optional(),
            timestamp: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

aiRoutes.openapi(generateRoute, async (c) => {
  const { model: modelInput, messages, temperature, max_tokens, stream } = c.req.valid('json');

  // Resolve model alias
  const model = MODEL_ALIASES[modelInput] || modelInput as AIModel;

  // Get request ID from context
  const cfRequestId = c.get('cfRequestId') || crypto.randomUUID();

  try {
    // Call Cloudflare AI
    const response = await c.env.AI.run(model, {
      messages,
      temperature,
      max_tokens,
      stream,
    });

    // Extract response text (handle different response formats)
    let responseText: string;
    let usage: any;

    if (typeof response === 'string') {
      responseText = response;
    } else if (response && typeof response === 'object') {
      // Handle streaming or structured responses
      if ('response' in response) {
        responseText = response.response as string;
      } else if ('text' in response) {
        responseText = response.text as string;
      } else if ('choices' in response && Array.isArray(response.choices)) {
        responseText = response.choices[0]?.message?.content || '';
      } else {
        responseText = JSON.stringify(response);
      }

      // Extract usage if available
      if ('usage' in response) {
        usage = response.usage;
      }
    } else {
      throw new Error('Unexpected response format from AI');
    }

    // Log transcript to D1 (non-blocking via ctx.waitUntil if available, otherwise blocking)
    const logTranscript = async () => {
      const db = createDbClient(c.env.DB);
      await db.insert(aiTranscripts).values({
        cfRequestId,
        model,
        prompt: JSON.stringify(messages),
        response: responseText,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        metadata: JSON.stringify({ temperature, max_tokens }),
      });
    };

    // Use waitUntil if available (Workers context), otherwise block
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(logTranscript());
    } else {
      await logTranscript();
    }

    return c.json({
      id: cfRequestId,
      model,
      response: responseText,
      usage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI generation error:', error);
    return c.json(
      {
        error: 'AI Generation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/ai/models
 * List available models
 */
const modelsRoute = createRoute({
  method: 'get',
  path: '/models',
  responses: {
    200: {
      description: 'List of available AI models',
      content: {
        'application/json': {
          schema: z.object({
            models: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                description: z.string(),
                aliases: z.array(z.string()),
              })
            ),
          }),
        },
      },
    },
  },
});

aiRoutes.openapi(modelsRoute, (c) => {
  return c.json({
    models: [
      {
        id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        name: 'Llama 3.3 70B',
        description: 'Fast and powerful instruction-following model',
        aliases: ['default', 'llama-3.3', 'gpt-oss'],
      },
      {
        id: '@cf/meta/llama-3.2-11b-vision-instruct',
        name: 'Llama 3.2 Vision',
        description: 'Multimodal model with vision capabilities',
        aliases: ['llama-vision'],
      },
      {
        id: '@cf/meta/llama-4-scout-17b-16e-instruct',
        name: 'Llama 4 Scout',
        description: 'Compact and efficient instruction model',
        aliases: ['llama-scout'],
      },
    ],
  });
});
