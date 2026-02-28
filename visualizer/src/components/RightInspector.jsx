import { formatDateTime, formatRelative, scorePercent, titleCase } from '../lib/theme.js';
import { SettingsContent } from './SettingsPanel.jsx';
import {
  selectSelectedNode,
  useGraphStore
} from '../store/useGraphStore.js';

function anchorEntityId(node) {
  if (!node) return null;
  if (node.kind === 'entity') return Number(String(node.id).replace('entity-', ''));
  if (node.anchorRef) return Number(String(node.anchorRef).replace('entity-', ''));
  return Number(node.entityRefs?.[0] || 0) || null;
}

export function RightInspector() {
  const selectedNode = useGraphStore(selectSelectedNode);
  const entityDetails = useGraphStore((state) => state.entityDetails);
  const inspectorCommitments = useGraphStore((state) => state.inspectorCommitments);
  const traceGraph = useGraphStore((state) => state.traceGraph);
  const graphMode = useGraphStore((state) => state.graphMode);
  const togglePinNode = useGraphStore((state) => state.togglePinNode);
  const pinnedNodeIds = useGraphStore((state) => state.pinnedNodeIds);
  const revealEvidence = useGraphStore((state) => state.revealEvidence);
  const clearSelection = useGraphStore((state) => state.clearSelection);
  const selectNode = useGraphStore((state) => state.selectNode);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const setInspectorOpen = useGraphStore((state) => state.setInspectorOpen);
  const settingsOpen = useGraphStore((state) => state.settingsOpen);
  const setSettingsOpen = useGraphStore((state) => state.setSettingsOpen);

  const entityId = anchorEntityId(selectedNode);
  const detail = entityId ? entityDetails[entityId] : null;
  const isPinned = selectedNode ? pinnedNodeIds.includes(selectedNode.id) : false;

  return (
    <aside className={`side-panel right-inspector ${inspectorOpen ? 'is-open' : ''}`}>
      <div className="inspector-head">
        <div>
          <span>{settingsOpen ? 'Settings' : 'Inspector'}</span>
          <strong>{settingsOpen ? 'Live tuning panel' : (selectedNode?.label || 'No selection')}</strong>
        </div>
        <div className="inline-actions">
          {settingsOpen ? (
            <button className="inspector-close" onClick={() => setSettingsOpen(false)}>Inspect</button>
          ) : (
            <button className="inspector-close" onClick={() => setSettingsOpen(true)}>Tune</button>
          )}
          <button className="inspector-close" onClick={() => setInspectorOpen(false)}>Hide</button>
        </div>
      </div>

      {settingsOpen ? (
        <SettingsContent />
      ) : selectedNode ? (
        <>
          <section className="panel-block">
            <div className="panel-heading">
              <span>{titleCase(selectedNode.kind)} / {titleCase(selectedNode.subtype)}</span>
              <strong>Signal {scorePercent(selectedNode.signalScore)}</strong>
            </div>
            <p className="inspector-copy">{selectedNode.description || 'No description available for this node.'}</p>
            <div className="metric-grid">
              <div className="metric-card"><span>Status</span><strong>{titleCase(selectedNode.status)}</strong></div>
              <div className="metric-card"><span>Freshness</span><strong>{scorePercent(selectedNode.freshnessScore)}</strong></div>
              <div className="metric-card"><span>Urgency</span><strong>{scorePercent(selectedNode.urgencyScore)}</strong></div>
              <div className="metric-card"><span>Activity</span><strong>{formatRelative(selectedNode.timestamps?.activityAt)}</strong></div>
            </div>
            <div className="inline-actions">
              <button className="panel-button" onClick={() => togglePinNode(selectedNode.id)}>
                {isPinned ? 'Unpin' : 'Pin'}
              </button>
              <button className="panel-button" onClick={() => revealEvidence(selectedNode.id)}>Reveal Evidence</button>
              <button className="panel-button" onClick={clearSelection}>Clear</button>
            </div>
          </section>

          {detail ? (
            <>
              <section className="panel-block">
                <div className="panel-heading">
                  <span>Entity Context</span>
                  <strong>{detail.entity?.name || 'Anchor entity'}</strong>
                </div>
                <div className="info-list">
                  <div className="info-row"><span>Last updated</span><strong>{formatDateTime(detail.entity?.updated_at)}</strong></div>
                  <div className="info-row"><span>Memories</span><strong>{detail.memories?.length || 0}</strong></div>
                  <div className="info-row"><span>Relationships</span><strong>{detail.relationships?.length || 0}</strong></div>
                </div>
              </section>

              <section className="panel-block">
                <div className="panel-heading">
                  <span>Relationships</span>
                  <strong>Top linked entities</strong>
                </div>
                <div className="result-stack">
                  {(detail.relationships || []).slice(0, 8).map((relationship) => (
                    <button
                      key={`${relationship.id}-${relationship.other_id}`}
                      className="result-row"
                      onClick={() => selectNode(`entity-${relationship.other_id}`)}
                    >
                      <span>{titleCase(relationship.relationship_type || relationship.direction)}</span>
                      <strong>{relationship.other_name}</strong>
                      <span>Strength {Number(relationship.strength || 0).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel-block">
                <div className="panel-heading">
                  <span>Evidence</span>
                  <strong>Recent memory</strong>
                </div>
                <div className="result-stack">
                  {(detail.memories || []).slice(0, 10).map((memory) => (
                    <button
                      key={memory.id}
                      className="result-row"
                      onClick={() => selectNode(`memory-${memory.id}`)}
                    >
                      <span>{titleCase(memory.type)}</span>
                      <div className="result-copy">{memory.content || 'No memory content stored.'}</div>
                      <span>{formatDateTime(memory.updated_at || memory.created_at)}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {inspectorCommitments.length ? (
            <section className="panel-block">
              <div className="panel-heading">
                <span>Commitments</span>
                <strong>Active obligations</strong>
              </div>
              <div className="result-stack">
                {inspectorCommitments.map((item) => (
                  <button key={item.id} className="result-row commitment-row" onClick={() => selectNode(item.id)}>
                    <span>{formatDateTime(item.timestamps?.deadlineAt || item.timestamps?.activityAt)}</span>
                    <div className="result-copy">{item.description || item.label}</div>
                    <span>{titleCase(item.status)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {graphMode === 'trace' && traceGraph?.evidence?.length ? (
            <section className="panel-block">
              <div className="panel-heading">
                <span>Trace Support</span>
                <strong>Path evidence</strong>
              </div>
              <div className="result-stack">
                {traceGraph.evidence.map((item) => (
                  <button key={item.id} className="result-row" onClick={() => selectNode(item.id)}>
                    <span>{titleCase(item.kind)} / {titleCase(item.subtype)}</span>
                    <div className="result-copy">{item.description || item.label}</div>
                    <span>{item.entityRefs?.length || 0} anchors</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="panel-block">
          <div className="empty-inline">
            Select a node to inspect its local relationships, linked evidence, and active commitments.
          </div>
        </section>
      )}
    </aside>
  );
}
