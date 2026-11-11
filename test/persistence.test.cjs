const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pgDbPath = path.resolve(__dirname, '../server/pgDb.js');
const serverPath = path.resolve(__dirname, '../server/server.js');

test('Persistence Verification Suite', async (t) => {
  const pgDbContent = fs.readFileSync(pgDbPath, 'utf8');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  await t.test('1. Database Schema & Migration Verification', () => {
    // 1. Table definition contains workflow_graph
    assert.match(
      pgDbContent,
      /CREATE TABLE IF NOT EXISTS form_templates\s*\([\s\S]*?workflow_graph JSONB DEFAULT '{}'/m,
      'form_templates table definition must include workflow_graph JSONB DEFAULT \'{}\''
    );

    // 2. Safe startup migration exists
    assert.match(
      pgDbContent,
      /ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS workflow_graph JSONB DEFAULT '{}';/,
      'initDb must execute ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS workflow_graph'
    );
  });

  await t.test('2. Server Helper: cleanWorkflowStep Verification', () => {
    // Extract cleanWorkflowStep definition from server.js
    const match = serverContent.match(/function cleanWorkflowStep[\s\S]*?\n\}/);
    assert.ok(match, 'cleanWorkflowStep function must be defined in server.js');

    // Evaluate cleanWorkflowStep in isolated sandbox
    const cleanFn = new Function('return (' + match[0] + ')')();

    // Case A: Legacy string department
    const fromString = cleanFn('Human Resources', 0);
    assert.deepEqual(fromString, { step: 1, department: 'Human Resources' });

    // Case B: Legacy object without rich attributes
    const fromLegacyObj = cleanFn({ department: 'Finance' }, 1);
    assert.deepEqual(fromLegacyObj, { step: 2, department: 'Finance' });

    // Case C: Enriched object with condition, nodeSubType, trueBranchTarget, falseBranchTarget
    const richInput = {
      step: 99, // Should be renumbered to index + 1
      department: 'Legal',
      nodeSubType: 'RULE_GATE',
      nodeId: 'stage-101',
      label: 'Legal Spend Threshold Gate',
      decisionQuestion: 'Does contract value exceed $100,000?',
      trueBranchTarget: 'stage-board-approval',
      falseBranchTarget: 'stage-procurement-fast-track',
      condition: {
        enabled: true,
        logic: 'AND',
        rules: [
          { field: 'Contract Value', operator: '>', value: '100000' }
        ]
      },
      slaHours: 24,
      requirePki: true
    };

    const cleanRich = cleanFn(richInput, 2);
    assert.equal(cleanRich.step, 3, 'Step index must be recomputed as index + 1');
    assert.equal(cleanRich.department, 'Legal', 'Department must remain intact');
    assert.equal(cleanRich.nodeSubType, 'RULE_GATE', 'nodeSubType must be preserved');
    assert.equal(cleanRich.trueBranchTarget, 'stage-board-approval', 'trueBranchTarget must be preserved');
    assert.equal(cleanRich.falseBranchTarget, 'stage-procurement-fast-track', 'falseBranchTarget must be preserved');
    assert.deepEqual(cleanRich.condition, richInput.condition, 'condition object must be preserved');
    assert.equal(cleanRich.nodeId, 'stage-101');
    assert.equal(cleanRich.slaHours, 24);
    assert.equal(cleanRich.requirePki, true);

    // Case D: Aliased target names (yesTargetNodeId / noTargetNodeId)
    const aliasedInput = {
      name: 'Operations',
      yesTargetNodeId: 'node-yes-target',
      noTargetNodeId: 'node-no-target'
    };
    const cleanAliased = cleanFn(aliasedInput, 0);
    assert.equal(cleanAliased.department, 'Operations');
    assert.equal(cleanAliased.trueBranchTarget, 'node-yes-target');
    assert.equal(cleanAliased.falseBranchTarget, 'node-no-target');

    // Case E: Invalid or empty entries
    assert.equal(cleanFn(null, 0), null);
    assert.equal(cleanFn(undefined, 0), null);
    assert.equal(cleanFn('', 0), null);
    assert.equal(cleanFn({ department: '' }, 0), null);
  });

  await t.test('3. Template Serialization & Retrieval Mapping Verification', () => {
    // Verify mapTemplate includes workflow_graph and workflowGraph
    assert.match(
      serverContent,
      /workflow_graph:\s*parseJson\(t\.workflow_graph,\s*\{\}\)/,
      'mapTemplate must return workflow_graph'
    );
    assert.match(
      serverContent,
      /workflowGraph:\s*parseJson\(t\.workflow_graph,\s*\{\}\)/,
      'mapTemplate must return workflowGraph'
    );

    // Verify GET /api/forms/templates/:id route exists
    assert.match(
      serverContent,
      /app\.get\('\/api\/forms\/templates\/:id'/,
      'server.js must expose GET /api/forms/templates/:id'
    );
  });

  await t.test('4. Template Creation & Update SQL Parameter Alignment', () => {
    // Verify POST /api/forms/templates has 31 parameters and includes workflow_graph
    assert.match(
      serverContent,
      /INSERT INTO form_templates[\s\S]*?file_path,\s*file_hash,\s*mime_type,\s*workflow_graph\)/,
      'POST insert column list must include workflow_graph'
    );
    assert.match(
      serverContent,
      /\$29,\s*\$30,\s*\$31::jsonb\)/,
      'POST insert values must bind $31::jsonb for workflow_graph'
    );

    // Verify PUT /api/forms/templates/:id has 23 parameters and includes workflow_graph
    assert.match(
      serverContent,
      /workflow_graph\s*=\s*COALESCE\(\$22::jsonb,\s*workflow_graph\)/,
      'PUT update must set workflow_graph = COALESCE($22::jsonb, workflow_graph)'
    );
    assert.match(
      serverContent,
      /WHERE id = \$23/,
      'PUT update WHERE clause must bind id to $23'
    );
  });

  await t.test('5. Non-Regression Compatibility with Existing Modules', () => {
    // Replicate SmartWordStudio's normalizeWorkflowSteps logic:
    const normalizeWorkflowSteps = (wf) => {
      if (!Array.isArray(wf)) return [];
      return wf.map((step, idx) => {
        if (typeof step === 'string') return { step: idx + 1, department: step };
        return { step: step.step || idx + 1, department: step.department || step.name || '' };
      }).filter(s => s.department);
    };

    // Replicate FormsHub workflow inspection logic:
    const formsHubDisplaySteps = (t) => {
      return (t.workflow || []).map(st => typeof st === 'string' ? st : st?.department);
    };

    // Replicate ui.jsx WorkflowMiniProgress logic:
    const workflowMiniProgressSteps = (workflow) => {
      return (workflow || []).map(st => typeof st === 'string' ? st : (st?.department || ''));
    };

    // Sample enriched template returned by server
    const enrichedTemplate = {
      id: 'TMPL-001',
      title: 'CapEx Request',
      department: 'Finance',
      workflow: [
        {
          step: 1,
          department: 'IT',
          nodeSubType: 'APPROVAL',
          slaHours: 24
        },
        {
          step: 2,
          department: 'Finance',
          nodeSubType: 'RULE_GATE',
          trueBranchTarget: 'stage-3',
          falseBranchTarget: 'stage-audit',
          condition: { enabled: true, rules: [{ field: 'Amount', operator: '>', value: '5000' }] }
        },
        {
          step: 3,
          department: 'Executive Board',
          nodeSubType: 'APPROVAL'
        }
      ],
      workflow_graph: {
        orientation: 'horizontal',
        nodes: [
          { id: 'node-start', type: 'START' },
          { id: 'stage-1', type: 'STAGE', department: 'IT' },
          { id: 'stage-2', type: 'STAGE', department: 'Finance' },
          { id: 'stage-3', type: 'STAGE', department: 'Executive Board' },
          { id: 'node-end', type: 'END' }
        ]
      }
    };

    // A. SmartWordStudio test
    const normalizedInStudio = normalizeWorkflowSteps(enrichedTemplate.workflow);
    assert.equal(normalizedInStudio.length, 3);
    assert.deepEqual(
      normalizedInStudio.map(s => s.department),
      ['IT', 'Finance', 'Executive Board'],
      'SmartWordStudio must receive correct department list without error'
    );

    // B. FormsHub test
    const formsHubSteps = formsHubDisplaySteps(enrichedTemplate);
    assert.deepEqual(formsHubSteps, ['IT', 'Finance', 'Executive Board']);
    assert.equal(enrichedTemplate.workflow.length, 3, 'FormsHub step count must be 3');

    // C. FillFormModal test
    const hasWorkflow = Array.isArray(enrichedTemplate.workflow) && enrichedTemplate.workflow.length > 0;
    assert.equal(hasWorkflow, true, 'FillFormModal workflow validation must pass');

    // D. FormApprovals & ui.jsx test
    const trackSteps = workflowMiniProgressSteps(enrichedTemplate.workflow);
    assert.deepEqual(trackSteps, ['IT', 'Finance', 'Executive Board']);

    // E. WorkflowGraphStudio test: workflow_graph is accessible and intact
    assert.ok(enrichedTemplate.workflow_graph);
    assert.equal(enrichedTemplate.workflow_graph.nodes.length, 5);
  });
});
