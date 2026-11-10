import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  RULE_OPERATORS,
  YES_NO_NO_ACTIONS,
  SLA_PRESETS,
  computeAutoLayout,
  createStageNode,
  buildGraphFromWorkflowSteps,
  compileGraphToStandardWorkflow,
  simulateWorkflowGraph,
  formatConditionSummary,
  describeNoBranch,
  computeGraphEdges,
  loadWorkflowBlueprints,
  saveWorkflowBlueprints,
  loadTemplateGraphRecord,
  saveTemplateGraphRecord
} from '../utils/workflowGraphEngine';
import {
  GitBranch,
  Plus,
  Trash2,
  Copy,
  Play,
  Save,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Sliders,
  Layers,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Upload,
  FileText,
  Folder,
  X,
  ArrowRightLeft,
  ArrowUpDown,
  Lock,
  UserCheck,
  Split,
  HelpCircle,
  FilePlus2,
  Check,
  CornerDownRight
} from 'lucide-react';

const NODE_WIDTH = 242;
const NODE_HEIGHT = 148;

export const WorkflowGraphStudio = () => {
  const {
    departments,
    formTemplates,
    currentUser,
    isSuperAdmin,
    canManageDepartment,
    updateTemplate,
    addToast
  } = useApp();

  const defaultDept = useMemo(() => {
    if (currentUser?.department && departments.some(d => d.name === currentUser.department)) {
      return currentUser.department;
    }
    return departments[0]?.name || 'Administration';
  }, [currentUser, departments]);

  const secondaryDept = useMemo(() => {
    const other = departments.find(d => d.name !== defaultDept);
    return other?.name || defaultDept;
  }, [departments, defaultDept]);

  // Editable templates the current user can sync workflows to
  const editableTemplates = useMemo(() => {
    return (formTemplates || []).filter(t => {
      if (t.status === 'ARCHIVED' || t.isEditable === false) return false;
      if (isSuperAdmin) return true;
      return canManageDepartment ? canManageDepartment(t.department) : t.department === currentUser?.department;
    });
  }, [formTemplates, isSuperAdmin, canManageDepartment, currentUser]);

  // Saved blueprints state
  const [blueprints, setBlueprints] = useState(() => loadWorkflowBlueprints(departments));
  const [activeBlueprintId, setActiveBlueprintId] = useState(() => blueprints[0]?.id || 'bp-custom');
  const [workflowName, setWorkflowName] = useState(() => blueprints[0]?.name || 'Yes / No Decision Workflow');
  const [linkedTemplateId, setLinkedTemplateId] = useState('');
  const [orientation, setOrientation] = useState('horizontal');

  // Graph nodes state
  const [nodes, setNodes] = useState(() => {
    if (blueprints[0]?.nodes?.length) return blueprints[0].nodes;
    return buildGraphFromWorkflowSteps([defaultDept], defaultDept, 'horizontal');
  });

  // Selected node & right rail tab ('inspector' | 'palette')
  const [selectedNodeId, setSelectedNodeId] = useState(() => {
    const firstStage = (blueprints[0]?.nodes || []).find(n => n.type === 'STAGE');
    return firstStage ? firstStage.id : 'node-start';
  });
  const [rightTab, setRightTab] = useState('inspector');

  // Canvas Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 20 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Node dragging state
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const dragNodeRef = useRef({ nodeId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false });

  // Live Rule Simulator state
  const [simMode, setSimMode] = useState(false);
  const [simValues, setSimValues] = useState({
    'Decision / Approved': 'Yes',
    'Total Amount': '7500',
    'Leave Days': '3',
    Priority: 'High'
  });
  const [savingSync, setSavingSync] = useState(false);
  const fileInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const canvasViewportRef = useRef(null);

  // Active linked template object
  const linkedTemplate = useMemo(
    () => (formTemplates || []).find(t => t.id === linkedTemplateId) || null,
    [formTemplates, linkedTemplateId]
  );

  // Available fields for the Rule Builder
  const availableFields = useMemo(() => {
    const set = new Set(['Decision / Approved']);
    if (Array.isArray(linkedTemplate?.fields)) {
      linkedTemplate.fields.forEach(f => {
        if (f?.label) set.add(f.label);
        else if (f?.key) set.add(f.key);
      });
    }
    nodes.forEach(n => {
      if (n.type === 'STAGE' && Array.isArray(n.condition?.rules)) {
        n.condition.rules.forEach(r => {
          if (r?.field) set.add(r.field);
        });
      }
    });
    ['Total Amount', 'Contract Value', 'Leave Days', 'Priority', 'Department', 'Urgency'].forEach(k => set.add(k));
    return Array.from(set);
  }, [linkedTemplate, nodes]);

  // All fields referenced by active rules (for the Simulator test bar)
  const activeRuleFields = useMemo(() => {
    const fields = new Set();
    nodes.forEach(n => {
      if (n.type === 'STAGE' && (n.nodeSubType === 'DECISION_YES_NO' || n.condition?.enabled)) {
        if (Array.isArray(n.condition?.rules) && n.condition.rules.length > 0) {
          n.condition.rules.forEach(r => {
            if (r?.field) fields.add(r.field);
          });
        } else if (n.nodeSubType === 'DECISION_YES_NO') {
          fields.add('Decision / Approved');
        }
      }
    });
    if (fields.size === 0) {
      fields.add('Decision / Approved');
      fields.add('Total Amount');
    }
    return Array.from(fields);
  }, [nodes]);

  // Simulation evaluation
  const simulationResult = useMemo(() => {
    if (!simMode) return null;
    return simulateWorkflowGraph(nodes, simValues);
  }, [simMode, nodes, simValues]);

  // Computed edges
  const edges = useMemo(() => computeGraphEdges(nodes, simulationResult), [nodes, simulationResult]);

  // Selected node object
  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) || nodes.find(n => n.type === 'STAGE') || nodes[0],
    [nodes, selectedNodeId]
  );

  const stageNodes = useMemo(() => nodes.filter(n => n.type === 'STAGE'), [nodes]);

  // Check URL deep link `?template=<id>` or `?id=<id>` on mount
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const tplId = qs.get('template') || qs.get('id');
      if (tplId && formTemplates.some(t => t.id === tplId)) {
        handleSelectTemplate(tplId);
      }
    } catch (e) {
      // ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a brand new workflow
  const handleCreateNewWorkflow = () => {
    const newId = `bp-user-${Date.now().toString(36)}`;
    const freshNodes = buildGraphFromWorkflowSteps([defaultDept], defaultDept, orientation);
    setActiveBlueprintId(newId);
    setLinkedTemplateId('');
    setWorkflowName(`New Workflow (${defaultDept})`);
    setNodes(freshNodes);
    const firstStage = freshNodes.find(n => n.type === 'STAGE');
    if (firstStage) setSelectedNodeId(firstStage.id);
    setRightTab('inspector');
    setPan({ x: 24, y: 20 });
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 40);
    addToast('New Workflow Created', 'Started a fresh workflow canvas. Add stages or Yes/No nodes on the right.', 'info');
  };

  // Select a template to load its workflow onto the graph
  const handleSelectTemplate = useCallback((tplId) => {
    setLinkedTemplateId(tplId);
    if (!tplId) return;
    const tpl = (formTemplates || []).find(t => t.id === tplId);
    if (!tpl) return;

    const savedRecord = loadTemplateGraphRecord(tpl.id);
    if (savedRecord && Array.isArray(savedRecord.nodes) && savedRecord.nodes.length >= 2) {
      setNodes(savedRecord.nodes);
      setOrientation(savedRecord.orientation || 'horizontal');
      setWorkflowName(savedRecord.name || `${tpl.title} — Workflow`);
      const firstStage = savedRecord.nodes.find(n => n.type === 'STAGE');
      if (firstStage) setSelectedNodeId(firstStage.id);
    } else {
      const built = buildGraphFromWorkflowSteps(tpl.workflow, tpl.department || defaultDept, orientation);
      setNodes(built);
      setWorkflowName(`${tpl.title} — Workflow`);
      const firstStage = built.find(n => n.type === 'STAGE');
      if (firstStage) setSelectedNodeId(firstStage.id);
    }
  }, [formTemplates, defaultDept, orientation]);

  // Auto-arrange nodes
  const handleAutoArrange = useCallback((nextOrientation = orientation) => {
    setNodes(prev => computeAutoLayout(prev, nextOrientation));
    setPan({ x: 24, y: 20 });
  }, [orientation]);

  const handleToggleOrientation = () => {
    const next = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    setOrientation(next);
    handleAutoArrange(next);
  };

  // Add a stage or Yes/No decision node
  const handleInsertStageNode = useCallback((options = {}, insertAfterIndex = null) => {
    const targetDept = options.department || defaultDept;
    const subType = options.nodeSubType || (options.withCondition ? 'RULE_GATE' : 'APPROVAL');
    const isDecision = subType === 'DECISION_YES_NO';
    const defaultField = isDecision ? 'Decision / Approved' : (availableFields.find(f => f !== 'Decision / Approved') || 'Total Amount');

    const newNode = createStageNode({
      department: targetDept,
      nodeSubType: subType,
      label: options.label || (isDecision ? `${targetDept} Yes / No Decision` : `${targetDept} Approval`),
      decisionQuestion: options.decisionQuestion || (isDecision ? `Does ${targetDept} approve?` : ''),
      noAction: options.noAction || 'ROUTE_DEPT',
      noDepartment: options.noDepartment || secondaryDept,
      slaHours: options.slaHours || 48,
      withCondition: Boolean(options.withCondition || isDecision),
      defaultField
    });

    setNodes(prev => {
      const copy = [...prev];
      const endIdx = copy.findIndex(n => n.type === 'END');
      const targetIdx = insertAfterIndex !== null && insertAfterIndex >= 0 && insertAfterIndex < copy.length
        ? insertAfterIndex + 1
        : (endIdx >= 0 ? endIdx : copy.length);

      if (options.customPosition) {
        newNode.position = options.customPosition;
        copy.splice(targetIdx, 0, newNode);
        return copy;
      }

      copy.splice(targetIdx, 0, newNode);
      return computeAutoLayout(copy, orientation);
    });

    setSelectedNodeId(newNode.id);
    setRightTab('inspector');
  }, [defaultDept, secondaryDept, availableFields, orientation]);

  // Update a specific stage node
  const updateStageNode = useCallback((nodeId, updater) => {
    setNodes(prev =>
      prev.map(n => {
        if (n.id !== nodeId) return n;
        const updated = typeof updater === 'function' ? updater(n) : { ...n, ...updater };
        return updated;
      })
    );
  }, []);

  // Switch a selected node's subtype ('APPROVAL' | 'DECISION_YES_NO' | 'RULE_GATE')
  const handleSwitchNodeSubType = (subType) => {
    if (!selectedNode || selectedNode.type !== 'STAGE') return;
    updateStageNode(selectedNode.id, (n) => {
      const isDecision = subType === 'DECISION_YES_NO';
      const isRule = subType === 'RULE_GATE';
      const existingRules = Array.isArray(n.condition?.rules) && n.condition.rules.length > 0
        ? n.condition.rules
        : [{
            id: `rule-${Date.now().toString(36)}`,
            field: isDecision ? 'Decision / Approved' : 'Total Amount',
            operator: isDecision ? '=' : '>',
            value: isDecision ? 'Yes' : '5000'
          }];

      return {
        ...n,
        nodeSubType: subType,
        decisionQuestion: n.decisionQuestion || `Does ${n.department} approve?`,
        noAction: n.noAction || 'ROUTE_DEPT',
        noDepartment: n.noDepartment || secondaryDept,
        condition: {
          ...(n.condition || {}),
          enabled: isDecision || isRule,
          logic: n.condition?.logic || 'AND',
          elseAction: isDecision
            ? ((n.noAction || 'ROUTE_DEPT') === 'ROUTE_DEPT' ? 'FALLBACK_DEPT' : 'BYPASS')
            : (n.condition?.elseAction || 'BYPASS'),
          fallbackDepartment: n.noDepartment || n.condition?.fallbackDepartment || secondaryDept,
          rules: existingRules
        }
      };
    });
  };

  // Reorder a stage node earlier or later
  const handleMoveStage = useCallback((nodeId, delta) => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === nodeId);
      if (idx <= 0 || idx >= prev.length - 1) return prev;
      const targetIdx = idx + delta;
      if (targetIdx <= 0 || targetIdx >= prev.length - 1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return computeAutoLayout(copy, orientation);
    });
  }, [orientation]);

  // Duplicate a stage node
  const handleDuplicateStage = useCallback((nodeId) => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === nodeId);
      if (idx <= 0 || idx >= prev.length - 1) return prev;
      const orig = prev[idx];
      const clone = {
        ...JSON.parse(JSON.stringify(orig)),
        id: `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        label: `${orig.label} (Copy)`
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, clone);
      setSelectedNodeId(clone.id);
      return computeAutoLayout(copy, orientation);
    });
  }, [orientation]);

  // Remove a stage node
  const handleDeleteStage = useCallback((nodeId) => {
    setNodes(prev => {
      const stages = prev.filter(n => n.type === 'STAGE');
      if (stages.length <= 1) {
        addToast('Minimum 1 Stage Required', 'An approval workflow must contain at least one department stage.', 'warning');
        return prev;
      }
      const next = prev.filter(n => n.id !== nodeId);
      const remainingStage = next.find(n => n.type === 'STAGE');
      if (selectedNodeId === nodeId && remainingStage) {
        setSelectedNodeId(remainingStage.id);
      }
      return computeAutoLayout(next, orientation);
    });
  }, [addToast, orientation, selectedNodeId]);

  // Rule CRUD helpers for selected node
  const handleToggleNodeCondition = (enabled) => {
    if (!selectedNode || selectedNode.type !== 'STAGE') return;
    handleSwitchNodeSubType(enabled ? 'RULE_GATE' : 'APPROVAL');
  };

  const handleAddRuleRow = () => {
    if (!selectedNode || selectedNode.type !== 'STAGE') return;
    updateStageNode(selectedNode.id, (n) => ({
      ...n,
      condition: {
        ...(n.condition || {}),
        enabled: true,
        logic: n.condition?.logic || 'AND',
        elseAction: n.condition?.elseAction || 'BYPASS',
        rules: [
          ...(n.condition?.rules || []),
          {
            id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            field: availableFields[0] || 'Total Amount',
            operator: '=',
            value: ''
          }
        ]
      }
    }));
  };

  const handleUpdateRuleRow = (ruleId, patch) => {
    if (!selectedNode || selectedNode.type !== 'STAGE') return;
    updateStageNode(selectedNode.id, (n) => ({
      ...n,
      condition: {
        ...(n.condition || {}),
        rules: (n.condition?.rules || []).map(r => (r.id === ruleId ? { ...r, ...patch } : r))
      }
    }));
  };

  const handleRemoveRuleRow = (ruleId) => {
    if (!selectedNode || selectedNode.type !== 'STAGE') return;
    updateStageNode(selectedNode.id, (n) => {
      const nextRules = (n.condition?.rules || []).filter(r => r.id !== ruleId);
      return {
        ...n,
        condition: {
          ...(n.condition || {}),
          enabled: nextRules.length > 0 ? n.condition.enabled : false,
          rules: nextRules
        }
      };
    });
  };

  // Save current graph as a reusable Blueprint (updates existing or creates new)
  const handleSaveBlueprint = () => {
    const cleanName = workflowName.trim() || 'Custom Approval Workflow';
    const existingById = blueprints.findIndex(b => b.id === activeBlueprintId);
    const existingByName = blueprints.findIndex(b => b.name.toLowerCase() === cleanName.toLowerCase());
    const matchIdx = existingById >= 0 ? existingById : existingByName;

    const targetId = matchIdx >= 0 ? blueprints[matchIdx].id : `bp-user-${Date.now().toString(36)}`;
    const newBp = {
      id: targetId,
      name: cleanName,
      description: `${stageNodes.length} stage${stageNodes.length === 1 ? '' : 's'} · ${stageNodes.map(s => s.department).join(' → ')}`,
      updatedAt: new Date().toISOString(),
      orientation,
      nodes
    };

    let nextList;
    if (matchIdx >= 0) {
      nextList = blueprints.map((b, i) => (i === matchIdx ? newBp : b));
    } else {
      nextList = [newBp, ...blueprints];
    }
    setActiveBlueprintId(targetId);
    setBlueprints(nextList);
    saveWorkflowBlueprints(nextList);

    if (linkedTemplateId) {
      saveTemplateGraphRecord(linkedTemplateId, { name: cleanName, orientation, nodes });
    }

    addToast(
      matchIdx >= 0 ? 'Workflow Updated' : 'Workflow Saved',
      `"${cleanName}" (${stageNodes.length} stages) saved to your Saved Workflows bar.`,
      'success'
    );
  };

  // Load a blueprint onto the canvas
  const handleLoadBlueprint = (bp) => {
    if (!bp || !Array.isArray(bp.nodes)) return;
    setActiveBlueprintId(bp.id);
    setLinkedTemplateId('');
    setWorkflowName(bp.name);
    setOrientation(bp.orientation || 'horizontal');
    setNodes(JSON.parse(JSON.stringify(bp.nodes)));
    const firstStage = bp.nodes.find(n => n.type === 'STAGE');
    if (firstStage) setSelectedNodeId(firstStage.id);
    setRightTab('inspector');
  };

  const handleDeleteBlueprint = (bpId, e) => {
    if (e) e.stopPropagation();
    if (blueprints.length <= 1) {
      addToast('Cannot Delete Last Workflow', 'At least one saved workflow must remain.', 'warning');
      return;
    }
    const next = blueprints.filter(b => b.id !== bpId);
    setBlueprints(next);
    saveWorkflowBlueprints(next);
    if (activeBlueprintId === bpId && next[0]) {
      handleLoadBlueprint(next[0]);
    }
    addToast('Workflow Deleted', 'Removed workflow from saved list.', 'info');
  };

  // Sync the compiled workflow steps directly to the linked Form Template
  const handleSyncToTemplate = async () => {
    if (!linkedTemplate) {
      addToast('Select a Template First', 'Choose a Form Template in the top bar to sync this workflow.', 'warning');
      return;
    }
    if (stageNodes.length === 0) {
      addToast('Validation Error', 'At least one Department Approval Stage is required.', 'error');
      return;
    }

    setSavingSync(true);
    try {
      saveTemplateGraphRecord(linkedTemplate.id, {
        name: workflowName.trim() || `${linkedTemplate.title} — Workflow`,
        orientation,
        nodes
      });

      const standardWorkflow = compileGraphToStandardWorkflow(nodes);

      const payload = {
        title: linkedTemplate.title,
        description: linkedTemplate.description || '',
        department: linkedTemplate.department,
        folderId: linkedTemplate.folderId || null,
        audience: linkedTemplate.audience || 'ALL',
        defaultExpiryDays: linkedTemplate.defaultExpiryDays || 14,
        fontFamily: linkedTemplate.fontFamily || 'Calibri, sans-serif',
        fontSize: linkedTemplate.fontSize || '11pt',
        fields: linkedTemplate.fields || [],
        workflow: standardWorkflow,
        status: linkedTemplate.status || 'ACTIVE',
        isDraft: Boolean(linkedTemplate.isDraft),
        commitMessage: `Updated workflow graph (${stageNodes.map(s => s.department).join(' → ')})`,
        changeSummary: `Updated workflow graph (${stageNodes.map(s => s.department).join(' → ')})`
      };

      const res = await updateTemplate(linkedTemplate.id, payload);
      if (res) {
        addToast(
          'Synced to Form Template',
          `Approval chain (${stageNodes.map(s => s.department).join(' → ')}) applied to "${linkedTemplate.title}".`,
          'success'
        );
      }
    } catch (err) {
      addToast('Sync Failed', err?.message || 'Could not update template workflow.', 'error');
    } finally {
      setSavingSync(false);
    }
  };

  // Export & Import JSON
  const handleExportJson = () => {
    const data = {
      name: workflowName,
      version: '1.0',
      exportedAt: new Date().toISOString(),
      orientation,
      nodes,
      compiledWorkflow: compileGraphToStandardWorkflow(nodes)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(workflowName || 'workflow').replace(/\W+/g, '_').toLowerCase()}.workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (Array.isArray(parsed.nodes) && parsed.nodes.length >= 2) {
          setWorkflowName(parsed.name || file.name.replace(/\.json$/i, ''));
          setOrientation(parsed.orientation || 'horizontal');
          setNodes(parsed.nodes);
          const firstStage = parsed.nodes.find(n => n.type === 'STAGE');
          if (firstStage) setSelectedNodeId(firstStage.id);
          addToast('Workflow Imported', `Loaded "${parsed.name || file.name}" successfully.`, 'success');
        } else {
          addToast('Invalid Workflow File', 'JSON file does not contain a valid workflow node array.', 'error');
        }
      } catch (err) {
        addToast('Import Error', 'Could not parse workflow JSON file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Pointer handlers for dragging individual nodes on the canvas
  const handleNodePointerDown = (e, node) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    e.stopPropagation();

    dragNodeRef.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.position?.x || 0,
      origY: node.position?.y || 0,
      moved: false
    };
    setDraggingNodeId(node.id);
    setSelectedNodeId(node.id);
    if (node.type === 'STAGE') {
      setRightTab('inspector');
    }
  };

  // Pointer handlers for panning the canvas background
  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    if (
      e.target.closest('.sd-wfg-node') ||
      e.target.closest('.sd-wfg-no-branch-card') ||
      e.target.closest('.sd-wfg-edge-badge-wrap') ||
      e.target.closest('.sd-wfg-sim-drawer')
    ) {
      return;
    }
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  useEffect(() => {
    const handleWindowPointerMove = (e) => {
      if (draggingNodeId && dragNodeRef.current.nodeId === draggingNodeId) {
        const dx = (e.clientX - dragNodeRef.current.startX) / zoom;
        const dy = (e.clientY - dragNodeRef.current.startY) / zoom;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          dragNodeRef.current.moved = true;
        }
        const nextX = Math.max(16, Math.round(dragNodeRef.current.origX + dx));
        const nextY = Math.max(16, Math.round(dragNodeRef.current.origY + dy));
        setNodes(prev =>
          prev.map(n => (n.id === draggingNodeId ? { ...n, position: { x: nextX, y: nextY } } : n))
        );
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        });
      }
    };

    const handleWindowPointerUp = () => {
      if (draggingNodeId) setDraggingNodeId(null);
      if (isPanning) setIsPanning(false);
    };

    if (draggingNodeId || isPanning) {
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [draggingNodeId, isPanning, zoom]);

  // Support dropping a Department chip or Node Type from the right rail onto the center canvas
  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const deptName = e.dataTransfer.getData('text/smartdoc-dept');
    const nodeKind = e.dataTransfer.getData('text/smartdoc-node-kind');
    if (!deptName && !nodeKind) return;

    const rect = canvasViewportRef.current?.getBoundingClientRect();
    let customPosition = null;
    if (rect) {
      const rawX = (e.clientX - rect.left - pan.x) / zoom - NODE_WIDTH / 2;
      const rawY = (e.clientY - rect.top - pan.y) / zoom - NODE_HEIGHT / 2;
      customPosition = {
        x: Math.max(24, Math.round(rawX)),
        y: Math.max(24, Math.round(rawY))
      };
    }

    handleInsertStageNode({
      department: deptName || defaultDept,
      nodeSubType: nodeKind === 'DECISION_YES_NO' ? 'DECISION_YES_NO' : (nodeKind === 'CONDITIONAL' ? 'RULE_GATE' : 'APPROVAL'),
      withCondition: nodeKind === 'CONDITIONAL' || nodeKind === 'DECISION_YES_NO',
      customPosition
    });
  };

  // Calculate SVG geometry for edges (including YES primary lines and NO branch cards!)
  const renderedEdges = useMemo(() => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const isHoriz = orientation !== 'vertical';

    return edges
      .map((edge) => {
        const fromNode = nodeMap.get(edge.fromId);
        const toNode = nodeMap.get(edge.toId);
        if (!fromNode || !toNode) return null;

        const fx = fromNode.position?.x || 0;
        const fy = fromNode.position?.y || 0;
        const tx = toNode.position?.x || 0;
        const ty = toNode.position?.y || 0;

        if (edge.kind === 'NO_BRANCH') {
          // Connects from the bottom (horizontal) or right (vertical) of `fromNode` to its visual `NO` outcome box
          const x1 = isHoriz ? fx + NODE_WIDTH / 2 : fx + NODE_WIDTH;
          const y1 = isHoriz ? fy + NODE_HEIGHT : fy + NODE_HEIGHT / 2;
          const boxX = isHoriz ? fx + 12 : fx + NODE_WIDTH + 60;
          const boxY = isHoriz ? fy + NODE_HEIGHT + 58 : fy + 26;
          const x2 = isHoriz ? boxX + (NODE_WIDTH - 24) / 2 : boxX;
          const y2 = isHoriz ? boxY : boxY + 28;

          const d = isHoriz
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1 + 28} ${y1}, ${x2 - 28} ${y2}, ${x2} ${y2}`;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return { ...edge, d, midX, midY, x1, y1, x2, y2, boxX, boxY, parentNode: fromNode };
        }

        // Standard primary edge (or YES branch edge)
        const x1 = isHoriz ? fx + NODE_WIDTH : fx + NODE_WIDTH / 2;
        const y1 = isHoriz ? fy + NODE_HEIGHT / 2 : fy + NODE_HEIGHT;
        const x2 = isHoriz ? tx : tx + NODE_WIDTH / 2;
        const y2 = isHoriz ? ty + NODE_HEIGHT / 2 : ty;

        const deltaX = Math.max(48, Math.abs(x2 - x1) * 0.45);
        const deltaY = Math.max(48, Math.abs(y2 - y1) * 0.45);

        const cx1 = isHoriz ? x1 + deltaX : x1;
        const cy1 = isHoriz ? y1 : y1 + deltaY;
        const cx2 = isHoriz ? x2 - deltaX : x2;
        const cy2 = isHoriz ? y2 : y2 - deltaY;

        const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        return { ...edge, d, midX, midY, x1, y1, x2, y2 };
      })
      .filter(Boolean);
  }, [edges, nodes, orientation]);

  const totalSlaHours = useMemo(
    () => stageNodes.reduce((acc, s) => acc + (Number(s.slaHours) || 48), 0),
    [stageNodes]
  );

  const conditionalStagesCount = useMemo(
    () => stageNodes.filter(s => s.nodeSubType === 'DECISION_YES_NO' || (s.condition?.enabled && s.condition?.rules?.length > 0)).length,
    [stageNodes]
  );

  return (
    <div className="sd-wfg-studio-shell">
      {/* 1. TOP COMMAND BAR */}
      <header className="sd-wfg-topbar">
        <div className="sd-wfg-topbar-left">
          <div className="sd-wfg-brand-badge">
            <GitBranch size={17} />
          </div>
          <div className="sd-wfg-title-group">
            <input
              ref={titleInputRef}
              id="input-workflow-graph-name"
              type="text"
              className="sd-wfg-title-input"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Enter Workflow Name…"
              title="Click to rename workflow"
            />
            <div className="sd-wfg-subtitle-row">
              <span className="sd-wfg-meta-pill">
                <Layers size={11} /> {stageNodes.length} Stage{stageNodes.length === 1 ? '' : 's'}
              </span>
              <span className="sd-wfg-meta-pill">
                <Split size={11} /> {conditionalStagesCount} Yes/No &amp; Rules
              </span>
              <span className="sd-wfg-meta-pill">
                <Clock size={11} /> {totalSlaHours}h SLA
              </span>
            </div>
          </div>
        </div>

        {/* Center Target Template Selector & Canvas Controls */}
        <div className="sd-wfg-topbar-center">
          <div className="sd-wfg-template-selector-wrap">
            <FileText size={13} className="sd-wfg-template-icon" />
            <select
              id="select-wfg-target-template"
              className="sd-wfg-template-select"
              value={linkedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              title="Optionally link this workflow graph to a Form Template"
            >
              <option value="">Standalone Workflow Blueprint</option>
              {editableTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  [{t.department}] {t.title} ({t.code || 'Form'})
                </option>
              ))}
            </select>
          </div>

          <div className="sd-wfg-canvas-toolbar">
            <button
              type="button"
              className="sd-wfg-tool-btn"
              onClick={handleToggleOrientation}
              title={orientation === 'horizontal' ? 'Switch to Vertical Top-to-Bottom Graph' : 'Switch to Horizontal Left-to-Right Graph'}
            >
              {orientation === 'horizontal' ? <ArrowRightLeft size={14} /> : <ArrowUpDown size={14} />}
              <span>{orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
            </button>

            <button
              type="button"
              className="sd-wfg-tool-btn"
              onClick={() => handleAutoArrange(orientation)}
              title="Auto-align all nodes cleanly on the canvas"
            >
              <Maximize2 size={13} />
              <span>Auto-Align</span>
            </button>

            <div className="sd-wfg-zoom-group">
              <button
                type="button"
                className="sd-wfg-zoom-btn"
                onClick={() => setZoom(z => Math.max(0.55, +(z - 0.1).toFixed(2)))}
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <button
                type="button"
                className="sd-wfg-zoom-readout"
                onClick={() => { setZoom(1); setPan({ x: 24, y: 20 }); }}
                title="Reset Zoom & Pan to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className="sd-wfg-zoom-btn"
                onClick={() => setZoom(z => Math.min(1.45, +(z + 0.1).toFixed(2)))}
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
            </div>

            <button
              id="btn-wfg-simulate-toggle"
              type="button"
              className={`sd-wfg-tool-btn sim-toggle ${simMode ? 'is-active' : ''}`}
              onClick={() => setSimMode(v => !v)}
              title="Test Yes/No and conditional rules with sample values"
            >
              <Play size={13} />
              <span>{simMode ? 'Simulating' : 'Test Yes/No Rules'}</span>
            </button>
          </div>
        </div>

        {/* Right Create New / Save / Sync / Export Actions */}
        <div className="sd-wfg-topbar-right">
          <button
            id="btn-wfg-new-workflow"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCreateNewWorkflow}
            title="Start a brand new workflow graph from scratch"
          >
            <FilePlus2 size={14} /> + New Workflow
          </button>

          <button
            id="btn-wfg-save-blueprint"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSaveBlueprint}
            title="Save or update this workflow in your Saved Workflows bar"
          >
            <Save size={14} /> Save Workflow
          </button>

          {linkedTemplate && (
            <button
              id="btn-wfg-sync-template"
              type="button"
              className="btn btn-primary btn-sm"
              disabled={savingSync}
              onClick={handleSyncToTemplate}
              title={`Apply compiled workflow chain to "${linkedTemplate.title}"`}
            >
              <CheckCircle2 size={14} />
              {savingSync ? 'Syncing…' : 'Apply to Form'}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportJson}
          />
          <button
            type="button"
            className="sd-wfg-icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import Workflow JSON"
          >
            <Upload size={14} />
          </button>
          <button
            type="button"
            className="sd-wfg-icon-btn"
            onClick={handleExportJson}
            title="Export Workflow JSON"
          >
            <Download size={14} />
          </button>
        </div>
      </header>

      {/* 1B. SAVED WORKFLOWS BAR — CLICK ANY SAVED WORKFLOW TO VIEW OR EDIT */}
      <div className="sd-wfg-saved-strip">
        <span className="sd-wfg-saved-strip-label">
          <Layers size={12} /> Saved Workflows ({blueprints.length}):
        </span>
        <div className="sd-wfg-saved-pills-scroll">
          {blueprints.map((bp) => {
            const isCurrent = !linkedTemplateId && bp.id === activeBlueprintId;
            const bpStageCount = (bp.nodes || []).filter(n => n.type === 'STAGE').length;
            const hasYesNo = (bp.nodes || []).some(n => n.nodeSubType === 'DECISION_YES_NO' || n.condition?.enabled);
            return (
              <div
                key={bp.id}
                className={`sd-wfg-saved-pill ${isCurrent ? 'is-active' : ''}`}
                onClick={() => handleLoadBlueprint(bp)}
                title={`Click to view or edit "${bp.name}"`}
              >
                <span className="sd-wfg-saved-pill-name">{bp.name}</span>
                <span className="sd-wfg-saved-pill-meta">
                  {bpStageCount} stg{hasYesNo ? ' · Yes/No' : ''}
                </span>
                {blueprints.length > 1 && (
                  <button
                    type="button"
                    className="sd-wfg-saved-pill-del"
                    onClick={(e) => handleDeleteBlueprint(bp.id, e)}
                    title="Delete this saved workflow"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: CENTER GRAPH CANVAS + RIGHT-HAND NODE & RULE INSPECTOR */}
      <div className="sd-wfg-body">
        {/* CENTER INTERACTIVE GRAPH CANVAS */}
        <div
          ref={canvasViewportRef}
          className={`sd-wfg-canvas-viewport ${isPanning ? 'is-panning' : ''} ${simMode ? 'is-simulating' : ''}`}
          onPointerDown={handleCanvasPointerDown}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {/* Floating Top-Left Canvas Legend & Instructions */}
          <div className="sd-wfg-canvas-hud-top">
            <div className="sd-wfg-hud-pill">
              <span className="sd-wfg-hud-dot start" />
              <span>Origin</span>
            </div>
            <div className="sd-wfg-hud-pill">
              <span className="sd-wfg-hud-dot stage" />
              <span>Dept Stage</span>
            </div>
            <div className="sd-wfg-hud-pill">
              <span className="sd-wfg-hud-dot decision" />
              <span>Yes / No Branch</span>
            </div>
            <div className="sd-wfg-hud-pill">
              <span className="sd-wfg-hud-dot end" />
              <span>PKI Seal</span>
            </div>
            <span className="sd-wfg-hud-hint">
              Click any node to edit its <strong>Yes / No branches &amp; rules</strong> on the right · Drag nodes to move · Click <strong>+</strong> on any line to insert
            </span>
          </div>

          {/* Transformed Pan & Zoom Layer */}
          <div
            className="sd-wfg-canvas-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            {/* SVG Edges Layer */}
            <svg className="sd-wfg-edges-svg" width="3200" height="2200">
              <defs>
                <marker
                  id="wfg-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary-500)" />
                </marker>
                <marker
                  id="wfg-arrow-emerald"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>
                <marker
                  id="wfg-arrow-rose"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
                </marker>
                <marker
                  id="wfg-arrow-muted"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                </marker>
              </defs>

              {renderedEdges.map((edge) => {
                const isNoBranch = edge.kind === 'NO_BRANCH';
                const isSimBypassed = simMode && edge.simStatus === 'BYPASSED';
                const isNoTriggered = simMode && edge.simStatus === 'NO_ACTIVE';

                let strokeColor = 'var(--primary-500)';
                let markerUrl = 'url(#wfg-arrow-active)';

                if (isNoBranch) {
                  strokeColor = isNoTriggered ? '#f43f5e' : 'rgba(244, 63, 94, 0.65)';
                  markerUrl = 'url(#wfg-arrow-rose)';
                } else if (isSimBypassed) {
                  strokeColor = 'rgba(148, 163, 184, 0.35)';
                  markerUrl = 'url(#wfg-arrow-muted)';
                } else if (edge.isYesBranch) {
                  strokeColor = '#10b981';
                  markerUrl = 'url(#wfg-arrow-emerald)';
                }

                return (
                  <g key={edge.id} className="sd-wfg-edge-group">
                    {!isSimBypassed && (
                      <path
                        d={edge.d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="6"
                        strokeOpacity="0.14"
                      />
                    )}
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isNoBranch ? '2.2' : '2.6'}
                      strokeDasharray={isNoBranch ? '5 4' : isSimBypassed ? '6 5' : simMode ? '8 4' : undefined}
                      className={simMode && (!isSimBypassed || isNoTriggered) ? 'sd-wfg-edge-animated' : ''}
                      markerEnd={markerUrl}
                    />
                  </g>
                );
              })}
            </svg>

            {/* HTML Edge Labels, Midpoint '+' Insert Stage Buttons, & Visual 'NO' Branch Cards */}
            {renderedEdges.map((edge) => {
              if (edge.kind === 'NO_BRANCH') {
                const isSelectedParent = selectedNode?.id === edge.fromId;
                const isNoActive = simMode && edge.simStatus === 'NO_ACTIVE';
                return (
                  <div
                    key={`no-card-${edge.id}`}
                    className={`sd-wfg-no-branch-card ${isSelectedParent ? 'is-parent-selected' : ''} ${isNoActive ? 'sim-no-active' : ''}`}
                    style={{
                      left: `${edge.boxX}px`,
                      top: `${edge.boxY}px`,
                      width: `${NODE_WIDTH - 24}px`
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(edge.fromId);
                      setRightTab('inspector');
                    }}
                    title="Click to configure what happens on the NO / False branch"
                  >
                    <div className="sd-wfg-no-branch-header">
                      <span className="sd-wfg-no-pill">✕ IF NO / FALSE</span>
                      <CornerDownRight size={12} />
                    </div>
                    <div className="sd-wfg-no-branch-body">
                      {edge.label.replace(/^✕\s*/, '')}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`badge-${edge.id}`}
                  className={`sd-wfg-edge-badge-wrap ${edge.isYesBranch ? 'is-yes-branch' : ''} ${edge.hasRule ? 'has-rule' : ''}`}
                  style={{
                    left: `${edge.midX}px`,
                    top: `${edge.midY}px`
                  }}
                >
                  <span className="sd-wfg-edge-label-pill" title={edge.label}>
                    {edge.label}
                  </span>
                  <button
                    type="button"
                    className="sd-wfg-edge-insert-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInsertStageNode({}, edge.insertIndex);
                    }}
                    title="Insert a new node here"
                  >
                    <Plus size={11} />
                  </button>
                </div>
              );
            })}

            {/* HTML Interactive Node Cards */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isDragging = draggingNodeId === node.id;
              const stageIdx = node.type === 'STAGE' ? stageNodes.findIndex(s => s.id === node.id) : -1;
              const isDecisionNode = node.type === 'STAGE' && node.nodeSubType === 'DECISION_YES_NO';
              const condSummary = node.type === 'STAGE' ? formatConditionSummary(node.condition) : null;
              const simState = simulationResult?.nodeStates?.[node.id];

              if (node.type === 'START') {
                return (
                  <div
                    key={node.id}
                    className={`sd-wfg-node node-start ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                    style={{
                      width: `${NODE_WIDTH}px`,
                      minHeight: `${NODE_HEIGHT}px`,
                      left: `${node.position?.x || 0}px`,
                      top: `${node.position?.y || 0}px`
                    }}
                    onPointerDown={(e) => handleNodePointerDown(e, node)}
                  >
                    <div className="sd-wfg-node-header start">
                      <span className="sd-wfg-node-step-tag">START · ORIGIN</span>
                      <span className="sd-wfg-node-status-dot online" />
                    </div>
                    <div className="sd-wfg-node-body">
                      <div className="sd-wfg-node-title-row">
                        <UserCheck size={16} className="sd-wfg-node-main-icon emerald" />
                        <div>
                          <div className="sd-wfg-node-title">{node.label}</div>
                          <div className="sd-wfg-node-sub">{node.subtitle}</div>
                        </div>
                      </div>
                      <div className="sd-wfg-node-chips">
                        <span className="sd-wfg-chip emerald">
                          <Lock size={10} /> RSA-2048 Signed
                        </span>
                        <span className="sd-wfg-chip neutral">
                          <FileText size={10} /> {linkedTemplate ? `${linkedTemplate.fields?.length || 0} Fields` : 'Form Intake'}
                        </span>
                      </div>
                    </div>
                    <div className={`sd-wfg-port port-out ${orientation}`} title="Output Port" />
                  </div>
                );
              }

              if (node.type === 'END') {
                const activeCount = simulationResult ? simulationResult.effectiveSteps.length : stageNodes.length;
                const activeSla = simulationResult ? simulationResult.totalActiveSlaHours : totalSlaHours;
                return (
                  <div
                    key={node.id}
                    className={`sd-wfg-node node-end ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                    style={{
                      width: `${NODE_WIDTH}px`,
                      minHeight: `${NODE_HEIGHT}px`,
                      left: `${node.position?.x || 0}px`,
                      top: `${node.position?.y || 0}px`
                    }}
                    onPointerDown={(e) => handleNodePointerDown(e, node)}
                  >
                    <div className={`sd-wfg-port port-in ${orientation}`} title="Input Port" />
                    <div className="sd-wfg-node-header end">
                      <span className="sd-wfg-node-step-tag">TERMINAL · ARCHIVE</span>
                      <ShieldCheck size={14} />
                    </div>
                    <div className="sd-wfg-node-body">
                      <div className="sd-wfg-node-title-row">
                        <CheckCircle2 size={16} className="sd-wfg-node-main-icon accent" />
                        <div>
                          <div className="sd-wfg-node-title">{node.label}</div>
                          <div className="sd-wfg-node-sub">{node.subtitle}</div>
                        </div>
                      </div>
                      <div className="sd-wfg-node-chips">
                        <span className="sd-wfg-chip accent">
                          {activeCount} Active Stage{activeCount === 1 ? '' : 's'}
                        </span>
                        <span className="sd-wfg-chip neutral">
                          <Clock size={10} /> {activeSla}h SLA
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // STAGE NODE (Standard Approval, Yes/No Decision Node, or Field Rule Gate)
              const isSimBypassed = simMode && simState?.status === 'BYPASSED';
              const isSimNoBranch = simMode && simState?.branch === 'NO';
              const isSimActive = simMode && simState?.branch !== 'NO';

              return (
                <div
                  key={node.id}
                  id={`wfg-node-${node.id}`}
                  className={`sd-wfg-node node-stage ${isDecisionNode ? 'is-decision-node' : ''} ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${condSummary ? 'has-condition' : ''} ${isSimBypassed ? 'sim-bypassed' : ''} ${isSimActive ? 'sim-active' : ''}`}
                  style={{
                    width: `${NODE_WIDTH}px`,
                    minHeight: `${NODE_HEIGHT}px`,
                    left: `${node.position?.x || 0}px`,
                    top: `${node.position?.y || 0}px`
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                >
                  <div className={`sd-wfg-port port-in ${orientation}`} title="Stage Input" />

                  <div className={`sd-wfg-node-header stage ${isDecisionNode ? 'decision' : ''}`}>
                    <div className="sd-wfg-node-step-badge">
                      <span className="sd-wfg-step-num">STAGE {stageIdx + 1}</span>
                      {isDecisionNode ? (
                        <span className="sd-wfg-yesno-gate-tag" title="Yes / No Decision Branch Node">
                          🔀 YES / NO
                        </span>
                      ) : condSummary ? (
                        <span className="sd-wfg-rule-gate-tag" title="Conditional Rule Gate Enabled">
                          ⚡ RULE
                        </span>
                      ) : null}
                    </div>

                    <div className="sd-wfg-node-quick-actions">
                      {stageIdx > 0 && (
                        <button
                          type="button"
                          className="sd-wfg-node-mini-btn"
                          onClick={(e) => { e.stopPropagation(); handleMoveStage(node.id, -1); }}
                          title="Move Stage Earlier"
                        >
                          <ArrowLeft size={11} />
                        </button>
                      )}
                      {stageIdx < stageNodes.length - 1 && (
                        <button
                          type="button"
                          className="sd-wfg-node-mini-btn"
                          onClick={(e) => { e.stopPropagation(); handleMoveStage(node.id, 1); }}
                          title="Move Stage Later"
                        >
                          <ArrowRight size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="sd-wfg-node-mini-btn"
                        onClick={(e) => { e.stopPropagation(); handleDuplicateStage(node.id); }}
                        title="Duplicate Stage"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        className="sd-wfg-node-mini-btn danger"
                        onClick={(e) => { e.stopPropagation(); handleDeleteStage(node.id); }}
                        title="Remove Stage"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>

                  <div className="sd-wfg-node-body">
                    <div className="sd-wfg-node-dept-line">
                      <Folder size={13} className="sd-wfg-dept-icon" />
                      <span className="sd-wfg-dept-name">{node.department}</span>
                    </div>
                    <div className="sd-wfg-node-stage-label" title={node.label}>
                      {node.label || `${node.department} Approval`}
                    </div>

                    {/* Yes/No Decision Question or Rule Box */}
                    {isDecisionNode ? (
                      <div className="sd-wfg-node-yesno-box">
                        <div className="sd-wfg-yesno-question">
                          ? {node.decisionQuestion || `Does ${node.department} approve?`}
                        </div>
                        <div className="sd-wfg-yesno-split-pills">
                          <span className="sd-wfg-yn-pill yes">✓ YES &rarr; Next</span>
                          <span className="sd-wfg-yn-pill no">✕ NO &rarr; Branch</span>
                        </div>
                      </div>
                    ) : condSummary ? (
                      <div className="sd-wfg-node-rule-box">
                        <span className="sd-wfg-node-rule-expr">{condSummary}</span>
                        <span className="sd-wfg-node-rule-else">{describeNoBranch(node)}</span>
                      </div>
                    ) : null}

                    <div className="sd-wfg-node-chips">
                      <span className="sd-wfg-chip neutral">
                        <Clock size={10} /> {node.slaHours || 48}h SLA
                      </span>
                      <span className={`sd-wfg-chip ${node.requirePki !== false ? 'emerald' : 'neutral'}`}>
                        <ShieldCheck size={10} /> {node.requirePki !== false ? 'PKI Sign' : 'Review'}
                      </span>
                      {simMode && (
                        <span className={`sd-wfg-chip ${isSimNoBranch ? 'amber' : 'emerald'}`}>
                          {isSimNoBranch ? `✕ NO (${simState?.effectiveDepartment || 'Bypass'})` : '✓ YES Path'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* YES Output Port (Right) and NO Output Port (Bottom) */}
                  <div className={`sd-wfg-port port-out ${orientation}`} title="YES / Primary Output Port" />
                  {(isDecisionNode || condSummary) && (
                    <div className={`sd-wfg-port port-no ${orientation}`} title="NO / False Branch Port" />
                  )}
                </div>
              );
            })}
          </div>

          {/* LIVE RULE SIMULATOR DRAWER (BOTTOM OF CENTER CANVAS) */}
          {simMode && (
            <div className="sd-wfg-sim-drawer">
              <div className="sd-wfg-sim-header">
                <div className="sd-wfg-sim-title">
                  <Play size={14} className="sd-wfg-sim-icon" />
                  <span>Live Yes/No &amp; Rule Simulator</span>
                  <span className="sd-wfg-sim-badge">
                    Resulting Path: Applicant &rarr;{' '}
                    {simulationResult?.effectiveSteps.length
                      ? simulationResult.effectiveSteps.map(s => `${s.department} (${s.branch})`).join(' → ')
                      : '(Direct Seal)'}{' '}
                    &rarr; Final Seal ({simulationResult?.totalActiveSlaHours || 0}h SLA)
                  </span>
                </div>
                <button
                  type="button"
                  className="sd-wfg-sim-close"
                  onClick={() => setSimMode(false)}
                  title="Close Simulator"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="sd-wfg-sim-inputs-row">
                {activeRuleFields.map((fieldKey) => (
                  <div key={fieldKey} className="sd-wfg-sim-field">
                    <label className="sd-wfg-sim-label">{fieldKey}:</label>
                    {fieldKey === 'Decision / Approved' ? (
                      <div className="sd-wfg-sim-yesno-toggle">
                        <button
                          type="button"
                          className={`sd-wfg-sim-yn-btn yes ${(simValues[fieldKey] || 'Yes').toLowerCase() === 'yes' ? 'active' : ''}`}
                          onClick={() => setSimValues(prev => ({ ...prev, [fieldKey]: 'Yes' }))}
                        >
                          ✓ YES
                        </button>
                        <button
                          type="button"
                          className={`sd-wfg-sim-yn-btn no ${(simValues[fieldKey] || 'Yes').toLowerCase() === 'no' ? 'active' : ''}`}
                          onClick={() => setSimValues(prev => ({ ...prev, [fieldKey]: 'No' }))}
                        >
                          ✕ NO
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="sd-input sd-input-sm sd-wfg-sim-input"
                        value={simValues[fieldKey] ?? ''}
                        onChange={(e) =>
                          setSimValues(prev => ({ ...prev, [fieldKey]: e.target.value }))
                        }
                        placeholder={`Test value for ${fieldKey}…`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT-HAND RAIL: CREATE NODES & DEFINE RULES */}
        <aside className="sd-wfg-right-rail" aria-label="Workflow Node Creator and Rule Builder">
          {/* Persistent Quick-Create Node Bar at Top of Right Rail */}
          <div className="sd-wfg-rail-create-bar">
            <div className="sd-wfg-rail-section-kicker">
              <span>ADD NODES TO WORKFLOW GRAPH (CLICK OR DRAG)</span>
            </div>
            <div className="sd-wfg-create-btns-grid-3">
              <button
                id="btn-wfg-add-dept-node"
                type="button"
                className="sd-wfg-create-node-btn primary"
                onClick={() => handleInsertStageNode({ nodeSubType: 'APPROVAL', withCondition: false })}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/smartdoc-node-kind', 'STANDARD');
                  e.dataTransfer.setData('text/smartdoc-dept', defaultDept);
                }}
                title="Add a standard Department Approval Node"
              >
                <Plus size={14} />
                <div className="sd-wfg-create-btn-text">
                  <strong>+ Dept Node</strong>
                  <span>Standard Stage</span>
                </div>
              </button>

              <button
                id="btn-wfg-add-yesno-node"
                type="button"
                className="sd-wfg-create-node-btn yesno"
                onClick={() => handleInsertStageNode({ nodeSubType: 'DECISION_YES_NO', withCondition: true })}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/smartdoc-node-kind', 'DECISION_YES_NO');
                  e.dataTransfer.setData('text/smartdoc-dept', defaultDept);
                }}
                title="Add a Yes / No Decision Branch Node with YES and NO paths"
              >
                <HelpCircle size={14} />
                <div className="sd-wfg-create-btn-text">
                  <strong>+ Yes / No Node</strong>
                  <span>✓ Yes / ✕ No Path</span>
                </div>
              </button>

              <button
                id="btn-wfg-add-rule-node"
                type="button"
                className="sd-wfg-create-node-btn conditional"
                onClick={() => handleInsertStageNode({ nodeSubType: 'RULE_GATE', withCondition: true })}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/smartdoc-node-kind', 'CONDITIONAL');
                  e.dataTransfer.setData('text/smartdoc-dept', defaultDept);
                }}
                title="Add a Field Rule Gate Node (e.g., IF Amount > 5000)"
              >
                <Split size={14} />
                <div className="sd-wfg-create-btn-text">
                  <strong>+ Field Rule</strong>
                  <span>IF Field &gt; Value</span>
                </div>
              </button>
            </div>
          </div>

          {/* Right Rail Mode Switcher: Node & Rule Inspector vs. Department Palette & Saved List */}
          <div className="sd-wfg-rail-tabs">
            <button
              type="button"
              className={`sd-wfg-rail-tab ${rightTab === 'inspector' ? 'active' : ''}`}
              onClick={() => setRightTab('inspector')}
            >
              <Sliders size={13} />
              <span>Edit Node &amp; Rules</span>
            </button>
            <button
              type="button"
              className={`sd-wfg-rail-tab ${rightTab === 'palette' ? 'active' : ''}`}
              onClick={() => setRightTab('palette')}
            >
              <Layers size={13} />
              <span>Departments &amp; Saved ({blueprints.length})</span>
            </button>
          </div>

          {/* TAB 1: SELECTED NODE PROPERTIES, YES/NO BRANCHES & CONDITIONAL RULE BUILDER */}
          {rightTab === 'inspector' && (
            <div className="sd-wfg-rail-scroll">
              {selectedNode && selectedNode.type === 'STAGE' ? (
                <>
                  {/* Node Type Switcher (Standard vs Yes/No Decision vs Field Rule) */}
                  <div className="sd-wfg-inspector-card">
                    <div className="sd-wfg-card-header">
                      <span className="sd-wfg-card-title">
                        Stage {stageNodes.findIndex(s => s.id === selectedNode.id) + 1} Mode
                      </span>
                      <div className="sd-wfg-card-actions">
                        <button
                          type="button"
                          className="sd-wfg-mini-action"
                          onClick={() => handleDuplicateStage(selectedNode.id)}
                          title="Duplicate Node"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          className="sd-wfg-mini-action danger"
                          onClick={() => handleDeleteStage(selectedNode.id)}
                          title="Delete Node"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="sd-wfg-node-mode-pills">
                      <button
                        type="button"
                        className={`sd-wfg-mode-pill ${(!selectedNode.nodeSubType || selectedNode.nodeSubType === 'APPROVAL') && !selectedNode.condition?.enabled ? 'active' : ''}`}
                        onClick={() => handleSwitchNodeSubType('APPROVAL')}
                      >
                        🏢 Standard Stage
                      </button>
                      <button
                        type="button"
                        className={`sd-wfg-mode-pill yesno ${selectedNode.nodeSubType === 'DECISION_YES_NO' ? 'active' : ''}`}
                        onClick={() => handleSwitchNodeSubType('DECISION_YES_NO')}
                      >
                        🔀 Yes / No Branch
                      </button>
                      <button
                        type="button"
                        className={`sd-wfg-mode-pill rule ${selectedNode.nodeSubType === 'RULE_GATE' || (selectedNode.condition?.enabled && selectedNode.nodeSubType !== 'DECISION_YES_NO') ? 'active' : ''}`}
                        onClick={() => handleSwitchNodeSubType('RULE_GATE')}
                      >
                        ⚡ Field Rule
                      </button>
                    </div>

                    <div className="sd-wfg-field-group">
                      <label className="sd-wfg-label">Target Approving Department</label>
                      <select
                        id="select-wfg-node-department"
                        className="sd-input sd-input-sm"
                        value={selectedNode.department}
                        onChange={(e) => {
                          const newDept = e.target.value;
                          updateStageNode(selectedNode.id, (n) => ({
                            ...n,
                            department: newDept,
                            label: n.label?.includes(n.department)
                              ? n.label.replace(n.department, newDept)
                              : `${newDept} Approval`
                          }));
                        }}
                      >
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sd-wfg-field-group">
                      <label className="sd-wfg-label">Node Title / Stage Label</label>
                      <input
                        id="input-wfg-node-label"
                        type="text"
                        className="sd-input sd-input-sm"
                        value={selectedNode.label || ''}
                        onChange={(e) =>
                          updateStageNode(selectedNode.id, { label: e.target.value })
                        }
                        placeholder="e.g., Finance Yes/No Decision"
                      />
                    </div>

                    {/* SLA Turnaround Target */}
                    <div className="sd-wfg-field-group">
                      <label className="sd-wfg-label">SLA Turnaround Deadline (Hours)</label>
                      <div className="sd-wfg-sla-pills">
                        {SLA_PRESETS.map(p => (
                          <button
                            key={p.hours}
                            type="button"
                            className={`sd-wfg-sla-pill ${Number(selectedNode.slaHours) === p.hours ? 'active' : ''}`}
                            onClick={() => updateStageNode(selectedNode.id, { slaHours: p.hours })}
                          >
                            {p.hours}h
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={720}
                          className="sd-input sd-input-sm sd-wfg-sla-custom"
                          value={selectedNode.slaHours || 48}
                          onChange={(e) =>
                            updateStageNode(selectedNode.id, { slaHours: Math.max(1, parseInt(e.target.value, 10) || 24) })
                          }
                          title="Custom SLA Hours"
                        />
                      </div>
                    </div>

                    <label className="sd-wfg-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedNode.requirePki !== false}
                        onChange={(e) =>
                          updateStageNode(selectedNode.id, { requirePki: e.target.checked })
                        }
                      />
                      <span>Require X.509 RSA-2048 Digital Signature Stamp</span>
                    </label>
                  </div>

                  {/* DEDICATED YES / NO DECISION BRANCH CONFIGURATOR */}
                  {selectedNode.nodeSubType === 'DECISION_YES_NO' && (
                    <div className="sd-wfg-inspector-card yesno-card">
                      <div className="sd-wfg-card-header">
                        <div className="sd-wfg-rule-header-title">
                          <HelpCircle size={14} className="sd-wfg-yesno-icon" />
                          <span>Yes / No Decision Paths</span>
                        </div>
                        <span className="sd-wfg-yesno-gate-tag">✓ YES / ✕ NO</span>
                      </div>

                      <div className="sd-wfg-field-group">
                        <label className="sd-wfg-label">Decision Question Displayed on Node</label>
                        <input
                          type="text"
                          className="sd-input sd-input-sm"
                          value={selectedNode.decisionQuestion || ''}
                          onChange={(e) =>
                            updateStageNode(selectedNode.id, { decisionQuestion: e.target.value })
                          }
                          placeholder="e.g., Is Budget Approved by Department Head?"
                        />
                      </div>

                      {/* YES Branch Box */}
                      <div className="sd-wfg-branch-config-box yes">
                        <div className="sd-wfg-branch-config-title">
                          <Check size={13} />
                          <strong>IF YES (Approved / True Path)</strong>
                        </div>
                        <p className="sd-wfg-branch-config-desc">
                          Proceeds forward along the green <strong>✓ YES</strong> line to the next stage in the workflow.
                        </p>
                      </div>

                      {/* NO Branch Box */}
                      <div className="sd-wfg-branch-config-box no">
                        <div className="sd-wfg-branch-config-title">
                          <X size={13} />
                          <strong>IF NO (Rejected / False Path)</strong>
                        </div>
                        <div className="sd-wfg-field-group" style={{ marginTop: 6 }}>
                          <label className="sd-wfg-label">Action When Answer is NO:</label>
                          <select
                            className="sd-input sd-input-sm"
                            value={selectedNode.noAction || 'ROUTE_DEPT'}
                            onChange={(e) => {
                              const act = e.target.value;
                              updateStageNode(selectedNode.id, (n) => ({
                                ...n,
                                noAction: act,
                                condition: {
                                  ...(n.condition || {}),
                                  enabled: true,
                                  elseAction: act === 'ROUTE_DEPT' ? 'FALLBACK_DEPT' : 'BYPASS'
                                }
                              }));
                            }}
                          >
                            {YES_NO_NO_ACTIONS.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </div>

                        {(selectedNode.noAction || 'ROUTE_DEPT') === 'ROUTE_DEPT' && (
                          <div className="sd-wfg-field-group" style={{ marginTop: 6 }}>
                            <label className="sd-wfg-label">Route NO Branch to Department:</label>
                            <select
                              className="sd-input sd-input-sm"
                              value={selectedNode.noDepartment || secondaryDept}
                              onChange={(e) => {
                                const dept = e.target.value;
                                updateStageNode(selectedNode.id, (n) => ({
                                  ...n,
                                  noDepartment: dept,
                                  condition: {
                                    ...(n.condition || {}),
                                    fallbackDepartment: dept
                                  }
                                }));
                              }}
                            >
                              {departments.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* FIELD-BASED CONDITIONAL ROUTING RULES BUILDER */}
                  <div className="sd-wfg-inspector-card rule-card">
                    <div className="sd-wfg-card-header">
                      <div className="sd-wfg-rule-header-title">
                        <Split size={14} className="sd-wfg-rule-icon" />
                        <span>Field Conditions (IF / ELSE)</span>
                      </div>
                      <button
                        id="btn-wfg-toggle-condition"
                        type="button"
                        className={`sd-wfg-rule-switch ${selectedNode.condition?.enabled ? 'is-on' : ''}`}
                        onClick={() => handleToggleNodeCondition(!selectedNode.condition?.enabled)}
                      >
                        {selectedNode.condition?.enabled ? '⚡ Rules Active' : '+ Enable Rule'}
                      </button>
                    </div>

                    {!selectedNode.condition?.enabled ? (
                      <div className="sd-wfg-rule-empty">
                        <p>
                          Want this stage to trigger based on form answers (e.g., <code>Total Amount &gt; 5000</code>) or a Yes/No choice? Click below to add a rule.
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSwitchNodeSubType('DECISION_YES_NO')}
                          >
                            🔀 Make Yes/No Node
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSwitchNodeSubType('RULE_GATE')}
                          >
                            ⚡ Add Field Rule
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="sd-wfg-rule-builder-body">
                        {/* AND / OR Combiner */}
                        <div className="sd-wfg-logic-bar">
                          <span className="sd-wfg-logic-label">Trigger YES path when:</span>
                          <div className="sd-wfg-logic-pills">
                            <button
                              type="button"
                              className={`sd-wfg-logic-btn ${selectedNode.condition?.logic !== 'OR' ? 'active' : ''}`}
                              onClick={() =>
                                updateStageNode(selectedNode.id, n => ({
                                  ...n,
                                  condition: { ...n.condition, logic: 'AND' }
                                }))
                              }
                            >
                              ALL Match (AND)
                            </button>
                            <button
                              type="button"
                              className={`sd-wfg-logic-btn ${selectedNode.condition?.logic === 'OR' ? 'active' : ''}`}
                              onClick={() =>
                                updateStageNode(selectedNode.id, n => ({
                                  ...n,
                                  condition: { ...n.condition, logic: 'OR' }
                                }))
                              }
                            >
                              ANY Matches (OR)
                            </button>
                          </div>
                        </div>

                        {/* Individual Rule Condition Rows */}
                        <div className="sd-wfg-rules-list">
                          {(selectedNode.condition?.rules || []).map((rule, rIdx) => (
                            <div key={rule.id || rIdx} className="sd-wfg-rule-row-card">
                              <div className="sd-wfg-rule-row-top">
                                <span className="sd-wfg-rule-idx">
                                  {rIdx === 0 ? 'IF' : selectedNode.condition?.logic || 'AND'}
                                </span>
                                <input
                                  type="text"
                                  list="wfg-available-fields-datalist"
                                  className="sd-input sd-input-sm sd-wfg-rule-field-input"
                                  value={rule.field || ''}
                                  onChange={(e) => handleUpdateRuleRow(rule.id, { field: e.target.value })}
                                  placeholder="Field name (e.g. Total Amount)"
                                  title="Select a template field or type any field name"
                                />
                                <button
                                  type="button"
                                  className="sd-wfg-rule-del-btn"
                                  onClick={() => handleRemoveRuleRow(rule.id)}
                                  title="Remove condition"
                                >
                                  <X size={12} />
                                </button>
                              </div>

                              <div className="sd-wfg-rule-row-bottom">
                                <select
                                  className="sd-input sd-input-sm sd-wfg-rule-op-select"
                                  value={rule.operator || '='}
                                  onChange={(e) => handleUpdateRuleRow(rule.id, { operator: e.target.value })}
                                >
                                  {RULE_OPERATORS.map(op => (
                                    <option key={op.value} value={op.value}>{op.label}</option>
                                  ))}
                                </select>

                                {rule.operator !== 'not_empty' && (
                                  <input
                                    type="text"
                                    className="sd-input sd-input-sm sd-wfg-rule-val-input"
                                    value={rule.value ?? ''}
                                    onChange={(e) => handleUpdateRuleRow(rule.id, { value: e.target.value })}
                                    placeholder="Value (e.g. Yes or 5000)"
                                  />
                                )}
                              </div>
                            </div>
                          ))}

                          <datalist id="wfg-available-fields-datalist">
                            {availableFields.map(f => (
                              <option key={f} value={f} />
                            ))}
                          </datalist>
                        </div>

                        <button
                          type="button"
                          className="sd-wfg-add-rule-btn"
                          onClick={handleAddRuleRow}
                        >
                          <Plus size={12} /> Add Another Rule Condition
                        </button>

                        {/* False / Else Action (for non-Decision Rule Gates) */}
                        {selectedNode.nodeSubType !== 'DECISION_YES_NO' && (
                          <div className="sd-wfg-else-box">
                            <label className="sd-wfg-label">When Rule is FALSE (NO / Else Path)</label>
                            <select
                              className="sd-input sd-input-sm"
                              value={selectedNode.condition?.elseAction || 'BYPASS'}
                              onChange={(e) =>
                                updateStageNode(selectedNode.id, n => ({
                                  ...n,
                                  condition: { ...n.condition, elseAction: e.target.value }
                                }))
                              }
                            >
                              <option value="BYPASS">Bypass / Skip This Stage Automatically</option>
                              <option value="FALLBACK_DEPT">Route to Fallback Department Instead</option>
                            </select>

                            {selectedNode.condition?.elseAction === 'FALLBACK_DEPT' && (
                              <div style={{ marginTop: 8 }}>
                                <label className="sd-wfg-label">Fallback Department</label>
                                <select
                                  className="sd-input sd-input-sm"
                                  value={selectedNode.condition?.fallbackDepartment || secondaryDept}
                                  onChange={(e) =>
                                    updateStageNode(selectedNode.id, n => ({
                                      ...n,
                                      condition: { ...n.condition, fallbackDepartment: e.target.value }
                                    }))
                                  }
                                >
                                  {departments.map(d => (
                                    <option key={d.id} value={d.name}>{d.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="sd-wfg-inspector-card">
                  <div className="sd-wfg-card-header">
                    <span className="sd-wfg-card-title">
                      {selectedNode?.type === 'START' ? 'Origin / Submitter Node' : 'Terminal Seal Node'}
                    </span>
                  </div>
                  <p className="sd-wfg-helper-text">
                    {selectedNode?.type === 'START'
                      ? 'Every workflow begins when an authorized user fills the form and stamps their X.509 RSA-2048 digital signature.'
                      : 'Once all active department stages approve the submission, SmartDoc permanently stamps all signatures into the Word document and seals the record.'}
                  </p>
                  <div className="sd-wfg-stage-quick-pick">
                    <span className="sd-wfg-label">Click a Stage to Configure Rules or Yes/No Paths:</span>
                    {stageNodes.map((st, idx) => (
                      <button
                        key={st.id}
                        type="button"
                        className="sd-wfg-stage-jump-btn"
                        onClick={() => setSelectedNodeId(st.id)}
                      >
                        <span>
                          Stage {idx + 1}: {st.department}{' '}
                          {st.nodeSubType === 'DECISION_YES_NO' ? '(Yes/No)' : ''}
                        </span>
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: QUICK DEPARTMENT CHIPS & SAVED WORKFLOW BLUEPRINTS */}
          {rightTab === 'palette' && (
            <div className="sd-wfg-rail-scroll">
              <div className="sd-wfg-inspector-card">
                <div className="sd-wfg-card-header">
                  <span className="sd-wfg-card-title">Saved Workflows Library</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCreateNewWorkflow}
                  >
                    <Plus size={12} /> New
                  </button>
                </div>

                <div className="sd-wfg-blueprints-list">
                  {blueprints.map((bp) => {
                    const bpStages = (bp.nodes || []).filter(n => n.type === 'STAGE');
                    const bpRules = bpStages.filter(s => s.nodeSubType === 'DECISION_YES_NO' || s.condition?.enabled).length;
                    const isActive = !linkedTemplateId && bp.id === activeBlueprintId;
                    return (
                      <div
                        key={bp.id}
                        className={`sd-wfg-blueprint-card ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleLoadBlueprint(bp)}
                      >
                        <div className="sd-wfg-bp-top">
                          <span className="sd-wfg-bp-name">{bp.name}</span>
                          {blueprints.length > 1 && (
                            <button
                              type="button"
                              className="sd-wfg-bp-del"
                              onClick={(e) => handleDeleteBlueprint(bp.id, e)}
                              title="Delete Saved Workflow"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div className="sd-wfg-bp-chain">
                          {bpStages.map(s => s.department).join(' → ') || 'Custom Workflow'}
                        </div>
                        <div className="sd-wfg-bp-meta">
                          <span>{bpStages.length} Stage{bpStages.length === 1 ? '' : 's'}</span>
                          {bpRules > 0 && <span>· 🔀 {bpRules} Yes/No or Rule</span>}
                          <span className="sd-wfg-bp-load-link">Edit Workflow &rarr;</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sd-wfg-inspector-card">
                <div className="sd-wfg-card-header">
                  <span className="sd-wfg-card-title">Quick Add by Department</span>
                </div>
                <p className="sd-wfg-helper-text">
                  Click any department below or drag it onto the center graph to append an approval stage.
                </p>
                <div className="sd-wfg-dept-chips-grid">
                  {departments.map((dept) => (
                    <div key={dept.id} className="sd-wfg-dept-quick-row">
                      <button
                        type="button"
                        className="sd-wfg-dept-chip-btn"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/smartdoc-dept', dept.name);
                          e.dataTransfer.setData('text/smartdoc-node-kind', 'STANDARD');
                        }}
                        onClick={() => handleInsertStageNode({ department: dept.name, nodeSubType: 'APPROVAL' })}
                        title={`Add ${dept.name} approval stage`}
                      >
                        <Folder size={12} className="sd-wfg-dept-chip-icon" />
                        <span className="sd-wfg-dept-chip-name">{dept.name}</span>
                        <span className="sd-wfg-dept-add-tag">+ Stage</span>
                      </button>
                      <button
                        type="button"
                        className="sd-wfg-dept-yesno-btn"
                        onClick={() => handleInsertStageNode({ department: dept.name, nodeSubType: 'DECISION_YES_NO', withCondition: true })}
                        title={`Add ${dept.name} Yes / No Decision node`}
                      >
                        + Yes/No
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
export default WorkflowGraphStudio;
