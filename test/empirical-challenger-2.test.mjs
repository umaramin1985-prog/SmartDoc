// empirical-challenger-2.test.mjs
// Challenger 2 Empirical Test Suite: UI Layout Collision Prevention, SVG Edge Geometry, and Dual-Layer State Roundtrip Fidelity

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 1. Dynamic Engine Resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.resolve(__dirname, '../src/utils/workflowGraphEngine.js');
const serverPath = path.resolve(__dirname, '../server/server.js');

const engine = await import(`file:///${enginePath.replace(/\\/g, '/')}`);
const {
  createStageNode,
  computeAutoLayout,
  addNodeOnBranch,
  computeGraphEdges,
  compileGraphToStandardWorkflow,
  buildGraphFromWorkflowSteps,
  repairBranchTargets
} = engine;

// Helper: Extract cleanWorkflowStep from server.js
const serverCode = fs.readFileSync(serverPath, 'utf8');
const cleanWorkflowStepMatch = serverCode.match(/function cleanWorkflowStep[\s\S]*?\n\}/);
if (!cleanWorkflowStepMatch) {
  throw new Error('Failed to extract cleanWorkflowStep from server/server.js');
}
const cleanWorkflowStep = new Function('return (' + cleanWorkflowStepMatch[0] + ')')();

// Geometry Helper: Check rectangular bounding box intersection
const NODE_WIDTH = 242;
const NODE_HEIGHT = 148;

function getBoundingBox(node) {
  const x = node.position?.x ?? 0;
  const y = node.position?.y ?? 0;
  return {
    id: node.id,
    label: node.label || node.id,
    x1: x,
    y1: y,
    x2: x + NODE_WIDTH,
    y2: y + NODE_HEIGHT
  };
}

function detectCollisions(nodes) {
  const boxes = nodes.map(getBoundingBox);
  const collisions = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const hasOverlap = !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
      if (hasOverlap) {
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        collisions.push({
          nodeA: a.id,
          nodeB: b.id,
          posA: [a.x1, a.y1],
          posB: [b.x1, b.y1],
          overlapDimensions: [overlapX, overlapY]
        });
      }
    }
  }
  return collisions;
}

// Geometry Helper: Sample cubic Bezier B(t)
function evaluateBezierPoint(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

// Geometry Helper: Parse cubic Bezier pathD string
function parseBezierPathD(pathD) {
  // Matches: M x1 y1 C cx1 cy1, cx2 cy2, x2 y2
  const cubicMatch = pathD.match(/M\s+([\d\.-]+)\s+([\d\.-]+)\s+C\s+([\d\.-]+)\s+([\d\.-]+),\s+([\d\.-]+)\s+([\d\.-]+),\s+([\d\.-]+)\s+([\d\.-]+)/);
  if (cubicMatch) {
    return {
      type: 'CUBIC',
      p0: { x: parseFloat(cubicMatch[1]), y: parseFloat(cubicMatch[2]) },
      p1: { x: parseFloat(cubicMatch[3]), y: parseFloat(cubicMatch[4]) },
      p2: { x: parseFloat(cubicMatch[5]), y: parseFloat(cubicMatch[6]) },
      p3: { x: parseFloat(cubicMatch[7]), y: parseFloat(cubicMatch[8]) }
    };
  }

  // Matches: M x1 y1 L x2 y2
  const lineMatch = pathD.match(/M\s+([\d\.-]+)\s+([\d\.-]+)\s+L\s+([\d\.-]+)\s+([\d\.-]+)/);
  if (lineMatch) {
    return {
      type: 'LINE',
      p0: { x: parseFloat(lineMatch[1]), y: parseFloat(lineMatch[2]) },
      p3: { x: parseFloat(lineMatch[3]), y: parseFloat(lineMatch[4]) }
    };
  }

  return null;
}

// Geometry Helper: Check if curve penetrates any obstacle bounding box
function findEdgeObstaclePenetrations(edge, nodes) {
  const parsed = parseBezierPathD(edge.pathD);
  if (!parsed) return [];

  // Exclude source and target nodes
  const obstacleNodes = nodes.filter(n => n.id !== edge.fromId && n.id !== edge.toId);
  const penetrations = [];

  const sampleCount = 40;
  for (let s = 1; s < sampleCount; s++) {
    const t = s / sampleCount;
    let pt;
    if (parsed.type === 'CUBIC') {
      pt = evaluateBezierPoint(t, parsed.p0, parsed.p1, parsed.p2, parsed.p3);
    } else {
      pt = {
        x: parsed.p0.x + t * (parsed.p3.x - parsed.p0.x),
        y: parsed.p0.y + t * (parsed.p3.y - parsed.p0.y)
      };
    }

    // Check if pt is inside any obstacle node's bounding box (with 4px margin)
    for (const obs of obstacleNodes) {
      const box = getBoundingBox(obs);
      if (pt.x > box.x1 + 4 && pt.x < box.x2 - 4 && pt.y > box.y1 + 4 && pt.y < box.y2 - 4) {
        penetrations.push({
          edgeId: edge.id,
          obstacleId: obs.id,
          t: t.toFixed(2),
          samplePoint: [pt.x.toFixed(1), pt.y.toFixed(1)],
          obstacleBox: [box.x1, box.y1, box.x2, box.y2]
        });
        break; // Record once per sample point
      }
    }
  }

  return penetrations;
}

// =========================================================================
// SUITE 1: Node Collision Prevention & Multi-Track Auto-Layout Stress Tests
// =========================================================================
describe('Suite 1: Empirical Layout & Collision Prevention Tests', () => {

  it('1.1 Baseline Linear Graph: All sequential nodes maintain clean non-overlapping spacing', () => {
    const nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Intake' }),
      createStageNode({ id: 's2', department: 'Review' }),
      createStageNode({ id: 's3', department: 'Finance' }),
      createStageNode({ id: 's4', department: 'Legal' }),
      { id: 'node-end', type: 'END', position: { x: 1600, y: 150 } }
    ];

    const layoutNodes = computeAutoLayout(nodes, 'horizontal');
    const collisions = detectCollisions(layoutNodes);
    assert.equal(collisions.length, 0, `Expected 0 collisions in linear graph, found: ${JSON.stringify(collisions)}`);

    // Verify horizontal spacing step >= 315px (card 242px + 73px gap)
    for (let i = 0; i < layoutNodes.length - 1; i++) {
      const deltaX = layoutNodes[i + 1].position.x - layoutNodes[i].position.x;
      assert.ok(deltaX >= 315, `Spacing between node ${i} and ${i+1} is ${deltaX}px, expected >= 315px`);
    }
  });

  it('1.2 Single Yes/No Decision with Single False Branch: Offset cleanly on Lane 1', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Budget Approval', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Fulfillment', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1000, y: 150 } }
    ];

    // Add branch node on s1
    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_no', department: 'Special Audit' });
    const collisions = detectCollisions(nodes);
    assert.equal(collisions.length, 0, `Expected 0 collisions, found: ${JSON.stringify(collisions)}`);

    const branch = nodes.find(n => n.id === 's1_no');
    const s1 = nodes.find(n => n.id === 's1');
    const s2 = nodes.find(n => n.id === 's2');

    // Branch node must be on Lane 1 (Y = s1.y + 220 = 370)
    assert.equal(branch.position.y, s1.position.y + 220, 'Branch node must be on Lane 1 (+220px)');
    assert.equal(branch.position.x, s2.position.x, 'Branch node column matches s2 column');
  });

  it('1.3 Adversarial Multi-Stage Decision Gates with Chained NO Nodes (Collision Stress Test)', () => {
    // Topologically rich scenario:
    // Stage 1 (Decision) has a False branch with a 2-node chain (s1_no1 -> s1_no2)
    // Stage 2 (Decision) on primary spine also has a False branch (s2_no1)
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Finance Gate', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Legal Gate', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's3' }),
      createStageNode({ id: 's3', department: 'Executive Signoff', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1400, y: 150 } }
    ];

    // 1. Add first node on s1's NO branch
    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_no1', department: 'Finance Escalation' });
    // 2. Chain a second node on s1_no1's forward/true path (the requested chaining feature!)
    nodes = addNodeOnBranch(nodes, 's1_no1', 'true', { id: 's1_no2', department: 'CFO Special Review' });
    // 3. Add a node on s2's NO branch
    nodes = addNodeOnBranch(nodes, 's2', 'false', { id: 's2_no1', department: 'External Legal Counsel' });

    console.log('--- Adversarial Test 1.3 Node Layout Coordinates ---');
    nodes.forEach(n => console.log(`  Node ${n.id.padEnd(10)}: x=${n.position?.x}, y=${n.position?.y}, isBranch=${Boolean(n.isBranchNode)}`));

    const collisions = detectCollisions(nodes);
    console.log('--- Adversarial Test 1.3 Collision Analysis ---');
    console.log(`  Total collisions detected: ${collisions.length}`);
    collisions.forEach(c => {
      console.log(`  ⚠️ COLLISION: Node "${c.nodeA}" and "${c.nodeB}" overlap at [${c.posA}] vs [${c.posB}]! Overlap size: ${c.overlapDimensions[0]}x${c.overlapDimensions[1]}px`);
    });

    // Assert collision-free layout:
    assert.equal(collisions.length, 0, `Node bounding box collision detected! Overlapping nodes: ${JSON.stringify(collisions)}`);
  });

  it('1.5 Upstream Rejection / Cycle Safety: Coordinate bounds must not blow out to 32,000px', () => {
    // When Stage 2 routes back to Stage 1 (rejection/revision loop)
    const nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Stage 1', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Stage 2 (Reject back to 1)', trueBranchTarget: 's1' }),
      { id: 'node-end', type: 'END', position: { x: 1340, y: 150 } }
    ];

    const layout = computeAutoLayout(nodes, 'horizontal');
    const s1 = layout.find(n => n.id === 's1');
    const s2 = layout.find(n => n.id === 's2');
    const end = layout.find(n => n.id === 'node-end');

    console.log(`--- Cycle Coordinate Blowout Check: s1.x=${s1?.position?.x}, s2.x=${s2?.position?.x}, end.x=${end?.position?.x} ---`);
    assert.ok(s1.position.x < 2000, `s1.position.x (${s1.position.x}px) blew out due to cycle in computeAutoLayout!`);
    assert.ok(s2.position.x < 2000, `s2.position.x (${s2.position.x}px) blew out due to cycle in computeAutoLayout!`);
    assert.ok(end.position.x < 3000, `end.position.x (${end.position.x}px) blew out due to cycle in computeAutoLayout!`);
  });

  it('1.4 Vertical Orientation Layout Spacing & Coordinate Monotonicity', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 320, y: 50 } },
      createStageNode({ id: 's1', department: 'Stage 1', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Stage 2', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 320, y: 600 } }
    ];

    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_branch', department: 'Branch V1' }, 'vertical');
    const layout = computeAutoLayout(nodes, 'vertical');
    const collisions = detectCollisions(layout);

    assert.equal(collisions.length, 0, `Expected 0 collisions in vertical layout, found: ${JSON.stringify(collisions)}`);
    const branch = layout.find(n => n.id === 's1_branch');
    const s1 = layout.find(n => n.id === 's1');
    assert.equal(branch.position.x, s1.position.x + 320, 'Branch node in vertical layout must be on lane 1 (x offset +320px)');
  });
});

// =========================================================================
// SUITE 2: SVG Edge Path Validation & Obstacle Avoidance
// =========================================================================
describe('Suite 2: SVG Edge Path Validation & Obstacle Geometry Tests', () => {

  it('2.1 Edge Syntax & NaN Invariance: All edges produce valid SVG pathD without NaNs', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Intake', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Review', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1000, y: 150 } }
    ];
    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_branch', department: 'Alternate' });

    const edges = computeGraphEdges(nodes);
    assert.ok(edges.length >= 3, 'Must generate edges for primary flow and branch');

    edges.forEach(edge => {
      assert.ok(edge.pathD, `Edge ${edge.id} must have pathD`);
      assert.ok(!edge.pathD.includes('NaN'), `Edge ${edge.id} pathD contains NaN: ${edge.pathD}`);
      assert.ok(!edge.pathD.includes('undefined'), `Edge ${edge.id} pathD contains undefined: ${edge.pathD}`);

      const svgPathRegex = /^M\s+[\d\.-]+\s+[\d\.-]+(\s+C\s+[\d\.-]+\s+[\d\.-]+,\s+[\d\.-]+\s+[\d\.-]+,\s+[\d\.-]+\s+[\d\.-]+|\s+L\s+[\d\.-]+\s+[\d\.-]+)+$/;
      assert.match(edge.pathD, svgPathRegex, `Edge ${edge.id} pathD is not valid SVG path: ${edge.pathD}`);

      assert.ok(typeof edge.labelX === 'number' && !Number.isNaN(edge.labelX), `labelX must be valid number on ${edge.id}`);
      assert.ok(typeof edge.labelY === 'number' && !Number.isNaN(edge.labelY), `labelY must be valid number on ${edge.id}`);
    });
  });

  it('2.2 Forward Multi-Stage Jump: Clears intervening stage node bounding box', () => {
    const nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Intake', trueBranchTarget: 's3' }),
      createStageNode({ id: 's2', department: 'Intervening Stage' }),
      createStageNode({ id: 's3', department: 'Final Stage', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1340, y: 150 } }
    ];

    const layoutNodes = computeAutoLayout(nodes, 'horizontal');
    const edges = computeGraphEdges(layoutNodes);
    const jumpEdge = edges.find(e => e.fromId === 's1' && e.toId === 's3');
    assert.ok(jumpEdge, 'Must generate jump edge from s1 to s3');

    const penetrations = findEdgeObstaclePenetrations(jumpEdge, layoutNodes);
    assert.equal(penetrations.length, 0, `Multi-stage jump edge must not penetrate intervening node s2`);
  });

  it('2.3 Loop-Back Edge (Target upstream): Drops cleanly beneath cards', () => {
    const nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Stage 1', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Stage 2', trueBranchTarget: 's3' }),
      createStageNode({ id: 's3', department: 'Stage 3 (Reject Loop)', trueBranchTarget: 's1' }),
      { id: 'node-end', type: 'END', position: { x: 1340, y: 150 } }
    ];

    const layoutNodes = computeAutoLayout(nodes, 'horizontal');
    const edges = computeGraphEdges(layoutNodes);
    const loopEdge = edges.find(e => e.fromId === 's3' && e.toId === 's1');
    assert.ok(loopEdge, 'Must generate loop-back edge from s3 to s1');

    const penetrations = findEdgeObstaclePenetrations(loopEdge, layoutNodes);
    assert.equal(penetrations.length, 0, `Loop-back edge must drop cleanly without penetrating obstacles (s2)`);
  });

  it('2.4 Reverse / Upstream Routing from Branch Node to Main Spine Node', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Stage 1', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Stage 2 (Decision)', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1000, y: 150 } }
    ];

    nodes = addNodeOnBranch(nodes, 's2', 'false', { id: 's2_fix', department: 'Revision Stage', trueBranchTarget: 's1' });
    const edges = computeGraphEdges(nodes);
    const returnEdge = edges.find(e => e.fromId === 's2_fix' && e.toId === 's1');

    assert.ok(returnEdge, 'Must generate edge from branch node back to s1');
  });

  it('2.5 Placeholder & Unconnected Branch Stub Edge Validation', () => {
    const nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({
        id: 's1',
        department: 'Decision Unconnected',
        nodeSubType: 'DECISION_YES_NO',
        falseBranchTarget: '',
        noAction: 'ROUTE_DEPT',
        trueBranchTarget: 'node-end'
      }),
      { id: 'node-end', type: 'END', position: { x: 700, y: 150 } }
    ];

    const edges = computeGraphEdges(nodes);
    const stubEdge = edges.find(e => e.kind === 'NO_BRANCH' && e.isPlaceholder);
    assert.ok(stubEdge, 'Must emit placeholder stub edge for unlinked NO branch');
    assert.equal(stubEdge.isPlaceholder, true);
    assert.ok(stubEdge.pathD.startsWith('M'), 'Stub pathD must start with M');
    assert.ok(stubEdge.pathD.includes('L'), 'Stub pathD must be a straight downward line connector');
    assert.ok(!stubEdge.pathD.includes('NaN'), 'Stub pathD must not have NaN');
  });

  it('2.6 Same-Column Vertical Merge: Edge must not slice through source branch card', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Stage 1', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Stage 2', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1340, y: 150 } }
    ];

    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_branch', department: 'Branch Rework', trueBranchTarget: 's2' });

    const edges = computeGraphEdges(nodes);
    const mergeEdge = edges.find(e => e.fromId === 's1_branch' && e.toId === 's2');
    assert.ok(mergeEdge, 'Must generate merge edge from s1_branch to s2');

    const branchCard = nodes.find(n => n.id === 's1_branch');
    const box = getBoundingBox(branchCard);

    const parsed = parseBezierPathD(mergeEdge.pathD);
    assert.ok(parsed, 'Path must be valid cubic bezier');

    let slicesSourceCard = false;
    for (let s = 2; s < 38; s++) {
      const t = s / 40;
      const pt = evaluateBezierPoint(t, parsed.p0, parsed.p1, parsed.p2, parsed.p3);
      if (pt.x > box.x1 + 4 && pt.x < box.x2 - 4 && pt.y > box.y1 + 4 && pt.y < box.y2 - 4) {
        slicesSourceCard = true;
        break;
      }
    }

    assert.equal(slicesSourceCard, false, 'Edge must not slice through the source node card body');
  });
});

// =========================================================================
// SUITE 3: Dual-Layer State Roundtrip Fidelity Across Engine, UI, and Backend
// =========================================================================
describe('Suite 3: Dual-Layer State Roundtrip Fidelity Tests', () => {

  it('3.1 Full Enterprise Topology: Graph -> Standard Workflow Steps -> DB Clean -> Deserialization', () => {
    let initialNodes = [
      { id: 'node-start', type: 'START', label: 'Applicant / Submitter', position: { x: 60, y: 150 } },
      createStageNode({
        id: 's1-finance',
        department: 'Finance Budgeting',
        label: 'Stage 1: Capex Threshold Gate',
        nodeSubType: 'DECISION_YES_NO',
        decisionQuestion: 'Does expenditure exceed $25,000?',
        yesLabel: '✓ YES · Approved for Purchase',
        noLabel: '✕ NO · Route to Procurement Audit',
        branchLabelTrue: '✓ YES · Under $25k',
        branchLabelFalse: '✕ NO · Over $25k',
        slaHours: 24,
        approverRole: 'CFO_DELEGATE',
        requirePki: true,
        trueBranchTarget: 's2-procurement'
      }),
      createStageNode({
        id: 's2-procurement',
        department: 'Procurement',
        label: 'Stage 2: Vendor Selection',
        nodeSubType: 'RULE_GATE',
        slaHours: 48,
        trueBranchTarget: 'node-end'
      }),
      { id: 'node-end', type: 'END', label: 'Final Approved & Sealed', position: { x: 1200, y: 150 } }
    ];

    const s1 = initialNodes.find(n => n.id === 's1-finance');
    s1.condition = {
      enabled: true,
      combiner: 'ALL',
      logic: 'AND',
      elseAction: 'FALLBACK_DEPT',
      fallbackDepartment: 'Procurement Audit',
      rules: [
        { id: 'r1', field: 'Total Amount', operator: '<=', value: '25000' },
        { id: 'r2', field: 'Budget Code', operator: 'not_empty', value: '' }
      ]
    };

    const s2 = initialNodes.find(n => n.id === 's2-procurement');
    s2.condition = {
      enabled: true,
      combiner: 'ANY',
      logic: 'OR',
      elseAction: 'BYPASS',
      fallbackDepartment: '',
      rules: [
        { id: 'r3', field: 'Preferred Vendor', operator: '=', value: 'Yes' },
        { id: 'r4', field: 'Sole Source Justification', operator: 'contains', value: 'approved' }
      ]
    };

    initialNodes = addNodeOnBranch(initialNodes, 's1-finance', 'false', {
      id: 's1-no-audit',
      department: 'Procurement Audit',
      label: 'Stage 1.B: Over-Budget Audit',
      nodeSubType: 'APPROVAL',
      slaHours: 72,
      approverRole: 'AUDIT_DIRECTOR',
      requirePki: true,
      trueBranchTarget: 's2-procurement'
    });

    const compiledSteps = compileGraphToStandardWorkflow(initialNodes);
    assert.equal(compiledSteps.length, 3, 'Must compile exactly 3 STAGE nodes into workflow steps');
    assert.deepEqual(compiledSteps.map(s => s.step), [1, 2, 3], 'Steps must be numbered 1, 2, 3 sequentially');

    const serverCleanedSteps = compiledSteps.map((step, idx) => cleanWorkflowStep(step, idx));
    const serializedJson = JSON.stringify(serverCleanedSteps);
    const deserializedDbSteps = JSON.parse(serializedJson);

    const rehydratedNodes = buildGraphFromWorkflowSteps(deserializedDbSteps, 'Administration', 'horizontal');
    const rehydratedStageNodes = rehydratedNodes.filter(n => n.type === 'STAGE');

    assert.equal(rehydratedStageNodes.length, compiledSteps.length, 'Stage count must match exactly');

    const s1Rehydrated = rehydratedNodes.find(n => n.id === 's1-finance');
    assert.ok(s1Rehydrated, 's1-finance must be found in rehydrated graph');
    assert.equal(s1Rehydrated.trueBranchTarget, 's2-procurement', 'trueBranchTarget must survive roundtrip');
    assert.equal(s1Rehydrated.falseBranchTarget, 's1-no-audit', 'falseBranchTarget must survive roundtrip');

    const s1NoAuditRehydrated = rehydratedNodes.find(n => n.id === 's1-no-audit');
    assert.ok(s1NoAuditRehydrated, 's1-no-audit must be found in rehydrated graph');
    assert.equal(s1NoAuditRehydrated.trueBranchTarget, 's2-procurement', 'Chained node trueBranchTarget must survive roundtrip');
    assert.equal(s1NoAuditRehydrated.isBranchNode, true, 'isBranchNode must be true');

    assert.equal(s1Rehydrated.condition.enabled, true, 'condition.enabled must survive roundtrip');
    assert.equal(s1Rehydrated.condition.combiner, 'ALL', 'condition.combiner must survive roundtrip');
    assert.equal(s1Rehydrated.condition.logic, 'AND', 'condition.logic must survive roundtrip');
    assert.equal(s1Rehydrated.condition.rules.length, 2, 'condition rules length must survive roundtrip');
    assert.deepEqual(
      s1Rehydrated.condition.rules.map(r => ({ f: r.field, op: r.operator, v: r.value })),
      [
        { f: 'Total Amount', op: '<=', v: '25000' },
        { f: 'Budget Code', op: 'not_empty', v: '' }
      ],
      'Condition rules clauses must match 100%'
    );

    const s2Rehydrated = rehydratedNodes.find(n => n.id === 's2-procurement');
    assert.equal(s2Rehydrated.condition.combiner, 'ANY', 'OR combiner must survive roundtrip');
    assert.equal(s2Rehydrated.condition.rules.length, 2, 'OR rules length must survive roundtrip');

    assert.equal(s1Rehydrated.slaHours, 24, 'slaHours must survive roundtrip');
    assert.equal(s1Rehydrated.approverRole, 'CFO_DELEGATE', 'approverRole must survive roundtrip');
    assert.equal(s1Rehydrated.requirePki, true, 'requirePki must survive roundtrip');
    assert.equal(s1Rehydrated.decisionQuestion, 'Does expenditure exceed $25,000?', 'decisionQuestion must survive roundtrip');
  });

  it('3.2 Direct workflow_graph JSONB Snapshot Fidelity: 100% lossless canvas state', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'HR', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Payroll', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1000, y: 150 } }
    ];
    nodes = addNodeOnBranch(nodes, 's1', 'false', { id: 's1_alt', department: 'HR Escalation' });

    const canvasSnapshot = {
      nodes,
      orientation: 'horizontal',
      version: 2
    };

    const jsonbString = JSON.stringify(canvasSnapshot);
    const loadedSnapshot = JSON.parse(jsonbString);

    assert.equal(loadedSnapshot.version, 2);
    assert.equal(loadedSnapshot.nodes.length, nodes.length);

    nodes.forEach((originalNode, idx) => {
      const reloadedNode = loadedSnapshot.nodes[idx];
      assert.deepEqual(reloadedNode, originalNode, `Node ${originalNode.id} must be 100% deep-equal across JSONB snapshot`);
    });
  });

  it('3.3 Orphaned Branch Target Self-Healing on Node Deletion (`repairBranchTargets`)', () => {
    let nodes = [
      { id: 'node-start', type: 'START', position: { x: 60, y: 150 } },
      createStageNode({ id: 's1', department: 'Dept 1', nodeSubType: 'DECISION_YES_NO', trueBranchTarget: 's2' }),
      createStageNode({ id: 's2', department: 'Dept 2', trueBranchTarget: 's3' }),
      createStageNode({ id: 's3', department: 'Dept 3', trueBranchTarget: 'node-end' }),
      { id: 'node-end', type: 'END', position: { x: 1000, y: 150 } }
    ];

    nodes[1].falseBranchTarget = 's2';
    const filteredNodes = nodes.filter(n => n.id !== 's2');
    const repairedNodes = repairBranchTargets(filteredNodes);

    const s1Repaired = repairedNodes.find(n => n.id === 's1');
    assert.equal(s1Repaired.trueBranchTarget, '__NEXT__', 'Broken trueBranchTarget pointing to deleted node must heal to __NEXT__');
    assert.equal(s1Repaired.falseBranchTarget, '', 'Broken falseBranchTarget pointing to deleted node must heal to empty string');
  });

  it('3.4 Backward Compatibility Non-Regression: Legacy step arrays without branch targets', () => {
    const legacySteps = [
      { step: 1, department: 'Finance' },
      { step: 2, department: 'Legal' }
    ];

    const graph = buildGraphFromWorkflowSteps(legacySteps, 'Administration', 'horizontal');
    const stages = graph.filter(n => n.type === 'STAGE');

    assert.equal(stages.length, 2);
    assert.equal(stages[0].department, 'Finance');
    assert.equal(stages[0].nodeSubType, 'APPROVAL');
    assert.equal(stages[0].trueBranchTarget, '__NEXT__');
    assert.equal(stages[0].falseBranchTarget, '');
    assert.equal(stages[1].department, 'Legal');
    assert.equal(stages[1].nodeSubType, 'APPROVAL');
  });
});
