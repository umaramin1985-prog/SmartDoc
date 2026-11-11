import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createStageNode,
  buildGraphFromWorkflowSteps,
  addNodeOnBranch,
  repairBranchTargets,
  computeGraphEdges,
  evaluateStageCondition,
  simulateWorkflowGraph
} from '../src/utils/workflowGraphEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('M2-M3 Engine Integration: addNodeOnBranch creates first-class interactive node on NO branch', () => {
  const baseNodes = buildGraphFromWorkflowSteps(['Finance', 'Legal'], 'Finance');
  const financeNode = baseNodes.find(n => n.department === 'Finance');
  assert.ok(financeNode, 'Finance node must exist in base graph');

  // Add a node on the NO branch of Finance
  const updatedNodes = addNodeOnBranch(baseNodes, financeNode.id, 'false', {
    department: 'Compliance',
    label: 'Compliance Audit (NO Branch)'
  });

  const newNode = updatedNodes.newNode;
  assert.ok(newNode, 'addNodeOnBranch must return the new node');
  assert.equal(newNode.isBranchNode, true, 'New node must be marked as isBranchNode');
  assert.equal(newNode.branchType, 'false', 'New node branchType must be false');
  assert.equal(newNode.branchParentId, financeNode.id, 'New node branchParentId must point to source');

  // Verify source node was wired to point to the new node
  const updatedFinance = updatedNodes.find(n => n.id === financeNode.id);
  assert.equal(updatedFinance.falseBranchTarget, newNode.id, 'Source node falseBranchTarget must point to new node id');

  // Verify layout placed the branch node on secondary lane (lane 1 / y > primary)
  assert.ok(newNode.position.y > updatedFinance.position.y, 'Branch node must be offset in secondary lane');
});

test('M2-M3 Engine Integration: Chaining multiple nodes on the NO branch and merging back', () => {
  const baseNodes = buildGraphFromWorkflowSteps(['Finance', 'Legal', 'Executive'], 'Finance');
  const financeNode = baseNodes.find(n => n.department === 'Finance');
  const execNode = baseNodes.find(n => n.department === 'Executive');

  // 1. Add first node on Finance NO branch
  const step1 = addNodeOnBranch(baseNodes, financeNode.id, 'false', {
    department: 'Risk Management'
  });
  const riskNode = step1.newNode;

  // 2. Chain another node from Risk Management onward
  const step2 = addNodeOnBranch(step1, riskNode.id, 'false', {
    department: 'Audit Committee'
  });
  const auditNode = step2.newNode;

  // 3. Configure Audit Committee to merge back into Executive stage
  auditNode.trueBranchTarget = execNode.id;

  assert.equal(step2.find(n => n.id === financeNode.id).falseBranchTarget, riskNode.id);
  assert.equal(step2.find(n => n.id === riskNode.id).falseBranchTarget, auditNode.id);
  assert.equal(auditNode.trueBranchTarget, execNode.id);

  // Compute graph edges
  const edges = computeGraphEdges(step2);
  const riskEdge = edges.find(e => e.fromId === financeNode.id && e.toId === riskNode.id);
  const auditEdge = edges.find(e => e.fromId === riskNode.id && e.toId === auditNode.id);

  assert.ok(riskEdge, 'Edge from Finance to Risk Management must exist');
  assert.equal(riskEdge.isFalseBranch, true, 'Edge must be marked as false branch');
  assert.ok(auditEdge, 'Edge from Risk to Audit must exist');
});

test('M2-M3 Engine Integration: repairBranchTargets gracefully handles node deletions', () => {
  const nodes = [
    { id: 'start', type: 'START' },
    { id: 'n1', type: 'STAGE', trueBranchTarget: 'n2', falseBranchTarget: 'n3' },
    { id: 'n2', type: 'STAGE', trueBranchTarget: '__NEXT__', falseBranchTarget: '' },
    { id: 'end', type: 'END' }
  ];
  // n3 is not in nodes (it was deleted)
  const repaired = repairBranchTargets(nodes);
  const repairedN1 = repaired.find(n => n.id === 'n1');

  assert.equal(repairedN1.trueBranchTarget, 'n2', 'Valid true target is preserved');
  assert.equal(repairedN1.falseBranchTarget, '', 'Orphaned false target is cleared to empty');
});

test('M2-M3 Engine Integration: computeGraphEdges generates True green and False rose edges', () => {
  const baseNodes = buildGraphFromWorkflowSteps(['Finance', 'Legal'], 'Finance');
  const finance = baseNodes.find(n => n.department === 'Finance');
  finance.nodeSubType = 'DECISION_YES_NO';
  finance.condition = { enabled: true, rules: [] };
  finance.trueBranchTarget = '__NEXT__';

  // Case A: Unconnected NO branch stub
  finance.falseBranchTarget = '';
  const edgesA = computeGraphEdges(baseNodes);
  const stubNoEdge = edgesA.find(e => e.fromId === finance.id && e.isNoBranch);
  assert.ok(stubNoEdge, 'Stub NO branch edge must be generated');
  assert.equal(stubNoEdge.isPlaceholder, true, 'Stub NO branch must be marked isPlaceholder');

  // Case B: Connected NO branch to Legal
  const legal = baseNodes.find(n => n.department === 'Legal');
  finance.falseBranchTarget = legal.id;
  const edgesB = computeGraphEdges(baseNodes);
  const connectedNoEdge = edgesB.find(e => e.fromId === finance.id && e.toId === legal.id && e.isFalseBranch);
  assert.ok(connectedNoEdge, 'Connected false branch edge must exist');
  assert.equal(connectedNoEdge.isPlaceholder, false, 'Connected false branch must not be a placeholder');
});

test('M2-M3 UI Component Static Verification: WorkflowGraphStudio.jsx contains all required UI elements', () => {
  const studioPath = path.resolve(__dirname, '../src/components/WorkflowGraphStudio.jsx');
  assert.ok(fs.existsSync(studioPath), 'WorkflowGraphStudio.jsx must exist');
  const content = fs.readFileSync(studioPath, 'utf8');

  // 1. Imports
  assert.match(content, /addNodeOnBranch/, 'Must import addNodeOnBranch');
  assert.match(content, /repairBranchTargets/, 'Must import repairBranchTargets');
  assert.match(content, /YES_NO_NO_ACTIONS/, 'Must import YES_NO_NO_ACTIONS');

  // 2. Selectors & Handlers in Right Rail
  assert.match(content, /select-wfg-true-branch-target/, 'Must contain select for trueBranchTarget');
  assert.match(content, /select-wfg-false-branch-target/, 'Must contain select for falseBranchTarget');
  assert.match(content, /btn-wfg-add-node-on-no-branch/, 'Must contain dedicated button to add node on NO branch');
  assert.match(content, /handleAddNodeOnNoBranch/, 'Must define handleAddNodeOnNoBranch callback');

  // 3. Rule criteria builder with ALL/ANY logic pills & Add Rule button
  assert.match(content, /ALL Match \(AND\)/, 'Must contain ALL Match (AND) logic option');
  assert.match(content, /ANY Matches \(OR\)/, 'Must contain ANY Matches (OR) logic option');
  assert.match(content, /btn-wfg-add-rule-row/, 'Must contain + Add Rule button in rule list');

  // 4. SVG Edge Layer
  assert.match(content, /sd-wfg-canvas-add-no-port/, 'Must contain sd-wfg-canvas-add-no-port in SVG layer');
  assert.match(content, /\+ Add Node on NO Path/, 'Must render "+ Add Node on NO Path" on pending NO stub');
  assert.match(content, /sd-wfg-edge-badge-yes/, 'Must render centered ✓ YES badge on True edges');
  assert.match(content, /sd-wfg-edge-badge-no/, 'Must render centered ✕ NO badge on False edges');

  // 5. Node Cards Lane 1 Branch Path Badge
  assert.match(content, /sd-wfg-node-branch-tag/, 'Must render sd-wfg-node-branch-tag for branch nodes');
  assert.match(content, /Branch Path/, 'Must display "Branch Path" text on branch node badge');
});

test('M2-M3 CSS Verification: App.css defines all required design classes', () => {
  const cssPath = path.resolve(__dirname, '../src/App.css');
  assert.ok(fs.existsSync(cssPath), 'App.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.sd-wfg-target-select/, 'CSS must define .sd-wfg-target-select');
  assert.match(css, /\.sd-wfg-branch-badge/, 'CSS must define .sd-wfg-branch-badge');
  assert.match(css, /\.sd-wfg-node-branch-tag/, 'CSS must define .sd-wfg-node-branch-tag');
  assert.match(css, /\.sd-wfg-add-branch-node-btn/, 'CSS must define .sd-wfg-add-branch-node-btn');
  assert.match(css, /\.sd-wfg-canvas-add-no-port/, 'CSS must define .sd-wfg-canvas-add-no-port');
  assert.match(css, /\.sd-wfg-edge-badge-yes/, 'CSS must define .sd-wfg-edge-badge-yes');
  assert.match(css, /\.sd-wfg-edge-badge-no/, 'CSS must define .sd-wfg-edge-badge-no');
});

test('M2-M3 Edge Case: Multi-rule clause evaluation with ALL (AND) and ANY (OR) combiners', () => {
  const node = createStageNode({
    department: 'Finance',
    nodeSubType: 'RULE_GATE',
    withCondition: true
  });

  node.condition = {
    enabled: true,
    combiner: 'ALL',
    logic: 'AND',
    rules: [
      { id: 'r1', field: 'Total Amount', operator: '>', value: '5000' },
      { id: 'r2', field: 'Priority', operator: '=', value: 'High' }
    ]
  };

  // Case 1: ALL matching: amount 6000, priority High -> Passed
  const eval1 = evaluateStageCondition(node, { 'Total Amount': '6000', Priority: 'High' });
  assert.equal(eval1.passed, true);
  assert.equal(eval1.branch, 'YES');

  // Case 2: ALL matching: amount 6000, priority Low -> Failed
  const eval2 = evaluateStageCondition(node, { 'Total Amount': '6000', Priority: 'Low' });
  assert.equal(eval2.passed, false);
  assert.equal(eval2.branch, 'NO');

  // Case 3: ANY matching: switch combiner to ANY (OR)
  node.condition.combiner = 'ANY';
  node.condition.logic = 'OR';
  const eval3 = evaluateStageCondition(node, { 'Total Amount': '6000', Priority: 'Low' });
  assert.equal(eval3.passed, true);
  assert.equal(eval3.branch, 'YES');
});

test('M2-M3 End-to-End Simulation: Routing across chained NO branch nodes and terminating at Seal', () => {
  const baseNodes = buildGraphFromWorkflowSteps(['Finance', 'Legal'], 'Finance');
  const finance = baseNodes.find(n => n.department === 'Finance');
  finance.nodeSubType = 'DECISION_YES_NO';

  // Add Risk Management on Finance NO branch
  const step1 = addNodeOnBranch(baseNodes, finance.id, 'false', {
    department: 'Risk Management'
  });
  const riskNode = step1.newNode;

  // Add Compliance on Risk Management NO branch
  const step2 = addNodeOnBranch(step1, riskNode.id, 'false', {
    department: 'Compliance'
  });
  const complianceNode = step2.newNode;

  // Compliance merges into Legal
  const legal = step2.find(n => n.department === 'Legal');
  complianceNode.trueBranchTarget = legal.id;

  // Simulate when Finance answer is No
  const simRes = simulateWorkflowGraph(step2, {
    'Decision / Approved': 'No'
  });

  assert.ok(simRes.executionPath.includes(finance.id), 'Finance must be visited');
  assert.ok(simRes.executionPath.includes(riskNode.id), 'Risk Management on NO branch must be visited');
});
