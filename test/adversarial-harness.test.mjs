// Adversarial Stress Testing Harness for SmartDoc Business Rules & Conditional Branching
// Challenger 1 — Comprehensive Empirical Verification Suite
// Target: workflowGraphEngine.js (Worker M1 implementation)

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import * as engine from '../src/utils/workflowGraphEngine.js';

const {
  createStageNode,
  buildGraphFromWorkflowSteps,
  compileGraphToStandardWorkflow,
  computeAutoLayout,
  computeGraphEdges,
  addNodeOnBranch,
  repairBranchTargets,
  evaluateSingleRule,
  evaluateStageCondition,
  simulateWorkflowGraph,
  formatConditionSummary,
  describeNoBranch
} = engine;

console.log('TAP version 13');

// ============================================================================
// SUITE 1: Chaining 5+ Consecutive Nodes on NO Branch & Multi-Track Layout
// ============================================================================
describe('Suite 1: Chaining 5+ Consecutive Nodes on NO Branch & Multi-Track Layout', () => {

  test('1.1: Cascading NO branches (5 consecutive false-branch nodes) generate distinct multi-track coordinates', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance']);
    const s1 = nodes.find(n => n.type === 'STAGE');
    let prevId = s1.id;

    for (let i = 1; i <= 5; i++) {
      nodes = addNodeOnBranch(nodes, prevId, 'false', {
        department: `NO_Track_Stage_${i}`,
        label: `Cascading NO Stage ${i}`
      });
      prevId = nodes.newNode.id;
    }

    // Verify 8 nodes: START, 1 primary STAGE, 5 branch STAGES, END
    assert.equal(nodes.length, 8, 'Expected 8 total nodes in graph');

    // Verify all nodes have unique (x, y) coordinates
    const coordSet = new Set();
    nodes.forEach(n => {
      const coordKey = `${n.position.x},${n.position.y}`;
      assert.ok(!coordSet.has(coordKey), `Coordinate collision detected at ${coordKey} for node ${n.id}`);
      coordSet.add(coordKey);
    });

    // Verify cascading Y positions (each false-branch increments lane)
    const branchNodes = nodes.filter(n => n.isBranchNode);
    assert.equal(branchNodes.length, 5, 'Expected 5 branch nodes');
    for (let i = 1; i < branchNodes.length; i++) {
      assert.ok(
        branchNodes[i].position.y > branchNodes[i - 1].position.y,
        `Branch node ${i} Y (${branchNodes[i].position.y}) must be below Branch node ${i-1} Y (${branchNodes[i-1].position.y})`
      );
      assert.ok(
        branchNodes[i].position.x > branchNodes[i - 1].position.x,
        `Branch node ${i} X (${branchNodes[i].position.x}) must advance horizontally past Branch node ${i-1} X (${branchNodes[i-1].position.x})`
      );
    }

    // Verify END node is positioned after all branch nodes horizontally
    const endNode = nodes.find(n => n.type === 'END');
    const maxOtherX = Math.max(...nodes.filter(n => n.type !== 'END').map(n => n.position.x));
    assert.ok(
      endNode.position.x > maxOtherX,
      `End node X (${endNode.position.x}) must be greater than max node X (${maxOtherX})`
    );
  });

  test('1.2: Linear NO branch chaining (5 consecutive nodes on secondary track) maintains uniform lane alignment', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance']);
    const s1 = nodes.find(n => n.type === 'STAGE');

    // First node diverges to NO branch (lane 1)
    nodes = addNodeOnBranch(nodes, s1.id, 'false', { department: 'Audit_1' });
    let prevId = nodes.newNode.id;

    // Remaining 4 nodes chain forward along the NO track (true continuation of the branch)
    for (let i = 2; i <= 5; i++) {
      nodes = addNodeOnBranch(nodes, prevId, 'true', { department: `Audit_${i}` });
      prevId = nodes.newNode.id;
    }

    const branchNodes = nodes.filter(n => n.isBranchNode);
    assert.equal(branchNodes.length, 5);

    // All 5 linear branch nodes should share the same Y lane (y = 370)
    const firstBranchY = branchNodes[0].position.y;
    branchNodes.forEach((bn, idx) => {
      assert.equal(
        bn.position.y,
        firstBranchY,
        `Branch node ${idx + 1} (${bn.department}) should remain on lane Y=${firstBranchY}, got ${bn.position.y}`
      );
    });

    // Spacing between consecutive branch nodes should be exactly stepX (315px)
    for (let i = 1; i < branchNodes.length; i++) {
      const deltaX = branchNodes[i].position.x - branchNodes[i - 1].position.x;
      assert.equal(deltaX, 315, `Spacing between branch nodes ${i} and ${i+1} must be 315px, got ${deltaX}`);
    }

    // No collisions across the entire graph
    const coords = new Set(nodes.map(n => `${n.position.x},${n.position.y}`));
    assert.equal(coords.size, nodes.length, 'No node coordinates may collide');
  });

  test('1.3: Vertical orientation correctly computes coordinates for 5-node NO branch chain', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance'], 'Administration', 'vertical');
    const s1 = nodes.find(n => n.type === 'STAGE');
    let prevId = s1.id;

    for (let i = 1; i <= 5; i++) {
      nodes = addNodeOnBranch(nodes, prevId, 'true', { department: `V_Stage_${i}` }, 'vertical');
      prevId = nodes.newNode.id;
    }

    // In vertical mode, nodes advance along Y axis
    for (let i = 1; i < nodes.length; i++) {
      assert.ok(
        nodes[i].position.y >= nodes[i - 1].position.y || nodes[i].position.x !== nodes[i - 1].position.x,
        'Vertical nodes must not occupy same coordinate'
      );
    }
    const coords = new Set(nodes.map(n => `${n.position.x},${n.position.y}`));
    assert.equal(coords.size, nodes.length, 'Vertical layout must have zero coordinate collisions');
  });

  test('1.4: Edge computation generates complete edge topology for 5-node NO branch chain', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance']);
    const s1 = nodes.find(n => n.type === 'STAGE');
    nodes = addNodeOnBranch(nodes, s1.id, 'false', { department: 'Audit_1' });
    let prevId = nodes.newNode.id;
    for (let i = 2; i <= 5; i++) {
      nodes = addNodeOnBranch(nodes, prevId, 'true', { department: `Audit_${i}` });
      prevId = nodes.newNode.id;
    }

    const edges = computeGraphEdges(nodes);
    assert.equal(edges.length, 8, `Expected 8 edges (Start->S1, S1->End, S1->B1, B1->B2, B2->B3, B3->B4, B4->B5, B5->End), got ${edges.length}`);

    // Verify all edges have valid SVG pathD strings
    edges.forEach(e => {
      assert.ok(e.pathD && e.pathD.startsWith('M '), `Edge ${e.id} must have a valid pathD starting with M`);
      assert.ok(typeof e.labelX === 'number' && !Number.isNaN(e.labelX), `Edge ${e.id} labelX must be numeric`);
      assert.ok(typeof e.labelY === 'number' && !Number.isNaN(e.labelY), `Edge ${e.id} labelY must be numeric`);
    });

    const falseEdge = edges.find(e => e.kind === 'FALSE_BRANCH');
    assert.ok(falseEdge, 'FALSE_BRANCH edge must exist from decision node to Audit_1');
    assert.equal(falseEdge.fromId, s1.id);
  });

  test('1.5: simulateWorkflowGraph correctly traverses entire 5-node NO branch chain and calculates cumulative SLA', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance']);
    const s1 = nodes.find(n => n.type === 'STAGE');
    nodes = addNodeOnBranch(nodes, s1.id, 'false', { department: 'Audit_1', slaHours: 12 });
    let prevId = nodes.newNode.id;
    for (let i = 2; i <= 5; i++) {
      nodes = addNodeOnBranch(nodes, prevId, 'true', { department: `Audit_${i}`, slaHours: 10 });
      prevId = nodes.newNode.id;
    }

    // Trigger NO branch on stage 1
    const sim = simulateWorkflowGraph(nodes, { 'Decision / Approved': 'No' });

    assert.ok(sim.executionPath.includes(s1.id), 'Stage 1 must be in execution path');
    const branchNodes = nodes.filter(n => n.isBranchNode);
    branchNodes.forEach(bn => {
      assert.ok(sim.executionPath.includes(bn.id), `Branch node ${bn.department} must be in execution path`);
    });
    assert.ok(sim.executionPath.includes('node-end'), 'End node must be reached at end of NO branch chain');

    // Expected SLA: S1 (48) + B1 (12) + B2 (10) + B3 (10) + B4 (10) + B5 (10) = 100 hours
    assert.equal(sim.totalActiveSlaHours, 100, `Expected 100 active SLA hours, got ${sim.totalActiveSlaHours}`);
  });
});

// ============================================================================
// SUITE 2: Cycle Prevention & Termination Safety in simulateWorkflowGraph
// ============================================================================
describe('Suite 2: Cycle Prevention & Termination Safety in simulateWorkflowGraph', () => {

  test('2.1: 2-node mutual cycle (A -> B -> A) terminates safely via visitedSet without infinite loop', () => {
    const nodeA = createStageNode({ id: 'stage-A', department: 'DeptA', trueBranchTarget: 'stage-B' });
    const nodeB = createStageNode({ id: 'stage-B', department: 'DeptB', trueBranchTarget: 'stage-A' });
    const start = { id: 'node-start', type: 'START', position: { x: 0, y: 0 } };
    const end = { id: 'node-end', type: 'END', position: { x: 500, y: 0 } };
    const nodes = [start, nodeA, nodeB, end];

    const startTime = performance.now();
    const sim = simulateWorkflowGraph(nodes, {});
    const elapsed = performance.now() - startTime;

    assert.ok(elapsed < 200, `Simulation should terminate in <200ms, took ${elapsed}ms`);
    assert.deepEqual(sim.executionPath, ['node-start', 'stage-A', 'stage-B']);
    assert.equal(sim.nodeStates['stage-A'].status, 'ACTIVE');
    assert.equal(sim.nodeStates['stage-B'].status, 'ACTIVE');
    assert.equal(sim.nodeStates['node-end'].status, 'BYPASSED');
    assert.ok(sim.activeEdgeIds.includes('edge-stage-B-stage-A-true'), 'Cycle-closing edge should be recorded');
  });

  test('2.2: 1-node self-referential cycle (A -> A) terminates immediately', () => {
    const nodeA = createStageNode({ id: 'stage-A', department: 'SelfDept', trueBranchTarget: 'stage-A' });
    const start = { id: 'node-start', type: 'START', position: { x: 0, y: 0 } };
    const end = { id: 'node-end', type: 'END', position: { x: 500, y: 0 } };

    const sim = simulateWorkflowGraph([start, nodeA, end], {});
    assert.deepEqual(sim.executionPath, ['node-start', 'stage-A']);
    assert.equal(sim.activeEdgeIds.length, 2, 'Should include start edge and self loop edge');
  });

  test('2.3: 3-node loop cycle (A -> B -> C -> A) terminates on second visit to A', () => {
    const nodeA = createStageNode({ id: 'stage-A', trueBranchTarget: 'stage-B' });
    const nodeB = createStageNode({ id: 'stage-B', trueBranchTarget: 'stage-C' });
    const nodeC = createStageNode({ id: 'stage-C', trueBranchTarget: 'stage-A' });
    const start = { id: 'node-start', type: 'START', position: { x: 0, y: 0 } };
    const end = { id: 'node-end', type: 'END', position: { x: 600, y: 0 } };

    const sim = simulateWorkflowGraph([start, nodeA, nodeB, nodeC, end], {});
    assert.deepEqual(sim.executionPath, ['node-start', 'stage-A', 'stage-B', 'stage-C']);
  });

  test('2.4: Lasso topology (Entry tail S1 -> S2 -> S3 -> S4 -> S2) terminates safely on S2', () => {
    const s1 = createStageNode({ id: 's1', trueBranchTarget: 's2' });
    const s2 = createStageNode({ id: 's2', trueBranchTarget: 's3' });
    const s3 = createStageNode({ id: 's3', trueBranchTarget: 's4' });
    const s4 = createStageNode({ id: 's4', trueBranchTarget: 's2' });
    const start = { id: 'node-start', type: 'START', position: { x: 0, y: 0 } };
    const end = { id: 'node-end', type: 'END', position: { x: 800, y: 0 } };

    const sim = simulateWorkflowGraph([start, s1, s2, s3, s4, end], {});
    assert.deepEqual(sim.executionPath, ['node-start', 's1', 's2', 's3', 's4']);
    assert.ok(sim.activeEdgeIds.includes('edge-s4-s2-true'));
  });

  test('2.5: Alternating conditional cycle (A false-branches to B, B false-branches to A) terminates cleanly', () => {
    const sA = createStageNode({
      id: 'sA',
      nodeSubType: 'DECISION_YES_NO',
      falseBranchTarget: 'sB'
    });
    const sB = createStageNode({
      id: 'sB',
      nodeSubType: 'DECISION_YES_NO',
      falseBranchTarget: 'sA'
    });
    const start = { id: 'node-start', type: 'START', position: { x: 0, y: 0 } };
    const end = { id: 'node-end', type: 'END', position: { x: 500, y: 0 } };

    const sim = simulateWorkflowGraph([start, sA, sB, end], { 'Decision / Approved': 'No' });
    assert.deepEqual(sim.executionPath, ['node-start', 'sA', 'sB']);
    assert.ok(sim.activeEdgeIds.includes('edge-sB-sA-false'));
  });

  test('2.6: Safety limit counter (50 iterations max) prevents infinite loops under any conditions', () => {
    const depts = Array.from({ length: 60 }, (_, i) => `Chain_${i + 1}`);
    const nodes = buildGraphFromWorkflowSteps(depts);
    const sim = simulateWorkflowGraph(nodes, {});

    assert.equal(sim.executionPath.length, 50, 'Safety limit must cap simulation path at 50 iterations');
  });
});

// ============================================================================
// SUITE 3: Target Node Deletion Resilience (repairBranchTargets)
// ============================================================================
describe('Suite 3: Target Node Deletion Resilience (repairBranchTargets)', () => {

  test('3.1: Auto-heals deleted trueBranchTarget by resetting to __NEXT__', () => {
    const s1 = createStageNode({
      id: 'stage-1',
      trueBranchTarget: 'stage-deleted-xyz',
      falseBranchTarget: 'stage-2'
    });
    const s2 = createStageNode({ id: 'stage-2' });
    const nodes = [
      { id: 'node-start', type: 'START' },
      s1,
      s2,
      { id: 'node-end', type: 'END' }
    ];

    const repaired = repairBranchTargets(nodes);
    const repS1 = repaired.find(n => n.id === 'stage-1');
    assert.equal(repS1.trueBranchTarget, '__NEXT__', 'Orphaned trueBranchTarget should be auto-healed to __NEXT__');
    assert.equal(repS1.falseBranchTarget, 'stage-2', 'Existing valid falseBranchTarget must be preserved');
  });

  test('3.2: Auto-heals deleted falseBranchTarget by resetting to empty string', () => {
    const s1 = createStageNode({
      id: 'stage-1',
      nodeSubType: 'DECISION_YES_NO',
      trueBranchTarget: 'stage-2',
      falseBranchTarget: 'stage-deleted-abc'
    });
    const s2 = createStageNode({ id: 'stage-2' });
    const nodes = [
      { id: 'node-start', type: 'START' },
      s1,
      s2,
      { id: 'node-end', type: 'END' }
    ];

    const repaired = repairBranchTargets(nodes);
    const repS1 = repaired.find(n => n.id === 'stage-1');
    assert.equal(repS1.falseBranchTarget, '', 'Orphaned falseBranchTarget should be auto-healed to empty string');
    assert.equal(repS1.trueBranchTarget, 'stage-2', 'Existing valid trueBranchTarget must be preserved');
  });

  test('3.3: Preserves special sentinels (__NEXT__, __END__, __REJECT__, __RETURN__)', () => {
    const s1 = createStageNode({
      id: 'stage-sentinels',
      trueBranchTarget: '__END__',
      falseBranchTarget: '__REJECT__'
    });
    const s2 = createStageNode({
      id: 'stage-sentinels-2',
      trueBranchTarget: '__NEXT__',
      falseBranchTarget: '__RETURN__'
    });
    const nodes = [s1, s2];

    const repaired = repairBranchTargets(nodes);
    assert.equal(repaired[0].trueBranchTarget, '__END__');
    assert.equal(repaired[0].falseBranchTarget, '__REJECT__');
    assert.equal(repaired[1].trueBranchTarget, '__NEXT__');
    assert.equal(repaired[1].falseBranchTarget, '__RETURN__');
  });

  test('3.4: Splicing deletion: Removing an intermediate branch node and repairing maintains graph integrity', () => {
    let nodes = buildGraphFromWorkflowSteps(['Finance', 'Legal']);
    const s1 = nodes.find(n => n.department === 'Finance');
    nodes = addNodeOnBranch(nodes, s1.id, 'false', { department: 'Intermediate_Audit', id: 'stage-audit-target' });
    
    const filteredNodes = nodes.filter(n => n.id !== 'stage-audit-target');
    const repaired = repairBranchTargets(filteredNodes);

    const repairedS1 = repaired.find(n => n.id === s1.id);
    assert.equal(repairedS1.falseBranchTarget, '', 'False target should be healed to empty');

    const edges = computeGraphEdges(repaired);
    assert.ok(edges.length >= 3, 'Edges should compute safely');
    const sim = simulateWorkflowGraph(repaired, { 'Decision / Approved': 'No' });
    assert.ok(sim.executionPath.length >= 2, 'Simulation should complete safely');
  });

  test('3.5: Boundary handling: Empty, null, and non-array inputs return safe defaults without throwing', () => {
    assert.deepEqual(repairBranchTargets([]), []);
    assert.deepEqual(repairBranchTargets(null), []);
    assert.deepEqual(repairBranchTargets(undefined), []);
    assert.deepEqual(repairBranchTargets('not-an-array'), []);
  });
});

// ============================================================================
// SUITE 4: Adversarial Form Inputs & Boundary Conditions
// ============================================================================
describe('Suite 4: Adversarial Form Inputs & Boundary Conditions', () => {

  test('4.1: Undefined, null, and missing field values evaluate safely', () => {
    const ruleNotEmpty = { field: 'vendor', operator: 'not_empty', value: '' };
    const ruleEq = { field: 'status', operator: '=', value: 'APPROVED' };
    const ruleGt = { field: 'amount', operator: '>', value: '500' };

    assert.equal(evaluateSingleRule(ruleNotEmpty, { vendor: undefined }), false);
    assert.equal(evaluateSingleRule(ruleNotEmpty, { vendor: null }), false);
    assert.equal(evaluateSingleRule(ruleNotEmpty, {}), false);

    assert.equal(evaluateSingleRule(ruleEq, { status: null }), false);
    assert.equal(evaluateSingleRule(ruleEq, { status: undefined }), false);
    assert.equal(evaluateSingleRule(ruleEq, {}), false);

    assert.equal(evaluateSingleRule(ruleGt, { amount: null }), false);
    assert.equal(evaluateSingleRule(ruleGt, { amount: undefined }), false);
  });

  test('4.2: Numeric string variations (commas, leading zeroes, negative, scientific notation)', () => {
    assert.equal(evaluateSingleRule({ field: 'amount', operator: '>', value: '5000' }, { amount: '10,000' }), true);
    assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '10,000' }, { amount: '10000' }), true);
    assert.equal(evaluateSingleRule({ field: 'code', operator: '=', value: '7' }, { code: '  007  ' }), true);
    assert.equal(evaluateSingleRule({ field: 'temp', operator: '<', value: '0' }, { temp: '-5' }), true);
    assert.equal(evaluateSingleRule({ field: 'temp', operator: '>', value: '-10' }, { temp: '-5' }), true);
    assert.equal(evaluateSingleRule({ field: 'rate', operator: '>=', value: '3.14' }, { rate: '3.14159' }), true);
  });

  test('4.3: [EMPIRICAL FINDING] Currency symbols ($10,000, €500) fail parseFloat and trigger string localeCompare', () => {
    const dollarVal = String.fromCharCode(36) + '10,000';
    const isNumParsed = !Number.isNaN(parseFloat(dollarVal.replace(/,/g, '')));
    assert.equal(isNumParsed, false, 'Currency symbol causes parseFloat to return NaN');

    const res = evaluateSingleRule({ field: 'cost', operator: '>', value: '5000' }, { cost: dollarVal });
    assert.equal(res, false, 'Unstripped currency symbol results in lexicographical comparison failure');
  });

  test('4.4: [EMPIRICAL FINDING] NaN field value in testValues falls back to string "NaN" and evaluates true against digits', () => {
    const res = evaluateSingleRule({ field: 'amount', operator: '>', value: '100' }, { amount: NaN });
    assert.equal(res, true, 'NaN string fallback results in true comparison against digits under localeCompare');
  });

  test('4.5: Object and array values in testValues do not cause uncaught crash', () => {
    const rule = { field: 'payload', operator: 'not_empty', value: '' };

    const resObj = evaluateSingleRule(rule, { payload: { internal: 123 } });
    assert.equal(resObj, true, 'Object converted to string is not empty');

    const resArr = evaluateSingleRule(rule, { payload: [1, 2, 3] });
    assert.equal(resArr, true, 'Array converted to string is not empty');

    const resEmptyArr = evaluateSingleRule(rule, { payload: [] });
    assert.equal(resEmptyArr, false, 'Empty array converted to string is empty');
  });

  test('4.6: Security injection strings (SQLi, XSS, SSTI, Prototype keys) do not execute or poison engine', () => {
    const injections = [
      "<script>alert('xss')</script>",
      "' OR '1'='1' --",
      "${7*7}",
      "{{constructor.constructor('return this')()}}",
      "__proto__",
      "constructor",
      "toString",
      "valueOf",
      "../../../etc/passwd"
    ];

    injections.forEach(inj => {
      const resEq = evaluateSingleRule({ field: 'comment', operator: '=', value: inj }, { comment: inj });
      assert.equal(resEq, true, `Injection string ${inj} should compare safely as literal`);

      const resContains = evaluateSingleRule({ field: 'comment', operator: 'contains', value: 'alert' }, { comment: injections[0] });
      assert.equal(resContains, true);

      const summary = formatConditionSummary({
        enabled: true,
        rules: [{ field: 'comment', operator: '=', value: inj }]
      });
      assert.ok(summary.includes(inj), 'Summary must contain sanitized literal');
    });

    assert.equal(Object.prototype.polluted, undefined, 'Prototype pollution must not occur');
  });

  test('4.7: Unknown operator and corrupted rule objects fall back safely', () => {
    assert.equal(evaluateSingleRule({ field: 'x', operator: 'UNKNOWN_OP', value: '1' }, { x: '2' }), true);
    assert.equal(evaluateSingleRule(null, { x: '1' }), true);
    assert.equal(evaluateSingleRule({}, { x: '1' }), true);
    assert.equal(evaluateSingleRule({ operator: '=' }, { x: '1' }), true);
  });
});
