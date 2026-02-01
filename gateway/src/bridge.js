/**
 * Claudia Core Bridge
 *
 * Connects the gateway to:
 * 1. LLM provider (Anthropic API or local Ollama) for response generation
 * 2. Memory daemon (via MCP subprocess) for recall/remember
 *
 * This is the brain of the gateway - it enriches messages with memory context,
 * builds prompts, calls the LLM, and stores new memories.
 *
 * Provider auto-detection: if ANTHROPIC_API_KEY is set, uses Anthropic.
 * Otherwise, uses the local Ollama model from ~/.claudia/config.json.
 */

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
    this.provider = null; // 'anthropic' | 'ollama'
    this.mcpClient = null;
    this.mcpTransport = null;
    this.memoryAvailable = false;
    this.extractor = null; // Set by gateway after construction
    this._consecutiveFailures = 0;
  }

  async start() {
    // Provider auto-detection: try Anthropic first, then Ollama
    const apiKey = this.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      // Anthropic path: dynamic import so gateway doesn't crash if SDK isn't installed
      try {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        this.anthropic = new Anthropic({ apiKey });
        this.provider = 'anthropic';
        log.info('Using Anthropic provider', { model: this.config.model });
      } catch (err) {
        log.warn('Anthropic SDK not available', { error: err.message });
      }
    }

    if (!this.provider) {
      // Ollama path: check if Ollama is running and a model is configured
      const ollamaModel = this.config.ollama?.model;
      const ollamaHost = this.config.ollama?.host || 'http://localhost:11434';

      if (!ollamaModel) {
        throw new Error(
          'No LLM provider available. Either:\n' +
            '  1. Set ANTHROPIC_API_KEY for cloud inference, or\n' +
            '  2. Install a local model: ollama pull qwen3:4b\n' +
            '     (model is auto-detected from ~/.claudia/config.json)'
        );
      }

      try {
        const res = await fetch(`${ollamaHost}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.provider = 'ollama';
        log.info('Using Ollama provider', { model: ollamaModel, host: ollamaHost });
      } catch (err) {
        throw new Error(
          `Ollama not reachable at ${ollamaHost} (${err.message}).\n` +
            '  Start Ollama or set ANTHROPIC_API_KEY for cloud inference.'
        );
      }
    }

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
  async processMessage(message, conversationHistory = [], episodeId = null) {
    const { text, userId, userName, channel } = message;

    // 1. Recall relevant memories (skip if memory is failing repeatedly)
    let memoryContext = '';
    if (this.memoryAvailable && this._consecutiveFailures < 3) {
      try {
        memoryContext = await this._recallContext(text, userName);
        this._consecutiveFailures = 0;
      } catch (err) {
        this._consecutiveFailures++;
        log.warn('Memory recall failed, continuing without context', {
          error: err.message,
          consecutiveFailures: this._consecutiveFailures,
        });
      }
    }

    // 2. Build the prompt
    const systemPrompt = this._buildSystemPrompt(memoryContext, userName, channel);

    // 3. Build message history
    const messages = [];
    for (const turn of conversationHistory) {
      messages.push({ role: 'user', content: turn.user });
      if (turn.assistant) {
        messages.push({ role: 'assistant', content: turn.assistant });
      }
    }
    messages.push({ role: 'user', content: text });

    // 4. Call LLM (Anthropic or Ollama)
    log.info('Calling LLM', {
      provider: this.provider,
      model: this.provider === 'anthropic' ? this.config.model : this.config.ollama.model,
      messageCount: messages.length,
    });

    let result;
    try {
      if (this.provider === 'anthropic') {
        result = await this._callAnthropic(systemPrompt, messages);
      } else {
        result = await this._callOllama(systemPrompt, messages);
      }
    } catch (err) {
      log.error('LLM call failed', { provider: this.provider, error: err.message });
      throw err;
    }

    const { text: responseText, usage } = result;

    // 5. Store the exchange in memory (always attempt -- resets failure counter on success)
    let returnedEpisodeId = episodeId;
    if (this.memoryAvailable) {
      // Await on first call (no episodeId) so we capture it for session continuity.
      // Subsequent calls fire-and-forget since we already have the episode.
      const bufferPromise = this._bufferTurn(text, responseText, channel, episodeId);

      if (!episodeId) {
        try {
          const bufferResult = await bufferPromise;
          this._consecutiveFailures = 0;
          if (bufferResult?.episode_id) {
            returnedEpisodeId = bufferResult.episode_id;
          }
        } catch (err) {
          this._consecutiveFailures++;
          log.warn('Failed to buffer turn', {
            error: err.message,
            consecutiveFailures: this._consecutiveFailures,
          });
        }
      } else {
        bufferPromise
          .then(() => { this._consecutiveFailures = 0; })
          .catch((err) => {
            this._consecutiveFailures++;
            log.warn('Failed to buffer turn', {
              error: err.message,
              consecutiveFailures: this._consecutiveFailures,
            });
          });
      }

      // 6. Fire-and-forget extraction
      if (this.extractor) {
        this._extractAsync(text, responseText, channel);
      }
    }

    return { text: responseText, usage, episodeId: returnedEpisodeId };
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
   * @param {string} userContent
   * @param {string} assistantContent
   * @param {string} [channel] - Source channel for tagging
   * @param {number|null} [episodeId] - Existing episode to append to
   * @returns {Object|null} Parsed MCP result with episode_id
   */
  async _bufferTurn(userContent, assistantContent, channel = null, episodeId = null) {
    if (!this.mcpClient) return null;

    try {
      const args = {
        user_content: userContent,
        assistant_content: assistantContent,
      };
      if (channel) args.source = channel;
      if (episodeId) args.episode_id = episodeId;

      const result = await this.mcpClient.callTool({
        name: 'memory.buffer_turn',
        arguments: args,
      });
      return this._parseMcpResult(result);
    } catch (err) {
      log.debug('Buffer turn failed', { error: err.message });
      return null;
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
   * End a session by building a narrative from history and calling memory.end_session.
   * Called by the router when a session expires (TTL cleanup).
   *
   * @param {Object} session - Session object with history and episodeId
   */
  async endSession(session) {
    if (!this.mcpClient || !session.episodeId || !session.history.length) return;

    try {
      // Build a minimal narrative from the conversation turns
      const lines = session.history.map((turn) => {
        const userSnippet = (turn.user || '').slice(0, 150);
        const assistantSnippet = (turn.assistant || '').slice(0, 150);
        return `User: ${userSnippet}\nCloudia: ${assistantSnippet}`;
      });
      const narrative =
        `Gateway session (${session.history.length} turns, ended by TTL expiry).\n\n` +
        lines.join('\n\n');

      await this.mcpClient.callTool({
        name: 'memory.end_session',
        arguments: {
          episode_id: session.episodeId,
          narrative,
        },
      });
      log.debug('Session ended via TTL', { episodeId: session.episodeId });
    } catch (err) {
      log.debug('Failed to end session', { error: err.message });
    }
  }

  /**
   * Fire-and-forget extraction from a conversation turn.
   * Calls the extractor module (if wired) to detect notes and extract facts.
   */
  _extractAsync(userMsg, assistantMsg, channel) {
    if (!this.extractor) return;
    this.extractor.extract(userMsg, assistantMsg, channel, this).catch((err) => {
      log.debug('Extraction failed (non-blocking)', { error: err.message });
    });
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
   * Call Anthropic API.
   * @returns {{ text: string, usage: Object }}
   */
  async _callAnthropic(systemPrompt, messages) {
    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 2048,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return { text, usage: response.usage };
  }

  /**
   * Call Ollama /api/chat endpoint.
   * Retries up to 2 times with 2s delay (matching memory daemon pattern).
   * @returns {{ text: string, usage: null }}
   */
  async _callOllama(systemPrompt, messages) {
    const host = this.config.ollama?.host || 'http://localhost:11434';
    const model = this.config.ollama?.model;

    // Build Ollama message array: system prompt + conversation turns
    const ollamaMessages = [{ role: 'system', content: systemPrompt }];
    for (const msg of messages) {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }

    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        log.debug('Retrying Ollama call', { attempt });
        await new Promise((r) => setTimeout(r, 2000));
      }

      try {
        const res = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: ollamaMessages,
            stream: false,
            options: { temperature: 0.7 },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Ollama HTTP ${res.status}: ${body}`);
        }

        const data = await res.json();
        return { text: data.message?.content || '', usage: null };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError;
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
      provider: this.provider,
      providerReady: this.provider === 'anthropic' ? !!this.anthropic : this.provider === 'ollama',
      memoryAvailable: this.memoryAvailable,
      model:
        this.provider === 'ollama' ? this.config.ollama?.model : this.config.model,
    };
  }
}
