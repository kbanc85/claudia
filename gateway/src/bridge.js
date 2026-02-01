/**
 * Claudia Core Bridge
 *
 * Connects the gateway to:
 * 1. Anthropic API (Claude) for response generation
 * 2. Memory daemon (via MCP subprocess) for recall/remember
 *
 * This is the brain of the gateway - it enriches messages with memory context,
 * builds prompts, calls Claude, and stores new memories.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { createLogger } from './utils/logger.js';

const log = createLogger('bridge');

const DEFAULT_SYSTEM_PROMPT = `You are Claudia, an AI executive assistant who is warm, sharp, and proactive. You are responding via a messaging app (Telegram/Slack). Keep responses concise and conversational - this is chat, not a document.

Key behaviors:
- Be direct and helpful. Short replies when appropriate, detailed when needed.
- You have access to persistent memory. Use recalled context naturally.
- When someone mentions a commitment or follow-up, note it.
- Be personable but professional. You know this person.
- Use plain text formatting suitable for chat (no complex markdown).
- If you don't have enough context, ask clarifying questions.`;

export class Bridge {
  /**
   * @param {Object} config - Full gateway config
   */
  constructor(config) {
    this.config = config;
    this.anthropic = null;
    this.mcpClient = null;
    this.mcpTransport = null;
    this.memoryAvailable = false;
  }

  async start() {
    // Initialize Anthropic client
    const apiKey = this.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not configured. Set anthropicApiKey in gateway.json or ANTHROPIC_API_KEY env var'
      );
    }

    this.anthropic = new Anthropic({ apiKey });
    log.info('Anthropic client initialized', { model: this.config.model });

    // Try to connect to memory daemon via MCP
    await this._connectMemory();
  }

  async stop() {
    if (this.mcpTransport) {
      try {
        await this.mcpTransport.close();
      } catch {
        // ignore
      }
      this.mcpClient = null;
      this.mcpTransport = null;
      this.memoryAvailable = false;
    }
    log.info('Bridge stopped');
  }

  /**
   * Process an inbound message and generate a response.
   *
   * @param {Object} message - Standardized message from adapter
   * @param {string} message.text - User's message text
   * @param {string} message.userId - Platform user ID
   * @param {string} message.userName - User's display name
   * @param {string} message.channel - Channel name
   * @param {Object[]} conversationHistory - Recent turns for this session
   * @returns {Object} { text: string, memories?: Object[] }
   */
  async processMessage(message, conversationHistory = []) {
    const { text, userId, userName, channel } = message;

    // 1. Recall relevant memories
    let memoryContext = '';
    if (this.memoryAvailable) {
      try {
        memoryContext = await this._recallContext(text, userName);
      } catch (err) {
        log.warn('Memory recall failed, continuing without context', { error: err.message });
      }
    }

    // 2. Build the prompt
    const systemPrompt = this._buildSystemPrompt(memoryContext, userName, channel);

    // 3. Build message history
    const messages = [];
    for (const turn of conversationHistory.slice(-10)) {
      messages.push({ role: 'user', content: turn.user });
      if (turn.assistant) {
        messages.push({ role: 'assistant', content: turn.assistant });
      }
    }
    messages.push({ role: 'user', content: text });

    // 4. Call Claude
    log.info('Calling Claude API', { model: this.config.model, messageCount: messages.length });

    try {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 2048,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      // 5. Store the exchange in memory (async, don't block response)
      if (this.memoryAvailable) {
        this._bufferTurn(text, responseText).catch((err) => {
          log.warn('Failed to buffer turn', { error: err.message });
        });
      }

      return {
        text: responseText,
        usage: response.usage,
      };
    } catch (err) {
      log.error('Claude API call failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Recall relevant memory context for a query.
   */
  async _recallContext(query, userName) {
    if (!this.mcpClient) return '';

    const sections = [];

    // Semantic recall
    try {
      const recallResult = await this.mcpClient.callTool({
        name: 'memory.recall',
        arguments: { query, limit: 5, compact: false },
      });

      const data = this._parseMcpResult(recallResult);
      if (data?.results?.length > 0) {
        sections.push('## Relevant Memories');
        for (const mem of data.results) {
          const entities = mem.entities?.join(', ') || '';
          const prefix = entities ? `[${entities}] ` : '';
          sections.push(`- ${prefix}${mem.content}`);
        }
      }
    } catch (err) {
      log.debug('Recall failed', { error: err.message });
    }

    // Entity context (if user name is known)
    if (userName && userName !== 'Unknown') {
      try {
        const aboutResult = await this.mcpClient.callTool({
          name: 'memory.about',
          arguments: { entity: userName, limit: 5 },
        });

        const data = this._parseMcpResult(aboutResult);
        if (data?.memories?.length > 0) {
          sections.push(`\n## About ${userName}`);
          for (const mem of data.memories) {
            sections.push(`- ${mem.content}`);
          }
        }
      } catch (err) {
        log.debug('Entity recall failed', { error: err.message });
      }
    }

    return sections.join('\n');
  }

  /**
   * Store a conversation turn in memory buffer.
   */
  async _bufferTurn(userContent, assistantContent) {
    if (!this.mcpClient) return;

    try {
      await this.mcpClient.callTool({
        name: 'memory.buffer_turn',
        arguments: {
          user_content: userContent,
          assistant_content: assistantContent,
        },
      });
    } catch (err) {
      log.debug('Buffer turn failed', { error: err.message });
    }
  }

  /**
   * Remember a fact via the memory daemon.
   */
  async remember(content, type = 'fact', about = [], importance = 1.0) {
    if (!this.mcpClient) return null;

    try {
      const result = await this.mcpClient.callTool({
        name: 'memory.remember',
        arguments: { content, type, about, importance },
      });
      return this._parseMcpResult(result);
    } catch (err) {
      log.warn('Remember failed', { error: err.message });
      return null;
    }
  }

  /**
   * Get predictions from the memory daemon for proactive notifications.
   */
  async getPredictions(limit = 5) {
    if (!this.mcpClient) return [];

    try {
      const result = await this.mcpClient.callTool({
        name: 'memory.predictions',
        arguments: { limit },
      });
      const data = this._parseMcpResult(result);
      return data?.predictions || [];
    } catch (err) {
      log.debug('Predictions failed', { error: err.message });
      return [];
    }
  }

  /**
   * Build the system prompt with memory context.
   */
  _buildSystemPrompt(memoryContext, userName, channel) {
    let prompt = DEFAULT_SYSTEM_PROMPT;

    // Load custom system prompt if configured
    if (this.config.systemPromptPath && existsSync(this.config.systemPromptPath)) {
      try {
        prompt = readFileSync(this.config.systemPromptPath, 'utf8');
      } catch {
        // Fall back to default
      }
    }

    prompt += `\n\nChannel: ${channel}`;
    if (userName) {
      prompt += `\nUser: ${userName}`;
    }

    if (memoryContext) {
      prompt += `\n\n# Memory Context\n${memoryContext}`;
    }

    return prompt;
  }

  /**
   * Connect to the memory daemon via MCP stdio.
   */
  async _connectMemory() {
    const { pythonPath, moduleName, projectDir } = this.config.memoryDaemon;

    if (!existsSync(pythonPath)) {
      log.warn('Memory daemon Python not found, running without memory', { pythonPath });
      return;
    }

    try {
      const args = ['-m', moduleName];
      if (projectDir) {
        args.push('--project-dir', projectDir);
      }

      this.mcpTransport = new StdioClientTransport({
        command: pythonPath,
        args,
      });

      this.mcpClient = new Client(
        { name: 'claudia-gateway', version: '0.1.0' },
        { capabilities: {} }
      );

      await this.mcpClient.connect(this.mcpTransport);
      this.memoryAvailable = true;
      log.info('Connected to memory daemon via MCP');
    } catch (err) {
      log.warn('Failed to connect to memory daemon', { error: err.message });
      this.mcpClient = null;
      this.mcpTransport = null;
      this.memoryAvailable = false;
    }
  }

  /**
   * Parse MCP tool result content.
   */
  _parseMcpResult(result) {
    if (!result?.content?.length) return null;
    const textContent = result.content.find((c) => c.type === 'text');
    if (!textContent) return null;
    try {
      return JSON.parse(textContent.text);
    } catch {
      return { text: textContent.text };
    }
  }

  getStatus() {
    return {
      anthropicReady: !!this.anthropic,
      memoryAvailable: this.memoryAvailable,
      model: this.config.model,
    };
  }
}
