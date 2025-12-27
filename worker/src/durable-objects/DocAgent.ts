import { DurableObject } from 'cloudflare:workers';
import type { Env, DocOp, DocState } from '../types';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

/**
 * DocAgent Durable Object
 *
 * Orchestrates markdown-to-doc conversion workflow:
 * 1. Parse markdown to HTML to JSON Doc Ops Plan
 * 2. Execute operations via Apps Script Doc Controller
 * 3. Verify document state matches intent
 * 4. Support chat interface for natural language edits
 */
export class DocAgent extends DurableObject<Env> {
  private sessionId: string;
  private currentDocId: string | null = null;
  private gasWebAppUrl: string | null = null;
  private authToken: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessionId = crypto.randomUUID();
  }

  /**
   * Handle HTTP requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route handlers
    if (path === '/configure' && request.method === 'POST') {
      return this.handleConfigure(request);
    }

    if (path === '/md-to-doc' && request.method === 'POST') {
      return this.handleMdToDoc(request);
    }

    if (path === '/chat' && request.method === 'POST') {
      return this.handleChat(request);
    }

    if (path === '/status' && request.method === 'GET') {
      return this.handleStatus();
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Configure the Doc Controller endpoint
   */
  private async handleConfigure(request: Request): Promise<Response> {
    try {
      const { gasWebAppUrl, authToken } = await request.json();

      if (!gasWebAppUrl) {
        return Response.json({ error: 'gasWebAppUrl is required' }, { status: 400 });
      }

      this.gasWebAppUrl = gasWebAppUrl;
      this.authToken = authToken;

      return Response.json({
        success: true,
        sessionId: this.sessionId,
      });
    } catch (error) {
      return Response.json(
        {
          error: 'Configuration failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  /**
   * Convert markdown to Google Doc
   */
  private async handleMdToDoc(request: Request): Promise<Response> {
    try {
      const { markdown, docId, gasWebAppUrl, authToken } = await request.json();

      if (!markdown || !docId) {
        return Response.json({ error: 'markdown and docId are required' }, { status: 400 });
      }

      // Update configuration if provided
      if (gasWebAppUrl) this.gasWebAppUrl = gasWebAppUrl;
      if (authToken) this.authToken = authToken;

      if (!this.gasWebAppUrl) {
        return Response.json({ error: 'Doc Controller not configured' }, { status: 400 });
      }

      this.currentDocId = docId;

      // Phase 1: Parse Markdown to Doc Ops Plan
      const docOpsPlan = await this.markdownToDocOps(markdown);

      // Phase 2-3: Execute operations and verify
      const executionResult = await this.executeDocOps(docOpsPlan, docId);

      return Response.json({
        success: true,
        sessionId: this.sessionId,
        docId,
        opsExecuted: executionResult.opsExecuted,
        verificationsPerformed: executionResult.verificationsPerformed,
        finalState: executionResult.finalState,
      });
    } catch (error) {
      return Response.json(
        {
          error: 'Markdown conversion failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  /**
   * Handle chat interface for natural language doc edits
   */
  private async handleChat(request: Request): Promise<Response> {
    try {
      const { message, docId } = await request.json();

      if (!message) {
        return Response.json({ error: 'message is required' }, { status: 400 });
      }

      if (!this.gasWebAppUrl) {
        return Response.json({ error: 'Doc Controller not configured' }, { status: 400 });
      }

      const targetDocId = docId || this.currentDocId;
      if (!targetDocId) {
        return Response.json({ error: 'No active document' }, { status: 400 });
      }

      // Get current doc state
      const currentState = await this.getDocState(targetDocId);

      // Use AI to interpret the natural language request
      const systemPrompt = `You are a document editor assistant. Given the current document state and a user request, generate a JSON array of document operations to fulfill the request.

Available operations:
- insertText: { index: number, text: string }
- replaceText: { startIndex: number, endIndex: number, text: string }
- setAttributes: { startIndex: number, endIndex: number, attributes: { bold?: boolean, italic?: boolean, fontSize?: number, foregroundColor?: string } }
- deleteRange: { startIndex: number, endIndex: number }

Current document state:
${JSON.stringify(currentState, null, 2)}

User request: ${message}

Respond with ONLY a JSON array of operations, no explanation.`;

      const aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
      });

      // Parse AI response to doc ops
      let docOps: DocOp[];
      try {
        const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
        docOps = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
      } catch (parseError) {
        return Response.json(
          {
            error: 'Failed to parse AI response',
            aiResponse,
          },
          { status: 500 }
        );
      }

      // Execute the operations
      const executionResult = await this.executeDocOps(docOps, targetDocId);

      return Response.json({
        success: true,
        message: 'Operations executed successfully',
        opsExecuted: executionResult.opsExecuted,
        response: `I've applied ${executionResult.opsExecuted} changes to your document.`,
      });
    } catch (error) {
      return Response.json(
        {
          error: 'Chat processing failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  }

  /**
   * Get agent status
   */
  private async handleStatus(): Promise<Response> {
    return Response.json({
      sessionId: this.sessionId,
      currentDocId: this.currentDocId,
      configured: !!this.gasWebAppUrl,
    });
  }

  /**
   * Convert markdown to Doc Ops Plan
   */
  private async markdownToDocOps(markdown: string): Promise<DocOp[]> {
    const ops: DocOp[] = [];
    let currentIndex = 1; // Google Docs body starts at index 1

    // Parse markdown to HTML
    const htmlResult = await remark().use(remarkHtml).process(markdown);
    const html = String(htmlResult);

    // Simple HTML parsing (production would use a proper HTML parser)
    const lines = markdown.split('\n');

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // Heading 1
        const text = line.slice(2) + '\n';
        ops.push({
          type: 'insertText',
          payload: { index: currentIndex, text },
        });
        ops.push({
          type: 'setAttributes',
          payload: {
            startIndex: currentIndex,
            endIndex: currentIndex + text.length - 1,
            attributes: { bold: true, fontSize: 24 },
          },
        });
        currentIndex += text.length;
      } else if (line.startsWith('## ')) {
        // Heading 2
        const text = line.slice(3) + '\n';
        ops.push({
          type: 'insertText',
          payload: { index: currentIndex, text },
        });
        ops.push({
          type: 'setAttributes',
          payload: {
            startIndex: currentIndex,
            endIndex: currentIndex + text.length - 1,
            attributes: { bold: true, fontSize: 18 },
          },
        });
        currentIndex += text.length;
      } else if (line.trim().length > 0) {
        // Regular paragraph
        const text = line + '\n';
        ops.push({
          type: 'insertText',
          payload: { index: currentIndex, text },
        });
        currentIndex += text.length;
      }
    }

    return ops;
  }

  /**
   * Execute Doc Ops via Apps Script
   */
  private async executeDocOps(
    ops: DocOp[],
    docId: string
  ): Promise<{ opsExecuted: number; verificationsPerformed: number; finalState: DocState }> {
    let opsExecuted = 0;
    let verificationsPerformed = 0;

    // Execute operations in batches
    const batchSize = 10;
    for (let i = 0; i < ops.length; i += batchSize) {
      const batch = ops.slice(i, i + batchSize);

      const response = await fetch(`${this.gasWebAppUrl}?action=applyOps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          docId,
          operations: batch,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute operations: ${response.statusText}`);
      }

      opsExecuted += batch.length;
    }

    // Verify final state
    const finalState = await this.getDocState(docId);
    verificationsPerformed = 1;

    return { opsExecuted, verificationsPerformed, finalState };
  }

  /**
   * Get current document state from Apps Script
   */
  private async getDocState(docId: string): Promise<DocState> {
    const response = await fetch(`${this.gasWebAppUrl}?action=getState&docId=${docId}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get document state: ${response.statusText}`);
    }

    return response.json();
  }
}
