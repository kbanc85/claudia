/**
 * Tool Schema Manager for Claudia Gateway
 *
 * Fetches MCP tool schemas from the memory daemon, filters to a curated
 * subset safe for LLM use, and converts them to Anthropic/Ollama formats.
 *
 * Design: rather than hardcoding 14 tool definitions in JavaScript
 * (duplicating the Python schemas), we fetch at startup, filter to the
 * curated set, and convert the format. When daemon schemas change, the
 * gateway automatically picks them up.
 */

import { createLogger } from './utils/logger.js';

const log = createLogger('tools');

/**
 * Tools exposed to the LLM for agentic use.
 *
 * Criteria for inclusion:
 * - Read-only or safe writes (remember, correct, invalidate)
 * - Useful in a conversational context
 * - No destructive/admin operations
 * - No session lifecycle tools (gateway manages those internally)
 */
const EXPOSED_TOOLS = new Set([
  'memory.recall',
  'memory.about',
  'memory.remember',
  'memory.relate',
  'memory.entity',
  'memory.search_entities',
  'memory.batch',
  'memory.correct',
  'memory.invalidate',
  'memory.trace',
  'memory.reflections',
  'memory.project_network',
  'memory.find_path',
  'memory.briefing',
]);

export class ToolManager {
  constructor() {
    this._mcpTools = [];       // Raw MCP tool schemas (filtered)
    this._anthropicTools = [];  // Converted to Anthropic format
    this._ollamaTools = [];     // Converted to Ollama format
    this._initialized = false;
  }

  /**
   * Fetch tool schemas from the MCP daemon and prepare provider-specific formats.
   *
   * @param {import('@modelcontextprotocol/sdk/client/index.js').Client} mcpClient
   */
  async initialize(mcpClient) {
    try {
      const result = await mcpClient.listTools();
      const allTools = result?.tools || [];

      // Filter to the curated exposed set
      this._mcpTools = allTools.filter((t) => EXPOSED_TOOLS.has(t.name));

      // Convert to provider formats
      this._anthropicTools = this._mcpTools.map((t) => this._toAnthropicSchema(t));
      this._ollamaTools = this._mcpTools.map((t) => this._toOllamaSchema(t));

      this._initialized = true;
      log.info('Tool schemas loaded', {
        total: allTools.length,
        exposed: this._mcpTools.length,
      });
    } catch (err) {
      log.warn('Failed to load tool schemas', { error: err.message });
      this._mcpTools = [];
      this._anthropicTools = [];
      this._ollamaTools = [];
      this._initialized = false;
    }
  }

  /**
   * Get tools in Anthropic API format.
   * @returns {Object[]} Array of { name, description, input_schema }
   */
  getAnthropicTools() {
    return this._anthropicTools;
  }

  /**
   * Get tools in Ollama API format.
   * @returns {Object[]} Array of { type: 'function', function: { name, description, parameters } }
   */
  getOllamaTools() {
    return this._ollamaTools;
  }

  /**
   * Check whether a tool name is in the exposed set.
   * Used as a safety gate before executing tool calls from the LLM.
   *
   * @param {string} toolName
   * @returns {boolean}
   */
  isExposed(toolName) {
    return EXPOSED_TOOLS.has(toolName);
  }

  /**
   * @returns {boolean} Whether initialization succeeded and tools are available
   */
  isReady() {
    return this._initialized && this._anthropicTools.length > 0;
  }

  /**
   * @returns {number} Number of exposed tools loaded
   */
  get toolCount() {
    return this._anthropicTools.length;
  }

  // --- Private conversion methods ---

  /**
   * Convert an MCP tool schema to Anthropic format.
   *
   * MCP: { name, description, inputSchema: { type, properties, required } }
   * Anthropic: { name, description, input_schema: { type, properties, required } }
   */
  _toAnthropicSchema(mcpTool) {
    const inputSchema = this._normalizeSchema(mcpTool.inputSchema || { type: 'object', properties: {} });
    return {
      name: mcpTool.name,
      description: mcpTool.description || '',
      input_schema: inputSchema,
    };
  }

  /**
   * Convert an MCP tool schema to Ollama format.
   *
   * Ollama: { type: 'function', function: { name, description, parameters } }
   */
  _toOllamaSchema(mcpTool) {
    const parameters = this._normalizeSchema(mcpTool.inputSchema || { type: 'object', properties: {} });
    return {
      type: 'function',
      function: {
        name: mcpTool.name,
        description: mcpTool.description || '',
        parameters,
      },
    };
  }

  /**
   * Normalize JSON Schema types for provider compatibility.
   *
   * MCP/Python sometimes emits union types like `"type": ["array", "string"]`
   * which aren't valid in Anthropic's tool schema. We pick the first type
   * and note the alternative in the description.
   *
   * @param {Object} schema - JSON Schema object
   * @returns {Object} Normalized schema (deep copy)
   */
  _normalizeSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;

    const normalized = Array.isArray(schema) ? [...schema] : { ...schema };

    // Normalize union types at this level
    if (Array.isArray(normalized.type)) {
      const types = normalized.type.filter((t) => t !== 'null');
      normalized.type = types[0] || 'string';
      if (types.length > 1) {
        const altTypes = types.slice(1).join(', ');
        normalized.description = normalized.description
          ? `${normalized.description} (also accepts: ${altTypes})`
          : `Also accepts: ${altTypes}`;
      }
    }

    // Recursively normalize nested properties
    if (normalized.properties && typeof normalized.properties === 'object') {
      const normalizedProps = {};
      for (const [key, value] of Object.entries(normalized.properties)) {
        normalizedProps[key] = this._normalizeSchema(value);
      }
      normalized.properties = normalizedProps;
    }

    // Normalize items schema (for arrays)
    if (normalized.items && typeof normalized.items === 'object') {
      normalized.items = this._normalizeSchema(normalized.items);
    }

    return normalized;
  }
}

export { EXPOSED_TOOLS };
