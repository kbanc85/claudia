import { getEntities, getMemories, getRelationships, getMemoryEntityLinks, getPatterns, getEntityEmbeddings, getMemoryEmbeddings } from './database.js';

const ENTITY_COLORS = {
  person: '#fbbf24',
  organization: '#60a5fa',
  project: '#34d399',
  concept: '#c084fc',
  location: '#fb923c',
};

const MEMORY_COLORS = {
  fact: '#e2e8f0',
  commitment: '#f87171',
  learning: '#4ade80',
  observation: '#93c5fd',
  preference: '#fbbf24',
  pattern: '#a78bfa',
};

export function buildGraph(db) {
  const entities = getEntities(db);
  const memories = getMemories(db);
  const relationships = getRelationships(db);
  const memEntityLinks = getMemoryEntityLinks(db);
  const patterns = getPatterns(db);
  const entityEmbeddings = getEntityEmbeddings(db);
  const memEmbeddings = getMemoryEmbeddings(db);

  // Build embedding lookup maps
  const entityEmbMap = new Map(entityEmbeddings.map(e => [e.id, e.embedding]));
  const memEmbMap = new Map(memEmbeddings.map(e => [e.id, e.embedding]));

  // Build memory→entity primary link map (first entity = primary)
  const memPrimaryEntity = new Map();
  for (const link of memEntityLinks) {
    if (!memPrimaryEntity.has(link.memory_id)) {
      memPrimaryEntity.set(link.memory_id, link.entity_id);
    }
  }

  // Count memories per entity for memory-driven node sizing
  const entityMemoryCount = new Map();
  for (const link of memEntityLinks) {
    entityMemoryCount.set(link.entity_id, (entityMemoryCount.get(link.entity_id) || 0) + 1);
  }

  const nodes = [];
  const links = [];

  // Entity nodes
  for (const entity of entities) {
    const importance = Math.max(0.1, Math.min(1.0, entity.importance || 0.5));
    nodes.push({
      id: `entity_${entity.id}`,
      entityId: entity.id,
      name: entity.name,
      type: entity.type,
      nodeType: 'entity',
      importance,
      memoryCount: entityMemoryCount.get(entity.id) || 0,
      size: Math.sqrt(importance) * 8 + 3,
      color: ENTITY_COLORS[entity.type] || '#94a3b8',
      description: entity.description || '',
      lastContact: entity.last_contact_at,
      createdAt: entity.created_at,
      embedding: entityEmbMap.get(entity.id) || null,
    });
  }

  // Memory nodes (only those linked to entities)
  for (const memory of memories) {
    const primaryEntityId = memPrimaryEntity.get(memory.id);
    if (!primaryEntityId) continue; // skip orphan memories
    const importance = Math.max(0.05, Math.min(1.0, memory.importance || 0.5));
    nodes.push({
      id: `memory_${memory.id}`,
      memoryId: memory.id,
      content: memory.content.substring(0, 200),
      type: memory.type || 'fact',
      nodeType: 'memory',
      importance,
      size: 1.5,
      color: MEMORY_COLORS[memory.type] || '#94a3b8',
      entityId: `entity_${primaryEntityId}`,
      sourceContext: memory.source_context,
      embedding: memEmbMap.get(memory.id) || null,
    });
  }

  // Pattern nodes
  for (const pattern of patterns) {
    nodes.push({
      id: `pattern_${pattern.id}`,
      patternId: pattern.id,
      name: pattern.pattern_type,
      description: pattern.description,
      nodeType: 'pattern',
      importance: pattern.confidence || 0.5,
      size: 3,
      color: '#a78bfa',
    });
  }

  // Entity-entity relationship links
  for (const rel of relationships) {
    links.push({
      id: `rel_${rel.id}`,
      source: `entity_${rel.source_entity_id}`,
      target: `entity_${rel.target_entity_id}`,
      type: rel.relationship_type,
      strength: Math.max(0.1, Math.min(1.0, rel.strength || 0.5)),
      linkType: 'relationship',
    });
  }

  // Memory-entity links
  for (const link of memEntityLinks) {
    links.push({
      id: `mem_link_${link.memory_id}_${link.entity_id}`,
      source: `memory_${link.memory_id}`,
      target: `entity_${link.entity_id}`,
      strength: 0.3,
      linkType: 'memory_link',
    });
  }

  return { nodes, links };
}
