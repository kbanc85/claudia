import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolManager, EXPOSED_TOOLS } from '../src/tools.js';

// Mock MCP tool schemas matching what the daemon returns
const MOCK_MCP_TOOLS = [
  {
    name: 'memory.recall',
    description: 'Search memories semantically',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory.remember',
    description: 'Store a new memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content' },
        about: { type: ['array', 'string'], description: 'Related entities' },
        importance: { type: 'number', description: 'Importance score' },
      },
      required: ['content'],
    },
  },
  {
    name: 'memory.about',
    description: 'Get context about an entity',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string' },
      },
      required: ['entity'],
    },
  },
  // Gateway-internal tool (should be filtered out)
  {
    name: 'memory.buffer_turn',
    description: 'Buffer a conversation turn',
    inputSchema: {
      type: 'object',
      properties: {
        user_content: { type: 'string' },
        assistant_content: { type: 'string' },
      },
    },
  },
  // Destructive/admin tool (should be filtered out)
  {
    name: 'memory.purge',
    description: 'Purge all memories',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory.merge_entities',
    description: 'Merge duplicate entities',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        target: { type: 'string' },
      },
    },
  },
];

class MockMcpClient {
  constructor(tools = MOCK_MCP_TOOLS) {
    this._tools = tools;
  }
  async listTools() {
    return { tools: this._tools };
  }
}

describe('ToolManager', () => {
  it('filters to only exposed tools', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient());

    const tools = tm.getAnthropicTools();
    const names = tools.map((t) => t.name);

    assert.ok(names.includes('memory_recall'));
    assert.ok(names.includes('memory_remember'));
    assert.ok(names.includes('memory_about'));
    assert.ok(!names.includes('memory_buffer_turn'), 'Should filter out gateway-internal tools');
    assert.ok(!names.includes('memory_purge'), 'Should filter out destructive tools');
    assert.ok(!names.includes('memory_merge_entities'), 'Should filter out admin tools');
  });

  it('converts MCP inputSchema to Anthropic input_schema', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient());

    const recallTool = tm.getAnthropicTools().find((t) => t.name === 'memory_recall');
    assert.ok(recallTool);
    assert.ok(recallTool.input_schema, 'Should have input_schema (snake_case)');
    assert.equal(recallTool.input_schema.type, 'object');
    assert.ok(recallTool.input_schema.properties.query);
    assert.deepEqual(recallTool.input_schema.required, ['query']);
  });

  it('converts dot names to underscores for Anthropic format', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient());

    const tools = tm.getAnthropicTools();
    for (const tool of tools) {
      assert.ok(!tool.name.includes('.'), `Anthropic tool name should not contain dots: ${tool.name}`);
      assert.ok(/^[a-zA-Z0-9_-]+$/.test(tool.name), `Anthropic tool name must match API regex: ${tool.name}`);
    }
  });

  it('normalizes union types like ["array", "string"]', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient());

    const rememberTool = tm.getAnthropicTools().find((t) => t.name === 'memory_remember');
    const aboutProp = rememberTool.input_schema.properties.about;

    // Should normalize to the first non-null type
    assert.equal(aboutProp.type, 'array');
    // Should note the alternative in description
    assert.ok(aboutProp.description.includes('string'), 'Should mention alternative type');
  });

  it('converts to Ollama format', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient());

    const tools = tm.getOllamaTools();
    assert.ok(tools.length > 0);

    const recallTool = tools.find((t) => t.function.name === 'memory.recall');
    assert.ok(recallTool);
    assert.equal(recallTool.type, 'function');
    assert.ok(recallTool.function.description);
    assert.ok(recallTool.function.parameters);
    assert.equal(recallTool.function.parameters.type, 'object');
  });

  it('isExposed returns correct values', () => {
    const tm = new ToolManager();

    assert.equal(tm.isExposed('memory.recall'), true);
    assert.equal(tm.isExposed('memory.remember'), true);
    assert.equal(tm.isExposed('memory.trace'), true);
    assert.equal(tm.isExposed('memory.buffer_turn'), false);
    assert.equal(tm.isExposed('memory.purge'), false);
    assert.equal(tm.isExposed('memory.merge_entities'), false);
    assert.equal(tm.isExposed('nonexistent.tool'), false);
  });

  it('isExposed accepts both dot and underscore names', () => {
    const tm = new ToolManager();

    // Dot names (MCP format)
    assert.equal(tm.isExposed('memory.recall'), true);
    assert.equal(tm.isExposed('memory.remember'), true);

    // Underscore names (Anthropic format)
    assert.equal(tm.isExposed('memory_recall'), true);
    assert.equal(tm.isExposed('memory_remember'), true);
    assert.equal(tm.isExposed('memory_trace'), true);

    // Non-exposed still rejected in both formats
    assert.equal(tm.isExposed('memory_purge'), false);
    assert.equal(tm.isExposed('memory_buffer_turn'), false);
  });

  it('handles empty tool list gracefully', async () => {
    const tm = new ToolManager();
    await tm.initialize(new MockMcpClient([]));

    assert.deepEqual(tm.getAnthropicTools(), []);
    assert.deepEqual(tm.getOllamaTools(), []);
    assert.equal(tm.isReady(), false);
    assert.equal(tm.toolCount, 0);
  });

  it('handles MCP client error gracefully', async () => {
    const failingClient = {
      async listTools() {
        throw new Error('Connection refused');
      },
    };

    const tm = new ToolManager();
    await tm.initialize(failingClient);

    assert.equal(tm.isReady(), false);
    assert.deepEqual(tm.getAnthropicTools(), []);
  });

  it('EXPOSED_TOOLS contains expected set of 14 tools', () => {
    assert.equal(EXPOSED_TOOLS.size, 14);
    assert.ok(EXPOSED_TOOLS.has('memory.recall'));
    assert.ok(EXPOSED_TOOLS.has('memory.about'));
    assert.ok(EXPOSED_TOOLS.has('memory.remember'));
    assert.ok(EXPOSED_TOOLS.has('memory.relate'));
    assert.ok(EXPOSED_TOOLS.has('memory.entity'));
    assert.ok(EXPOSED_TOOLS.has('memory.search_entities'));
    assert.ok(EXPOSED_TOOLS.has('memory.batch'));
    assert.ok(EXPOSED_TOOLS.has('memory.correct'));
    assert.ok(EXPOSED_TOOLS.has('memory.invalidate'));
    assert.ok(EXPOSED_TOOLS.has('memory.trace'));
    assert.ok(EXPOSED_TOOLS.has('memory.reflections'));
    assert.ok(EXPOSED_TOOLS.has('memory.project_network'));
    assert.ok(EXPOSED_TOOLS.has('memory.find_path'));
    assert.ok(EXPOSED_TOOLS.has('memory.briefing'));
  });
});
