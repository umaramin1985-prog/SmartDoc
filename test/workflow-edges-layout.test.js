import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Dynamic import for workflowGraphEngine
let engine;
try {
  engine = await import('../src/utils/workflowGraphEngine.js');
} catch {
  engine = await import(pathToFileURL('C:/AliA-----/UAmin/SmartDoc/SmartDoc/src/utils/workflowGraphEngine.js').href);
}

const {
  computeGraphEdges,
  computeAutoLayout,
  createStageNode,
  simulateWorkflowGraph
} = engine;

// -------------------------------------------------------------
// Tier 1: Feature Coverage — Graph Edges & Multi-Branch Layout
// -------------------------------------------------------------

test('Tier 1: computeGraphEdges generates PRIMARY edges between sequential stages', () => {
  const nodes = [
    { id: 'node-start', type: 'START', label: 'Submitter' },
    createStageNode({ department: 'HR' }),
    createStageNode({ department: 'Finance' }),
    { id: 'node-end', type: 'END', label: 'Archived' }
  ];

  const edges = computeGraphEdges(nodes);
  assert.equal(edges.length, 3);

  assert.equal(edges[0].fromId, 'node-start');
  assert.equal(edges[0].toId, nodes[1].id);
  assert.equal(edges[0].kind, 'PRIMARY');
  assert.equal(edges[0].insertIndex, 0);

  assert.equal(edges[1].fromId, nodes[1].id);
  assert.equal(edges[1].toId, nodes[2].id);
  assert.equal(edges[1].kind, 'PRIMARY');

  assert.equal(edges[2].fromId, nodes[2].id);
  assert.equal(edges[2].toId, 'node-end');
  assert.equal(edges[2].kind, 'PRIMARY');
});

test('Tier 1: computeGraphEdges generates YES and NO branch edges for decision nodes', () => {
  const stage1 = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Legal'
  });
  const stage2 = createStageNode({ department: 'Executive' });

  const nodes = [stage1, stage2];
  const edges = computeGraphEdges(nodes);

  assert.equal(edges.length, 2);

  const primaryEdge = edges.find(e => e.kind === 'PRIMARY');
  assert.ok(primaryEdge);
  assert.equal(primaryEdge.isYesBranch, true);
  assert.equal(primaryEdge.label, '✓ YES · Proceed');

  const noEdge = edges.find(e => e.kind === 'NO_BRANCH');
  assert.ok(noEdge);
  assert.equal(noEdge.fromId, stage1.id);
  assert.equal(noEdge.hasRule, true);
  assert.ok(noEdge.label.includes('NO → Route to Legal'));
});

test('Tier 1: computeGraphEdges reflects simulation states on edges', () => {
  const stage1 = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Legal'
  });
  const stage2 = createStageNode({ department: 'Finance' });
  const nodes = [stage1, stage2];

  const simPass = simulateWorkflowGraph(nodes, { 'Decision / Approved': 'Yes' });
  const edgesPass = computeGraphEdges(nodes, simPass);
  const noEdgePass = edgesPass.find(e => e.kind === 'NO_BRANCH');
  assert.equal(noEdgePass.simStatus, 'NO_IDLE');

  const simFail = simulateWorkflowGraph(nodes, { 'Decision / Approved': 'No' });
  const edgesFail = computeGraphEdges(nodes, simFail);
  const noEdgeFail = edgesFail.find(e => e.kind === 'NO_BRANCH');
  const primaryEdgeFail = edgesFail.find(e => e.kind === 'PRIMARY');
  assert.equal(noEdgeFail.simStatus, 'NO_ACTIVE');
  assert.equal(primaryEdgeFail.simStatus, 'BYPASSED');
});

test('Tier 1: computeAutoLayout calculates horizontal coordinates with uniform step spacing', () => {
  const nodes = [
    { id: '1', type: 'START' },
    { id: '2', type: 'STAGE' },
    { id: '3', type: 'STAGE' },
    { id: '4', type: 'END' }
  ];

  const layout = computeAutoLayout(nodes, 'horizontal');
  assert.equal(layout.length, 4);

  assert.deepEqual(layout[0].position, { x: 60, y: 150 });
  assert.deepEqual(layout[1].position, { x: 60 + 315, y: 150 });
  assert.deepEqual(layout[2].position, { x: 60 + 315 * 2, y: 150 });
  assert.deepEqual(layout[3].position, { x: 60 + 315 * 3, y: 150 });
});

test('Tier 1: computeAutoLayout calculates vertical coordinates with uniform step spacing', () => {
  const nodes = [
    { id: '1', type: 'START' },
    { id: '2', type: 'STAGE' },
    { id: '3', type: 'END' }
  ];

  const layout = computeAutoLayout(nodes, 'vertical');
  assert.equal(layout.length, 3);

  assert.deepEqual(layout[0].position, { x: 320, y: 50 });
  assert.deepEqual(layout[1].position, { x: 320, y: 50 + 210 });
  assert.deepEqual(layout[2].position, { x: 320, y: 50 + 210 * 2 });
});

// -------------------------------------------------------------
// Tier 2: Boundary & Corner Cases
// -------------------------------------------------------------

test('Tier 2: computeGraphEdges handles empty or single node arrays without error', () => {
  assert.deepEqual(computeGraphEdges([]), []);
  assert.deepEqual(computeGraphEdges(null), []);
  assert.deepEqual(computeGraphEdges([{ id: 'solo', type: 'START' }]), []);
});

test('Tier 2: computeAutoLayout handles empty array safely', () => {
  assert.deepEqual(computeAutoLayout([]), []);
  assert.deepEqual(computeAutoLayout([], 'vertical'), []);
});

test('Tier 2: computeGraphEdges gracefully handles null/undefined simulation parameter', () => {
  const nodes = [{ id: '1', type: 'START' }, { id: '2', type: 'END' }];
  const edges = computeGraphEdges(nodes, null);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].simStatus, 'ACTIVE');
});

// -------------------------------------------------------------
// Tier 3: Complex Multi-Node Edge Graph Topology
// -------------------------------------------------------------

test('Tier 3: Complex workflow with multiple decision gates and rules generates complete edge topology', () => {
  const nodeStart = { id: 'start', type: 'START' };
  const gate1 = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Recruitment Review'
  });
  const gate2 = createStageNode({
    department: 'Finance',
    withCondition: true,
    defaultField: 'Budget'
  });
  const gate3 = createStageNode({
    department: 'Compliance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'REJECT_END'
  });
  const nodeEnd = { id: 'end', type: 'END' };

  const nodes = [nodeStart, gate1, gate2, gate3, nodeEnd];
  const edges = computeGraphEdges(nodes);

  assert.equal(edges.length, 7);

  const primaryEdges = edges.filter(e => e.kind === 'PRIMARY');
  const noBranchEdges = edges.filter(e => e.kind === 'NO_BRANCH');

  assert.equal(primaryEdges.length, 4);
  assert.equal(noBranchEdges.length, 3);

  const layout = computeAutoLayout(nodes, 'horizontal');
  const xPositions = layout.map(n => n.position.x);
  const uniqueXPositions = new Set(xPositions);
  assert.equal(uniqueXPositions.size, nodes.length, 'Each node must have a unique X coordinate to avoid collision');
});
