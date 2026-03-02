#!/usr/bin/env node

/**
 * Claudia CLI - Pure Node.js memory system.
 * Replaces the Python MCP daemon with CLI subcommands.
 *
 * Usage:
 *   claudia memory save "fact" --person Kamil
 *   claudia memory recall "query"
 *   claudia system-health
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('claudia')
  .description('Claudia CLI - An AI assistant who learns how you work')
  .version(pkg.version)
  .option('--project-dir <dir>', 'Workspace directory (auto-detected if omitted)');

// Register subcommands (lazy-loaded)

program
  .command('system-health')
  .description('Check system health and diagnostics')
  .action(async (opts) => {
    const { systemHealthCommand } = await import('./commands/system.js');
    await systemHealthCommand(program.opts());
  });

// Memory subcommand group
const memory = program
  .command('memory')
  .description('Memory operations (save, recall, about, etc.)');

memory
  .command('save')
  .description('Save a memory')
  .argument('<content>', 'Memory content to save')
  .option('--type <type>', 'Memory type: fact, preference, observation, learning, commitment, pattern', 'fact')
  .option('--person <name>', 'Person this memory is about')
  .option('--entity <names...>', 'Entity names this memory is about')
  .option('--importance <n>', 'Importance 0.0-1.0', parseFloat, 1.0)
  .option('--source <source>', 'Where this came from', 'conversation')
  .option('--source-context <ctx>', 'One-line breadcrumb')
  .option('--source-channel <ch>', 'Origin channel', 'claude_code')
  .option('--critical', 'Mark as sacred (immune to decay)')
  .action(async (content, opts) => {
    const { memorySaveCommand } = await import('./commands/memory.js');
    await memorySaveCommand(content, opts, program.opts());
  });

memory
  .command('recall')
  .description('Search memories')
  .argument('<query>', 'Search query')
  .option('--limit <n>', 'Max results', parseInt, 20)
  .option('--type <types...>', 'Filter by memory type')
  .option('--entity <name>', 'Filter to memories about entity')
  .option('--since <date>', 'Only memories after this date')
  .option('--before <date>', 'Only memories before this date')
  .option('--include-archived', 'Include archived memories')
  .action(async (query, opts) => {
    const { memoryRecallCommand } = await import('./commands/memory.js');
    await memoryRecallCommand(query, opts, program.opts());
  });

memory
  .command('about')
  .description('Get full context about an entity')
  .argument('<entity>', 'Entity name')
  .option('--limit <n>', 'Max memories to return', parseInt, 20)
  .option('--include-historical', 'Include invalidated relationships')
  .action(async (entity, opts) => {
    const { memoryAboutCommand } = await import('./commands/memory.js');
    await memoryAboutCommand(entity, opts, program.opts());
  });

memory
  .command('relate')
  .description('Create or strengthen a relationship')
  .option('--source <name>', 'Source entity name')
  .option('--target <name>', 'Target entity name')
  .option('--type <type>', 'Relationship type (works_with, manages, etc.)')
  .option('--strength <n>', 'Relationship strength 0.0-1.0', parseFloat, 1.0)
  .option('--origin <type>', 'Origin type', 'extracted')
  .action(async (opts) => {
    const { memoryRelateCommand } = await import('./commands/memory.js');
    await memoryRelateCommand(opts, program.opts());
  });

memory
  .command('batch')
  .description('Run batch memory operations (reads JSON from stdin or --file)')
  .option('--file <path>', 'JSON file with operations')
  .action(async (opts) => {
    const { memoryBatchCommand } = await import('./commands/memory.js');
    await memoryBatchCommand(opts, program.opts());
  });

memory
  .command('end-session')
  .description('End a session with narrative and extractions')
  .option('--episode-id <id>', 'Episode ID', parseInt)
  .option('--narrative <text>', 'Session narrative')
  .option('--file <path>', 'JSON file with session data')
  .action(async (opts) => {
    const { memoryEndSessionCommand } = await import('./commands/memory.js');
    await memoryEndSessionCommand(opts, program.opts());
  });

memory
  .command('consolidate')
  .description('Run memory consolidation (decay, patterns, merge)')
  .option('--lightweight', 'Only run decay (faster)')
  .action(async (opts) => {
    const { memoryConsolidateCommand } = await import('./commands/memory.js');
    await memoryConsolidateCommand(opts, program.opts());
  });

memory
  .command('briefing')
  .description('Get compact session-start briefing')
  .action(async (opts) => {
    const { memoryBriefingCommand } = await import('./commands/memory.js');
    await memoryBriefingCommand(opts, program.opts());
  });

memory
  .command('summary')
  .description('Get lightweight entity summary')
  .option('--entity <name>', 'Entity name')
  .action(async (opts) => {
    const { memorySummaryCommand } = await import('./commands/memory.js');
    await memorySummaryCommand(opts, program.opts());
  });

memory
  .command('reflections')
  .description('Query or manage reflections')
  .option('--query <text>', 'Search reflections')
  .option('--save <content>', 'Store a new reflection')
  .option('--type <type>', 'Reflection type: observation, pattern, learning, question')
  .option('--update <id>', 'Update reflection by ID', parseInt)
  .option('--delete <id>', 'Delete reflection by ID', parseInt)
  .action(async (opts) => {
    const { memoryReflectionsCommand } = await import('./commands/memory.js');
    await memoryReflectionsCommand(opts, program.opts());
  });

memory
  .command('project-health')
  .description('Relationship velocity projection')
  .option('--entity <name>', 'Project or person name')
  .action(async (opts) => {
    const { memoryProjectHealthCommand } = await import('./commands/memory.js');
    await memoryProjectHealthCommand(opts, program.opts());
  });

// Temporal subcommands
const temporal = memory
  .command('temporal')
  .description('Time-based memory queries');

temporal
  .command('upcoming')
  .description('Upcoming deadlines')
  .option('--days <n>', 'Days ahead to look', parseInt, 14)
  .option('--include-overdue', 'Include overdue items')
  .action(async (opts) => {
    const { temporalUpcomingCommand } = await import('./commands/memory.js');
    await temporalUpcomingCommand(opts, program.opts());
  });

temporal
  .command('since')
  .description('Changes since a date')
  .argument('<date>', 'ISO date string')
  .option('--entity <name>', 'Filter to entity')
  .option('--limit <n>', 'Max results', parseInt, 50)
  .action(async (date, opts) => {
    const { temporalSinceCommand } = await import('./commands/memory.js');
    await temporalSinceCommand(date, opts, program.opts());
  });

temporal
  .command('timeline')
  .description('Entity history timeline')
  .argument('<entity>', 'Entity name')
  .option('--limit <n>', 'Max results', parseInt, 50)
  .action(async (entity, opts) => {
    const { temporalTimelineCommand } = await import('./commands/memory.js');
    await temporalTimelineCommand(entity, opts, program.opts());
  });

temporal
  .command('morning')
  .description('Morning context digest')
  .action(async (opts) => {
    const { temporalMorningCommand } = await import('./commands/memory.js');
    await temporalMorningCommand(opts, program.opts());
  });

// Graph subcommands
const graph = memory
  .command('graph')
  .description('Relationship graph operations');

graph
  .command('network')
  .description('Project collaborator network')
  .argument('<entity>', 'Project name')
  .action(async (entity, opts) => {
    const { graphNetworkCommand } = await import('./commands/memory.js');
    await graphNetworkCommand(entity, opts, program.opts());
  });

graph
  .command('path')
  .description('Find connection path between entities')
  .argument('<entityA>', 'Start entity')
  .argument('<entityB>', 'End entity')
  .option('--max-depth <n>', 'Max path depth', parseInt, 4)
  .action(async (entityA, entityB, opts) => {
    const { graphPathCommand } = await import('./commands/memory.js');
    await graphPathCommand(entityA, entityB, opts, program.opts());
  });

graph
  .command('hubs')
  .description('Hub entities with many connections')
  .option('--min-connections <n>', 'Minimum connections', parseInt, 5)
  .option('--type <type>', 'Entity type filter')
  .option('--limit <n>', 'Max results', parseInt, 20)
  .action(async (opts) => {
    const { graphHubsCommand } = await import('./commands/memory.js');
    await graphHubsCommand(opts, program.opts());
  });

graph
  .command('dormant')
  .description('Dormant relationships')
  .option('--days <n>', 'Days without activity', parseInt, 60)
  .option('--min-strength <n>', 'Min relationship strength', parseFloat, 0.3)
  .option('--limit <n>', 'Max results', parseInt, 20)
  .action(async (opts) => {
    const { graphDormantCommand } = await import('./commands/memory.js');
    await graphDormantCommand(opts, program.opts());
  });

graph
  .command('reconnect')
  .description('Reconnection suggestions')
  .option('--limit <n>', 'Max results', parseInt, 10)
  .action(async (opts) => {
    const { graphReconnectCommand } = await import('./commands/memory.js');
    await graphReconnectCommand(opts, program.opts());
  });

// Entities subcommands
const entities = memory
  .command('entities')
  .description('Entity management');

entities
  .command('create')
  .description('Create a new entity')
  .argument('<name>', 'Entity name')
  .option('--type <type>', 'Entity type', 'person')
  .option('--description <desc>', 'Entity description')
  .option('--aliases <names...>', 'Alias names')
  .action(async (name, opts) => {
    const { entitiesCreateCommand } = await import('./commands/memory.js');
    await entitiesCreateCommand(name, opts, program.opts());
  });

entities
  .command('search')
  .description('Search entities')
  .argument('<query>', 'Search query')
  .option('--type <types...>', 'Filter by entity type')
  .option('--limit <n>', 'Max results', parseInt, 10)
  .action(async (query, opts) => {
    const { entitiesSearchCommand } = await import('./commands/memory.js');
    await entitiesSearchCommand(query, opts, program.opts());
  });

entities
  .command('merge')
  .description('Merge duplicate entities')
  .option('--source <id>', 'Source entity ID (to merge FROM)', parseInt)
  .option('--target <id>', 'Target entity ID (to merge INTO)', parseInt)
  .option('--reason <text>', 'Reason for merge')
  .action(async (opts) => {
    const { entitiesMergeCommand } = await import('./commands/memory.js');
    await entitiesMergeCommand(opts, program.opts());
  });

entities
  .command('delete')
  .description('Soft-delete an entity')
  .argument('<id>', 'Entity ID', parseInt)
  .option('--reason <text>', 'Reason for deletion')
  .action(async (id, opts) => {
    const { entitiesDeleteCommand } = await import('./commands/memory.js');
    await entitiesDeleteCommand(id, opts, program.opts());
  });

entities
  .command('overview')
  .description('Entity overview with network')
  .argument('<names...>', 'Entity names')
  .action(async (names, opts) => {
    const { entitiesOverviewCommand } = await import('./commands/memory.js');
    await entitiesOverviewCommand(names, opts, program.opts());
  });

// Modify subcommands
const modify = memory
  .command('modify')
  .description('Correct or invalidate memories');

modify
  .command('correct')
  .description('Correct a memory')
  .argument('<id>', 'Memory ID', parseInt)
  .argument('<correction>', 'Corrected content')
  .option('--reason <text>', 'Reason for correction')
  .action(async (id, correction, opts) => {
    const { modifyCorrectCommand } = await import('./commands/memory.js');
    await modifyCorrectCommand(id, correction, opts, program.opts());
  });

modify
  .command('invalidate')
  .description('Mark a memory as no longer true')
  .argument('<id>', 'Memory ID', parseInt)
  .option('--reason <text>', 'Reason for invalidation')
  .action(async (id, opts) => {
    const { modifyInvalidateCommand } = await import('./commands/memory.js');
    await modifyInvalidateCommand(id, opts, program.opts());
  });

modify
  .command('invalidate-relationship')
  .description('Invalidate a relationship')
  .option('--source <name>', 'Source entity name')
  .option('--target <name>', 'Target entity name')
  .option('--type <type>', 'Relationship type')
  .option('--reason <text>', 'Reason for invalidation')
  .action(async (opts) => {
    const { modifyInvalidateRelationshipCommand } = await import('./commands/memory.js');
    await modifyInvalidateRelationshipCommand(opts, program.opts());
  });

// Session subcommands
const session = memory
  .command('session')
  .description('Session lifecycle');

session
  .command('buffer')
  .description('Buffer a conversation turn')
  .option('--user <content>', 'User message content')
  .option('--assistant <content>', 'Assistant message content')
  .option('--episode-id <id>', 'Episode ID', parseInt)
  .option('--source <channel>', 'Source channel', 'claude_code')
  .action(async (opts) => {
    const { sessionBufferCommand } = await import('./commands/memory.js');
    await sessionBufferCommand(opts, program.opts());
  });

session
  .command('context')
  .description('Get session context summary')
  .option('--episode-id <id>', 'Episode ID', parseInt)
  .action(async (opts) => {
    const { sessionContextCommand } = await import('./commands/memory.js');
    await sessionContextCommand(opts, program.opts());
  });

session
  .command('unsummarized')
  .description('List unsummarized sessions')
  .action(async (opts) => {
    const { sessionUnsummarizedCommand } = await import('./commands/memory.js');
    await sessionUnsummarizedCommand(opts, program.opts());
  });

// Document subcommands
const document = memory
  .command('document')
  .description('Document storage and search');

document
  .command('store')
  .description('Store a document')
  .argument('<file>', 'File path')
  .option('--source-type <type>', 'Source type: gmail, transcript, upload, capture, session')
  .option('--source-ref <ref>', 'External reference')
  .option('--summary <text>', 'Document summary')
  .action(async (file, opts) => {
    const { documentStoreCommand } = await import('./commands/memory.js');
    await documentStoreCommand(file, opts, program.opts());
  });

document
  .command('search')
  .description('Search documents')
  .argument('<query>', 'Search query')
  .option('--source-type <type>', 'Filter by source type')
  .option('--limit <n>', 'Max results', parseInt, 10)
  .action(async (query, opts) => {
    const { documentSearchCommand } = await import('./commands/memory.js');
    await documentSearchCommand(query, opts, program.opts());
  });

// Provenance subcommands
const provenance = memory
  .command('provenance')
  .description('Audit trail and provenance');

provenance
  .command('trace')
  .description('Trace memory provenance chain')
  .argument('<id>', 'Memory ID', parseInt)
  .action(async (id, opts) => {
    const { provenanceTraceCommand } = await import('./commands/memory.js');
    await provenanceTraceCommand(id, opts, program.opts());
  });

provenance
  .command('audit')
  .description('Entity or memory audit history')
  .option('--entity-id <id>', 'Entity ID', parseInt)
  .option('--memory-id <id>', 'Memory ID', parseInt)
  .action(async (opts) => {
    const { provenanceAuditCommand } = await import('./commands/memory.js');
    await provenanceAuditCommand(opts, program.opts());
  });

provenance
  .command('verify-chain')
  .description('Verify memory hash chain integrity')
  .action(async (opts) => {
    const { provenanceVerifyChainCommand } = await import('./commands/memory.js');
    await provenanceVerifyChainCommand(opts, program.opts());
  });

// Vault subcommand group (top-level, not under memory)
const vault = program
  .command('vault')
  .description('Obsidian vault operations');

vault
  .command('sync')
  .description('Export to Obsidian vault (PARA structure)')
  .action(async (opts) => {
    const { vaultSyncCommand } = await import('./commands/vault.js');
    await vaultSyncCommand(opts, program.opts());
  });

vault
  .command('status')
  .description('Vault sync status')
  .action(async (opts) => {
    const { vaultStatusCommand } = await import('./commands/vault.js');
    await vaultStatusCommand(opts, program.opts());
  });

vault
  .command('canvas')
  .description('Generate Obsidian .canvas files')
  .action(async (opts) => {
    const { vaultCanvasCommand } = await import('./commands/vault.js');
    await vaultCanvasCommand(opts, program.opts());
  });

vault
  .command('import')
  .description('Import vault edits back to memory')
  .action(async (opts) => {
    const { vaultImportCommand } = await import('./commands/vault.js');
    await vaultImportCommand(opts, program.opts());
  });

// Cognitive subcommand group
const cognitive = program
  .command('cognitive')
  .description('Cognitive operations (LLM-powered)');

cognitive
  .command('ingest')
  .description('Extract entities and memories from text')
  .option('--text <text>', 'Text to ingest')
  .option('--file <path>', 'File to ingest')
  .option('--type <type>', 'Source type: meeting, email, document, general')
  .option('--context <ctx>', 'Extra context for extraction')
  .action(async (opts) => {
    const { cognitiveIngestCommand } = await import('./commands/cognitive.js');
    await cognitiveIngestCommand(opts, program.opts());
  });

// Setup command
program
  .command('setup')
  .description('Onboarding wizard — create dirs, verify Ollama, run health check')
  .option('--skip-ollama', 'Skip Ollama model checks')
  .action(async (opts) => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(opts, program.opts());
  });

// Parse and execute
program.parseAsync(process.argv);
