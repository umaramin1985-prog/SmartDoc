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
  createStageNode,
  buildGraphFromWorkflowSteps,
  evaluateStageCondition,
  simulateWorkflowGraph,
  describeNoBranch,
  addNodeOnBranch
} = engine;

// -------------------------------------------------------------
// Tier 1: Feature Coverage — Conditional Branching & Decisions
// -------------------------------------------------------------

test('Tier 1: DECISION_YES_NO node evaluates YES path when Decision / Approved is Yes', () => {
  const node = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    decisionQuestion: 'Is background verification clear?'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'Yes' });
  assert.equal(res.passed, true);
  assert.equal(res.status, 'ACTIVE');
  assert.equal(res.effectiveDepartment, 'HR');
  assert.equal(res.branch, 'YES');
});

test('Tier 1: DECISION_YES_NO node evaluates NO path when Decision / Approved is No', () => {
  const node = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Legal'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'No' });
  assert.equal(res.passed, false);
  assert.equal(res.status, 'FALLBACK');
  assert.equal(res.effectiveDepartment, 'Legal');
  assert.equal(res.branch, 'NO');
});

test('Tier 1: NO branch action ROUTE_DEPT routes to alternate department', () => {
  const node = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Internal Audit'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'No' });
  assert.equal(res.status, 'FALLBACK');
  assert.equal(res.effectiveDepartment, 'Internal Audit');
});

test('Tier 1: NO branch action RETURN_SUBMITTER returns to applicant', () => {
  const node = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'RETURN_SUBMITTER'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'No' });
  assert.equal(res.status, 'RETURNED');
  assert.equal(res.effectiveDepartment, 'Applicant (Returned)');
});

test('Tier 1: NO branch action REJECT_END terminates workflow', () => {
  const node = createStageNode({
    department: 'Compliance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'REJECT_END'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'No' });
  assert.equal(res.status, 'REJECTED');
  assert.equal(res.effectiveDepartment, 'Rejected (Closed)');
});

test('Tier 1: NO branch action BYPASS_NEXT bypasses the stage', () => {
  const node = createStageNode({
    department: 'Compliance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'BYPASS_NEXT'
  });

  const res = evaluateStageCondition(node, { 'Decision / Approved': 'No' });
  assert.equal(res.status, 'BYPASSED');
  assert.equal(res.effectiveDepartment, null);
});

test('Tier 1: describeNoBranch outputs correct human-readable descriptions', () => {
  const nodeRoute = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Tax'
  });
  assert.equal(describeNoBranch(nodeRoute), 'NO → Route to Tax');

  const nodeReturn = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'RETURN_SUBMITTER'
  });
  assert.equal(describeNoBranch(nodeReturn), 'NO → Return to Submitter');

  const nodeReject = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'REJECT_END'
  });
  assert.equal(describeNoBranch(nodeReject), 'NO → Reject & Close');

  const nodeBypass = createStageNode({
    department: 'Finance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'BYPASS_NEXT'
  });
  assert.equal(describeNoBranch(nodeBypass), 'NO → Skip Stage');

  const regularNode = createStageNode({ department: 'HR' });
  assert.equal(describeNoBranch(regularNode), '');
});

test('Tier 1: buildGraphFromWorkflowSteps preserves decision and rule attributes', () => {
  const steps = [
    { department: 'HR', nodeSubType: 'DECISION_YES_NO', noAction: 'ROUTE_DEPT', noDepartment: 'Legal' },
    { department: 'Finance', condition: { enabled: true, rules: [{ field: 'Amount', operator: '>', value: '1000' }] } }
  ];

  const nodes = buildGraphFromWorkflowSteps(steps, 'Administration', 'horizontal');
  assert.ok(nodes.length >= 4); // START + 2 stages + END
  const startNode = nodes.find(n => n.type === 'START');
  const hrNode = nodes.find(n => n.department === 'HR');
  const finNode = nodes.find(n => n.department === 'Finance');
  const endNode = nodes.find(n => n.type === 'END');

  assert.ok(startNode);
  assert.ok(endNode);
  assert.equal(hrNode.nodeSubType, 'DECISION_YES_NO');
  assert.equal(hrNode.noDepartment, 'Legal');
  assert.equal(finNode.condition.enabled, true);
});

// -------------------------------------------------------------
// Tier 2: Boundary & Corner Cases
// -------------------------------------------------------------

test('Tier 2: Decision node with missing Decision/Approved value in testValues defaults to No', () => {
  const node = createStageNode({
    department: 'Operations',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Escalations'
  });

  const res = evaluateStageCondition(node, {});
  assert.equal(res.passed, false);
  assert.equal(res.status, 'FALLBACK');
  assert.equal(res.effectiveDepartment, 'Escalations');
});

test('Tier 2: Node condition with FALLBACK_DEPT but empty fallbackDepartment defaults safely', () => {
  const node = createStageNode({ department: 'Admin', withCondition: true });
  node.condition = {
    enabled: true,
    logic: 'AND',
    elseAction: 'FALLBACK_DEPT',
    fallbackDepartment: '',
    rules: [{ field: 'Score', operator: '>', value: '50' }]
  };

  const res = evaluateStageCondition(node, { Score: '20' });
  assert.equal(res.passed, false);
  assert.equal(res.status, 'BYPASSED');
});

test('Tier 2: buildGraphFromWorkflowSteps with empty steps creates default stage', () => {
  const nodes = buildGraphFromWorkflowSteps([], 'HR', 'horizontal');
  assert.equal(nodes.length, 3);
  const stage = nodes.find(n => n.type === 'STAGE');
  assert.equal(stage.department, 'HR');
});

// -------------------------------------------------------------
// Tier 3: Cross-Feature Interactions & Graph Simulation
// -------------------------------------------------------------

test('Tier 3: simulateWorkflowGraph traces sequential nodes with decision and conditional branches', () => {
  const nodeStart = { id: 'start', type: 'START', label: 'Submitter' };
  const stage1 = createStageNode({
    department: 'HR',
    nodeSubType: 'DECISION_YES_NO',
    slaHours: 24,
    noAction: 'ROUTE_DEPT',
    noDepartment: 'Special Review'
  });
  const stage2 = createStageNode({
    department: 'Finance',
    slaHours: 48,
    withCondition: true
  });
  stage2.condition = {
    enabled: true,
    logic: 'AND',
    elseAction: 'BYPASS',
    rules: [{ field: 'Amount', operator: '>', value: '10000' }]
  };
  const nodeEnd = { id: 'end', type: 'END', label: 'Approved & Sealed' };

  const graph = [nodeStart, stage1, stage2, nodeEnd];

  const simA = simulateWorkflowGraph(graph, {
    'Decision / Approved': 'Yes',
    Amount: '5000'
  });

  assert.equal(simA.nodeStates[stage1.id].passed, true);
  assert.equal(simA.nodeStates[stage2.id].passed, false);
  assert.equal(simA.nodeStates[stage2.id].status, 'BYPASSED');
  assert.equal(simA.effectiveSteps.length, 1);
  assert.equal(simA.effectiveSteps[0].department, 'HR');
  assert.equal(simA.totalActiveSlaHours, 24);

  const simB = simulateWorkflowGraph(graph, {
    'Decision / Approved': 'No',
    Amount: '20000'
  });

  assert.equal(simB.nodeStates[stage1.id].passed, false);
  assert.equal(simB.nodeStates[stage1.id].status, 'FALLBACK');
  assert.equal(simB.nodeStates[stage2.id].passed, true);
  assert.equal(simB.effectiveSteps.length, 2);
  assert.equal(simB.effectiveSteps[0].department, 'Special Review');
  assert.equal(simB.effectiveSteps[1].department, 'Finance');
  assert.equal(simB.totalActiveSlaHours, 24 + 48);
});

test('Tier 3: First-Class Branch Node Chaining Contract & Interactivity', () => {
  assert.strictEqual(typeof addNodeOnBranch, 'function', 'addNodeOnBranch must be a function exported by engine');
  const nodes = [
    { id: 'node-start', type: 'START' },
    createStageNode({ department: 'HR', nodeSubType: 'DECISION_YES_NO' }),
    { id: 'node-end', type: 'END' }
  ];
  const sourceNode = nodes[1];
  const updatedNodes = addNodeOnBranch(nodes, sourceNode.id, 'false', {
    department: 'Escalations',
    label: 'Escalations Handling'
  });
  const chainedNode = updatedNodes.find(n => n.department === 'Escalations');
  const updatedSource = updatedNodes.find(n => n.id === sourceNode.id);
  assert.ok(chainedNode, 'New node should be inserted on the false branch');
  assert.equal(chainedNode.type, 'STAGE');
  assert.equal(chainedNode.isBranchNode, true);
  assert.equal(updatedSource.falseBranchTarget, chainedNode.id);
});
