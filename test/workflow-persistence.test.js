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
  compileGraphToStandardWorkflow,
  loadWorkflowBlueprints,
  createStageNode,
  simulateWorkflowGraph,
  computeAutoLayout
} = engine;

// -------------------------------------------------------------
// Tier 1: Feature Coverage — Persistence & Compilation
// -------------------------------------------------------------

test('Tier 1: compileGraphToStandardWorkflow compiles stage nodes to standard step array', () => {
  const nodes = [
    { id: 'start', type: 'START', label: 'Submitter' },
    createStageNode({ department: 'HR', slaHours: 24 }),
    createStageNode({ department: 'Finance', slaHours: 48, withCondition: true }),
    createStageNode({ department: 'Legal', slaHours: 72 }),
    { id: 'end', type: 'END', label: 'Archived' }
  ];

  const standardSteps = compileGraphToStandardWorkflow(nodes);

  assert.equal(standardSteps.length, 3);
  assert.strictEqual(standardSteps[0].step, 1);
  assert.strictEqual(standardSteps[0].department, 'HR');
  assert.strictEqual(standardSteps[1].step, 2);
  assert.strictEqual(standardSteps[1].department, 'Finance');
  assert.strictEqual(standardSteps[2].step, 3);
  assert.strictEqual(standardSteps[2].department, 'Legal');
});

test('Tier 1: compileGraphToStandardWorkflow ignores START, END, and non-stage nodes', () => {
  const nodes = [
    { id: 'start', type: 'START' },
    { id: 'custom', type: 'ANNOTATION', label: 'Note' },
    createStageNode({ department: 'Operations' }),
    { id: 'end', type: 'END' }
  ];

  const standardSteps = compileGraphToStandardWorkflow(nodes);
  assert.equal(standardSteps.length, 1);
  assert.strictEqual(standardSteps[0].step, 1);
  assert.strictEqual(standardSteps[0].department, 'Operations');
});

test('Tier 1: loadWorkflowBlueprints provides enterprise starter templates with injected departments', () => {
  const customDepts = [{ name: 'Accounting' }, { name: 'Audit' }, { name: 'Security' }];
  const blueprints = loadWorkflowBlueprints(customDepts);

  assert.ok(Array.isArray(blueprints));
  assert.ok(blueprints.length >= 3);

  const bpDecision = blueprints.find(b => b.id === 'bp-yes-no-decision');
  const bpCapex = blueprints.find(b => b.id === 'bp-conditional-capex');
  const bp3Stage = blueprints.find(b => b.id === 'bp-enterprise-3stage');

  assert.ok(bpDecision, 'Yes/No Decision blueprint must exist');
  assert.ok(bpCapex, 'Conditional Capex blueprint must exist');
  assert.ok(bp3Stage, '3-Stage Enterprise blueprint must exist');

  for (const bp of [bpDecision, bpCapex, bp3Stage]) {
    assert.ok(bp.nodes.some(n => n.type === 'START'));
    assert.ok(bp.nodes.some(n => n.type === 'STAGE'));
    assert.ok(bp.nodes.some(n => n.type === 'END'));
    assert.ok(bp.nodes.every(n => n.position && typeof n.position.x === 'number'));
  }
});

// -------------------------------------------------------------
// Tier 2: Boundary & Corner Cases
// -------------------------------------------------------------

test('Tier 2: compileGraphToStandardWorkflow handles empty and corrupt node arrays gracefully', () => {
  assert.deepEqual(compileGraphToStandardWorkflow([]), []);
  assert.deepEqual(compileGraphToStandardWorkflow(null), []);
  assert.deepEqual(compileGraphToStandardWorkflow(undefined), []);
  assert.deepEqual(compileGraphToStandardWorkflow([{ id: 'start', type: 'START' }]), []);
  assert.deepEqual(compileGraphToStandardWorkflow([{ type: 'STAGE', department: '' }]), []);
});

test('Tier 2: Dual-layer JSON serialization roundtrip preserves all rules and branching topology', () => {
  const originalGraph = {
    schemaVersion: '2.0',
    name: 'Purchase Order Multi-Branch',
    orientation: 'horizontal',
    nodes: computeAutoLayout([
      { id: 'start', type: 'START', label: 'Submitter' },
      createStageNode({
        department: 'Finance',
        nodeSubType: 'DECISION_YES_NO',
        decisionQuestion: 'Is budget approved?',
        noAction: 'ROUTE_DEPT',
        noDepartment: 'Executive Board',
        slaHours: 24
      }),
      createStageNode({
        department: 'Compliance',
        withCondition: true,
        defaultField: 'VendorScore'
      }),
      { id: 'end', type: 'END', label: 'Done' }
    ])
  };

  const jsonString = JSON.stringify(originalGraph);
  const reloadedGraph = JSON.parse(jsonString);

  assert.equal(reloadedGraph.name, originalGraph.name);
  assert.equal(reloadedGraph.nodes.length, 4);

  const finNode = reloadedGraph.nodes.find(n => n.department === 'Finance');
  assert.equal(finNode.nodeSubType, 'DECISION_YES_NO');
  assert.equal(finNode.noDepartment, 'Executive Board');
  assert.equal(finNode.noAction, 'ROUTE_DEPT');

  const compNode = reloadedGraph.nodes.find(n => n.department === 'Compliance');
  assert.equal(compNode.condition.enabled, true);
  assert.equal(compNode.condition.rules[0].field, 'VendorScore');

  const recompiled = compileGraphToStandardWorkflow(reloadedGraph.nodes);
  assert.equal(recompiled.length, 2);
  assert.equal(recompiled[0].department, 'Finance');
  assert.equal(recompiled[1].department, 'Compliance');
});

// -------------------------------------------------------------
// Tier 4: Real-World Enterprise Workflows
// -------------------------------------------------------------

test('Tier 4: Workflow Scenario 1 — Purchase Order Approval > $10k with Multi-Level Escalation', () => {
  const lineManager = createStageNode({ department: 'Line Management', slaHours: 24 });
  const capexGate = createStageNode({
    department: 'Finance Audit',
    nodeSubType: 'RULE_GATE',
    slaHours: 48,
    withCondition: true
  });
  capexGate.condition = {
    enabled: true,
    logic: 'AND',
    elseAction: 'BYPASS',
    rules: [{ field: 'Amount', operator: '>', value: '10000' }]
  };
  const cfoGate = createStageNode({
    department: 'CFO Office',
    nodeSubType: 'RULE_GATE',
    slaHours: 48,
    withCondition: true
  });
  cfoGate.condition = {
    enabled: true,
    logic: 'AND',
    elseAction: 'BYPASS',
    rules: [{ field: 'Amount', operator: '>', value: '50000' }]
  };
  const procurement = createStageNode({ department: 'Procurement', slaHours: 24 });

  const poWorkflow = [
    { id: 'start', type: 'START' },
    lineManager,
    capexGate,
    cfoGate,
    procurement,
    { id: 'end', type: 'END' }
  ];

  const simSmall = simulateWorkflowGraph(poWorkflow, { Amount: '3500' });
  const activeSmallDepts = simSmall.effectiveSteps.map(s => s.department);
  assert.deepEqual(activeSmallDepts, ['Line Management', 'Procurement']);
  assert.equal(simSmall.totalActiveSlaHours, 24 + 24);

  const simMedium = simulateWorkflowGraph(poWorkflow, { Amount: '25000' });
  const activeMedDepts = simMedium.effectiveSteps.map(s => s.department);
  assert.deepEqual(activeMedDepts, ['Line Management', 'Finance Audit', 'Procurement']);
  assert.equal(simMedium.totalActiveSlaHours, 24 + 48 + 24);

  const simLarge = simulateWorkflowGraph(poWorkflow, { Amount: '75000' });
  const activeLargeDepts = simLarge.effectiveSteps.map(s => s.department);
  assert.deepEqual(activeLargeDepts, ['Line Management', 'Finance Audit', 'CFO Office', 'Procurement']);
  assert.equal(simLarge.totalActiveSlaHours, 24 + 48 + 48 + 24);
});

test('Tier 4: Workflow Scenario 2 — HR Onboarding with Visa Escalation & Submitter Return', () => {
  const hrReview = createStageNode({ department: 'HR Talent', slaHours: 24 });
  const visaGate = createStageNode({
    department: 'Global Mobility',
    nodeSubType: 'DECISION_YES_NO',
    decisionQuestion: 'Does candidate require specialized work visa?',
    noAction: 'BYPASS_NEXT',
    slaHours: 48
  });
  visaGate.condition = {
    enabled: true,
    logic: 'AND',
    rules: [{ field: 'VisaRequired', operator: '=', value: 'Yes' }]
  };
  const backgroundCheck = createStageNode({
    department: 'Security & Compliance',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'RETURN_SUBMITTER',
    slaHours: 24
  });
  const itProvisioning = createStageNode({ department: 'IT Operations', slaHours: 24 });

  const onboardingWorkflow = [
    { id: 'start', type: 'START' },
    hrReview,
    visaGate,
    backgroundCheck,
    itProvisioning,
    { id: 'end', type: 'END' }
  ];

  const simA = simulateWorkflowGraph(onboardingWorkflow, {
    VisaRequired: 'No',
    'Decision / Approved': 'Yes'
  });
  const stepsA = simA.effectiveSteps.map(s => s.department);
  assert.deepEqual(stepsA, ['HR Talent', 'Security & Compliance', 'IT Operations']);

  const simB = simulateWorkflowGraph(onboardingWorkflow, {
    VisaRequired: 'No',
    'Decision / Approved': 'No'
  });
  assert.equal(simB.nodeStates[backgroundCheck.id].status, 'RETURNED');
  assert.equal(simB.nodeStates[backgroundCheck.id].effectiveDepartment, 'Applicant (Returned)');
});

test('Tier 4: Workflow Scenario 3 — Vendor Compliance Audit Immediate Termination', () => {
  const vendorIntake = createStageNode({ department: 'Vendor Relations', slaHours: 12 });
  const complianceAudit = createStageNode({
    department: 'Risk Management',
    nodeSubType: 'DECISION_YES_NO',
    noAction: 'REJECT_END',
    slaHours: 24
  });
  const contractExecution = createStageNode({ department: 'Legal Contracts', slaHours: 48 });

  const vendorWorkflow = [
    { id: 'start', type: 'START' },
    vendorIntake,
    complianceAudit,
    contractExecution,
    { id: 'end', type: 'END' }
  ];

  const simReject = simulateWorkflowGraph(vendorWorkflow, { 'Decision / Approved': 'No' });
  assert.equal(simReject.nodeStates[complianceAudit.id].status, 'REJECTED');
  assert.equal(simReject.nodeStates[complianceAudit.id].effectiveDepartment, 'Rejected (Closed)');
  assert.equal(simReject.nodeStates[complianceAudit.id].branch, 'NO');
});
