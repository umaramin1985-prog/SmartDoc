import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Resolve workflowGraphEngine dynamically
let engine;
try {
  engine = await import('../src/utils/workflowGraphEngine.js');
} catch {
  engine = await import(pathToFileURL('C:/AliA-----/UAmin/SmartDoc/SmartDoc/src/utils/workflowGraphEngine.js').href);
}

const {
  evaluateSingleRule,
  evaluateStageCondition,
  formatConditionSummary,
  createStageNode
} = engine;

// -------------------------------------------------------------
// Tier 1: Feature Coverage — Rule Operators & Logic Combiners
// -------------------------------------------------------------

test('Tier 1: Operator (=) evaluates numeric equality correctly', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '5000' }, { amount: '5000' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '5000' }, { amount: 5000 }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '0' }, { amount: '0' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '10.50' }, { amount: '10.50' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '=', value: '5000' }, { amount: '5001' }), false);
});

test('Tier 1: Operator (=) evaluates string equality case-insensitively with trimming', () => {
  assert.equal(evaluateSingleRule({ field: 'status', operator: '=', value: 'Approved' }, { status: 'approved' }), true);
  assert.equal(evaluateSingleRule({ field: 'status', operator: '=', value: ' Yes ' }, { status: 'Yes' }), true);
  assert.equal(evaluateSingleRule({ field: 'dept', operator: '=', value: 'Finance' }, { dept: 'HR' }), false);
});

test('Tier 1: Operator (!=) evaluates numeric and string inequality correctly', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '!=', value: '5000' }, { amount: '6000' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '!=', value: '5000' }, { amount: '5000' }), false);
  assert.equal(evaluateSingleRule({ field: 'role', operator: '!=', value: 'Admin' }, { role: 'User' }), true);
  assert.equal(evaluateSingleRule({ field: 'role', operator: '!=', value: 'Admin' }, { role: 'admin' }), false);
});

test('Tier 1: Operator (>) evaluates numeric comparison strictly', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>', value: '5000' }, { amount: '10000' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>', value: '5000' }, { amount: '5000' }), false);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>', value: '5000' }, { amount: '4999' }), false);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>', value: '100.25' }, { amount: '100.50' }), true);
});

test('Tier 1: Operator (>=) evaluates boundary and strictly greater values', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>=', value: '5000' }, { amount: '5000' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>=', value: '5000' }, { amount: '5001' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '>=', value: '5000' }, { amount: '4999' }), false);
});

test('Tier 1: Operator (<) evaluates numeric comparison strictly', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<', value: '5000' }, { amount: '2500' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<', value: '5000' }, { amount: '5000' }), false);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<', value: '5000' }, { amount: '5001' }), false);
});

test('Tier 1: Operator (<=) evaluates boundary and strictly lesser values', () => {
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<=', value: '5000' }, { amount: '5000' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<=', value: '4999' }, { amount: '4999' }), true);
  assert.equal(evaluateSingleRule({ field: 'amount', operator: '<=', value: '5000' }, { amount: '5001' }), false);
});

test('Tier 1: Operator (contains) performs case-insensitive substring search', () => {
  assert.equal(evaluateSingleRule({ field: 'notes', operator: 'contains', value: 'urgent' }, { notes: 'PLEASE PROCESS URGENT REQUEST' }), true);
  assert.equal(evaluateSingleRule({ field: 'code', operator: 'contains', value: 'PO-99' }, { code: 'Doc-PO-99-Final' }), true);
  assert.equal(evaluateSingleRule({ field: 'notes', operator: 'contains', value: 'urgent' }, { notes: 'Standard processing' }), false);
});

test('Tier 1: Operator (not_empty) validates presence of value', () => {
  assert.equal(evaluateSingleRule({ field: 'signature', operator: 'not_empty' }, { signature: 'PKI_HASH_123' }), true);
  assert.equal(evaluateSingleRule({ field: 'count', operator: 'not_empty' }, { count: 0 }), true);
  assert.equal(evaluateSingleRule({ field: 'signature', operator: 'not_empty' }, { signature: '' }), false);
  assert.equal(evaluateSingleRule({ field: 'signature', operator: 'not_empty' }, { signature: '   ' }), false);
  assert.equal(evaluateSingleRule({ field: 'signature', operator: 'not_empty' }, {}), false);
});

test('Tier 1: Logic combiner (AND) requires all clauses to evaluate true', () => {
  const node = createStageNode({ department: 'Finance', withCondition: true });
  node.condition = {
    enabled: true,
    logic: 'AND',
    rules: [
      { field: 'Amount', operator: '>', value: '5000' },
      { field: 'Department', operator: '=', value: 'Operations' }
    ]
  };

  const res1 = evaluateStageCondition(node, { Amount: '6000', Department: 'Operations' });
  assert.equal(res1.passed, true);
  assert.equal(res1.status, 'ACTIVE');

  const res2 = evaluateStageCondition(node, { Amount: '4000', Department: 'Operations' });
  assert.equal(res2.passed, false);
  assert.equal(res2.status, 'BYPASSED');
});

test('Tier 1: Logic combiner (OR) passes if at least one clause evaluates true', () => {
  const node = createStageNode({ department: 'Security', withCondition: true });
  node.condition = {
    enabled: true,
    logic: 'OR',
    rules: [
      { field: 'IsVIP', operator: '=', value: 'Yes' },
      { field: 'Priority', operator: '=', value: 'Critical' }
    ]
  };

  const res1 = evaluateStageCondition(node, { IsVIP: 'Yes', Priority: 'Low' });
  assert.equal(res1.passed, true);

  const res2 = evaluateStageCondition(node, { IsVIP: 'No', Priority: 'Critical' });
  assert.equal(res2.passed, true);

  const res3 = evaluateStageCondition(node, { IsVIP: 'No', Priority: 'Medium' });
  assert.equal(res3.passed, false);
});

test('Tier 1: formatConditionSummary formats single and multi-rule summaries correctly', () => {
  const cond1 = {
    enabled: true,
    logic: 'AND',
    rules: [{ field: 'Amount', operator: '>', value: '5000' }]
  };
  assert.equal(formatConditionSummary(cond1), 'IF Amount > 5000');

  const cond2 = {
    enabled: true,
    logic: 'OR',
    rules: [
      { field: 'Status', operator: '=', value: 'Approved' },
      { field: 'Score', operator: '>=', value: '80' }
    ]
  };
  assert.equal(formatConditionSummary(cond2), 'IF Status = Approved OR Score ≥ 80');

  const cond3 = {
    enabled: true,
    logic: 'AND',
    rules: [
      { field: 'A', operator: '=', value: '1' },
      { field: 'B', operator: '=', value: '2' },
      { field: 'C', operator: '=', value: '3' }
    ]
  };
  assert.equal(formatConditionSummary(cond3), 'IF A = 1 AND B = 2 +1');

  assert.equal(formatConditionSummary(null), null);
  assert.equal(formatConditionSummary({ enabled: false }), null);
});

// -------------------------------------------------------------
// Tier 2: Boundary & Corner Cases
// -------------------------------------------------------------

test('Tier 2: Empty, undefined, and null field values in testValues evaluate gracefully', () => {
  const rule = { field: 'Amount', operator: '>', value: '0' };
  assert.equal(evaluateSingleRule(rule, { Amount: undefined }), false);
  assert.equal(evaluateSingleRule(rule, { Amount: null }), false);
  assert.equal(evaluateSingleRule(rule, { Amount: '' }), false);
  assert.equal(evaluateSingleRule(rule, {}), false);
});

test('Tier 2: Zero and negative numbers are properly handled numerically', () => {
  assert.equal(evaluateSingleRule({ field: 'balance', operator: '=', value: '0' }, { balance: 0 }), true);
  assert.equal(evaluateSingleRule({ field: 'balance', operator: '<', value: '0' }, { balance: -50 }), true);
  assert.equal(evaluateSingleRule({ field: 'balance', operator: '>', value: '-100' }, { balance: -20 }), true);
  assert.equal(evaluateSingleRule({ field: 'balance', operator: '<=', value: '-100' }, { balance: -100 }), true);
});

test('Tier 2: Formatted numbers with commas are sanitized for numerical comparison', () => {
  assert.equal(evaluateSingleRule({ field: 'price', operator: '>', value: '5,000' }, { price: '10,000' }), true);
  assert.equal(evaluateSingleRule({ field: 'price', operator: '=', value: '1,000,000' }, { price: '1000000' }), true);
  assert.equal(evaluateSingleRule({ field: 'price', operator: '<=', value: '2,500.50' }, { price: '2500.50' }), true);
});

test('Tier 2: Unknown operator falls back safely to true without crashing', () => {
  const result = evaluateSingleRule({ field: 'fieldA', operator: 'UNKNOWN_OP', value: 'foo' }, { fieldA: 'bar' });
  assert.equal(result, true);
});

test('Tier 2: Missing or null rule object returns true without throwing', () => {
  assert.equal(evaluateSingleRule(null, { any: 'val' }), true);
  assert.equal(evaluateSingleRule({}, { any: 'val' }), true);
  assert.equal(evaluateSingleRule({ field: '' }, { any: 'val' }), true);
});

test('Tier 2: Node without condition or with disabled condition is always ACTIVE', () => {
  const node1 = createStageNode({ department: 'HR', withCondition: false });
  const res1 = evaluateStageCondition(node1, {});
  assert.equal(res1.passed, true);
  assert.equal(res1.status, 'ACTIVE');

  const node2 = { type: 'STAGE', department: 'Legal', condition: { enabled: false } };
  const res2 = evaluateStageCondition(node2, {});
  assert.equal(res2.passed, true);
  assert.equal(res2.status, 'ACTIVE');
});

test('Tier 2: Case insensitivity in field name resolution', () => {
  const rule = { field: 'TotalAmount', operator: '>', value: '100' };
  assert.equal(evaluateSingleRule(rule, { totalamount: '250' }), true);
});

// -------------------------------------------------------------
// Tier 3: Complex Multi-Rule Combinations
// -------------------------------------------------------------

test('Tier 3: Multi-clause condition with mixed numeric, string, and contains operators under AND', () => {
  const node = createStageNode({ department: 'Executive', withCondition: true });
  node.condition = {
    enabled: true,
    logic: 'AND',
    rules: [
      { field: 'Amount', operator: '>', value: '10000' },
      { field: 'Region', operator: '=', value: 'EMEA' },
      { field: 'ProjectName', operator: 'contains', value: 'Alpha' }
    ]
  };

  const passValues = { Amount: '15000', Region: 'emea', ProjectName: 'Project Alpha Rollout' };
  assert.equal(evaluateStageCondition(node, passValues).passed, true);

  const failValues = { Amount: '15000', Region: 'APAC', ProjectName: 'Project Alpha Rollout' };
  assert.equal(evaluateStageCondition(node, failValues).passed, false);
});
