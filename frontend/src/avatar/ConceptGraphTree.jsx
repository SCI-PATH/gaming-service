/**
 * Keyword concept tree — short labels, dashed links, details on select.
 */
import { useMemo, useState } from 'react';
import { layoutConceptTree } from './conceptGraph.js';

function NodeBlock({ node, selectedId, onSelect, compact }) {
  if (!node) return null;
  const kind = node.kind || 'related';
  const kids = Array.isArray(node.children) ? node.children : [];
  return (
    <div className={`cg-branch is-${kind}`}>
      <button
        type="button"
        className={`cg-node is-${kind}${selectedId === node.id ? ' is-on' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(node);
        }}
      >
        {node.label}
      </button>
      {kids.length ? (
        <div className={`cg-kids${kids.length > 1 ? ' is-row' : ''}${compact ? ' is-compact' : ''}`}>
          {kids.map((child) => (
            <div key={child.id} className="cg-kid">
              {child.edge ? <span className="cg-edge">{child.edge}</span> : null}
              <NodeBlock node={child} selectedId={selectedId} onSelect={onSelect} compact={compact} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function teachOnlyGraph(graph) {
  if (!graph) return graph;
  const nodes = (graph.nodes || []).filter((n) => n.kind !== 'mixup');
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...graph,
    nodes,
    relationships: (graph.relationships || []).filter((r) => ids.has(r.from) && ids.has(r.to)),
  };
}

export default function ConceptGraphTree({ graph = null, compact = false, onNodeSelect = null }) {
  const teachGraph = useMemo(() => teachOnlyGraph(graph), [graph]);
  const layout = useMemo(() => layoutConceptTree(teachGraph), [teachGraph]);
  const [selectedId, setSelectedId] = useState(layout.rootId);
  const selected =
    (teachGraph?.nodes || []).find((n) => n.id === selectedId) || teachGraph?.nodes?.[0] || null;

  if (!layout.tree) return null;

  const pick = (n) => {
    setSelectedId(n.id);
    onNodeSelect?.(n);
  };

  return (
    <div className={`cg${compact ? ' is-compact' : ''}`}>
      <div className="cg-tree" role="tree">
        <NodeBlock node={layout.tree} selectedId={selectedId} onSelect={pick} compact={compact} />
        {layout.leftover.length ? (
          <div className="cg-leftover">
            {layout.leftover.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`cg-node is-${n.kind || 'related'}${selectedId === n.id ? ' is-on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(n);
                }}
              >
                {n.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {selected && (selected.explanation || selected.example) ? (
        <div className="cg-detail">
          <p className="cg-detail-label">{selected.label}</p>
          {selected.explanation ? <p>{selected.explanation}</p> : null}
          {selected.example ? <p className="cg-example">{selected.example}</p> : null}
        </div>
      ) : null}
      {Array.isArray(graph?.learningPath) && graph.learningPath.length ? (
        <ol className="cg-path">
          {graph.learningPath.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {graph?.practice?.question ? (
        <p className="cg-practice">
          <span>Try this</span> {graph.practice.question}
        </p>
      ) : null}
    </div>
  );
}
