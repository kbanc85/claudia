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
import { loadPersonality } from './personality.js';
import { ToolManager } from './tools.js';

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
    this._personality = null; // Loaded Claudia personality prompt
    this._toolManager = null; // ToolManager instance (or null if tool_use disabled)
    this._toolUseEnabled = false;
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

    // Load Claudia personality
    this._personality = loadPersonality(this.config);

    // Try to connect to memory daemon via MCP
    await this._connectMemory();

    // Initialize tool_use if memory is available and tool_use is enabled
    if (this.memoryAvailable && this._isToolUseEnabled()) {
      this._toolManager = new ToolManager();
      await this._toolManager.initialize(this.mcpClient);
      this._toolUseEnabled = this._toolManager.isReady();
      if (this._toolUseEnabled) {
        log.info('Tool use enabled', { toolCount: this._toolManager.toolCount });
      }
    }
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

    const useTools = this._toolUseEnabled && this._isToolUseEnabled(channel);

    // 1. Recall relevant memories (skip if tool_use is active and preRecall is off)
    let memoryContext = '';
    const doPreRecall = this.config.preRecall !== false;
    if (this.memoryAvailable && this._consecutiveFailures < 3 && (doPreRecall || !useTools)) {
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
    const systemPrompt = this._buildSystemPrompt(memoryContext, userName, channel, useTools);

    // 3. Build message history
    const messages = [];
    for (const turn of conversationHistory) {
      messages.push({ role: 'user', content: turn.user });
      if (turn.assistant) {
        messages.push({ role: 'assistant', content: turn.assistant });
      }
    }
    messages.push({ role: 'user', content: text });

    // 4. Call LLM (Anthropic or Ollama), with or without tool loop
    const resolvedModel = this._resolveModel(channel);
    log.info('Calling LLM', {
      provider: this.provider,
      model: resolvedModel,
      channel,
      messageCount: messages.length,
      toolUse: useTools,
    });

    let result;
    try {
      if (useTools) {
        if (this.provider === 'anthropic') {
          result = await this._callAnthropicWithTools(systemPrompt, messages, resolvedModel, channel);
        } else {
          result = await this._callOllamaWithTools(systemPrompt, messages, resolvedModel, channel);
        }
      } else {
        if (this.provider === 'anthropic') {
          result = await this._callAnthropic(systemPrompt, messages, resolvedModel);
        } else {
          result = await this._callOllama(systemPrompt, messages, resolvedModel);
        }
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
   * Resolve which model to use for a given channel.
   * Per-channel model overrides the global default.
   *
   * @param {string} channel - Channel name (e.g. 'telegram', 'slack')
   * @returns {string} Resolved model identifier
   */
  _resolveModel(channel) {
    // Check per-channel model override
    const channelModel = this.config.channels?.[channel]?.model;
    if (channelModel) return channelModel;

    // Fall back to global model for the active provider
    if (this.provider === 'anthropic') {
      return this.config.model;
    }
    return this.config.ollama?.model || '';
  }

  /**
   * Build the system prompt with memory context.
   *
   * Resolution chain for personality:
   * 1. Loaded personality from template dir (richest)
   * 2. Custom systemPromptPath file (backward compat)
   * 3. DEFAULT_SYSTEM_PROMPT fallback
   */
  _buildSystemPrompt(memoryContext, userName, channel, toolUse = false) {
    let prompt;

    if (this._personality) {
      // Full Claudia personality loaded from template files
      prompt = this._personality;
    } else if (this.config.systemPromptPath && existsSync(this.config.systemPromptPath)) {
      // Legacy: custom system prompt file
      try {
        prompt = readFileSync(this.config.systemPromptPath, 'utf8');
      } catch {
        prompt = DEFAULT_SYSTEM_PROMPT;
      }
    } else {
      prompt = DEFAULT_SYSTEM_PROMPT;
    }

    prompt += `\n\nChannel: ${channel}`;
    if (userName) {
      prompt += `\nUser: ${userName}`;
    }

    if (memoryContext) {
      prompt += `\n\n# Memory Context\n${memoryContext}`;
    }

    if (toolUse) {
      prompt += `\n\n# Memory Tools
You have access to memory tools to search, store, and manage your persistent knowledge. Use them naturally during conversation:
- Search for more context when a name, topic, or project comes up that you don't have enough info on
- Store new facts when the user mentions something important worth remembering
- Correct or invalidate memories when the user tells you something is wrong or outdated
- Trace provenance when asked where you learned something
Don't announce tool usage -- just use the tools and incorporate results naturally into your response.`;
    }

    return prompt;
  }

  /**
   * Call Anthropic API.
   * @param {string} systemPrompt
   * @param {Object[]} messages
   * @param {string} model - Resolved model to use
   * @returns {{ text: string, usage: Object }}
   */
  async _callAnthropic(systemPrompt, messages, model) {
    const response = await this.anthropic.messages.create({
      model,
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
   * @param {string} systemPrompt
   * @param {Object[]} messages
   * @param {string} model - Resolved model to use
   * @returns {{ text: string, usage: null }}
   */
  async _callOllama(systemPrompt, messages, model) {
    const host = this.config.ollama?.host || 'http://localhost:11434';

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
   * Check if tool_use is enabled for a given channel.
   * Resolution: per-channel override → global config → auto-detect by provider.
   *
   * @param {string} [channel] - Channel name
   * @returns {boolean}
   */
  _isToolUseEnabled(channel) {
    // Per-channel override (must be explicit boolean, not undefined)
    if (channel) {
      const channelToolUse = this.config.channels?.[channel]?.toolUse;
      if (typeof channelToolUse === 'boolean') return channelToolUse;
    }

    // Global config override
    if (typeof this.config.toolUse === 'boolean') return this.config.toolUse;

    // Auto-detect: enabled for Anthropic, disabled for Ollama
    return this.provider === 'anthropic';
  }

  /**
   * Call Anthropic API with tool_use loop.
   * Runs up to toolUseMaxIterations rounds, executing tool calls and feeding
   * results back until the model produces a final text response.
   *
   * @param {string} systemPrompt
   * @param {Object[]} messages - Conversation messages (will be mutated with tool results)
   * @param {string} model
   * @param {string} channel
   * @returns {{ text: string, usage: Object }}
   */
  async _callAnthropicWithTools(systemPrompt, messages, model, channel) {
    const tools = this._toolManager.getAnthropicTools();
    const maxIterations = this.config.toolUseMaxIterations || 5;
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: this.config.maxTokens || 2048,
        system: systemPrompt,
        messages,
        tools,
      });

      // Accumulate usage
      if (response.usage) {
        totalUsage.input_tokens += response.usage.input_tokens || 0;
        totalUsage.output_tokens += response.usage.output_tokens || 0;
      }

      // If model didn't request tool use, extract text and return
      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        return { text, usage: totalUsage };
      }

      // Process tool calls
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolUseBlocks) {
        log.debug('Tool call', {
          iteration,
          tool: block.name,
          id: block.id,
        });

        const result = await this._executeToolCall(block.name, block.input, channel);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      // Append assistant response + tool results for next iteration
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Exhausted iterations -- make one final call without tools to force a text response
    log.warn('Tool loop exhausted max iterations', { maxIterations });
    const finalResponse = await this.anthropic.messages.create({
      model,
      max_tokens: this.config.maxTokens || 2048,
      system: systemPrompt,
      messages,
    });

    if (finalResponse.usage) {
      totalUsage.input_tokens += finalResponse.usage.input_tokens || 0;
      totalUsage.output_tokens += finalResponse.usage.output_tokens || 0;
    }

    const text = finalResponse.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return { text, usage: totalUsage };
  }

  /**
   * Call Ollama /api/chat with tool_use loop.
   *
   * @param {string} systemPrompt
   * @param {Object[]} messages
   * @param {string} model
   * @param {string} channel
   * @returns {{ text: string, usage: null }}
   */
  async _callOllamaWithTools(systemPrompt, messages, model, channel) {
    const tools = this._toolManager.getOllamaTools();
    const host = this.config.ollama?.host || 'http://localhost:11434';
    const maxIterations = this.config.toolUseMaxIterations || 5;

    const ollamaMessages = [{ role: 'system', content: systemPrompt }];
    for (const msg of messages) {
      ollamaMessages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          stream: false,
          tools,
          options: { temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();

      // If no tool calls, return the text response
      if (!data.message?.tool_calls?.length) {
        return { text: data.message?.content || '', usage: null };
      }

      // Append assistant message with tool calls
      ollamaMessages.push(data.message);

      // Execute each tool call and add results
      for (const tc of data.message.tool_calls) {
        const toolName = tc.function?.name;
        const toolInput = tc.function?.arguments || {};

        log.debug('Ollama tool call', { iteration, tool: toolName });

        const result = await this._executeToolCall(toolName, toolInput, channel);
        ollamaMessages.push({
          role: 'tool',
          content: result,
        });
      }
    }

    // Exhausted iterations -- final call without tools
    log.warn('Ollama tool loop exhausted max iterations', { maxIterations });
    const finalRes = await fetch(`${host}/api/chat`, {
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

    if (!finalRes.ok) {
      const body = await finalRes.text().catch(() => '');
      throw new Error(`Ollama HTTP ${finalRes.status}: ${body}`);
    }

    const finalData = await finalRes.json();
    return { text: finalData.message?.content || '', usage: null };
  }

  /**
   * Execute a single tool call from the LLM against the MCP daemon.
   *
   * Safety: rejects calls to non-exposed tools.
   * Auto-injects source_channel for write operations.
   *
   * @param {string} toolName
   * @param {Object} toolInput
   * @param {string} channel
   * @returns {string} JSON string result (always valid, errors wrapped)
   */
  async _executeToolCall(toolName, toolInput, channel) {
    // Safety gate: only execute exposed tools
    if (!this._toolManager.isExposed(toolName)) {
      log.warn('LLM attempted to call non-exposed tool', { tool: toolName });
      return JSON.stringify({ error: `Tool "${toolName}" is not available` });
    }

    try {
      // Auto-inject source_channel for write operations
      const writeTools = new Set(['memory.remember', 'memory.batch', 'memory.correct']);
      if (writeTools.has(toolName) && channel) {
        toolInput = { ...toolInput, source_channel: channel };
      }

      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: toolInput,
      });

      const parsed = this._parseMcpResult(result);
      return JSON.stringify(parsed ?? { ok: true });
    } catch (err) {
      log.warn('Tool execution failed', { tool: toolName, error: err.message });
      return JSON.stringify({ error: err.message });
    }
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
      personalityLoaded: !!this._personality,
      model:
        this.provider === 'ollama' ? this.config.ollama?.model : this.config.model,
      toolUseEnabled: this._toolUseEnabled,
      toolCount: this._toolManager?.toolCount || 0,
    };
  }
}
