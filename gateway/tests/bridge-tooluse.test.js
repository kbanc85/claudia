import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.js';

// --- Mock helpers ---

/**
 * Create a Bridge with mocked internals for testing tool_use flow.
 * Skips start() entirely; sets up provider, mcpClient, and toolManager directly.
 */
function createTestBridge(opts = {}) {
  const config = {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
    toolUse: opts.toolUse ?? true,
    toolUseMaxIterations: opts.maxIterations ?? 5,
    preRecall: opts.preRecall ?? true,
    channels: {
      telegram: { model: '', toolUse: opts.telegramToolUse },
      slack: { model: '', toolUse: opts.slackToolUse },
    },
    memoryDaemon: { pythonPath: '/nonexistent', moduleName: 'test' },
    ...opts.configOverrides,
  };

  const bridge = new Bridge(config);
  bridge.provider = opts.provider || 'anthropic';
  bridge.memoryAvailable = true;
  bridge._personality = 'You are Claudia.';

  // Mock MCP client
  bridge.mcpClient = {
    callTool: opts.mcpCallTool || (async ({ name, arguments: args }) => ({
      content: [{ type: 'text', text: JSON.stringify({ tool: name, args, ok: true }) }],
    })),
    listTools: async () => ({ tools: [] }),
  };

  // Mock ToolManager
  bridge._toolManager = {
    isExposed: (name) => {
      const mcpName = name.replace(/_/g, '.');
      const blocked = ['memory.purge', 'memory.buffer_turn', 'memory.merge_entities'];
      return (name.startsWith('memory.') || name.startsWith('memory_')) &&
        !blocked.includes(name) && !blocked.includes(mcpName);
    },
    getAnthropicTools: () => [
      { name: 'memory_recall', description: 'Search memories', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'memory_remember', description: 'Store memory', input_schema: { type: 'object', properties: { content: { type: 'string' } } } },
    ],
    getOllamaTools: () => [
      { type: 'function', function: { name: 'memory.recall', description: 'Search memories', parameters: { type: 'object', properties: { query: { type: 'string' } } } } },
    ],
    isReady: () => true,
    toolCount: 2,
  };
  bridge._toolUseEnabled = true;

  // Mock Anthropic client
  bridge.anthropic = {
    messages: {
      create: opts.anthropicCreate || (async () => ({
        content: [{ type: 'text', text: 'Hello from Claudia!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      })),
    },
  };

  return bridge;
}

describe('Bridge._isToolUseEnabled', () => {
  it('returns true for Anthropic by default (auto-detect)', () => {
    const bridge = new Bridge({
      channels: {},
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge.provider = 'anthropic';
    assert.equal(bridge._isToolUseEnabled(), true);
  });

  it('returns false for Ollama by default (auto-detect)', () => {
    const bridge = new Bridge({
      channels: {},
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge.provider = 'ollama';
    assert.equal(bridge._isToolUseEnabled(), false);
  });

  it('respects global toolUse: false override', () => {
    const bridge = new Bridge({
      toolUse: false,
      channels: {},
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge.provider = 'anthropic';
    assert.equal(bridge._isToolUseEnabled(), false);
  });

  it('respects per-channel toolUse override', () => {
    const bridge = new Bridge({
      toolUse: true,
      channels: { telegram: { toolUse: false } },
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge.provider = 'anthropic';

    assert.equal(bridge._isToolUseEnabled('telegram'), false);
    assert.equal(bridge._isToolUseEnabled('slack'), true);
  });

  it('per-channel undefined falls through to global', () => {
    const bridge = new Bridge({
      toolUse: true,
      channels: { telegram: { toolUse: undefined } },
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge.provider = 'anthropic';
    assert.equal(bridge._isToolUseEnabled('telegram'), true);
  });
});

describe('Bridge._callAnthropicWithTools', () => {
  it('handles text-only response (no tool calls)', async () => {
    const bridge = createTestBridge();

    const result = await bridge._callAnthropicWithTools(
      'You are Claudia.',
      [{ role: 'user', content: 'Hello' }],
      'claude-sonnet-4-20250514',
      'telegram'
    );

    assert.equal(result.text, 'Hello from Claudia!');
    assert.ok(result.usage);
  });

  it('executes single tool call and returns final text', async () => {
    let callCount = 0;
    const bridge = createTestBridge({
      anthropicCreate: async (params) => {
        callCount++;
        if (callCount === 1) {
          // First call: model wants to use a tool
          return {
            content: [
              { type: 'text', text: 'Let me check...' },
              { type: 'tool_use', id: 'tu_1', name: 'memory_recall', input: { query: 'user preferences' } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 50, output_tokens: 30 },
          };
        }
        // Second call: model responds with text
        return {
          content: [{ type: 'text', text: 'Based on your preferences, you like coffee.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 80, output_tokens: 40 },
        };
      },
    });

    const messages = [{ role: 'user', content: 'What do I like?' }];
    const result = await bridge._callAnthropicWithTools(
      'System prompt',
      messages,
      'claude-sonnet-4-20250514',
      'telegram'
    );

    assert.equal(result.text, 'Based on your preferences, you like coffee.');
    assert.equal(callCount, 2);
    // Usage should be accumulated
    assert.equal(result.usage.input_tokens, 130);
    assert.equal(result.usage.output_tokens, 70);
  });

  it('handles multiple tool calls in one response', async () => {
    let callCount = 0;
    const toolCalls = [];

    const bridge = createTestBridge({
      anthropicCreate: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            content: [
              { type: 'tool_use', id: 'tu_1', name: 'memory_recall', input: { query: 'Alice' } },
              { type: 'tool_use', id: 'tu_2', name: 'memory_recall', input: { query: 'Bob' } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 50, output_tokens: 30 },
          };
        }
        return {
          content: [{ type: 'text', text: 'Found info on both.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 80, output_tokens: 20 },
        };
      },
      mcpCallTool: async ({ name, arguments: args }) => {
        toolCalls.push({ name, args });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });

    const result = await bridge._callAnthropicWithTools(
      'System',
      [{ role: 'user', content: 'Tell me about Alice and Bob' }],
      'model',
      'telegram'
    );

    assert.equal(result.text, 'Found info on both.');
    assert.equal(toolCalls.length, 2);
    assert.equal(toolCalls[0].args.query, 'Alice');
    assert.equal(toolCalls[1].args.query, 'Bob');
  });

  it('respects max iterations guard', async () => {
    let callCount = 0;

    const bridge = createTestBridge({
      maxIterations: 2,
      anthropicCreate: async (params) => {
        callCount++;
        // Always request tool use (except final forced call without tools)
        if (params.tools) {
          return {
            content: [
              { type: 'tool_use', id: `tu_${callCount}`, name: 'memory_recall', input: { query: 'test' } },
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 10 },
          };
        }
        // Final call without tools
        return {
          content: [{ type: 'text', text: 'Final response after max iterations' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    });

    const result = await bridge._callAnthropicWithTools(
      'System',
      [{ role: 'user', content: 'Keep calling' }],
      'model',
      'telegram'
    );

    assert.equal(result.text, 'Final response after max iterations');
    // 2 iterations with tools + 1 final without tools = 3 total API calls
    assert.equal(callCount, 3);
  });
});

describe('Bridge._executeToolCall', () => {
  it('rejects non-exposed tools', async () => {
    const bridge = createTestBridge();
    const result = await bridge._executeToolCall('memory_purge', {}, 'telegram');

    const parsed = JSON.parse(result);
    assert.ok(parsed.error);
    assert.ok(parsed.error.includes('not available'));
  });

  it('auto-injects source_channel for memory.remember', async () => {
    let capturedArgs;
    let capturedName;
    const bridge = createTestBridge({
      mcpCallTool: async ({ name, arguments: args }) => {
        capturedName = name;
        capturedArgs = args;
        return { content: [{ type: 'text', text: '{"ok": true}' }] };
      },
    });

    // LLM sends underscore name; MCP should receive dot name
    await bridge._executeToolCall('memory_remember', { content: 'User likes tea' }, 'telegram');

    assert.equal(capturedName, 'memory.remember', 'MCP should receive dot-notation name');
    assert.equal(capturedArgs.source_channel, 'telegram');
    assert.equal(capturedArgs.content, 'User likes tea');
  });

  it('auto-injects source_channel for memory.batch', async () => {
    let capturedArgs;
    let capturedName;
    const bridge = createTestBridge({
      mcpCallTool: async ({ name, arguments: args }) => {
        capturedName = name;
        capturedArgs = args;
        return { content: [{ type: 'text', text: '{"ok": true}' }] };
      },
    });

    await bridge._executeToolCall('memory_batch', { operations: [] }, 'slack');

    assert.equal(capturedName, 'memory.batch', 'MCP should receive dot-notation name');
    assert.equal(capturedArgs.source_channel, 'slack');
  });

  it('does not inject source_channel for read operations', async () => {
    let capturedArgs;
    const bridge = createTestBridge({
      mcpCallTool: async ({ name, arguments: args }) => {
        capturedArgs = args;
        return { content: [{ type: 'text', text: '{"results": []}' }] };
      },
    });

    await bridge._executeToolCall('memory_recall', { query: 'test' }, 'telegram');

    assert.equal(capturedArgs.source_channel, undefined);
    assert.equal(capturedArgs.query, 'test');
  });

  it('converts underscore names to dots for MCP calls', async () => {
    let capturedName;
    const bridge = createTestBridge({
      mcpCallTool: async ({ name, arguments: args }) => {
        capturedName = name;
        return { content: [{ type: 'text', text: '{"results": []}' }] };
      },
    });

    await bridge._executeToolCall('memory_recall', { query: 'test' }, 'telegram');
    assert.equal(capturedName, 'memory.recall');

    await bridge._executeToolCall('memory_search_entities', { query: 'Alice' }, 'telegram');
    assert.equal(capturedName, 'memory.search_entities');
  });

  it('returns error JSON on MCP failure (never throws)', async () => {
    const bridge = createTestBridge({
      mcpCallTool: async () => {
        throw new Error('Connection lost');
      },
    });

    const result = await bridge._executeToolCall('memory_recall', { query: 'test' }, 'telegram');
    const parsed = JSON.parse(result);

    assert.ok(parsed.error);
    assert.ok(parsed.error.includes('Connection lost'));
  });
});

describe('Bridge.processMessage with toolUse', () => {
  it('uses tool loop when toolUse is enabled', async () => {
    let usedTools = false;
    const bridge = createTestBridge({
      anthropicCreate: async (params) => {
        if (params.tools) usedTools = true;
        return {
          content: [{ type: 'text', text: 'Response with tools' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    });

    const result = await bridge.processMessage(
      { text: 'Hello', userId: '1', userName: 'Test', channel: 'telegram' },
      []
    );

    assert.equal(result.text, 'Response with tools');
    assert.ok(usedTools, 'Should have passed tools to API');
  });

  it('skips tool loop when toolUse is disabled', async () => {
    let usedTools = false;
    const bridge = createTestBridge({
      toolUse: false,
      anthropicCreate: async (params) => {
        if (params.tools) usedTools = true;
        return {
          content: [{ type: 'text', text: 'Response without tools' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    });
    bridge._toolUseEnabled = false;

    const result = await bridge.processMessage(
      { text: 'Hello', userId: '1', userName: 'Test', channel: 'telegram' },
      []
    );

    assert.equal(result.text, 'Response without tools');
    assert.ok(!usedTools, 'Should NOT have passed tools to API');
  });
});

describe('Bridge._buildSystemPrompt with toolUse', () => {
  it('appends tool instructions when toolUse is true', () => {
    const bridge = new Bridge({
      channels: {},
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge._personality = 'You are Claudia.';

    const prompt = bridge._buildSystemPrompt('', 'Test', 'telegram', true);
    assert.ok(prompt.includes('# Memory Tools'));
    assert.ok(prompt.includes('Search for more context'));
  });

  it('omits tool instructions when toolUse is false', () => {
    const bridge = new Bridge({
      channels: {},
      memoryDaemon: { pythonPath: '/x', moduleName: 'x' },
    });
    bridge._personality = 'You are Claudia.';

    const prompt = bridge._buildSystemPrompt('', 'Test', 'telegram', false);
    assert.ok(!prompt.includes('# Memory Tools'));
  });
});
