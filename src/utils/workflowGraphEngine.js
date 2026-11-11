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
 * Compute clean canvas coordinates for nodes across primary and secondary branch lanes.
 */
export function computeAutoLayout(nodes = [], orientation = 'horizontal') {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const isHoriz = orientation !== 'vertical';

  const startX = isHoriz ? 60 : 320;
  const startY = isHoriz ? 150 : 50;
  const stepX = isHoriz ? 315 : 0;
  const stepY = isHoriz ? 0 : 210;
  const laneYOffset = 220;
  const laneXOffset = 320;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const startNode = nodes.find(n => n.type === 'START') || nodes[0];
  const endNode = nodes.find(n => n.type === 'END');

  // Discover primary spine nodes
  const primaryIds = new Set();
  const primaryChain = [];
  let curr = startNode;
  let safety = 0;
  while (curr && safety < 100) {
    safety++;
    primaryIds.add(curr.id);
    primaryChain.push(curr);
    if (curr.type === 'END') break;

    // Follow primary target
    let nextId = null;
    if (curr.trueBranchTarget && curr.trueBranchTarget !== '__NEXT__') {
      nextId = curr.trueBranchTarget;
    } else {
      const idx = nodes.findIndex(n => n.id === curr.id);
      const nextNode = nodes.slice(idx + 1).find(n => !n.isBranchNode || n.type === 'END');
      nextId = nextNode?.id || null;
    }
    if (!nextId || primaryIds.has(nextId)) break;
    curr = nodeMap.get(nextId) || null;
  }

  // Assign columns and lanes
  const layoutPositions = new Map();
  const occupiedSlots = new Set();
  let maxCol = 0;

  // 1. Assign primary nodes to lane 0
  primaryChain.forEach((node, colIdx) => {
    occupiedSlots.add(`${colIdx},0`);
    layoutPositions.set(node.id, { col: colIdx, lane: 0 });
    if (node.type !== 'END') {
      maxCol = Math.max(maxCol, colIdx);
    }
  });

  // 2. Assign branch nodes iteratively
  let unassigned = nodes.filter(n => !layoutPositions.has(n.id) && n.type !== 'END');
  let iteration = 0;
  while (unassigned.length > 0 && iteration < 50) {
    iteration++;
    let assignedThisRound = 0;

    for (const node of unassigned) {
      let parentCol = null;
      let parentLane = null;
      let isSecondaryBranch = false;

      // Check explicit branchParentId
      if (node.branchParentId && layoutPositions.has(node.branchParentId)) {
        const p = layoutPositions.get(node.branchParentId);
        parentCol = p.col;
        parentLane = p.lane;
        isSecondaryBranch = (node.branchType === 'false');
      } else {
        // Find upstream node that points to this node via falseBranchTarget or trueBranchTarget
        const parentFalse = nodes.find(n => n.falseBranchTarget === node.id && layoutPositions.has(n.id));
        if (parentFalse) {
          const p = layoutPositions.get(parentFalse.id);
          parentCol = p.col;
          parentLane = p.lane;
          isSecondaryBranch = true;
        } else {
          const parentTrue = nodes.find(n => n.trueBranchTarget === node.id && layoutPositions.has(n.id));
          if (parentTrue) {
            const p = layoutPositions.get(parentTrue.id);
            parentCol = p.col;
            parentLane = p.lane;
            isSecondaryBranch = false;
          }
        }
      }

      if (parentCol !== null && parentLane !== null) {
        const assignedCol = parentCol + 1;
        const assignedLane = isSecondaryBranch ? (parentLane + 1) : parentLane;
        let col = assignedCol;
        let lane = assignedLane;
        while (occupiedSlots.has(`${col},${lane}`)) {
          lane++;
        }
        occupiedSlots.add(`${col},${lane}`);
        layoutPositions.set(node.id, { col, lane });
        maxCol = Math.max(maxCol, col);
        assignedThisRound++;
      }
    }

    if (assignedThisRound === 0) {
      // Fallback for any disconnected nodes
      for (const node of unassigned) {
        if (!layoutPositions.has(node.id)) {
          maxCol += 1;
          let col = maxCol;
          let lane = 1;
          while (occupiedSlots.has(`${col},${lane}`)) {
            lane++;
          }
          occupiedSlots.add(`${col},${lane}`);
          layoutPositions.set(node.id, { col, lane });
        }
      }
      break;
    }

    unassigned = nodes.filter(n => !layoutPositions.has(n.id) && n.type !== 'END');
  }

  // 3. Ensure End node is placed at the end of the graph on the primary spine
  if (endNode) {
    const endCol = maxCol + 1;
    occupiedSlots.add(`${endCol},0`);
    layoutPositions.set(endNode.id, { col: endCol, lane: 0 });
  }

  // 4. Map coordinates
  return nodes.map(node => {
    const layout = layoutPositions.get(node.id) || { col: 0, lane: 0 };
    const x = isHoriz
      ? startX + layout.col * stepX
      : startX + layout.lane * laneXOffset;
    const y = isHoriz
      ? startY + layout.lane * laneYOffset
      : startY + layout.col * stepY;

    return {
      ...node,
      position: { x, y }
    };
  });
}

/**
 * Create a new approval stage or Yes/No decision node.
 */
export function createStageNode({
  id = null,
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
  trueBranchTarget = '__NEXT__',
  falseBranchTarget = '',
  branchLabelTrue = 'YES',
  branchLabelFalse = 'NO',
  isBranchNode = false,
  branchParentId = null,
  branchType = null,
  position = { x: 380, y: 150 }
} = {}) {
  const isDecision = nodeSubType === 'DECISION_YES_NO';
  const hasRule = Boolean(withCondition || isDecision || nodeSubType === 'RULE_GATE');

  return {
    id: id || uid('stage'),
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
    trueBranchTarget: trueBranchTarget || '__NEXT__',
    falseBranchTarget: falseBranchTarget || '',
    branchLabelTrue: branchLabelTrue || 'YES',
    branchLabelFalse: branchLabelFalse || 'NO',
    isBranchNode: Boolean(isBranchNode),
    branchParentId: branchParentId || null,
    branchType: branchType || null,
    condition: {
      enabled: hasRule,
      combiner: 'ALL',
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
 * Build a complete node array from workflow steps with branching preservation.
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
        const combiner = item.condition?.combiner || (item.condition?.logic === 'OR' ? 'ANY' : 'ALL');
        return {
          id: item.nodeId || item.id || uid('stage'),
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
          trueBranchTarget: item.trueBranchTarget || '__NEXT__',
          falseBranchTarget: item.falseBranchTarget || '',
          branchLabelTrue: item.branchLabelTrue || item.yesLabel || 'YES',
          branchLabelFalse: item.branchLabelFalse || item.noLabel || 'NO',
          isBranchNode: Boolean(item.isBranchNode),
          branchParentId: item.branchParentId || null,
          branchType: item.branchType || null,
          condition: item.condition && typeof item.condition === 'object'
            ? {
                enabled: Boolean(item.condition.enabled),
                combiner,
                logic: combiner === 'ANY' ? 'OR' : 'AND',
                elseAction: item.condition.elseAction || 'BYPASS',
                fallbackDepartment: item.condition.fallbackDepartment || '',
                rules: Array.isArray(item.condition.rules) ? item.condition.rules : []
              }
            : {
                enabled: false,
                combiner: 'ALL',
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
 * Compile graph nodes back into standard workflow step array for 100% backward compatibility.
 */
export function compileGraphToStandardWorkflow(nodes = []) {
  const stageNodes = (Array.isArray(nodes) ? nodes : []).filter(n => n && n.type === 'STAGE' && n.department);
  return stageNodes.map((n, idx) => ({
    step: idx + 1,
    department: n.department,
    nodeId: n.id,
    label: n.label,
    nodeSubType: n.nodeSubType || 'APPROVAL',
    decisionQuestion: n.decisionQuestion || '',
    yesLabel: n.yesLabel || 'YES · Proceed',
    noAction: n.noAction || 'ROUTE_DEPT',
    noDepartment: n.noDepartment || n.department,
    noLabel: n.noLabel || 'NO · Alternate Path',
    slaHours: Number(n.slaHours) || 48,
    approverRole: n.approverRole || 'DEPARTMENT_ADMIN',
    requirePki: n.requirePki !== false,
    objectionAction: n.objectionAction || 'RETURN_TO_SUBMITTER',
    condition: n.condition || { enabled: false, logic: 'AND', combiner: 'ALL', rules: [] },
    trueBranchTarget: n.trueBranchTarget || '__NEXT__',
    falseBranchTarget: n.falseBranchTarget || '',
    branchLabelTrue: n.branchLabelTrue || n.yesLabel || 'YES',
    branchLabelFalse: n.branchLabelFalse || n.noLabel || 'NO',
    isBranchNode: Boolean(n.isBranchNode),
    branchParentId: n.branchParentId || null,
    branchType: n.branchType || null,
    position: n.position || { x: 0, y: 0 }
  }));
}

/**
 * Insert a new first-class stage node directly onto a node's branch path.
 */
export function addNodeOnBranch(nodes = [], sourceNodeId, branchType = 'false', newNodeData = {}, orientation = 'horizontal') {
  if (!Array.isArray(nodes)) return [];
  const clonedNodes = nodes.map(n => ({ ...n }));
  const sourceIndex = clonedNodes.findIndex(n => n.id === sourceNodeId);
  if (sourceIndex === -1) return nodes;

  const sourceNode = clonedNodes[sourceIndex];
  const newId = newNodeData.id || uid(`stage-${branchType}`);
  const targetDept = newNodeData.department || (branchType === 'false' ? (sourceNode.noDepartment || 'Compliance') : sourceNode.department);

  // Inherit existing downstream target if splicing
  const existingTarget = branchType === 'false' ? sourceNode.falseBranchTarget : sourceNode.trueBranchTarget;
  const endNode = clonedNodes.find(n => n.type === 'END');
  const forwardTarget = existingTarget && existingTarget !== '__NEXT__' && existingTarget !== ''
    ? existingTarget
    : (endNode ? endNode.id : '__NEXT__');

  const newNode = createStageNode({
    id: newId,
    department: targetDept,
    label: newNodeData.label || `${targetDept} Review (${branchType === 'false' ? 'NO Branch' : 'Alternate'})`,
    nodeSubType: newNodeData.nodeSubType || 'APPROVAL',
    slaHours: newNodeData.slaHours || 24,
    trueBranchTarget: forwardTarget,
    falseBranchTarget: newNodeData.falseBranchTarget || '',
    branchLabelTrue: newNodeData.branchLabelTrue || 'YES',
    branchLabelFalse: newNodeData.branchLabelFalse || 'NO',
    isBranchNode: true,
    branchParentId: sourceNode.id,
    branchType,
    ...newNodeData
  });
  newNode.id = newId;
  newNode.isBranchNode = true;
  newNode.branchParentId = sourceNode.id;
  newNode.branchType = branchType;

  // Re-wire source node
  if (branchType === 'false') {
    sourceNode.falseBranchTarget = newId;
    if (sourceNode.nodeSubType === 'APPROVAL') {
      sourceNode.nodeSubType = 'DECISION_YES_NO';
      sourceNode.condition = { ...(sourceNode.condition || {}), enabled: true };
    }
    sourceNode.noAction = 'ROUTE_DEPT';
    sourceNode.noDepartment = targetDept;
  } else {
    sourceNode.trueBranchTarget = newId;
  }

  // Insert before End node
  const endIdx = clonedNodes.findIndex(n => n.type === 'END');
  const insertIdx = endIdx !== -1 ? endIdx : clonedNodes.length;
  clonedNodes.splice(insertIdx, 0, newNode);

  const updatedNodes = computeAutoLayout(clonedNodes, orientation);
  updatedNodes.newNode = updatedNodes.find(n => n.id === newId) || newNode;
  return updatedNodes;
}

/**
 * Automatically inspects node targets and repairs orphaned references.
 */
export function repairBranchTargets(nodes = []) {
  if (!Array.isArray(nodes)) return [];
  const validIds = new Set(nodes.map(n => n.id));
  return nodes.map(node => {
    if (node.type !== 'STAGE') return node;
    let trueBranchTarget = node.trueBranchTarget;
    let falseBranchTarget = node.falseBranchTarget;

    if (trueBranchTarget && trueBranchTarget !== '__NEXT__' && trueBranchTarget !== '__END__' && !validIds.has(trueBranchTarget)) {
      trueBranchTarget = '__NEXT__';
    }
    if (falseBranchTarget && falseBranchTarget !== '__REJECT__' && falseBranchTarget !== '__RETURN__' && !validIds.has(falseBranchTarget)) {
      falseBranchTarget = '';
    }

    return {
      ...node,
      trueBranchTarget,
      falseBranchTarget
    };
  });
}

/**
 * Evaluate a single rule against test values.
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
 * Evaluate all rules on a stage node and return outcome.
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
  const isOrCombiner = cond?.combiner === 'ANY' || cond?.logic === 'OR';
  const passed = isOrCombiner ? results.some(Boolean) : results.every(Boolean);

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
  const executionPath = [];
  const activeEdgeIds = [];
  let totalActiveSlaHours = 0;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodeStates, effectiveSteps, totalActiveSlaHours, executionPath, activeEdgeIds };
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const startNode = nodes.find(n => n.type === 'START') || nodes[0];
  const endNode = nodes.find(n => n.type === 'END');

  // Initialize all nodes as BYPASSED
  nodes.forEach(n => {
    nodeStates[n.id] = { passed: false, status: 'BYPASSED', effectiveDepartment: null };
  });

  if (startNode) {
    nodeStates[startNode.id] = { passed: true, status: 'ACTIVE', effectiveDepartment: null };
    executionPath.push(startNode.id);
  }

  const visitedSet = new Set();
  let curr = startNode;
  let safety = 0;

  while (curr && safety < 50) {
    safety++;
    visitedSet.add(curr.id);

    if (curr.type === 'START') {
      const firstStage = nodes.find(n => n.type === 'STAGE');
      if (!firstStage) break;
      activeEdgeIds.push(`edge-${curr.id}-${firstStage.id}`);
      curr = firstStage;
      continue;
    }

    if (curr.type === 'END') {
      nodeStates[curr.id] = { passed: true, status: 'ACTIVE', effectiveDepartment: null };
      if (!executionPath.includes(curr.id)) executionPath.push(curr.id);
      break;
    }

    // Evaluate stage
    executionPath.push(curr.id);
    const res = evaluateStageCondition(curr, testValues);
    nodeStates[curr.id] = res;

    if (res.status === 'ACTIVE' || res.status === 'FALLBACK' || res.status === 'RETURNED' || res.status === 'REJECTED') {
      totalActiveSlaHours += Number(curr.slaHours) || 48;
      effectiveSteps.push({
        nodeId: curr.id,
        label: curr.label,
        department: res.effectiveDepartment,
        status: res.status,
        branch: res.branch || 'YES',
        slaHours: Number(curr.slaHours) || 48
      });
    }

    let nextId = null;
    let edgeId = null;

    if (res.passed) {
      if (curr.trueBranchTarget && curr.trueBranchTarget !== '__NEXT__') {
        nextId = curr.trueBranchTarget;
      } else {
        const idx = nodes.findIndex(n => n.id === curr.id);
        const nextNode = nodes.slice(idx + 1).find(n => !n.isBranchNode || n.type === 'END');
        nextId = nextNode?.id || (endNode ? endNode.id : null);
      }
      edgeId = `edge-${curr.id}-${nextId}-true`;
    } else {
      if (curr.falseBranchTarget && curr.falseBranchTarget !== '__REJECT__') {
        nextId = curr.falseBranchTarget;
        edgeId = `edge-${curr.id}-${nextId}-false`;
      } else if (curr.noAction === 'REJECT_END' || curr.falseBranchTarget === '__REJECT__') {
        if (endNode) {
          nodeStates[endNode.id] = { passed: false, status: 'REJECTED', effectiveDepartment: 'Terminated' };
          executionPath.push(endNode.id);
          activeEdgeIds.push(`edge-${curr.id}-${endNode.id}-reject`);
        }
        break;
      } else if (curr.noAction === 'RETURN_SUBMITTER') {
        break;
      } else {
        const idx = nodes.findIndex(n => n.id === curr.id);
        const nextNode = nodes.slice(idx + 1).find(n => !n.isBranchNode || n.type === 'END');
        nextId = nextNode?.id || (endNode ? endNode.id : null);
        edgeId = `edge-${curr.id}-${nextId}`;
      }
    }

    if (edgeId) activeEdgeIds.push(edgeId);
    if (!nextId || visitedSet.has(nextId)) break;
    curr = nodeMap.get(nextId);
  }

  if (endNode && visitedSet.has(endNode.id)) {
    nodeStates[endNode.id] = { passed: true, status: 'ACTIVE', effectiveDepartment: null };
  }

  return {
    nodeStates,
    effectiveSteps,
    totalActiveSlaHours,
    executionPath,
    activeEdgeIds
  };
}

/**
 * Format a compact summary of condition rules.
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
  const combiner = condition.combiner === 'ANY' || condition.logic === 'OR' ? 'OR' : 'AND';
  const suffix = condition.rules.length > 2 ? ` +${condition.rules.length - 2}` : '';
  return `IF ${parts.join(` ${combiner} `)}${suffix}`;
}

/**
 * Describe what happens on the NO / False branch of a node.
 */
export function describeNoBranch(node) {
  if (!node || node.type !== 'STAGE') return '';
  if (node.falseBranchTarget) {
    return `NO → Branch to ${node.falseBranchTarget}`;
  }
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
 * Compute visual SVG edges between nodes, including primary YES flow, NO branch edges, and curved bezier paths.
 */
export function computeGraphEdges(nodes = [], options = {}) {
  const edges = [];
  if (!Array.isArray(nodes) || nodes.length < 2) return edges;

  const simulation = options && (options.nodeStates || options.effectiveSteps) ? options : (options?.simulation || null);
  const orientation = options?.orientation || 'horizontal';
  const nodeWidth = options?.nodeWidth || 242;
  const nodeHeight = options?.nodeHeight || 148;
  const isHoriz = orientation !== 'vertical';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const calculatePath = (from, to, isFalseBranch = false, isPlaceholder = false) => {
    const fx = from.position?.x || 0;
    const fy = from.position?.y || 0;

    if (isPlaceholder || !to) {
      const x1 = isHoriz ? fx + nodeWidth / 2 : fx + nodeWidth;
      const y1 = isHoriz ? fy + nodeHeight : fy + nodeHeight / 2;
      const x2 = isHoriz ? x1 : x1 + 48;
      const y2 = isHoriz ? y1 + 48 : y1;
      const pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
      return { pathD, midX: x2, midY: y2, x1, y1, x2, y2 };
    }

    const tx = to.position?.x || 0;
    const ty = to.position?.y || 0;

    // For same-column upward transitions, route cleanly from top port to target bottom port
    if (isHoriz && tx === fx && ty < fy) {
      const x1 = fx + nodeWidth / 2;
      const y1 = fy;
      const x2 = tx + nodeWidth / 2;
      const y2 = ty + nodeHeight;
      const pathD = `M ${x1} ${y1} C ${x1} ${y1 - 30}, ${x2} ${y2 + 30}, ${x2} ${y2}`;
      return { pathD, midX: x1, midY: (y1 + y2) / 2, x1, y1, x2, y2 };
    }

    // Check for loop-back (target is behind source)
    const isLoopBack = isHoriz ? tx <= fx : ty <= fy;
    if (isLoopBack) {
      const x1 = isHoriz ? fx + nodeWidth / 2 : fx + nodeWidth;
      const y1 = isHoriz ? fy + nodeHeight : fy + nodeHeight / 2;
      const x2 = isHoriz ? tx + nodeWidth / 2 : tx + nodeWidth;
      const y2 = isHoriz ? ty + nodeHeight : ty + nodeHeight / 2;
      const dropY = Math.max(fy, ty) + nodeHeight + 70;
      const pathD = isHoriz
        ? `M ${x1} ${y1} C ${x1} ${dropY}, ${x2} ${dropY}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${dropY} ${y1}, ${dropY} ${y2}, ${x2} ${y2}`;
      return { pathD, midX: (x1 + x2) / 2, midY: dropY - 20, x1, y1, x2, y2 };
    }

    // Check for multi-stage forward jump (skipping intervening nodes)
    const isMultiStageJump = isHoriz ? (tx - fx) > nodeWidth * 2.2 : (ty - fy) > nodeHeight * 2.2;
    if (isMultiStageJump) {
      const x1 = isHoriz ? fx + nodeWidth / 2 : fx + nodeWidth;
      const y1 = isHoriz ? fy + nodeHeight : fy + nodeHeight / 2;
      const x2 = isHoriz ? tx : tx + nodeWidth / 2;
      const y2 = isHoriz ? ty + nodeHeight / 2 : ty;
      const clearanceY = Math.max(fy, ty) + nodeHeight + (isFalseBranch ? 40 : 65);
      const pathD = isHoriz
        ? `M ${x1} ${y1} C ${x1} ${clearanceY}, ${x2 - 50} ${clearanceY}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${clearanceY} ${y1}, ${clearanceY} ${y2 - 50}, ${x2} ${y2}`;
      return { pathD, midX: (x1 + x2) / 2, midY: clearanceY - 15, x1, y1, x2, y2 };
    }

    if (isFalseBranch) {
      // Divergent downward branch
      const x1 = isHoriz ? fx + nodeWidth / 2 : fx + nodeWidth;
      const y1 = isHoriz ? fy + nodeHeight : fy + nodeHeight / 2;
      const x2 = isHoriz ? tx : tx + nodeWidth / 2;
      const y2 = isHoriz ? ty + nodeHeight / 2 : ty;
      const drop = isHoriz ? Math.min(60, Math.abs(y2 - y1) * 0.5) : Math.min(60, Math.abs(x2 - x1) * 0.5);
      const pathD = isHoriz
        ? `M ${x1} ${y1} C ${x1} ${y1 + drop}, ${x2 - 40} ${y2}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1 + drop} ${y1}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
      return { pathD, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2, x1, y1, x2, y2 };
    }

    // Standard primary edge
    const x1 = isHoriz ? fx + nodeWidth : fx + nodeWidth / 2;
    const y1 = isHoriz ? fy + nodeHeight / 2 : fy + nodeHeight;
    const x2 = isHoriz ? tx : tx + nodeWidth / 2;
    const y2 = isHoriz ? ty + nodeHeight / 2 : ty;

    const deltaX = Math.max(40, Math.abs(x2 - x1) * 0.45);
    const deltaY = Math.max(40, Math.abs(y2 - y1) * 0.45);
    const cx1 = isHoriz ? x1 + deltaX : x1;
    const cy1 = isHoriz ? y1 : y1 + deltaY;
    const cx2 = isHoriz ? x2 - deltaX : x2;
    const cy2 = isHoriz ? y2 : y2 - deltaY;

    const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    return { pathD, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2, x1, y1, x2, y2 };
  };

  // Build edges
  nodes.forEach((from, idx) => {
    if (from.type === 'END') return;
    const hasBranching = from.type === 'STAGE' && (from.nodeSubType === 'DECISION_YES_NO' || from.condition?.enabled);
    const fromSim = simulation?.nodeStates?.[from.id];

    // 1. TRUE / PRIMARY PATH
    let trueTargetId = null;
    const isExplicitTrueBranch = Boolean(from.trueBranchTarget && from.trueBranchTarget !== '__NEXT__');
    if (isExplicitTrueBranch) {
      trueTargetId = from.trueBranchTarget;
    } else {
      const nextNode = nodes.slice(idx + 1).find(n => !n.isBranchNode || n.type === 'END');
      trueTargetId = nextNode?.id || null;
    }

    const toTrue = trueTargetId ? nodeMap.get(trueTargetId) : null;
    if (toTrue) {
      const geo = calculatePath(from, toTrue, false, false);
      const toSim = simulation?.nodeStates?.[toTrue.id];
      const primaryLabel = hasBranching
        ? (from.branchLabelTrue && from.branchLabelTrue !== 'YES' ? from.branchLabelTrue : '✓ YES · Proceed')
        : (toTrue.type === 'STAGE' ? `Stage ${idx + 1}` : 'Final Seal');

      edges.push({
        id: `edge-${from.id}-${toTrue.id}-true`,
        fromId: from.id,
        toId: toTrue.id,
        insertIndex: idx,
        kind: isExplicitTrueBranch ? 'TRUE_BRANCH' : 'PRIMARY',
        isBranch: hasBranching,
        isYesBranch: hasBranching,
        isTrueBranch: hasBranching,
        isFalseBranch: false,
        isPlaceholder: false,
        label: primaryLabel,
        hasRule: hasBranching,
        simStatus: (fromSim && !fromSim.passed) ? 'BYPASSED' : (toSim ? toSim.status : 'ACTIVE'),
        ...geo,
        pathD: geo.pathD,
        d: geo.pathD,
        labelX: geo.midX,
        labelY: geo.midY,
        boxX: geo.midX,
        boxY: geo.midY
      });
    }

    // 2. FALSE / ALTERNATE PATH
    if (hasBranching) {
      const falseTargetId = from.falseBranchTarget;
      const toFalse = (falseTargetId && falseTargetId !== '__REJECT__' && falseTargetId !== '__RETURN__')
        ? nodeMap.get(falseTargetId)
        : null;

      const noText = describeNoBranch(from);
      const falseLabel = from.branchLabelFalse && from.branchLabelFalse !== 'NO'
        ? from.branchLabelFalse
        : (noText ? `✕ ${noText}` : '✕ NO · Alternate Path');

      if (toFalse) {
        // Connected to real canvas node
        const geo = calculatePath(from, toFalse, true, false);
        edges.push({
          id: `edge-${from.id}-${toFalse.id}-false`,
          fromId: from.id,
          toId: toFalse.id,
          insertIndex: idx,
          kind: 'FALSE_BRANCH',
          isBranch: true,
          isYesBranch: false,
          isNoBranch: true,
          isFalseBranch: true,
          isPlaceholder: false,
          label: falseLabel,
          hasRule: true,
          simStatus: fromSim && !fromSim.passed ? 'NO_ACTIVE' : 'NO_IDLE',
          ...geo,
          pathD: geo.pathD,
          d: geo.pathD,
          labelX: geo.midX,
          labelY: geo.midY,
          boxX: geo.midX,
          boxY: geo.midY
        });
      } else if (from.noAction === 'REJECT_END' || falseTargetId === '__REJECT__') {
        const endNode = nodes.find(n => n.type === 'END');
        if (endNode && falseTargetId === '__REJECT__') {
          const geo = calculatePath(from, endNode, true, false);
          edges.push({
            id: `edge-${from.id}-${endNode.id}-reject`,
            fromId: from.id,
            toId: endNode.id,
            insertIndex: idx,
            kind: 'FALSE_BRANCH',
            isBranch: true,
            isYesBranch: false,
            isNoBranch: true,
            isFalseBranch: true,
            isPlaceholder: false,
            label: '✕ NO · Terminate & Reject',
            hasRule: true,
            simStatus: fromSim && !fromSim.passed ? 'NO_ACTIVE' : 'NO_IDLE',
            ...geo,
            pathD: geo.pathD,
            d: geo.pathD,
            labelX: geo.midX,
            labelY: geo.midY,
            boxX: geo.midX,
            boxY: geo.midY
          });
        } else {
          // Legacy or unlinked NO branch card
          const geo = calculatePath(from, null, true, true);
          edges.push({
            id: `edge-no-branch-${from.id}`,
            fromId: from.id,
            toId: from.id,
            insertIndex: idx,
            kind: 'NO_BRANCH',
            isBranch: true,
            isYesBranch: false,
            isNoBranch: true,
            isFalseBranch: true,
            isPlaceholder: true,
            label: falseLabel,
            noAction: from.noAction || 'ROUTE_DEPT',
            noDepartment: from.noDepartment || from.condition?.fallbackDepartment || '',
            hasRule: true,
            simStatus: fromSim && !fromSim.passed ? 'NO_ACTIVE' : 'NO_IDLE',
            ...geo,
            pathD: geo.pathD,
            d: geo.pathD,
            labelX: geo.midX,
            labelY: geo.midY,
            boxX: isHoriz ? (from.position?.x || 0) + 12 : (from.position?.x || 0) + nodeWidth + 60,
            boxY: isHoriz ? (from.position?.y || 0) + nodeHeight + 58 : (from.position?.y || 0) + 26
          });
        }
      } else {
        // Unconnected / Pending branch stub
        const geo = calculatePath(from, null, true, true);
        edges.push({
          id: `edge-no-branch-${from.id}`,
          fromId: from.id,
          toId: null,
          insertIndex: idx,
          kind: 'NO_BRANCH',
          isBranch: true,
          isYesBranch: false,
          isNoBranch: true,
          isFalseBranch: true,
          isPlaceholder: true,
          label: falseLabel,
          noAction: from.noAction || 'ROUTE_DEPT',
          noDepartment: from.noDepartment || from.condition?.fallbackDepartment || '',
          hasRule: true,
          simStatus: fromSim && !fromSim.passed ? 'NO_ACTIVE' : 'NO_IDLE',
          ...geo,
          pathD: geo.pathD,
          d: geo.pathD,
          labelX: geo.midX,
          labelY: geo.midY,
          boxX: isHoriz ? (from.position?.x || 0) + 12 : (from.position?.x || 0) + nodeWidth + 60,
          boxY: isHoriz ? (from.position?.y || 0) + nodeHeight + 58 : (from.position?.y || 0) + 26
        });
      }
    }
  });

  return edges;
}

/**
 * Load saved workflow blueprints from localStorage.
 */
export function loadWorkflowBlueprints(departments = []) {
  try {
    const raw = localStorage.getItem(BLUEPRINTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
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
          id: 'stage-decision-1',
          department: d1,
          nodeSubType: 'DECISION_YES_NO',
          label: `${d1} Yes / No Gate`,
          decisionQuestion: `Does ${d1} approve budget & compliance?`,
          noAction: 'ROUTE_DEPT',
          noDepartment: d3,
          slaHours: 24,
          trueBranchTarget: 'stage-final-signoff',
          falseBranchTarget: 'stage-branch-d3',
          branchLabelTrue: 'YES',
          branchLabelFalse: 'NO'
        }),
        createStageNode({
          id: 'stage-branch-d3',
          department: d3,
          label: `${d3} Alternate Audit`,
          slaHours: 24,
          isBranchNode: true,
          branchParentId: 'stage-decision-1',
          branchType: 'false',
          trueBranchTarget: 'stage-final-signoff'
        }),
        createStageNode({
          id: 'stage-final-signoff',
          department: d2,
          label: `${d2} Final Sign-Off`,
          slaHours: 48,
          trueBranchTarget: '__NEXT__'
        }),
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
  } catch {
    // ignore storage errors
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
  } catch {
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
  } catch {
    // ignore storage errors
  }
}
