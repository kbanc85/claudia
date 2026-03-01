import { create } from 'zustand';
import { mergeGraphData } from '../lib/graphAdapters.js';
import { querySearch } from '../lib/search.js';
import { DEFAULT_THEME_ID, ENTITY_SUBTYPES, MEMORY_SUBTYPES, PATTERN_SUBTYPES } from '../lib/theme.js';

const EMPTY_GRAPH = {
  meta: {},
  nodes: [],
  edges: []
};

const defaultFilters = {
  entities: Object.fromEntries(ENTITY_SUBTYPES.map((type) => [type, true])),
  memories: Object.fromEntries(MEMORY_SUBTYPES.map((type) => [type, type !== 'fact'])),
  patterns: Object.fromEntries(PATTERN_SUBTYPES.map((type) => [type, true]))
};

const defaultRenderSettings = {
  entitySize: 0.6,
  memorySize: 0.5,
  patternSize: 0.45,
  edgeIntensity: 1,
  lineThickness: 1.25,
  selectedLineThickness: 3,
  relationshipLineLength: 1,
  memoryLineLength: 1,
  patternLineLength: 1.06,
  lineEntrySpread: 0.42,
  edgeOpacity: 1,
  lineCurvature: 1,
  nodeOpacity: 1,
  labelDensity: 0.55,
  labelMode: 'balanced',
  labelScale: 1.8,
  showCommitments: true,
  showPatterns: true,
  traceEmphasis: 1.45,
  motionReduced: false,
  motionLevel: 'full',
  bloomStrength: 0.2,
  chromaticStrength: 0.85,
  cameraMoveSpeed: 0.5,
  autoRotateEnabled: true,
  autoRotateGlobal: false,
  autoRotateSpeed: 0.1,
  showParticles: true,
  particleSpeed: 1.8,
  particleSize: 0.65,
  showOverviewMemories: true,
  gridOpacity: 0.44,
  gridDensity: 1.15,
  fogNear: 1,
  fogFar: 1,
  gridColor: null,
  relationshipParticleColor: null,
  memoryParticleColor: null,
  patternParticleColor: null,
  memoryColor: '#8aa3b8',
  commitmentColor: '#ff956f',
  memoryStyle: 'shard',
  commitmentStyle: 'diamond',
  personColor: '#f0cf72',
  organizationColor: '#7fb9ff',
  projectColor: '#77efbf'
};

const STORAGE_KEYS = {
  defaultsRevision: 'claudia-defaults-revision',
  themeId: 'claudia-theme-id',
  renderSettings: 'claudia-render-settings',
  sceneQuality: 'claudia-scene-quality'
};
const DEFAULTS_REVISION = '2026-02-28-grid-lines-themes-4';

function readStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function persistSettingBundle(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function mergeFilterKeys(current = {}, keys = []) {
  const next = { ...current };
  for (const key of keys) {
    if (!key || key in next) continue;
    next[key] = true;
  }
  return next;
}

function mergeFilterGroups(activeFilters, additions = {}) {
  return {
    entities: mergeFilterKeys(activeFilters.entities, additions.entities),
    memories: mergeFilterKeys(activeFilters.memories, additions.memories),
    patterns: mergeFilterKeys(activeFilters.patterns, additions.patterns)
  };
}

function enabledFilterGroup(group = {}, groupName = '') {
  return Object.fromEntries(Object.keys(group).map((key) => [
    key,
    groupName === 'memories' && key === 'fact' ? false : true
  ]));
}

function subtypeGroupsFromStats(stats) {
  return {
    entities: (stats?.entityTypes || []).map((entry) => entry.type),
    memories: (stats?.memoryTypes || []).map((entry) => entry.type),
    patterns: PATTERN_SUBTYPES
  };
}

function subtypeGroupsFromGraph(graph) {
  const groups = {
    entities: new Set(),
    memories: new Set(),
    patterns: new Set()
  };

  for (const node of graph?.nodes || []) {
    if (!node?.subtype) continue;
    if (node.kind === 'entity') groups.entities.add(node.subtype);
    else if (node.kind === 'pattern') groups.patterns.add(node.subtype);
    else groups.memories.add(node.subtype);
  }

  return {
    entities: [...groups.entities],
    memories: [...groups.memories],
    patterns: [...groups.patterns]
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }
  return response.json();
}

function nodeIndexFromGraphs(...graphs) {
  const index = new Map();
  for (const graph of graphs.filter(Boolean)) {
    for (const node of graph.nodes || []) {
      index.set(node.id, node);
    }
  }
  return index;
}

function getNodeById(state, nodeId = state.selectedNodeId) {
  if (!nodeId) return null;
  return nodeIndexFromGraphs(state.overviewGraph, state.neighborhoodGraph, state.traceGraph).get(nodeId) || null;
}

function primaryEntityGraphId(node) {
  if (!node) return null;
  if (node.kind === 'entity') return node.id;
  if (node.anchorRef) return node.anchorRef;
  const entityId = node.entityRefs?.[0];
  return entityId ? `entity-${entityId}` : null;
}

export function selectActiveGraph(state) {
  if (state.graphMode === 'trace' && state.traceGraph) {
    return mergeGraphData(state.overviewGraph, state.traceGraph);
  }
  if ((state.graphMode === 'neighborhood' || state.graphMode === 'evidence') && state.neighborhoodGraph) {
    return mergeGraphData(state.overviewGraph, state.neighborhoodGraph);
  }
  return state.overviewGraph || EMPTY_GRAPH;
}

export function selectSelectedNode(state) {
  return getNodeById(state, state.selectedNodeId);
}

export function selectHoveredNode(state) {
  return getNodeById(state, state.hoveredNodeId);
}

export function selectPinnedNodes(state) {
  const index = nodeIndexFromGraphs(state.overviewGraph, state.neighborhoodGraph, state.traceGraph);
  return state.pinnedNodeIds.map((id) => index.get(id)).filter(Boolean);
}

export const useGraphStore = create((set, get) => ({
  initialized: false,
  themeId: DEFAULT_THEME_ID,
  stats: null,
  databases: [],
  activeDatabasePath: null,
  overviewGraph: EMPTY_GRAPH,
  neighborhoodGraph: null,
  traceGraph: null,
  graphMode: 'overview',
  selectedNodeId: null,
  hoveredNodeId: null,
  pinnedNodeIds: [],
  expandedNeighborhoodIds: [],
  activeFilters: defaultFilters,
  renderSettings: defaultRenderSettings,
  searchQuery: '',
  searchResults: [],
  searchOpen: false,
  settingsOpen: false,
  timelineWindow: 100,
  traceEndpoints: {
    from: null,
    to: null
  },
  tracePath: [],
  entityDetails: {},
  inspectorCommitments: [],
  commitmentFeed: [],
  neighborhoodCache: {},
  traceCache: {},
  loadingState: {
    boot: false,
    overview: false,
    neighborhood: false,
    trace: false,
    search: false,
    detail: false,
    database: false
  },
  errorMessage: '',
  cameraTarget: null,
  cameraState: {
    targetNodeId: null,
    mode: 'overview'
  },
  layoutState: {
    positions: {},
    velocities: {},
    reheatToken: 0
  },
  sceneQuality: {
    quality: 'balanced',
    effectsEnabled: true
  },
  fitNonce: 0,
  leftPanelOpen: true,
  inspectorOpen: true,
  bottomPanelOpen: true,

  init: async () => {
    if (get().initialized || get().loadingState.boot) return;
    const defaultsRevision = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.defaultsRevision) : null;
    const storedTheme = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.themeId) : null;
    const storedRenderSettings = readStoredJson(STORAGE_KEYS.renderSettings, defaultRenderSettings);
    const storedSceneQuality = readStoredJson(STORAGE_KEYS.sceneQuality, {
      quality: 'balanced',
      effectsEnabled: true
    });
    if (defaultsRevision !== DEFAULTS_REVISION && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.defaultsRevision, DEFAULTS_REVISION);
      window.localStorage.setItem(STORAGE_KEYS.themeId, DEFAULT_THEME_ID);
      persistSettingBundle(STORAGE_KEYS.renderSettings, defaultRenderSettings);
      persistSettingBundle(STORAGE_KEYS.sceneQuality, {
        quality: 'balanced',
        effectsEnabled: true
      });
      set({
        themeId: DEFAULT_THEME_ID,
        renderSettings: defaultRenderSettings,
        sceneQuality: {
          quality: 'balanced',
          effectsEnabled: true
        }
      });
    } else if (storedTheme || storedRenderSettings || storedSceneQuality) {
      set((state) => ({
        themeId: storedTheme || state.themeId,
        renderSettings: storedRenderSettings,
        sceneQuality: storedSceneQuality
      }));
    }

    set((state) => ({
      loadingState: { ...state.loadingState, boot: true },
      errorMessage: ''
    }));

    try {
      await Promise.all([
        get().loadOverview(),
        get().loadStats(),
        get().loadDatabases(),
        get().loadGlobalCommitments()
      ]);
      set({ initialized: true });
    } catch (error) {
      set({ errorMessage: error.message || 'Failed to initialize graph explorer' });
    } finally {
      set((state) => ({
        loadingState: { ...state.loadingState, boot: false }
      }));
    }
  },

  loadStats: async () => {
    const stats = await fetchJson('/api/stats');
    set((state) => ({
      stats,
      activeFilters: mergeFilterGroups(state.activeFilters, subtypeGroupsFromStats(stats))
    }));
  },

  loadDatabases: async () => {
    const result = await fetchJson('/api/databases');
    set({
      databases: result.databases || [],
      activeDatabasePath: result.current || null
    });
  },

  loadOverview: async () => {
    set((state) => ({
      loadingState: { ...state.loadingState, overview: true },
      errorMessage: ''
    }));
    try {
      const params = new URLSearchParams();
      if (get().renderSettings.showOverviewMemories) {
        params.set('includeMemories', '1');
      }
      const overviewGraph = await fetchJson(`/api/graph/overview${params.size ? `?${params.toString()}` : ''}`);
      set((state) => ({
        overviewGraph,
        activeFilters: mergeFilterGroups(state.activeFilters, subtypeGroupsFromGraph(overviewGraph)),
        graphMode: state.graphMode === 'trace' ? 'overview' : state.graphMode,
        cameraState: { ...state.cameraState, mode: 'overview' },
        layoutState: {
          ...state.layoutState,
          reheatToken: state.layoutState.reheatToken + 1
        },
        loadingState: { ...state.loadingState, overview: false }
      }));
    } catch (error) {
      set((state) => ({
        loadingState: { ...state.loadingState, overview: false },
        errorMessage: error.message || 'Failed to load overview graph'
      }));
    }
  },

  loadGlobalCommitments: async () => {
    const result = await fetchJson('/api/commitments/active?limit=12');
    set({ commitmentFeed: result.items || [] });
  },

  switchDatabase: async (path) => {
    if (!path || path === get().activeDatabasePath) return;
    set((state) => ({
      loadingState: { ...state.loadingState, database: true },
      errorMessage: ''
    }));
    try {
      await fetchJson('/api/database/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });

      set((state) => ({
        neighborhoodGraph: null,
        traceGraph: null,
        neighborhoodCache: {},
        traceCache: {},
        selectedNodeId: null,
        hoveredNodeId: null,
        pinnedNodeIds: [],
        traceEndpoints: { from: null, to: null },
        tracePath: [],
        entityDetails: {},
        inspectorCommitments: [],
        graphMode: 'overview',
        cameraTarget: null,
        cameraState: { targetNodeId: null, mode: 'overview' },
        layoutState: { positions: {}, velocities: {}, reheatToken: state.layoutState.reheatToken + 1 }
      }));

      await Promise.all([
        get().loadOverview(),
        get().loadStats(),
        get().loadDatabases(),
        get().loadGlobalCommitments()
      ]);
    } catch (error) {
      set({ errorMessage: error.message || 'Failed to switch database' });
    } finally {
      set((state) => ({
        loadingState: { ...state.loadingState, database: false }
      }));
    }
  },

  setGraphMode: (graphMode) => set((state) => ({
    graphMode,
    cameraState: { ...state.cameraState, mode: graphMode === 'trace' ? 'trace' : graphMode === 'overview' ? 'overview' : 'inspect' }
  })),

  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),

  requestFit: () => set((state) => ({
    fitNonce: state.fitNonce + 1,
    cameraState: { ...state.cameraState, mode: 'overview' }
  })),

  setTheme: (themeId) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.defaultsRevision, DEFAULTS_REVISION);
      window.localStorage.setItem(STORAGE_KEYS.themeId, themeId);
    }
    set({ themeId });
  },

  requestFocus: (cameraTarget, mode = 'inspect') => set({
    cameraTarget,
    cameraState: {
      targetNodeId: cameraTarget,
      mode
    }
  }),

  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  toggleBottomPanel: () => set((state) => ({ bottomPanelOpen: !state.bottomPanelOpen })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  runSearch: async (query) => {
    const trimmed = String(query || '').trim();
    set((state) => ({
      loadingState: { ...state.loadingState, search: Boolean(trimmed) }
    }));

    if (!trimmed) {
      set((state) => ({
        searchResults: [],
        loadingState: { ...state.loadingState, search: false }
      }));
      return;
    }

    try {
      const result = await querySearch(trimmed, 18);
      if (get().searchQuery.trim() !== trimmed) return;
      set((state) => ({
        searchResults: result.results || [],
        loadingState: { ...state.loadingState, search: false }
      }));
    } catch (error) {
      set((state) => ({
        loadingState: { ...state.loadingState, search: false },
        errorMessage: error.message || 'Search failed'
      }));
    }
  },

  toggleFilter: (group, key) => set((state) => ({
    activeFilters: {
      ...state.activeFilters,
      [group]: {
        ...state.activeFilters[group],
        [key]: !state.activeFilters[group][key]
      }
    }
  })),

  resetFilters: () => set((state) => ({
    activeFilters: {
      entities: enabledFilterGroup(state.activeFilters.entities, 'entities'),
      memories: enabledFilterGroup(state.activeFilters.memories, 'memories'),
      patterns: enabledFilterGroup(state.activeFilters.patterns, 'patterns')
    }
  })),

  setTimelineWindow: (timelineWindow) => set((state) => ({
    timelineWindow: typeof timelineWindow === 'function'
      ? timelineWindow(state.timelineWindow)
      : timelineWindow
  })),

  setRenderSetting: (key, value) => set((state) => {
    const renderSettings = {
      ...state.renderSettings,
      [key]: value
    };
    persistSettingBundle(STORAGE_KEYS.renderSettings, renderSettings);
    if (key === 'showOverviewMemories') {
      queueMicrotask(() => {
        get().loadOverview();
      });
    }
    return { renderSettings };
  }),

  setSceneEffectsEnabled: (effectsEnabled) => set((state) => {
    const sceneQuality = { ...state.sceneQuality, effectsEnabled };
    persistSettingBundle(STORAGE_KEYS.sceneQuality, sceneQuality);
    return { sceneQuality };
  }),

  setSceneQualityMode: (quality) => set((state) => {
    const sceneQuality = { ...state.sceneQuality, quality };
    persistSettingBundle(STORAGE_KEYS.sceneQuality, sceneQuality);
    return { sceneQuality };
  }),

  resetRenderSettings: () => set((state) => {
    persistSettingBundle(STORAGE_KEYS.renderSettings, defaultRenderSettings);
    persistSettingBundle(STORAGE_KEYS.sceneQuality, {
      quality: 'balanced',
      effectsEnabled: true
    });
    if (state.renderSettings.showOverviewMemories !== defaultRenderSettings.showOverviewMemories) {
      queueMicrotask(() => {
        get().loadOverview();
      });
    }
    return {
      renderSettings: defaultRenderSettings,
      sceneQuality: {
        quality: 'balanced',
        effectsEnabled: true
      }
    };
  }),

  applySettingsPreset: (preset) => set((state) => {
    const nextThemeId = typeof preset?.themeId === 'string' ? preset.themeId : state.themeId;
    const nextRenderSettings = {
      ...defaultRenderSettings,
      ...state.renderSettings,
      ...(preset?.renderSettings && typeof preset.renderSettings === 'object' ? preset.renderSettings : {})
    };
    const nextSceneQuality = {
      quality: 'balanced',
      effectsEnabled: true,
      ...state.sceneQuality,
      ...(preset?.sceneQuality && typeof preset.sceneQuality === 'object' ? preset.sceneQuality : {})
    };

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.defaultsRevision, DEFAULTS_REVISION);
      window.localStorage.setItem(STORAGE_KEYS.themeId, nextThemeId);
    }
    persistSettingBundle(STORAGE_KEYS.renderSettings, nextRenderSettings);
    persistSettingBundle(STORAGE_KEYS.sceneQuality, nextSceneQuality);
    if (state.renderSettings.showOverviewMemories !== nextRenderSettings.showOverviewMemories) {
      queueMicrotask(() => {
        get().loadOverview();
      });
    }

    return {
      themeId: nextThemeId,
      renderSettings: nextRenderSettings,
      sceneQuality: nextSceneQuality
    };
  }),

  setLayoutSnapshot: (positions, velocities = {}, bumpReheat = false) => set((state) => ({
    layoutState: {
      positions,
      velocities,
      reheatToken: bumpReheat ? state.layoutState.reheatToken + 1 : state.layoutState.reheatToken
    }
  })),

  reheatLayout: () => set((state) => ({
    layoutState: {
      ...state.layoutState,
      reheatToken: state.layoutState.reheatToken + 1
    }
  })),

  togglePinNode: (nodeId) => set((state) => ({
    pinnedNodeIds: state.pinnedNodeIds.includes(nodeId)
      ? state.pinnedNodeIds.filter((value) => value !== nodeId)
      : [...state.pinnedNodeIds, nodeId]
  })),

  clearSelection: () => set((state) => ({
    selectedNodeId: null,
    hoveredNodeId: null,
    inspectorCommitments: [],
    cameraState: { ...state.cameraState, targetNodeId: null, mode: 'overview' }
  })),

  clearTrace: () => set((state) => ({
    traceGraph: null,
    graphMode: 'overview',
    traceEndpoints: { from: null, to: null },
    tracePath: [],
    cameraState: { ...state.cameraState, mode: 'overview' },
    layoutState: { ...state.layoutState, reheatToken: state.layoutState.reheatToken + 1 }
  })),

  loadNeighborhood: async (nodeId, depth = 1) => {
    if (!nodeId) return;
    const cacheKey = `${nodeId}:${depth}`;
    const cached = get().neighborhoodCache[cacheKey];
    if (cached) {
      set((state) => ({
        neighborhoodGraph: cached,
        graphMode: depth > 1 ? 'evidence' : 'neighborhood',
        cameraState: { ...state.cameraState, mode: 'inspect', targetNodeId: nodeId },
        layoutState: { ...state.layoutState, reheatToken: state.layoutState.reheatToken + 1 }
      }));
      return;
    }

    set((state) => ({
      loadingState: { ...state.loadingState, neighborhood: true }
    }));
    try {
      const graph = await fetchJson(`/api/graph/neighborhood/${nodeId}?depth=${depth}`);
      set((state) => ({
        neighborhoodGraph: graph,
        neighborhoodCache: {
          ...state.neighborhoodCache,
          [cacheKey]: graph
        },
        expandedNeighborhoodIds: state.expandedNeighborhoodIds.includes(nodeId)
          ? state.expandedNeighborhoodIds
          : [...state.expandedNeighborhoodIds, nodeId],
        graphMode: depth > 1 ? 'evidence' : 'neighborhood',
        cameraState: { ...state.cameraState, mode: 'inspect', targetNodeId: nodeId },
        layoutState: { ...state.layoutState, reheatToken: state.layoutState.reheatToken + 1 },
        loadingState: { ...state.loadingState, neighborhood: false }
      }));
    } catch (error) {
      set((state) => ({
        loadingState: { ...state.loadingState, neighborhood: false },
        errorMessage: error.message || 'Failed to load neighborhood'
      }));
    }
  },

  loadTrace: async (from, to) => {
    if (!from || !to) return;
    const cacheKey = `${from}:${to}`;
    const cached = get().traceCache[cacheKey];
    if (cached) {
      set((state) => ({
        traceGraph: cached,
        graphMode: 'trace',
        tracePath: cached.path || [],
        cameraState: { ...state.cameraState, mode: 'trace', targetNodeId: to },
        layoutState: { ...state.layoutState, reheatToken: state.layoutState.reheatToken + 1 }
      }));
      return;
    }

    set((state) => ({
      loadingState: { ...state.loadingState, trace: true }
    }));
    try {
      const graph = await fetchJson(`/api/graph/trace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&maxDepth=4`);
      set((state) => ({
        traceGraph: graph,
        traceCache: {
          ...state.traceCache,
          [cacheKey]: graph
        },
        graphMode: 'trace',
        tracePath: graph.path || [],
        cameraState: { ...state.cameraState, mode: 'trace', targetNodeId: to },
        layoutState: { ...state.layoutState, reheatToken: state.layoutState.reheatToken + 1 },
        loadingState: { ...state.loadingState, trace: false }
      }));
    } catch (error) {
      set((state) => ({
        loadingState: { ...state.loadingState, trace: false },
        errorMessage: error.message || 'Failed to trace relationship path'
      }));
    }
  },

  hydrateInspector: async (nodeId) => {
    const node = getNodeById(get(), nodeId);
    const entityId = primaryEntityGraphId(node);

    if (!entityId) {
      set({ inspectorCommitments: [] });
      return;
    }

    const numericEntityId = Number(entityId.replace('entity-', ''));
    set((state) => ({
      loadingState: { ...state.loadingState, detail: true }
    }));
    try {
      const cachedDetail = get().entityDetails[numericEntityId];
      const detailPromise = cachedDetail
        ? Promise.resolve(cachedDetail)
        : fetchJson(`/api/entity/${numericEntityId}`);
      const commitmentsPromise = fetchJson(`/api/commitments/active?entityId=entity-${numericEntityId}&limit=8`);
      const [detail, commitmentData] = await Promise.all([detailPromise, commitmentsPromise]);

      set((state) => ({
        entityDetails: cachedDetail ? state.entityDetails : {
          ...state.entityDetails,
          [numericEntityId]: detail
        },
        inspectorCommitments: commitmentData.items || [],
        loadingState: { ...state.loadingState, detail: false }
      }));
    } catch (error) {
      set((state) => ({
        loadingState: { ...state.loadingState, detail: false },
        errorMessage: error.message || 'Failed to load inspector details'
      }));
    }
  },

  revealEvidence: async (nodeId) => {
    await get().loadNeighborhood(nodeId, 2);
    set((state) => ({
      selectedNodeId: nodeId,
      cameraTarget: nodeId,
      cameraState: { ...state.cameraState, targetNodeId: nodeId, mode: 'inspect' }
    }));
  },

  selectNode: async (nodeId, options = {}) => {
    const node = getNodeById(get(), nodeId);
    if (!node) return;

    if (options.shiftKey && node.kind === 'entity') {
      const current = get().traceEndpoints;
      if (!current.from || current.to) {
        set((state) => ({
          selectedNodeId: nodeId,
          traceEndpoints: { from: nodeId, to: null },
          graphMode: 'overview',
          cameraTarget: nodeId,
          cameraState: { ...state.cameraState, targetNodeId: nodeId, mode: 'overview' }
        }));
        await get().hydrateInspector(nodeId);
        return;
      }

      if (current.from !== nodeId) {
        set((state) => ({
          selectedNodeId: nodeId,
          traceEndpoints: { from: current.from, to: nodeId },
          cameraTarget: nodeId,
          cameraState: { ...state.cameraState, targetNodeId: nodeId, mode: 'trace' }
        }));
        await get().loadTrace(current.from, nodeId);
        await get().hydrateInspector(nodeId);
      }
      return;
    }

    set((state) => ({
      selectedNodeId: nodeId,
      cameraTarget: nodeId,
      graphMode: state.graphMode === 'trace' ? 'overview' : state.graphMode,
      cameraState: { ...state.cameraState, targetNodeId: nodeId, mode: 'inspect' },
      inspectorOpen: true
    }));

    await get().hydrateInspector(nodeId);

    if (options.doubleClick) {
      await get().loadNeighborhood(nodeId, 2);
      return;
    }
  }
}));
