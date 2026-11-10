// SmartDoc — Decoupled Visual Workflow Graph & Rule Engine
// Self-contained graph layout, Yes/No decision branching, rule evaluation, blueprint storage, and template step compiler.

const BLUEPRINTS_STORAGE_KEY = 'smartdoc_workflow_blueprints_v1';
const TEMPLATE_GRAPHS_STORAGE_KEY = 'smartdoc_workflow_graphs_v1';

export const RULE_OPERATORS = [
  { value: '=', label: 'Equals (=)', symbol: '=' },
  { value: '!=', label: 'Not Equals (≠)', symbol: '≠' },
  { value: '>', label: 'Greater Than (>)', symbol: '>' },
  { value: '>=', label: 'Greater or Equal (≥)', symbol: '≥' },
  { value: '<', label: 'Less Than (<)', symbol: '<' },
  { value: '<=', label: 'Less or Equal (≤)', symbol: '≤' },
  { value: 'contains', label: 'Contains Text', symbol: '∋' },
  { value: 'not_empty', label: 'Is Not Empty', symbol: '∃' }
];

export const YES_NO_NO_ACTIONS = [
  { value: 'ROUTE_DEPT', label: 'Route to Another Department (NO Branch)' },
  { value: 'RETURN_SUBMITTER', label: 'Return to Submitter / Applicant' },
  { value: 'BYPASS_NEXT', label: 'Bypass / Skip This Stage' },
  { value: 'REJECT_END', label: 'Reject & Terminate Workflow' }
];

export const SLA_PRESETS = [
  { label: '12h Urgent', hours: 12 },
  { label: '24h (1 Day)', hours: 24 },
  { label: '48h (2 Days)', hours: 48 },
  { label: '72h (3 Days)', hours: 72 },
  { label: '120h (5 Days)', hours: 120 }
];

const uid = (prefix = 'node') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Compute clean canvas coordinates for an ordered list of nodes.
 */
export function computeAutoLayout(nodes, orientation = 'horizontal') {
  const isHoriz = orientation !== 'vertical';
  const startX = isHoriz ? 60 : 320;
  const startY = isHoriz ? 150 : 50;
  const stepX = isHoriz ? 315 : 0;
  const stepY = isHoriz ? 0 : 210;

  return nodes.map((node, idx) => ({
    ...node,
    position: {
      x: startX + idx * stepX,
      y: startY + idx * stepY
    }
  }));
}

/**
 * Create a new approval stage or Yes/No decision node.
 */
export function createStageNode({
  department = 'Administration',
  label = '',
  nodeSubType = 'APPROVAL', // 'APPROVAL' | 'DECISION_YES_NO' | 'RULE_GATE'
  decisionQuestion = '',
  yesLabel = 'YES · Approved',
  noAction = 'ROUTE_DEPT', // 'ROUTE_DEPT' | 'RETURN_SUBMITTER' | 'BYPASS_NEXT' | 'REJECT_END'
  noDepartment = '',
  noLabel = 'NO · Alternate Path',
  slaHours = 48,
  approverRole = 'DEPARTMENT_ADMIN',
  requirePki = true,
  objectionAction = 'RETURN_TO_SUBMITTER',
  withCondition = false,
  defaultField = 'Total Amount',
  position = { x: 380, y: 150 }
} = {}) {
  const isDecision = nodeSubType === 'DECISION_YES_NO';
  const hasRule = Boolean(withCondition || isDecision || nodeSubType === 'RULE_GATE');

  return {
    id: uid('stage'),
    type: 'STAGE',
    nodeSubType: isDecision ? 'DECISION_YES_NO' : (hasRule ? 'RULE_GATE' : 'APPROVAL'),
    department,
    label: label || (isDecision ? `${department}: Yes / No Decision` : `${department} Approval`),
    decisionQuestion: decisionQuestion || (isDecision ? `Does ${department} approve or meet criteria?` : ''),
    yesLabel: yesLabel || 'YES · Proceed',
    noAction: noAction || 'ROUTE_DEPT',
    noDepartment: noDepartment || department,
    noLabel: noLabel || 'NO · Alternate Action',
    slaHours: Number(slaHours) || 48,
    approverRole,
    requirePki: requirePki !== false,
    objectionAction,
    condition: {
      enabled: hasRule,
      logic: 'AND',
      elseAction: isDecision
        ? (noAction === 'ROUTE_DEPT' ? 'FALLBACK_DEPT' : 'BYPASS')
        : 'BYPASS',
      fallbackDepartment: noDepartment || '',
      rules: hasRule
        ? [
            {
              id: uid('rule'),
              field: isDecision ? 'Decision / Approved' : defaultField,
              operator: isDecision ? '=' : '>',
              value: isDecision ? 'Yes' : '5000'
            }
          ]
        : []
    },
    position
  };
}

/**
 * Build a complete node array (START -> STAGE... -> END) from standard SmartDoc workflow steps.
 */
export function buildGraphFromWorkflowSteps(workflowSteps = [], defaultDept = 'Administration', orientation = 'horizontal') {
  const rawSteps = Array.isArray(workflowSteps) ? workflowSteps : [];
  const stageNodes = rawSteps
    .map((item, idx) => {
      if (typeof item === 'string') {
        const cleanDept = item.trim();
        if (!cleanDept) return null;
        return createStageNode({
          department: cleanDept,
          label: `Stage ${idx + 1}: ${cleanDept}`,
          slaHours: 48
        });
      }
      if (item && typeof item === 'object') {
        const cleanDept = String(item.department || item.name || defaultDept).trim();
        return {
          id: item.nodeId || uid('stage'),
          type: 'STAGE',
          nodeSubType: item.nodeSubType || (item.condition?.enabled ? 'RULE_GATE' : 'APPROVAL'),
          department: cleanDept,
          label: item.label || `Stage ${idx + 1}: ${cleanDept}`,
          decisionQuestion: item.decisionQuestion || '',
          yesLabel: item.yesLabel || 'YES · Proceed',
          noAction: item.noAction || 'ROUTE_DEPT',
          noDepartment: item.noDepartment || cleanDept,
          noLabel: item.noLabel || 'NO · Alternate Path',
          slaHours: Number(item.slaHours) || 48,
          approverRole: item.approverRole || 'DEPARTMENT_ADMIN',
          requirePki: item.requirePki !== false,
          objectionAction: item.objectionAction || 'RETURN_TO_SUBMITTER',
          condition: item.condition && typeof item.condition === 'object'
            ? {
                enabled: Boolean(item.condition.enabled),
                logic: item.condition.logic === 'OR' ? 'OR' : 'AND',
                elseAction: item.condition.elseAction || 'BYPASS',
                fallbackDepartment: item.condition.fallbackDepartment || '',
                rules: Array.isArray(item.condition.rules) ? item.condition.rules : []
              }
            : {
                enabled: false,
                logic: 'AND',
                elseAction: 'BYPASS',
                fallbackDepartment: '',
                rules: []
              },
          position: item.position || { x: 0, y: 0 }
        };
      }
      return null;
    })
    .filter(Boolean);

  if (stageNodes.length === 0 && defaultDept) {
    stageNodes.push(
      createStageNode({
        department: defaultDept,
        label: `${defaultDept} Review`,
        slaHours: 48
      })
    );
  }

  const allNodes = [
    {
      id: 'node-start',
      type: 'START',
      label: 'Applicant / Submitter',
      subtitle: 'Form Filled & PKI Signed',
      position: { x: 60, y: 150 }
    },
    ...stageNodes,
    {
      id: 'node-end',
      type: 'END',
      label: 'Final Approved & Sealed',
      subtitle: 'Word .docx Stamped & Archived',
      position: { x: 700, y: 150 }
    }
  ];

  return computeAutoLayout(allNodes, orientation);
}

/**
 * Compile graph nodes back into SmartDoc's standard workflow step array
 * (`[{ step: 1, department: '...' }, ...]`) for 100% backward compatibility.
 */
export function compileGraphToStandardWorkflow(nodes = []) {
  const stageNodes = (Array.isArray(nodes) ? nodes : []).filter(n => n && n.type === 'STAGE' && n.department);
  return stageNodes.map((n, idx) => ({
    step: idx + 1,
    department: n.department
  }));
}

/**
 * Evaluate a single rule against a dictionary of test field values.
 */
export function evaluateSingleRule(rule, testValues = {}) {
  if (!rule || !rule.field) return true;
  const rawVal = testValues[rule.field] ?? testValues[rule.field.toLowerCase()] ?? '';
  const strVal = String(rawVal ?? '').trim();
  const targetStr = String(rule.value ?? '').trim();
  const op = rule.operator || '=';

  if (op === 'not_empty') return strVal.length > 0;

  const numVal = parseFloat(strVal.replace(/,/g, ''));
  const numTarget = parseFloat(targetStr.replace(/,/g, ''));
  const bothNumeric = !Number.isNaN(numVal) && !Number.isNaN(numTarget) && strVal !== '' && targetStr !== '';

  switch (op) {
    case '=':
      return bothNumeric ? numVal === numTarget : strVal.toLowerCase() === targetStr.toLowerCase();
    case '!=':
      return bothNumeric ? numVal !== numTarget : strVal.toLowerCase() !== targetStr.toLowerCase();
    case '>':
      return bothNumeric ? numVal > numTarget : strVal.localeCompare(targetStr) > 0;
    case '>=':
      return bothNumeric ? numVal >= numTarget : strVal.localeCompare(targetStr) >= 0;
    case '<':
      return bothNumeric ? numVal < numTarget : strVal.localeCompare(targetStr) < 0;
    case '<=':
      return bothNumeric ? numVal <= numTarget : strVal.localeCompare(targetStr) <= 0;
    case 'contains':
      return strVal.toLowerCase().includes(targetStr.toLowerCase());
    default:
      return true;
  }
}

/**
 * Evaluate all rules on a stage node and return whether the stage takes the YES/True path or NO/False path.
 */
export function evaluateStageCondition(node, testValues = {}) {
  if (!node || node.type !== 'STAGE') return { passed: true, status: 'ACTIVE', effectiveDepartment: node?.department };
  const isDecision = node.nodeSubType === 'DECISION_YES_NO';
  const cond = node.condition;

  if (!isDecision && (!cond || !cond.enabled || !Array.isArray(cond.rules) || cond.rules.length === 0)) {
    return { passed: true, status: 'ACTIVE', effectiveDepartment: node.department };
  }

  const rules = Array.isArray(cond?.rules) && cond.rules.length > 0
    ? cond.rules
    : [{ field: 'Decision / Approved', operator: '=', value: 'Yes' }];

  const results = rules.map(r => evaluateSingleRule(r, testValues));
  const passed = cond?.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);

  if (passed) {
    return { passed: true, status: 'ACTIVE', effectiveDepartment: node.department, branch: 'YES' };
  }

  // NO / False path evaluation
  if (isDecision) {
    const noAct = node.noAction || 'ROUTE_DEPT';
    if (noAct === 'ROUTE_DEPT') {
      return {
        passed: false,
        status: 'FALLBACK',
        effectiveDepartment: node.noDepartment || node.condition?.fallbackDepartment || node.department,
        branch: 'NO'
      };
    }
    if (noAct === 'RETURN_SUBMITTER') {
      return {
        passed: false,
        status: 'RETURNED',
        effectiveDepartment: 'Applicant (Returned)',
        branch: 'NO'
      };
    }
    if (noAct === 'REJECT_END') {
      return {
        passed: false,
        status: 'REJECTED',
        effectiveDepartment: 'Rejected (Closed)',
        branch: 'NO'
      };
    }
    return { passed: false, status: 'BYPASSED', effectiveDepartment: null, branch: 'NO' };
  }

  if (cond?.elseAction === 'FALLBACK_DEPT' && cond?.fallbackDepartment) {
    return {
      passed: false,
      status: 'FALLBACK',
      effectiveDepartment: cond.fallbackDepartment,
      branch: 'NO'
    };
  }
  return { passed: false, status: 'BYPASSED', effectiveDepartment: null, branch: 'NO' };
}

/**
 * Simulate the entire workflow graph for a given map of test field values.
 */
export function simulateWorkflowGraph(nodes = [], testValues = {}) {
  const nodeStates = {};
  const effectiveSteps = [];
  let totalActiveSlaHours = 0;

  nodes.forEach((node) => {
    if (node.type === 'START' || node.type === 'END') {
      nodeStates[node.id] = { passed: true, status: 'ACTIVE', effectiveDepartment: null };
      return;
    }
    const res = evaluateStageCondition(node, testValues);
    nodeStates[node.id] = res;
    if (res.status === 'ACTIVE' || res.status === 'FALLBACK' || res.status === 'RETURNED' || res.status === 'REJECTED') {
      totalActiveSlaHours += Number(node.slaHours) || 48;
      effectiveSteps.push({
        nodeId: node.id,
        label: node.label,
        department: res.effectiveDepartment,
        status: res.status,
        branch: res.branch || 'YES',
        slaHours: Number(node.slaHours) || 48
      });
    }
  });

  return {
    nodeStates,
    effectiveSteps,
    totalActiveSlaHours
  };
}

/**
 * Format a compact human-readable summary of a node's condition rules.
 */
export function formatConditionSummary(condition) {
  if (!condition || !condition.enabled || !Array.isArray(condition.rules) || condition.rules.length === 0) {
    return null;
  }
  const parts = condition.rules.slice(0, 2).map((r) => {
    const opObj = RULE_OPERATORS.find(o => o.value === r.operator);
    const sym = opObj ? opObj.symbol : r.operator;
    if (r.operator === 'not_empty') return `${r.field} ${sym}`;
    return `${r.field} ${sym} ${r.value || '?'}`;
  });
  const suffix = condition.rules.length > 2 ? ` +${condition.rules.length - 2}` : '';
  return `IF ${parts.join(` ${condition.logic || 'AND'} `)}${suffix}`;
}

/**
 * Describe what happens on the NO / False branch of a node.
 */
export function describeNoBranch(node) {
  if (!node || node.type !== 'STAGE') return '';
  if (node.nodeSubType === 'DECISION_YES_NO') {
    const act = node.noAction || 'ROUTE_DEPT';
    if (act === 'ROUTE_DEPT') return `NO → Route to ${node.noDepartment || node.department}`;
    if (act === 'RETURN_SUBMITTER') return 'NO → Return to Submitter';
    if (act === 'REJECT_END') return 'NO → Reject & Close';
    return 'NO → Skip Stage';
  }
  if (node.condition?.enabled) {
    if (node.condition.elseAction === 'FALLBACK_DEPT' && node.condition.fallbackDepartment) {
      return `NO → ${node.condition.fallbackDepartment}`;
    }
    return 'NO → Bypass Stage';
  }
  return '';
}

/**
 * Compute visual edges between nodes, including primary YES/Proceed flow edges and NO/Bypass branch edges.
 */
export function computeGraphEdges(nodes = [], simulation = null) {
  const edges = [];
  if (!Array.isArray(nodes) || nodes.length < 2) return edges;

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    const isFromDecision = from.type === 'STAGE' && (from.nodeSubType === 'DECISION_YES_NO' || from.condition?.enabled);
    const condSummary = to.type === 'STAGE' ? formatConditionSummary(to.condition) : null;
    const toSim = simulation?.nodeStates?.[to.id];
    const fromSim = simulation?.nodeStates?.[from.id];

    let primaryLabel = to.type === 'STAGE' ? `Stage ${i + 1}` : 'Final Seal';
    if (isFromDecision) {
      primaryLabel = '✓ YES · Proceed';
    } else if (condSummary) {
      primaryLabel = condSummary;
    }

    edges.push({
      id: `edge-${from.id}-${to.id}`,
      fromId: from.id,
      toId: to.id,
      insertIndex: i,
      kind: 'PRIMARY',
      isYesBranch: isFromDecision,
      label: primaryLabel,
      hasRule: Boolean(condSummary || isFromDecision),
      simStatus: (fromSim && !fromSim.passed) ? 'BYPASSED' : (toSim ? toSim.status : 'ACTIVE')
    });

    // If `from` is a Decision (YES/NO) or Conditional Rule node, add its visual `✕ NO` branch connector!
    if (isFromDecision) {
      const noText = describeNoBranch(from);
      edges.push({
        id: `edge-no-branch-${from.id}`,
        fromId: from.id,
        toId: to.id,
        insertIndex: i,
        kind: 'NO_BRANCH',
        label: `✕ ${noText}`,
        noAction: from.noAction || (from.condition?.elseAction === 'FALLBACK_DEPT' ? 'ROUTE_DEPT' : 'BYPASS_NEXT'),
        noDepartment: from.noDepartment || from.condition?.fallbackDepartment || '',
        hasRule: true,
        simStatus: fromSim && !fromSim.passed ? 'NO_ACTIVE' : 'NO_IDLE'
      });
    }
  }

  return edges;
}

/**
 * Load saved workflow blueprints from localStorage (or seed initial enterprise blueprints from live departments).
 */
export function loadWorkflowBlueprints(departments = []) {
  try {
    const raw = localStorage.getItem(BLUEPRINTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // ignore storage errors
  }

  const deptNames = (Array.isArray(departments) ? departments : []).map(d => d.name).filter(Boolean);
  const d1 = deptNames[0] || 'HR';
  const d2 = deptNames[1] || deptNames[0] || 'Finance';
  const d3 = deptNames[2] || deptNames[0] || 'IT';

  const starterBlueprints = [
    {
      id: 'bp-yes-no-decision',
      name: `Yes / No Decision Workflow (${d1} → ${d2})`,
      description: 'Includes a Yes/No Decision branch with alternate routing when NO.',
      updatedAt: new Date().toISOString(),
      orientation: 'horizontal',
      nodes: computeAutoLayout([
        { id: 'node-start', type: 'START', label: 'Applicant / Submitter', subtitle: 'Form Filled & PKI Signed', position: { x: 60, y: 150 } },
        createStageNode({
          department: d1,
          nodeSubType: 'DECISION_YES_NO',
          label: `${d1} Yes / No Gate`,
          decisionQuestion: `Does ${d1} approve budget & compliance?`,
          noAction: 'ROUTE_DEPT',
          noDepartment: d3,
          slaHours: 24
        }),
        createStageNode({ department: d2, label: `${d2} Final Sign-Off`, slaHours: 48 }),
        { id: 'node-end', type: 'END', label: 'Final Approved & Sealed', subtitle: 'Word .docx Stamped & Archived', position: { x: 1000, y: 150 } }
      ], 'horizontal')
    },
    {
      id: 'bp-conditional-capex',
      name: `Amount > 5,000 Rule (${d1} → ${d2})`,
      description: 'Routes high-value requests (> 5,000) through secondary department audit.',
      updatedAt: new Date().toISOString(),
      orientation: 'horizontal',
      nodes: computeAutoLayout([
        { id: 'node-start', type: 'START', label: 'Applicant / Submitter', subtitle: 'Form Filled & PKI Signed', position: { x: 60, y: 150 } },
        createStageNode({ department: d1, label: `${d1} Line Manager`, slaHours: 24 }),
        createStageNode({
          department: d2,
          nodeSubType: 'RULE_GATE',
          label: `${d2} Budget Audit`,
          slaHours: 48,
          withCondition: true,
          defaultField: 'Total Amount'
        }),
        { id: 'node-end', type: 'END', label: 'Final Approved & Sealed', subtitle: 'Word .docx Stamped & Archived', position: { x: 1000, y: 150 } }
      ], 'horizontal')
    },
    {
      id: 'bp-enterprise-3stage',
      name: `3-Stage Standard (${d1} → ${d3} → ${d2})`,
      description: 'Multi-department compliance, security, and final authorization chain.',
      updatedAt: new Date().toISOString(),
      orientation: 'horizontal',
      nodes: computeAutoLayout([
        { id: 'node-start', type: 'START', label: 'Applicant / Submitter', subtitle: 'Form Filled & PKI Signed', position: { x: 60, y: 150 } },
        createStageNode({ department: d1, label: `${d1} Originating Check`, slaHours: 24 }),
        createStageNode({ department: d3, label: `${d3} Technical Review`, slaHours: 48 }),
        createStageNode({ department: d2, label: `${d2} Executive Sign-off`, slaHours: 48 }),
        { id: 'node-end', type: 'END', label: 'Final Approved & Sealed', subtitle: 'Word .docx Stamped & Archived', position: { x: 1300, y: 150 } }
      ], 'horizontal')
    }
  ];

  return starterBlueprints;
}

export function saveWorkflowBlueprints(blueprints) {
  try {
    localStorage.setItem(BLUEPRINTS_STORAGE_KEY, JSON.stringify(blueprints));
  } catch (e) {
    // ignore quota errors
  }
}

/**
 * Load/Save rich visual graph metadata keyed by template ID in decoupled storage.
 */
export function loadTemplateGraphRecord(templateId) {
  if (!templateId) return null;
  try {
    const raw = localStorage.getItem(TEMPLATE_GRAPHS_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map?.[templateId] || null;
  } catch (e) {
    return null;
  }
}

export function saveTemplateGraphRecord(templateId, graphRecord) {
  if (!templateId) return;
  try {
    const raw = localStorage.getItem(TEMPLATE_GRAPHS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[templateId] = {
      ...graphRecord,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(TEMPLATE_GRAPHS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    // ignore storage errors
  }
}
