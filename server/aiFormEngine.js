// SmartDoc — Dual Offline AI Form Generation Engine
// 1. Built-in Instant NLP & Semantic Synthesizer (<15ms, 23+ Enterprise Blueprints + Dynamic Custom Field Extractor)
// 2. Local Ollama LLM Integration (http://127.0.0.1:11434 — 100% Offline, Free Local Generative AI)

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || '';

// In-memory ring buffer for Ollama & AI request/response diagnostic logs
const OLLAMA_LOG_BUFFER = [];
const MAX_OLLAMA_LOGS = 50;
let ollamaLogSeq = 1;

export function recordOllamaLog(entry) {
  const item = {
    id: `olog_${Date.now()}_${ollamaLogSeq++}`,
    timestamp: new Date().toISOString(),
    ...entry
  };
  OLLAMA_LOG_BUFFER.unshift(item);
  if (OLLAMA_LOG_BUFFER.length > MAX_OLLAMA_LOGS) {
    OLLAMA_LOG_BUFFER.length = MAX_OLLAMA_LOGS;
  }
  return item;
}

export function getOllamaLogs() {
  return [...OLLAMA_LOG_BUFFER];
}

export function clearOllamaLogs() {
  OLLAMA_LOG_BUFFER.length = 0;
  return { cleared: true };
}

/**
 * Escapes HTML special characters safely
 */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Converts a label into a clean snake_case field key
 */
function toSnakeKey(label, index = 0) {
  const base = String(label || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return base || `custom_field_${index + 1}`;
}

/**
 * Title-cases a phrase nicely
 */
function toTitleCase(str) {
  const minor = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with', 'by', 'at']);
  return String(str || '')
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (/^(id|it|hr|nda|msa|sla|kpi|qa|qc|po|rfq|rfc|vpn|erp|crm|vip|ceo|cfo|cto|iso|ppe|capex|opex|dob|ssn|iban|swift)$/i.test(word)) {
        return word.toUpperCase();
      }
      if (idx > 0 && minor.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Probes Local Ollama Daemon (http://127.0.0.1:11434/api/tags)
 * Returns { online, baseUrl, models, defaultModel }
 */
export async function getOllamaStatus() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { online: false, baseUrl, models: [], defaultModel: '' };
    }

    const data = await res.json();
    const rawModels = Array.isArray(data?.models) ? data.models : [];

    // Filter out embedding-only models so only generative text/chat models are offered
    const generativeModels = rawModels
      .map(m => m.name || m.model)
      .filter(Boolean)
      .filter(name => !/embed|bge-|all-minilm|snowflake-arctic-embed/i.test(name));

    const models = generativeModels.length > 0
      ? generativeModels
      : rawModels.map(m => m.name || m.model).filter(Boolean);

    const envModel = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
    const defaultModel = (envModel && models.includes(envModel))
      ? envModel
      : (models[0] || envModel || 'llama3.2:latest');

    return {
      online: true,
      baseUrl,
      models,
      defaultModel
    };
  } catch {
    clearTimeout(timeout);
    return {
      online: false,
      baseUrl,
      models: [],
      defaultModel: process.env.OLLAMA_MODEL || ''
    };
  }
}

/**
 * Dynamic NLP Custom Field Extractor
 * Parses natural language prompts for explicit field requests, parenthetical dropdown options,
 * data types (date, number, dropdown, checkbox, textarea, text), and mandatory/optional flags.
 */
export function extractCustomFieldsFromPrompt(prompt, style = 'form') {
  const raw = String(prompt || '').trim();
  if (!raw) return [];

  const triggerMatch = raw.match(/(?:\bwith\b|\bincluding\b|\bcontaining\b|\bhaving\b|\bfields\s*:|\binputs\s*:|\bcapture\b|\bcollect\b)\s+([\s\S]+)$/i);
  let segment = triggerMatch ? triggerMatch[1] : '';

  if (!segment && (raw.split(',').length >= 3 || raw.includes('\n'))) {
    segment = raw.replace(/^(?:create|generate|make|build|design|draft|formulate|prepare)\s+(?:a|an|the)?\s*[^,:]+(?:form|checklist|contract|agreement|template|sheet|log|report)?\s*(?:for|with|:)?\s*/i, '');
  }

  if (!segment) return [];

  segment = segment.replace(/(?:,?\s*(?:and\s+)?|\.\s+)(?:sequential\s+|dual\s+|multi-tier\s+|final\s+)?(?:approval|sign-off|authorization|review|signature)s?\s+(?:by|from|for)\s+[^.]*\.?\s*$/i, '');

  const tokens = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);

    if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n' || ch === '•')) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  const expandedTokens = [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/^(?:and|also|plus)\s+/i, '').trim();
    if (!cleaned) continue;
    if (/\bstart\s+and\s+end\s+dates?\b/i.test(cleaned)) {
      expandedTokens.push('Start Date');
      expandedTokens.push('End Date');
      continue;
    }
    if (
      /\band\b/i.test(cleaned) &&
      !cleaned.includes('(') &&
      !/\b(terms and conditions|health and safety|research and development|profit and loss|name and address|date and time|reason and handover|roles and responsibilities)\b/i.test(cleaned) &&
      cleaned.split(/\s+and\s+/i).length === 2 &&
      cleaned.length > 28
    ) {
      const parts = cleaned.split(/\s+and\s+/i);
      expandedTokens.push(parts[0].trim());
      expandedTokens.push(parts[1].trim());
    } else {
      expandedTokens.push(cleaned);
    }
  }

  const extracted = [];
  const usedKeys = new Set();

  expandedTokens.forEach((rawToken, idx) => {
    let item = rawToken
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/[.]+$/, '')
      .trim();

    if (!item || item.length < 2 || item.length > 95) return;

    if (
      /^(?:signature\s+(?:slots?|blocks?)|digital\s+signatures?|approval\s+chain|workflow|itemized\s+.*table|criteria\s+table|evaluation\s+table|pass\/fail\s+table|both\s+parties)$/i.test(item) ||
      /^(?:human\s+resources|it\s*&\s*systems|finance\s*&\s*accounting|legal\s*&\s*compliance|executive\s+management|operations)$/i.test(item) ||
      /\b(?:approval|sign-?off|signatures?|signature\s+blocks?|table|matrix)\s*$/i.test(item) ||
      /^approval\s+(?:by|from)\b/i.test(item)
    ) {
      return;
    }

    const lower = item.toLowerCase();
    const isOptional = /\boptional\b/i.test(lower);
    item = item.replace(/\(\s*optional\s*\)/gi, '').replace(/\boptional\b/gi, '').trim();

    let customOptions = [];
    const parenMatch = item.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inside = parenMatch[1].trim();
      if (inside.includes(',') || inside.includes('/')) {
        customOptions = inside
          .split(/[,/]/)
          .map(s => s.trim())
          .filter(Boolean);
        item = item.replace(parenMatch[0], '').trim();
      }
    }

    let type = 'text';
    if (/\b(checkbox|check box|tick box|confirm|confirmation|agree|agreement|consent|acknowledge|acknowledgment|certify|declaration|verification)\b/i.test(lower)) {
      type = 'checkbox';
    } else if (customOptions.length >= 2 || /\b(dropdown|select|choice|category|classification|type|status|priority|urgency|rating|level|grade|blood group|gender|currency|shift|tier|mode|method)\b/i.test(lower)) {
      type = 'dropdown';
    } else if (/\b(date|dob|birth|day|deadline|effective|expiry|expiration|schedule|when|start|end|from|until)\b/i.test(lower) && !/\b(days|hours|number|count)\b/i.test(lower)) {
      type = 'date';
    } else if (/\b(textarea|paragraph|long text|description|justification|reason|summary|notes|remarks|comments|details|plan|scope|history|feedback|observations|remediation|achievements|goals|objectives|address|symptoms|incident details)\b/i.test(lower)) {
      type = 'textarea';
    } else if (/\b(number|numeric|amount|cost|price|budget|total|qty|quantity|count|days|hours|age|weight|height|score|rate|salary|fee|percentage|year|years|duration|mileage|distance)\b/i.test(lower)) {
      type = 'number';
    }

    let cleanLabel = item
      .replace(/\b(dropdown|select box|checkbox|check box|textarea|text area|text field|input field|number field|date picker|field|input|box)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanLabel || cleanLabel.length < 2) return;

    if (type === 'dropdown' && customOptions.length === 0) {
      const l = cleanLabel.toLowerCase();
      if (l.includes('priority') || l.includes('urgency') || l.includes('severity')) {
        customOptions = ['Low', 'Standard / Medium', 'High Priority', 'Critical / Immediate'];
      } else if (l.includes('blood')) {
        customOptions = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
      } else if (l.includes('currency')) {
        customOptions = ['USD ($)', 'EUR (€)', 'GBP (£)', 'AED', 'PKR', 'CAD ($)'];
      } else if (l.includes('gender') || l.includes('sex')) {
        customOptions = ['Male', 'Female', 'Prefer Not to Say'];
      } else if (l.includes('rating') || l.includes('score') || l.includes('grade')) {
        customOptions = ['5 - Exceptional', '4 - Exceeds Expectations', '3 - Meets Expectations', '2 - Needs Improvement', '1 - Unsatisfactory'];
      } else if (l.includes('status')) {
        customOptions = ['Active / Compliant', 'Pending Review', 'Conditional / Action Needed', 'Closed'];
      } else if (l.includes('shift')) {
        customOptions = ['Morning Shift (08:00 - 16:00)', 'Evening Shift (16:00 - 00:00)', 'Night Shift (00:00 - 08:00)', 'Weekend / Holiday'];
      } else if (l.includes('payment') || l.includes('method')) {
        customOptions = ['Corporate Bank Transfer', 'Corporate Credit Card', 'Petty Cash', 'Payroll Reimbursement'];
      } else {
        customOptions = ['Option 1 (Standard)', 'Option 2 (Specialized)', 'Option 3 (Other)'];
      }
    }

    if (type === 'checkbox' && cleanLabel.length < 45 && !/^i\s+(confirm|agree|certify|acknowledge)/i.test(cleanLabel)) {
      cleanLabel = `I confirm and acknowledge: ${toTitleCase(cleanLabel)}`;
    } else {
      cleanLabel = toTitleCase(cleanLabel);
    }

    let key = toSnakeKey(cleanLabel, idx);
    while (usedKeys.has(key)) {
      key = `${key}_${idx + 1}`;
    }
    usedKeys.add(key);

    const mode = style === 'contract' && type === 'text' ? 'placeholder' : 'input';

    extracted.push({
      key,
      label: cleanLabel,
      type: mode === 'placeholder' ? 'text' : type,
      required: !isOptional,
      mode,
      bold: type === 'number' && /total|amount|budget|days/i.test(cleanLabel),
      width: null,
      options: type === 'dropdown' ? customOptions : undefined,
      description: `${cleanLabel} (${type === 'dropdown' ? 'select one option' : type})`
    });
  });

  return extracted;
}

/**
 * Extracts approval workflow departments mentioned in the prompt
 */
function extractWorkflowFromPrompt(prompt, fallbackDept = 'Administration') {
  const p = String(prompt || '').toLowerCase();
  const matched = [];
  const deptMatchers = [
    { name: 'Human Resources', re: /\b(hr|human resources|people ops|personnel)\b/i },
    { name: 'IT & Systems', re: /\b(it|it\s*&\s*systems|information technology|cybersecurity|infosec|sysadmin)\b/i },
    { name: 'Finance & Accounting', re: /\b(finance|accounting|accounts|treasury|billing|payroll)\b/i },
    { name: 'Legal & Compliance', re: /\b(legal|compliance|counsel|governance|regulatory)\b/i },
    { name: 'Operations', re: /\b(operations|facilities|safety|hse|logistics|quality|qa)\b/i },
    { name: 'Executive Management', re: /\b(executive|management|director|ceo|cfo|vp|board)\b/i },
    { name: 'Procurement', re: /\b(procurement|purchasing|vendor management)\b/i }
  ];

  const approvalClause = p.match(/(?:approval|approved|sign-off|authorized|reviewed)\s+(?:by|from)\s+([^.]+)/i);
  const targetText = approvalClause ? approvalClause[1] : '';

  if (targetText) {
    for (const dm of deptMatchers) {
      if (dm.re.test(targetText) && !matched.includes(dm.name)) {
        matched.push(dm.name);
      }
    }
  }

  return matched.length > 0 ? matched : [fallbackDept];
}

/**
 * Merges base blueprint fields with any extra custom fields parsed from the user's prompt
 */
function mergeBlueprintWithCustomFields(baseFields, customFields) {
  if (!customFields || customFields.length === 0) return baseFields;
  const result = [...baseFields];

  const tokenizeWords = (str) =>
    String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'full', 'form', 'field', 'input'].includes(w));

  for (const cf of customFields) {
    const cfWords = tokenizeWords(cf.label);
    const alreadyExists = result.some(bf => {
      if (bf.key === cf.key) return true;
      const bfWords = tokenizeWords(bf.label);
      const overlap = cfWords.filter(w => bfWords.includes(w));
      return overlap.length > 0 && (overlap.length >= Math.min(cfWords.length, bfWords.length) || (bf.type === cf.type && overlap.length >= 1));
    });

    if (!alreadyExists) {
      const lastCheckboxIdx = result.findIndex(f => f.type === 'checkbox');
      if (lastCheckboxIdx !== -1 && cf.type !== 'checkbox') {
        result.splice(lastCheckboxIdx, 0, cf);
      } else {
        result.push(cf);
      }
    }
  }
  return result;
}

/**
 * Renders field tags one per paragraph line (matching Manual Mode "Enter" line breaks with zero inline margin/padding)
 */
function renderFieldRowsHtml(fieldsList) {
  if (!fieldsList || fieldsList.length === 0) return '';
  return fieldsList.map(f => `<p>{{${f.key}}} </p>`).join('\n');
}

/**
 * Renders the top document header block using only Manual Mode formatting and line breaks
 */
function renderDocumentHeader(title, includeHeaderMeta = true) {
  const metaHtml = includeHeaderMeta
    ? `<p style="text-align: center;">Form ID: <strong>{{Form ID}}</strong> · Department: <strong>{{Department}}</strong> · Date: <strong>{{Submitted Date}}</strong> · Version: <strong>{{Version}}</strong></p>\n<p><br/></p>`
    : `<p><br/></p>`;

  return `<h1 style="text-align: center;">${esc(title)}</h1>\n${metaHtml}`;
}

/**
 * Renders an optional executive instructions line using standard Manual Mode paragraph + line break
 */
function renderInstructionsBanner(purposeText) {
  return `<p><strong>Instructions & Governance Notice:</strong> <em>${esc(purposeText)} All mandatory fields marked with * Required must be completed prior to digital signature and workflow routing.</em></p>\n<p><br/></p>`;
}

/**
 * Renders an optional "For Official / Department Review Only" verification table
 */
function renderOfficialUseSection(workflow = []) {
  const approverDept = workflow[0] || 'Department Head';
  return `<p><br/></p>
<h3>Official Review & Verification Summary</h3>
<table>
  <tbody>
    <tr>
      <td><strong>Reviewing Authority:</strong></td>
      <td>${esc(approverDept)}</td>
      <td><strong>Compliance Verification:</strong></td>
      <td>[ ] Verified   [ ] Exception</td>
    </tr>
    <tr>
      <td><strong>Budget / Policy Code:</strong></td>
      <td></td>
      <td><strong>Audit Reference:</strong></td>
      <td>{{Form ID}}</td>
    </tr>
  </tbody>
</table>`;
}

/**
 * Renders multi-tier digital signature blocks matching Manual Mode (each signature on its own paragraph line at default 100% width)
 */
function renderSignaturesBlock(workflow = [], submitterTitle = 'Applicant Digital Signature', sectionNumber = 4) {
  const sigLines = [
    '<p>{{Signature: Submitter}}</p>',
    ...(workflow || []).map(dept => `<p>{{Signature: ${esc(dept)}}}</p>`)
  ];
  return `<p><br/></p>
<h3>${sectionNumber}. Authorization & Digital Sign-Off</h3>
${sigLines.join('\n')}`;
}

/**
 * Offline Smart Prompt Enhancer
 * Expands a brief 2-5 word topic into a comprehensive, well-structured prompt specification
 */
export function enhancePromptOffline(shortPrompt, department = 'General', style = 'form') {
  const raw = String(shortPrompt || '').trim();
  if (!raw) {
    return 'Create an enterprise request and approval form with applicant full name, employee ID, submission date, request category dropdown, priority level dropdown, detailed business justification textarea, compliance acknowledgment checkbox, and department head approval.';
  }
  const p = raw.toLowerCase();

  if (p.includes('leave') || p.includes('vacation') || p.includes('sick') || p.includes('absence')) {
    return 'Create an Employee Leave Request & Handover Form with employee full name, staff payroll ID, department unit, leave classification dropdown (Annual Vacation, Sick / Medical Leave, Casual Personal Leave, Compassionate Leave, Parental Leave), first day of leave, last day of leave, total working days, designated handover colleague, emergency contact details, handover plan textarea, and HR approval.';
  }
  if (p.includes('nda') || p.includes('non-disclosure') || p.includes('confidential')) {
    return 'Draft a formal Mutual Non-Disclosure & Confidentiality Agreement (NDA) between two commercial parties with effective date, disclosing party legal name, receiving party legal name, governing law jurisdiction, confidentiality term duration (years), commercial purpose & scope of disclosure, non-disclosure obligations acknowledgment checkbox, and signature blocks for both parties.';
  }
  if (p.includes('expense') || p.includes('reimbursement') || p.includes('travel') || p.includes('claim')) {
    return 'Design a Travel & Business Expense Reimbursement Claim Form with claimant full name, employee ID, claim date, expense category dropdown (Flights & Lodging, Client Meals, Local Transport, Conference & Training), billing currency dropdown (USD, EUR, GBP, AED), total claimed amount, itemized expense breakdown table, business purpose justification, original receipts declaration checkbox, and Finance approval.';
  }
  if (p.includes('equipment') || p.includes('hardware') || p.includes('laptop') || p.includes('asset')) {
    return 'Create an IT Equipment & Hardware Requisition Form with requester full name, job designation, date required, hardware category dropdown (MacBook Pro, Windows Workstation, 4K Display Monitor, Docking & Accessories, Mobile Device), priority SLA dropdown, estimated budget cost, operational justification textarea, acceptable use policy checkbox, and sequential approval by IT & Systems and Finance.';
  }
  if (p.includes('onboarding') || p.includes('new hire') || p.includes('joining')) {
    return 'Create a New Hire Onboarding & Provisioning Form with employee full name, job title, joining date, reporting manager, workstation preference dropdown (MacOS, Windows, Linux), badge & building access level dropdown, provisioning checklist table (Email, SSO, Laptop, VPN, ERP), special setup notes, and approval by Human Resources and IT & Systems.';
  }
  if (p.includes('offboarding') || p.includes('exit') || p.includes('resignation') || p.includes('clearance')) {
    return 'Create an Employee Offboarding & Exit Clearance Form with employee full name, staff ID, last working day, separation type dropdown (Resignation, Retirement, End of Contract, Internal Transfer), forwarding contact email, asset return & clearance checklist table, knowledge handover summary textarea, exit declaration checkbox, and approval by Human Resources and IT & Systems.';
  }
  if (p.includes('access') || p.includes('permission') || p.includes('vpn') || p.includes('login')) {
    return 'Create a System, Network & Cloud Access Authorization Request with user full name, job role, request date, target system environment dropdown (Production Database, Cloud AWS/GCP, Enterprise ERP, Git / CI-CD, CRM), privilege level dropdown (Read-Only, Standard Operator, Elevated Admin, Temporary 30-Day), security justification textarea, cybersecurity compliance checkbox, and IT & Systems approval.';
  }
  if (p.includes('change') || p.includes('deployment') || p.includes('rfc') || p.includes('release')) {
    return 'Create an IT Change Management & Production Deployment Request (RFC) with change owner name, target release date, system affected, change risk level dropdown (Low - Minor Patch, Medium - Standard Release, High - Core Architecture, Emergency Hotfix), impact & outage duration (minutes), implementation & rollback plan textarea, QA verification checkbox, and IT & Systems approval.';
  }
  if (p.includes('incident') || p.includes('accident') || p.includes('injury') || p.includes('hazard')) {
    return 'Create a Workplace Incident, Injury & Safety Hazard Report with reporter full name, incident date, exact location / facility zone, incident severity dropdown (Near Miss, Minor First Aid, Property Damage, Lost Time Injury, Critical Emergency), witnesses involved, detailed incident narrative textarea, immediate corrective actions taken, safety verification checkbox, and Operations and HR approval.';
  }
  if (p.includes('checklist') || p.includes('inspection') || p.includes('audit') || p.includes('safety')) {
    return 'Generate a Facility Safety, Quality & Operations Inspection Checklist with lead inspector name, inspection date, audit category dropdown (Monthly Safety Audit, ISO Quality Check, Fire & Emergency Readiness, Equipment Calibration), facility zone, overall compliance rating dropdown, multi-point pass/fail inspection table, corrective remediation plan textarea, and Operations approval.';
  }
  if (p.includes('purchase') || p.includes('procurement') || p.includes('vendor') || p.includes('po')) {
    return 'Create a Purchase Requisition & Vendor Selection Form with requester name, cost center code, required delivery date, preferred vendor name, procurement type dropdown (Hardware & Capital Goods, Software & Subscriptions, Professional Services, Facility Supplies), total order value, itemized bill of quantities table, sole-source / vendor justification textarea, budget compliance checkbox, and Finance approval.';
  }

  const cleanTopic = toTitleCase(raw.replace(/^(create|generate|make|build|design|a|an|the)\s+/i, ''));
  return `Create a comprehensive ${cleanTopic}${/form|checklist|agreement|contract|report/i.test(cleanTopic) ? '' : ' Form'} for ${department || 'the organization'} with applicant full name, reference ID, submission date, classification category dropdown, priority status dropdown, detailed specification and justification notes, compliance declaration checkbox, and departmental approval sign-off.`;
}

/**
 * Primary Offline Smart Form Synthesizer (<15ms)
 * Synthesizes complete, high-fidelity corporate forms, legal contracts, checklists, and policy memos
 */
export function synthesizeFormTemplate({
  prompt,
  department = 'General',
  style = 'form',
  complexity = 'standard',
  sections = {}
}) {
  const p = String(prompt || '').toLowerCase();
  // Strip parenthetical dropdown options and focus on the main topic clause so option values like "(..., Training)" never misfire domain detection
  const pWithoutParens = p.replace(/\([^)]*\)/g, ' ');
  const pMainTopic = pWithoutParens.split(/\b(?:with|including|containing|having|fields:)\b/i)[0] || pWithoutParens;
  const customExtractedFields = extractCustomFieldsFromPrompt(prompt, style);

  const isNda = pMainTopic.includes('nda') || pMainTopic.includes('non-disclosure') || pMainTopic.includes('confidentiality');
  const isMemo = style === 'memo' || pMainTopic.includes('memo') || pMainTopic.includes('memorandum') || pMainTopic.includes('circular') || pMainTopic.includes('policy directive');
  const isContract = style === 'contract' || isNda || pMainTopic.includes('agreement') || pMainTopic.includes('contract') || pMainTopic.includes('msa') || pMainTopic.includes('statement of work') || pMainTopic.includes('covenant');
  const isChecklist = style === 'checklist' || pMainTopic.includes('checklist') || pMainTopic.includes('inspection') || pMainTopic.includes('audit');
  const isExpense = pMainTopic.includes('expense') || pMainTopic.includes('reimbursement') || pMainTopic.includes('travel') || pMainTopic.includes('mileage claim') || pMainTopic.includes('per diem');
  const isPettyCash = pMainTopic.includes('petty cash') || pMainTopic.includes('cash advance') || pMainTopic.includes('imprest') || pMainTopic.includes('voucher');
  const isCapex = pMainTopic.includes('capex') || pMainTopic.includes('capital expenditure') || pMainTopic.includes('investment approval');
  const isProcurement = pMainTopic.includes('purchase') || pMainTopic.includes('procurement') || pMainTopic.includes('vendor') || pMainTopic.includes('supplier') || pMainTopic.includes('quotation') || pMainTopic.includes('rfq');
  const isEquipment = pMainTopic.includes('equipment') || pMainTopic.includes('hardware') || pMainTopic.includes('laptop') || pMainTopic.includes('macbook') || pMainTopic.includes('workstation') || pMainTopic.includes('monitor');
  const isSoftware = pMainTopic.includes('software') || pMainTopic.includes('license') || pMainTopic.includes('saas') || pMainTopic.includes('subscription');
  const isChangeRequest = pMainTopic.includes('change request') || pMainTopic.includes('rfc') || pMainTopic.includes('deployment') || pMainTopic.includes('production release') || pMainTopic.includes('change management');
  const isAccess = pMainTopic.includes('access') || pMainTopic.includes('permission') || pMainTopic.includes('privilege') || pMainTopic.includes('vpn') || pMainTopic.includes('login') || pMainTopic.includes('account');
  const isLeave = pMainTopic.includes('leave') || pMainTopic.includes('vacation') || pMainTopic.includes('time off') || pMainTopic.includes('absence') || pMainTopic.includes('sick') || pMainTopic.includes('maternity') || pMainTopic.includes('paternity') || pMainTopic.includes('holiday');
  const isPerformance = pMainTopic.includes('performance') || pMainTopic.includes('appraisal') || pMainTopic.includes('kpi') || pMainTopic.includes('evaluation') || (pMainTopic.includes('review') && pMainTopic.includes('employee'));
  const isOnboarding = pMainTopic.includes('onboarding') || pMainTopic.includes('new hire') || pMainTopic.includes('induction') || pMainTopic.includes('orientation') || pMainTopic.includes('joining');
  const isOffboarding = pMainTopic.includes('offboarding') || pMainTopic.includes('exit') || pMainTopic.includes('resignation') || pMainTopic.includes('termination') || pMainTopic.includes('clearance');
  const isOvertime = pMainTopic.includes('overtime') || pMainTopic.includes('shift allowance') || pMainTopic.includes('extra hours') || pMainTopic.includes('timesheet');
  const isHiring = pMainTopic.includes('hiring') || pMainTopic.includes('recruitment') || pMainTopic.includes('headcount') || pMainTopic.includes('job requisition') || pMainTopic.includes('vacancy');
  const isTraining = !isExpense && (pMainTopic.includes('training') || pMainTopic.includes('certification') || pMainTopic.includes('workshop') || pMainTopic.includes('course') || pMainTopic.includes('seminar'));
  const isIncident = pMainTopic.includes('incident') || pMainTopic.includes('accident') || pMainTopic.includes('hazard') || pMainTopic.includes('injury') || pMainTopic.includes('near miss') || pMainTopic.includes('breach');
  const isVisitor = pMainTopic.includes('visitor') || pMainTopic.includes('contractor') || pMainTopic.includes('work permit') || pMainTopic.includes('site access') || pMainTopic.includes('gate pass');
  const isVehicle = pMainTopic.includes('vehicle') || pMainTopic.includes('fleet') || pMainTopic.includes('driver') || pMainTopic.includes('fuel log') || pMainTopic.includes('dispatch');
  const isComplaint = pMainTopic.includes('complaint') || pMainTopic.includes('grievance') || pMainTopic.includes('customer feedback') || pMainTopic.includes('escalation') || pMainTopic.includes('refund');

  const matchedKnownArchetype =
    isNda || isMemo || isContract || isChecklist || isLeave || isPerformance ||
    isOnboarding || isOffboarding || isTraining || isOvertime || isHiring ||
    isExpense || isPettyCash || isCapex || isProcurement || isEquipment ||
    isSoftware || isChangeRequest || isAccess || isIncident || isVisitor ||
    isVehicle || isComplaint;

  let title = '';
  if (isNda) title = 'Mutual Non-Disclosure & Confidentiality Agreement';
  else if (isMemo) title = 'Official Corporate Policy Directive & Memorandum';
  else if (isLeave) title = 'Employee Leave Request & Handover Form';
  else if (isPerformance) title = 'Employee Performance Appraisal & KPI Review';
  else if (isOnboarding) title = 'New Hire Onboarding & Provisioning Request';
  else if (isOffboarding) title = 'Employee Offboarding & Exit Clearance Form';
  else if (isTraining) title = 'Employee Training & Certification Sponsorship Request';
  else if (isOvertime) title = 'Overtime & Shift Allowance Authorization Form';
  else if (isHiring) title = 'Job Requisition & Headcount Approval Form';
  else if (isExpense) title = 'Travel & Business Expense Reimbursement Claim';
  else if (isPettyCash) title = 'Petty Cash & Advance Disbursement Voucher';
  else if (isCapex) title = 'Capital Expenditure (CapEx) & Budget Authorization';
  else if (isProcurement) title = 'Purchase Requisition & Vendor Approval Form';
  else if (isEquipment) title = 'IT Equipment & Hardware Requisition Form';
  else if (isSoftware) title = 'Software License & SaaS Subscription Request';
  else if (isChangeRequest) title = 'IT Change Management & Deployment Request (RFC)';
  else if (isAccess) title = 'System & Network Access Authorization Request';
  else if (isIncident) title = 'Workplace Incident & Safety Hazard Report';
  else if (isVisitor) title = 'Visitor, Contractor & Site Work Permit';
  else if (isVehicle) title = 'Fleet Vehicle Dispatch & Inspection Log';
  else if (isComplaint) title = 'Service Escalation, Feedback & Grievance Form';
  else if (isChecklist) title = 'Facility Safety & Quality Inspection Checklist';
  else if (isContract) title = 'Master Commercial Service Agreement';
  else {
    const topicClause = String(prompt || '')
      .split(/\b(?:with|including|containing|having|fields:)\b/i)[0]
      .replace(/^(?:please\s+)?(?:create|generate|make|build|design|draft|formulate|prepare)\s+(?:a|an|the)?\s*/i, '')
      .replace(/[.,;]+$/, '')
      .trim();

    if (topicClause.length >= 3 && topicClause.length <= 68) {
      const titled = toTitleCase(topicClause);
      title = /\b(form|checklist|agreement|contract|report|log|permit|voucher|memo|application|request|claim|sheet)\b/i.test(titled)
        ? titled
        : `${titled} Form`;
    } else {
      title = 'Enterprise Request & Approval Form';
    }
  }

  let resolvedDept = department && department !== 'General' ? department : 'General';
  if (resolvedDept === 'General') {
    if (isEquipment || isAccess || isSoftware || isChangeRequest) resolvedDept = 'IT & Systems';
    else if (isExpense || isProcurement || isPettyCash || isCapex) resolvedDept = 'Finance & Accounting';
    else if (isLeave || isPerformance || isOnboarding || isOffboarding || isTraining || isOvertime || isHiring) resolvedDept = 'Human Resources';
    else if (isIncident || isChecklist || isVisitor || isVehicle) resolvedDept = 'Operations';
    else if (isContract || isNda || isMemo) resolvedDept = 'Legal & Compliance';
    else resolvedDept = 'Administration';
  }

  let workflow = [];
  if (isEquipment || isSoftware) workflow = ['IT & Systems', 'Finance & Accounting'];
  else if (isOnboarding || isOffboarding) workflow = ['Human Resources', 'IT & Systems'];
  else if (isCapex || isProcurement || isHiring) workflow = ['Finance & Accounting', 'Executive Management'];
  else if (isIncident) workflow = ['Operations', 'Human Resources'];
  else if (isExpense || isPettyCash) workflow = ['Finance & Accounting'];
  else if (isLeave || isPerformance || isTraining || isOvertime) workflow = ['Human Resources'];
  else if (isAccess || isChangeRequest) workflow = ['IT & Systems'];
  else if (isContract || isNda) workflow = ['Legal & Compliance'];
  else if (isChecklist || isVisitor || isVehicle) workflow = ['Operations'];
  else workflow = extractWorkflowFromPrompt(prompt, resolvedDept);

  const includeHeaderMeta = sections.includeHeaderMeta !== false;
  const includeDeclaration = sections.includeDeclaration !== false;
  const includeOfficialUse = sections.includeOfficialUse === true || complexity === 'comprehensive';
  const includeInstructions = complexity === 'comprehensive';
  const tableMode = sections.includeTable ?? 'auto';

  let fields = [];
  let htmlContent = '';
  const description = `Offline AI-synthesized template (${style}) generated from: "${prompt}"`;

  // 1. LEGAL CONTRACT / NDA
  if (isContract || isNda) {
    const baseFields = [
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, mode: 'placeholder', bold: true, description: 'The legally binding start date of this agreement.' },
      { key: 'party_one_name', label: 'First Party (Disclosing / Client)', type: 'text', required: true, mode: 'placeholder', bold: true, description: 'Full legal entity name of the first party.' },
      { key: 'party_one_address', label: 'First Party Registered Address', type: 'text', required: true, mode: 'placeholder', bold: false, description: 'Principal business address of the first party.' },
      { key: 'party_two_name', label: 'Second Party (Receiving / Counterparty)', type: 'text', required: true, mode: 'placeholder', bold: true, description: 'Full legal entity name of the counterparty.' },
      { key: 'party_two_address', label: 'Second Party Registered Address', type: 'text', required: true, mode: 'placeholder', bold: false, description: 'Principal business address of the counterparty.' },
      { key: 'governing_law', label: 'Governing Jurisdiction', type: 'text', required: true, mode: 'placeholder', bold: true, description: 'State or country laws governing this agreement.' },
      { key: 'term_duration_years', label: 'Agreement Term (Years)', type: 'number', required: true, mode: 'input', bold: true, width: 50, description: 'Duration of legal obligations in years.' },
      { key: 'notice_period_days', label: 'Termination Notice (Days)', type: 'number', required: true, mode: 'input', bold: false, width: 50, description: 'Written notice days required for termination.' },
      { key: 'scope_of_disclosure', label: 'Commercial Scope & Subject Matter', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed commercial purpose, deliverables, or proprietary scope.' }
    ];
    if (includeDeclaration) {
      baseFields.push({
        key: 'confidentiality_agreed',
        label: 'I confirm that I am an authorized corporate signatory and bind the named entity to all covenants herein',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Authorized signatory legal affirmation.'
      });
    }

    fields = mergeBlueprintWithCustomFields(
      complexity === 'compact' ? baseFields.filter(f => !['party_one_address', 'party_two_address', 'notice_period_days'].includes(f.key)) : baseFields,
      customExtractedFields
    );

    const extraCustomFields = fields.filter(f => !baseFields.some(bf => bf.key === f.key));

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner('Complete all highlighted in-text placeholders and commercial schedule fields before executing with PKI digital signatures.') : ''}
<p style="text-align: justify;">This <strong>${esc(title)}</strong> (the <em>"Agreement"</em>) is entered into and made effective as of <strong>{{effective_date}}</strong> (the <em>"Effective Date"</em>), by and between <strong>{{party_one_name}}</strong>${fields.some(f => f.key === 'party_one_address') ? `, with principal offices at {{party_one_address}}` : ''} (<em>"First Party"</em>), and <strong>{{party_two_name}}</strong>${fields.some(f => f.key === 'party_two_address') ? `, with principal offices at {{party_two_address}}` : ''} (<em>"Second Party"</em>).</p>
<p><br/></p>
<h3>1. Purpose & Commercial Scope</h3>
<p style="text-align: justify;">The Parties wish to establish a formal, legally binding relationship and, in connection with this engagement, may disclose proprietary technical, financial, or operational information subject to the terms set forth below:</p>
<p>{{scope_of_disclosure}}</p>
<p><br/></p>
<h3>2. Term, Confidentiality & Obligations</h3>
<p style="text-align: justify;">Each Receiving Party agrees to hold all proprietary disclosures in strict confidence and not to disclose them to any third party without prior written consent. The obligations under this Agreement shall remain in full force and effect for a term of years specified below${fields.some(f => f.key === 'notice_period_days') ? `, subject to written termination notice` : ''}:</p>
<p>{{term_duration_years}}</p>
${fields.some(f => f.key === 'notice_period_days') ? '<p>{{notice_period_days}}</p>' : ''}
<p><br/></p>
<h3>3. Governing Law, Remedies & Severability</h3>
<p style="text-align: justify;">This Agreement and any dispute or claim arising out of or in connection with its subject matter shall be governed by and construed exclusively in accordance with the laws of <strong>{{governing_law}}</strong>. Any breach of confidentiality may entitle the aggrieved Party to immediate injunctive relief in addition to legal remedies.</p>
${extraCustomFields.length > 0 ? `<p><br/></p>
<h3>4. Additional Special Provisions</h3>
${renderFieldRowsHtml(extraCustomFields)}` : ''}
${includeDeclaration ? `<p><br/></p>\n<p>{{confidentiality_agreed}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'First Party / Originator Signatory', extraCustomFields.length > 0 ? 5 : 4)}
`;

  // 2. OFFICIAL CORPORATE MEMO / POLICY DIRECTIVE
  } else if (isMemo) {
    const baseFields = [
      { key: 'memo_to', label: 'To (Target Audience / Division)', type: 'text', required: true, mode: 'input', bold: true, width: 50, description: 'Recipients of this directive.' },
      { key: 'memo_from', label: 'From (Issuing Authority)', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Executive or department issuing memo.' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Date policy takes effect.' },
      { key: 'classification', label: 'Security Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Internal — All Staff', 'Confidential — Department Heads', 'Mandatory Compliance Directive', 'Operational Advisory'], description: 'Distribution sensitivity.' },
      { key: 'executive_summary', label: 'Executive Summary & Policy Objective', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Core purpose and background of the directive.' },
      { key: 'action_items', label: 'Required Departmental Actions & Deadlines', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Concrete compliance actions required from teams.' }
    ];
    if (includeDeclaration) {
      baseFields.push({
        key: 'directive_ack',
        label: 'I confirm this directive has been reviewed for policy alignment and authorized for distribution',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Issuer sign-off.'
      });
    }
    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
<table>
  <tbody>
    <tr>
      <td>{{memo_to}}</td>
      <td>{{memo_from}}</td>
    </tr>
    <tr>
      <td>{{effective_date}}</td>
      <td>{{classification}}</td>
    </tr>
  </tbody>
</table>
<p><br/></p>
<h3>1. Background & Policy Statement</h3>
<p>{{executive_summary}}</p>
<p><br/></p>
<h3>2. Implementation & Required Actions</h3>
<p>{{action_items}}</p>
${renderFieldRowsHtml(fields.filter(f => !baseFields.some(bf => bf.key === f.key)))}
${includeDeclaration ? `<p>{{directive_ack}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Issuing Author Signatory', 3)}
`;

  // 3. AUDIT & INSPECTION CHECKLIST
  } else if (isChecklist) {
    const baseFields = [
      { key: 'inspector_name', label: 'Lead Inspector Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of the evaluating auditor.' },
      { key: 'inspection_date', label: 'Inspection Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Date the assessment was conducted.' },
      { key: 'inspection_type', label: 'Audit Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Routine Monthly Audit', 'ISO / Quality Assurance Review', 'Emergency Safety Inspection', 'Pre-Operational Readiness Check'], description: 'Primary inspection purpose.' },
      { key: 'facility_location', label: 'Facility / Site Zone', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Building, floor, lab, or operational zone inspected.' },
      { key: 'compliance_rating', label: 'Overall Assessment Grade', type: 'dropdown', required: true, mode: 'input', bold: true, width: 50, options: ['Satisfactory — Full Pass (90-100%)', 'Conditional Pass — Minor Remediation (75-89%)', 'Unsatisfactory — Immediate Action Required (<75%)'], description: 'Final compliance grading.' },
      { key: 'next_audit_date', label: 'Next Scheduled Follow-Up Date', type: 'date', required: false, mode: 'input', bold: false, width: 50, description: 'Date for re-inspection or follow-up.' },
      { key: 'findings_summary', label: 'Non-Conformances & Corrective Action Plan (CAPA)', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Summary of findings, root causes, and assigned corrective actions.' }
    ];
    if (includeDeclaration) {
      baseFields.push({
        key: 'audit_declaration',
        label: 'I certify this inspection was conducted objectively in accordance with safety and quality standards',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Inspector compliance sign-off.'
      });
    }

    fields = mergeBlueprintWithCustomFields(
      complexity === 'compact' ? baseFields.filter(f => f.key !== 'next_audit_date') : baseFields,
      customExtractedFields
    );

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner('Evaluate each operational criterion objectively. Record any non-conformance and required Corrective & Preventive Actions (CAPA) in Section 3.') : ''}
<h3>1. Audit Scope & Inspector Metadata</h3>
${renderFieldRowsHtml(fields.filter(f => !['findings_summary', 'audit_declaration'].includes(f.key)))}
${tableMode !== false ? `<p><br/></p>
<h3>2. Standardized Inspection Criteria Matrix</h3>
<table>
  <tbody>
    <tr>
      <td><strong>#</strong></td>
      <td><strong>Inspection Standard / Control Checkpoint</strong></td>
      <td><strong>Evaluation Result</strong></td>
      <td><strong>Inspector Evidence / Notes</strong></td>
    </tr>
    <tr>
      <td>01</td>
      <td>Emergency exits unobstructed, evacuation maps posted, and safety lighting operational</td>
      <td>[ ] Pass   [ ] Fail   [ ] N/A</td>
      <td></td>
    </tr>
    <tr>
      <td>02</td>
      <td>Machinery, hardware, and instrumentation operating within calibrated safety thresholds</td>
      <td>[ ] Pass   [ ] Fail   [ ] N/A</td>
      <td></td>
    </tr>
    <tr>
      <td>03</td>
      <td>Standard Operating Procedures (SOPs) and compliance logs current at workstation</td>
      <td>[ ] Pass   [ ] Fail   [ ] N/A</td>
      <td></td>
    </tr>
    <tr>
      <td>04</td>
      <td>Personal Protective Equipment (PPE) & first-aid stations stocked and accessible</td>
      <td>[ ] Pass   [ ] Fail   [ ] N/A</td>
      <td></td>
    </tr>
    <tr>
      <td>05</td>
      <td>Access controls, visitor logs, and restricted zone security locks verified</td>
      <td>[ ] Pass   [ ] Fail   [ ] N/A</td>
      <td></td>
    </tr>
  </tbody>
</table>` : ''}
<p><br/></p>
<h3>3. Audit Findings & Corrective Action Plan</h3>
<p>{{findings_summary}}</p>
${includeDeclaration ? `<p>{{audit_declaration}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Lead Auditor / Inspector Signature', 4)}
`;

  // 4. EMPLOYEE LEAVE APPLICATION (Strictly NO Itemized Price Table!)
  } else if (isLeave) {
    const baseFields = [
      { key: 'employee_name', label: 'Employee Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of the staff member.' },
      { key: 'employee_id', label: 'Staff / Payroll ID', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Official employee payroll number.' },
      { key: 'job_title', label: 'Designation / Role', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Current job title.' },
      { key: 'leave_type', label: 'Leave Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Annual Vacation Leave', 'Sick / Medical Leave', 'Casual Personal Leave', 'Compassionate / Bereavement', 'Maternity / Paternity Leave', 'Unpaid Leave of Absence'], description: 'Category of requested absence.' },
      { key: 'start_date', label: 'First Day of Leave', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'First date of absence from work.' },
      { key: 'end_date', label: 'Last Day of Leave', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Final date of absence from work.' },
      { key: 'total_days', label: 'Total Working Days Requested', type: 'number', required: true, mode: 'input', bold: true, width: 50, description: 'Exact count of business days requested.' },
      { key: 'handover_colleague', label: 'Designated Handover Colleague', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Colleague covering urgent duties during absence.' },
      { key: 'emergency_contact', label: 'Contact Number While on Leave', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Phone or email reachable for urgent escalations.' },
      { key: 'return_date', label: 'Expected Duty Resumption Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Date employee returns to active duty.' },
      { key: 'leave_reason', label: 'Reason for Leave & Work Handover Plan', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Brief reason for absence and delegation of active responsibilities.' }
    ];
    if (includeDeclaration) {
      baseFields.push({
        key: 'handover_declaration',
        label: 'I confirm my pending duties have been briefed to my covering colleague and I will resume work on the scheduled return date',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Employee handover affirmation.'
      });
    }

    const filteredBase = complexity === 'compact'
      ? baseFields.filter(f => !['job_title', 'emergency_contact', 'return_date'].includes(f.key))
      : baseFields;
    fields = mergeBlueprintWithCustomFields(filteredBase, customExtractedFields);

    const sec1Fields = fields.filter(f => ['employee_name', 'employee_id', 'job_title', 'leave_type'].includes(f.key));
    const sec2Fields = fields.filter(f => !['employee_name', 'employee_id', 'job_title', 'leave_type', 'leave_reason', 'handover_declaration'].includes(f.key));

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner('Submit annual leave requests at least 5 business days in advance. Medical certificates must accompany sick leave exceeding 2 consecutive working days.') : ''}
<h3>1. Employee Profile & Leave Category</h3>
${renderFieldRowsHtml(sec1Fields)}
<p><br/></p>
<h3>2. Absence Schedule & Coverage Arrangement</h3>
${renderFieldRowsHtml(sec2Fields)}
${tableMode === true ? `<p><br/></p>
<h3>Task Delegation & Handover Matrix</h3>
<table>
  <tbody>
    <tr>
      <td><strong>Active Deliverable / Responsibility</strong></td>
      <td><strong>Covering Colleague</strong></td>
      <td><strong>Due Date / Status</strong></td>
    </tr>
    <tr>
      <td>Daily operational inquiries & client escalations</td>
      <td></td>
      <td>Briefed</td>
    </tr>
    <tr>
      <td>Scheduled project milestones & weekly reporting</td>
      <td></td>
      <td>Handed Over</td>
    </tr>
  </tbody>
</table>` : ''}
<p><br/></p>
<h3>3. Handover Details & Employee Declaration</h3>
<p>{{leave_reason}}</p>
${includeDeclaration ? `<p>{{handover_declaration}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Employee Signature', 4)}
`;

  // 5. NEW HIRE ONBOARDING / EMPLOYEE OFFBOARDING
  } else if (isOnboarding || isOffboarding) {
    const baseFields = isOnboarding ? [
      { key: 'employee_name', label: 'New Hire Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of incoming employee.' },
      { key: 'job_title', label: 'Job Title / Designation', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Assigned role.' },
      { key: 'joining_date', label: 'Official Joining Date', type: 'date', required: true, mode: 'input', bold: true, width: 50, description: 'First day of employment.' },
      { key: 'reporting_manager', label: 'Hiring Manager Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Direct supervisor.' },
      { key: 'workstation_os', label: 'Workstation Preference', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['MacBook Pro (macOS)', 'ThinkPad Enterprise (Windows 11)', 'Developer Linux Workstation', 'Standard Desktop Setup'], description: 'Hardware bundle.' },
      { key: 'work_arrangement', label: 'Work Arrangement', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['On-Site Headquarters', 'Hybrid (3 Days On-Site)', 'Remote Distributed'], description: 'Work location mode.' },
      { key: 'provisioning_notes', label: 'Software Licenses, Access Groups & Seating Notes', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Specific repositories, SaaS tools, and security groups needed on Day 1.' }
    ] : [
      { key: 'employee_name', label: 'Departing Employee Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full name of departing staff member.' },
      { key: 'employee_id', label: 'Staff / Payroll ID', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee identification number.' },
      { key: 'last_working_day', label: 'Final Working Date', type: 'date', required: true, mode: 'input', bold: true, width: 50, description: 'Last active day with the company.' },
      { key: 'separation_type', label: 'Separation Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Voluntary Resignation', 'End of Fixed-Term Contract', 'Retirement', 'Internal Departmental Transfer'], description: 'Reason for exit clearance.' },
      { key: 'forwarding_email', label: 'Personal Forwarding Email', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Contact email for final settlement & tax forms.' },
      { key: 'handover_owner', label: 'Knowledge Handover Recipient', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Colleague taking over responsibilities.' },
      { key: 'provisioning_notes', label: 'Handover Status & Returned Company Assets Summary', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'List returned laptops, badges, keys, and completed documentation.' }
    ];

    if (includeDeclaration) {
      baseFields.push({
        key: 'clearance_declaration',
        label: isOnboarding
          ? 'I confirm the new hire background verification is complete and authorize Day-1 IT & facility provisioning'
          : 'I certify that all company property, credentials, and confidential files in my possession have been returned',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Mandatory compliance sign-off.'
      });
    }

    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
<h3>1. Personnel & Employment Details</h3>
${renderFieldRowsHtml(fields.filter(f => !['provisioning_notes', 'clearance_declaration'].includes(f.key)))}
${tableMode !== false ? `<p><br/></p>
<h3>2. ${isOnboarding ? 'IT, Security & Workspace Provisioning Matrix' : 'Departmental Asset & Access De-Provisioning Matrix'}</h3>
<table>
  <tbody>
    <tr>
      <td><strong>Domain</strong></td>
      <td><strong>Action Item / Asset Verification</strong></td>
      <td><strong>Status</strong></td>
    </tr>
    <tr>
      <td><strong>IT & Hardware</strong></td>
      <td>${isOnboarding ? 'Corporate laptop imaged, encrypted, and peripherals assigned' : 'Corporate laptop, charger, monitors, and peripherals returned intact'}</td>
      <td>[ ] Completed   [ ] N/A</td>
    </tr>
    <tr>
      <td><strong>Identity & SSO</strong></td>
      <td>${isOnboarding ? 'Corporate email, SSO, MFA token, and VPN credentials issued' : 'SSO, email forwarding configured, and VPN/cloud tokens revoked'}</td>
      <td>[ ] Completed   [ ] N/A</td>
    </tr>
    <tr>
      <td><strong>Facilities & Badge</strong></td>
      <td>${isOnboarding ? 'Smart ID badge printed, parking pass, and desk assigned' : 'Building access badge, keys, and parking transponder surrendered'}</td>
      <td>[ ] Completed   [ ] N/A</td>
    </tr>
    <tr>
      <td><strong>HR & Payroll</strong></td>
      <td>${isOnboarding ? 'Signed employment contract, NDA, and payroll bank details filed' : 'Leave balance calculated, exit interview held, and final settlement queued'}</td>
      <td>[ ] Completed   [ ] N/A</td>
    </tr>
  </tbody>
</table>` : ''}
<p><br/></p>
<h3>3. Notes & Compliance Sign-Off</h3>
<p>{{provisioning_notes}}</p>
${includeDeclaration ? `<p>{{clearance_declaration}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, isOnboarding ? 'Hiring Manager Signature' : 'Employee Signature', 4)}
`;

  // 6. EMPLOYEE PERFORMANCE APPRAISAL
  } else if (isPerformance) {
    const baseFields = [
      { key: 'employee_name', label: 'Employee Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee undergoing performance appraisal.' },
      { key: 'job_title', label: 'Job Title / Designation', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Current corporate position.' },
      { key: 'review_period', label: 'Appraisal Cycle', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Q1 Quarterly Review', 'Q2 Mid-Year Appraisal', 'Q3 Quarterly Review', 'Annual Year-End Performance Review', 'Probation Completion Review'], description: 'Evaluation period.' },
      { key: 'manager_name', label: 'Evaluating Supervisor', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Direct manager leading evaluation.' },
      { key: 'overall_rating', label: 'Overall Performance Rating', type: 'dropdown', required: true, mode: 'input', bold: true, width: 50, options: ['5 — Exceptional / Role Model', '4 — Exceeds Expectations', '3 — Fully Meets Expectations', '2 — Developing / Needs Improvement', '1 — Unsatisfactory'], description: 'Overall composite appraisal score.' },
      { key: 'promotion_readiness', label: 'Career Progression Recommendation', type: 'dropdown', required: false, mode: 'input', bold: false, width: 50, options: ['Ready for Immediate Promotion', 'On Track — Expand Scope', 'Maintain Current Role & Consolidate', 'Performance Coaching Plan'], description: 'Next career step.' },
      { key: 'achievements_summary', label: 'Key Milestones & Deliverables Accomplished', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Core deliverables and project outcomes achieved during cycle.' },
      { key: 'growth_goals', label: 'Next Cycle OKRs & Professional Development Goals', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Measurable objectives and training targets for the upcoming cycle.' }
    ];
    if (includeDeclaration) {
      baseFields.push({
        key: 'review_acknowledgment',
        label: 'I acknowledge this performance appraisal has been formally discussed between employee and supervisor',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Review discussion acknowledgment.'
      });
    }

    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
<h3>1. Employee & Appraisal Metadata</h3>
${renderFieldRowsHtml(fields.filter(f => !['achievements_summary', 'growth_goals', 'review_acknowledgment'].includes(f.key)))}
${tableMode !== false ? `<p><br/></p>
<h3>2. Core Competency Evaluation Matrix</h3>
<table>
  <tbody>
    <tr>
      <td><strong>Competency Pillar</strong></td>
      <td><strong>Evaluation Benchmark</strong></td>
      <td><strong>Score (1 - 5)</strong></td>
    </tr>
    <tr>
      <td><strong>Execution & Quality</strong></td>
      <td>Delivers accurate, reliable results on schedule with minimal rework</td>
      <td>[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]</td>
    </tr>
    <tr>
      <td><strong>Problem Solving & Initiative</strong></td>
      <td>Identifies bottlenecks proactively and proposes scalable solutions</td>
      <td>[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]</td>
    </tr>
    <tr>
      <td><strong>Collaboration & Leadership</strong></td>
      <td>Communicates clearly across teams and mentors peers constructively</td>
      <td>[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]</td>
    </tr>
  </tbody>
</table>` : ''}
<p><br/></p>
<h3>3. Key Achievements & Next Cycle Objectives</h3>
<p>{{achievements_summary}}</p>
<p>{{growth_goals}}</p>
${includeDeclaration ? `<p>{{review_acknowledgment}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Employee Signature', 4)}
`;

  // 7. SYSTEM ACCESS / CHANGE MANAGEMENT (RFC) / SOFTWARE LICENSE
  } else if (isAccess || isChangeRequest || isSoftware) {
    const baseFields = isChangeRequest ? [
      { key: 'change_owner', label: 'Change Owner / Lead Engineer', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Engineer responsible for execution.' },
      { key: 'deployment_date', label: 'Scheduled Maintenance Date', type: 'date', required: true, mode: 'input', bold: true, width: 50, description: 'Target production release date.' },
      { key: 'target_system', label: 'Affected System / Service', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Application, database, or cluster.' },
      { key: 'risk_classification', label: 'Change Risk Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Low — Pre-Approved Standard Change', 'Medium — Minor Scheduled Release', 'High — Core Infrastructure Change', 'Critical — Emergency Security Hotfix'], description: 'CAB risk tier.' },
      { key: 'downtime_minutes', label: 'Estimated Downtime (Minutes)', type: 'number', required: true, mode: 'input', bold: false, width: 50, description: 'Expected service interruption window.' },
      { key: 'peer_reviewer', label: 'Peer Code / QA Reviewer', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Engineer who verified staging tests.' },
      { key: 'business_justification', label: 'Implementation Steps, Impact Analysis & Rollback Plan', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Step-by-step execution plan and instant back-out procedure if anomalies occur.' }
    ] : [
      { key: 'user_name', label: 'Requester Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'User requesting access or license.' },
      { key: 'job_title', label: 'Job Title / Role', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Role determining entitlement.' },
      { key: 'request_date', label: 'Request Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Filing date.' },
      { key: 'system_category', label: isSoftware ? 'Software / SaaS Application' : 'Target System / Environment', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: isSoftware ? ['Enterprise IDE / JetBrains / Copilot', 'Adobe Creative Cloud Suite', 'Figma / Design Collaboration', 'Cloud Analytics / BI Seat', 'Project Management / Jira Enterprise'] : ['Production Database / Data Warehouse', 'Enterprise ERP / Financial Suite', 'Cloud Infrastructure (AWS / GCP / Azure)', 'Corporate Git / CI-CD Pipelines', 'Customer CRM / Sensitive Records'], description: 'Target resource.' },
      { key: 'access_level', label: isSoftware ? 'License Tier' : 'Requested Privilege Level', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: isSoftware ? ['Standard Individual Seat', 'Pro / Power User License', 'Enterprise Team Floating License', 'Temporary Trial Evaluation'] : ['Read-Only / Auditor Access', 'Standard Operator / Contributor', 'Elevated Admin / Superuser', 'Temporary Emergency Access (14 Days)'], description: 'Entitlement tier.' },
      { key: 'access_duration', label: 'Authorization Duration', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Permanent (Role-Based)', 'Temporary — 30 Days', 'Temporary — 90 Days (Project)', 'Single Maintenance Window'], description: 'Validity duration.' },
      { key: 'business_justification', label: 'Business Need & Technical Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Explain operational tasks requiring this entitlement.' }
    ];

    if (includeDeclaration) {
      baseFields.push({
        key: 'security_agreement',
        label: isChangeRequest
          ? 'I confirm staging tests passed and a verified rollback procedure is ready prior to production deployment'
          : 'I agree to comply with Corporate Information Security, Least-Privilege, and Data Protection Policies',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Security governance sign-off.'
      });
    }

    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner('All access and production change requests are logged under ISO-27001 / SOC-2 security controls. Privileged access is subject to quarterly recertification.') : ''}
<h3>1. Requester & Technical Specifications</h3>
${renderFieldRowsHtml(fields.filter(f => !['business_justification', 'security_agreement'].includes(f.key)))}
<p><br/></p>
<h3>2. ${isChangeRequest ? 'Implementation & Rollback Plan' : 'Operational Justification & Security Compliance'}</h3>
<p>{{business_justification}}</p>
${includeDeclaration ? `<p>{{security_agreement}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Requester Digital Signature', 3)}
`;

  // 8. WORKPLACE INCIDENT / VISITOR PERMIT / COMPLAINT / VEHICLE
  } else if (isIncident || isVisitor || isComplaint || isVehicle) {
    const baseFields = isIncident ? [
      { key: 'reporter_name', label: 'Reporter Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Person reporting the incident.' },
      { key: 'incident_date', label: 'Date of Incident', type: 'date', required: true, mode: 'input', bold: true, width: 50, description: 'Date occurrence took place.' },
      { key: 'incident_location', label: 'Exact Location / Facility Zone', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Site, floor, or room.' },
      { key: 'severity_level', label: 'Incident Classification', type: 'dropdown', required: true, mode: 'input', bold: true, width: 50, options: ['Near Miss / Hazard Observation', 'Minor First-Aid Incident', 'Equipment / Property Damage', 'Environmental Spill / Hazard', 'Critical / Lost-Time Injury'], description: 'HSE severity level.' },
      { key: 'persons_involved', label: 'Involved Personnel / Witnesses', type: 'text', required: false, mode: 'input', bold: false, width: 100, description: 'Names and roles of injured parties or witnesses.' },
      { key: 'narrative_details', label: 'Detailed Incident Description & Immediate Containment Taken', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Chronological account of events, root cause, and immediate safety actions.' }
    ] : isVisitor ? [
      { key: 'visitor_name', label: 'Visitor / Contractor Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full name as shown on government ID.' },
      { key: 'company_organization', label: 'Representing Company / Vendor', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'External organization name.' },
      { key: 'visit_date', label: 'Authorized Visit Date', type: 'date', required: true, mode: 'input', bold: true, width: 50, description: 'Date of facility access.' },
      { key: 'host_employee', label: 'Internal Host / Escort Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Responsible employee escorting visitor.' },
      { key: 'access_zone', label: 'Permitted Facility Zone', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Reception & Conference Rooms Only', 'General Office Floors (Escorted)', 'Data Center / Server Room', 'Warehouse & Loading Bay', 'Plant / Maintenance Work Zone'], description: 'Physical security zone.' },
      { key: 'id_document_ref', label: 'Government ID / Badge Number', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'ID card or passport reference.' },
      { key: 'narrative_details', label: 'Purpose of Visit, Tools Brought & Safety Precautions', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Scope of visit or maintenance work to be performed.' }
    ] : [
      { key: 'reporter_name', label: isVehicle ? 'Assigned Driver Name' : 'Submitted By / Client Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Primary contact name.' },
      { key: 'reference_id', label: isVehicle ? 'Vehicle Registration / Plate #' : 'Case / Invoice Reference #', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Tracking identifier.' },
      { key: 'log_date', label: 'Date Recorded', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Filing date.' },
      { key: 'category_type', label: isVehicle ? 'Dispatch Purpose' : 'Escalation Priority', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: isVehicle ? ['Client Site Delivery', 'Executive Transport', 'Scheduled Maintenance Service', 'Inter-Branch Logistics'] : ['Standard Service Feedback', 'Billing / Invoice Dispute', 'Product Quality Escalation', 'Urgent SLA Breach'], description: 'Classification.' },
      { key: 'narrative_details', label: isVehicle ? 'Route Summary, Odometer Readings & Vehicle Condition Notes' : 'Detailed Description & Requested Resolution', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Full details and resolution steps.' }
    ];

    if (includeDeclaration) {
      baseFields.push({
        key: 'safety_declaration',
        label: 'I confirm that all statements recorded above are accurate and compliant with organizational safety & governance policies',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Mandatory affirmation.'
      });
    }

    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
<h3>1. Primary Identification & Classification</h3>
${renderFieldRowsHtml(fields.filter(f => !['narrative_details', 'safety_declaration'].includes(f.key)))}
<p><br/></p>
<h3>2. Detailed Report & Action Plan</h3>
<p>{{narrative_details}}</p>
${includeDeclaration ? `<p>{{safety_declaration}}</p>` : ''}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Originator Signature', 3)}
`;

  // 9. EXPENSE / PROCUREMENT / EQUIPMENT / OVERTIME / TRAINING / HIRING / CUSTOM
  } else {
    const naturallyNeedsTable =
      isExpense || isProcurement || isEquipment || isPettyCash || isCapex || isOvertime ||
      /\b(itemized|line items|bill of quantities|price table|cost breakdown|expense table)\b/i.test(p);
    const showTable = tableMode === true || (tableMode === 'auto' && naturallyNeedsTable);

    let baseFields = [];

    if (isExpense || isPettyCash) {
      baseFields = [
        { key: 'employee_name', label: 'Claimant Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee submitting reimbursement claim.' },
        { key: 'employee_id', label: 'Staff / Payroll ID', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Unique payroll identification code.' },
        { key: 'claim_date', label: 'Claim Submission Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Date report is filed.' },
        { key: 'expense_category', label: 'Expense Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Flight, Hotel & Business Travel', 'Client Hospitality & Meals', 'Local Mileage & Ground Transport', 'Office Supplies & Software', 'Professional Training & Events'], description: 'Primary expense bucket.' },
        { key: 'currency', label: 'Billing Currency', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['USD ($)', 'EUR (€)', 'GBP (£)', 'AED', 'PKR', 'CAD ($)'], description: 'Currency of receipts.' },
        { key: 'total_claimed_amount', label: 'Total Claim Amount', type: 'number', required: true, mode: 'input', bold: true, width: 50, description: 'Sum of all itemized receipt totals.' },
        { key: 'detailed_description', label: 'Business Purpose & Commercial Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed commercial rationale for the incurred expenses.' }
      ];
    } else if (isEquipment || isProcurement || isCapex) {
      baseFields = [
        { key: 'requester_name', label: 'Requester Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee initiating requisition.' },
        { key: 'cost_center', label: 'Cost Center / Project Code', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Budget allocation code.' },
        { key: 'date_required', label: 'Required Delivery Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Target fulfillment date.' },
        { key: 'requisition_category', label: isEquipment ? 'Hardware Category' : 'Procurement Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: isEquipment ? ['MacBook Pro / Apple Silicon', 'ThinkPad Windows Workstation', '4K Display Monitor & Dock', 'Mobile / Tablet Asset', 'Network / Server Peripheral'] : ['IT Hardware & Infrastructure', 'Enterprise Software / Licenses', 'Professional Consulting Services', 'Facility & Lab Equipment', 'Marketing & Event Production'], description: 'Asset classification.' },
        { key: 'urgency_level', label: 'Fulfillment Priority SLA', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Standard (5-7 Business Days)', 'Expedited (2-3 Business Days)', 'Critical Operational Need (<24 Hours)'], description: 'Priority level.' },
        { key: 'estimated_budget', label: 'Estimated Total Cost', type: 'number', required: true, mode: 'input', bold: true, width: 50, description: 'Total estimated expenditure.' },
        { key: 'detailed_description', label: 'Operational Justification & Technical Specifications', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Business need, vendor comparison, and technical requirements.' }
      ];
    } else if (isOvertime || isTraining || isHiring) {
      baseFields = [
        { key: 'requester_name', label: isHiring ? 'Hiring Manager Name' : 'Employee Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Primary applicant.' },
        { key: 'employee_id', label: isHiring ? 'Target Position Title' : 'Staff / Payroll ID', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Role or ID.' },
        { key: 'effective_date', label: isHiring ? 'Target Start Date' : 'Effective Date', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Relevant date.' },
        { key: 'request_category', label: isOvertime ? 'Overtime Rate Tier' : isTraining ? 'Program Delivery Format' : 'Employment Type', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: isOvertime ? ['Weekday Extended Hours (1.5x)', 'Weekend / Rest Day Shift (2.0x)', 'Public Holiday Deployment (2.5x)', 'Compensatory Time-Off (CTO)'] : isTraining ? ['Professional Certification Exam', 'Live Technical Bootcamp', 'Executive Leadership Seminar', 'Online Self-Paced Course'] : ['Full-Time Permanent (FTE)', 'Fixed-Term Contract (12 Months)', 'Replacement Backfill', 'Internship / Graduate Trainee'], description: 'Category selection.' },
        { key: 'numeric_metric', label: isOvertime ? 'Total Overtime Hours' : isTraining ? 'Course & Exam Fee' : 'Approved Annual Budget', type: 'number', required: true, mode: 'input', bold: true, width: 50, description: 'Hours or cost.' },
        { key: 'reference_code', label: 'Project / Cost Center Code', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Departmental cost center.' },
        { key: 'detailed_description', label: 'Business Justification & Deliverable Objectives', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed operational rationale.' }
      ];
    } else if (!matchedKnownArchetype && customExtractedFields.length >= 2) {
      baseFields = [...customExtractedFields];
      if (!baseFields.some(f => f.type === 'textarea')) {
        baseFields.push({
          key: 'additional_remarks',
          label: 'Additional Details, Remarks & Supporting Notes',
          type: 'textarea',
          required: false,
          mode: 'input',
          bold: false,
          width: 100,
          description: 'Supporting context or instructions.'
        });
      }
    } else {
      baseFields = [
        { key: 'applicant_name', label: 'Applicant Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of applicant.' },
        { key: 'applicant_id', label: 'Employee / Reference ID', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Staff or case reference ID.' },
        { key: 'request_date', label: 'Date of Submission', type: 'date', required: true, mode: 'input', bold: false, width: 50, description: 'Application filing date.' },
        { key: 'request_type', label: 'Request Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Standard Operational Request', 'Special Executive Authorization', 'Resource / Budget Allocation', 'Policy Exception Waiver'], description: 'Class of request.' },
        { key: 'priority', label: 'Priority Level', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Normal / Standard SLA', 'High Priority', 'Urgent / Time-Sensitive'], description: 'Decision urgency level.' },
        { key: 'reference_number', label: 'Cost Center / Reference Code', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Optional project or reference code.' },
        { key: 'detailed_description', label: 'Detailed Scope, Background & Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Provide full background, scope, and expected outcomes.' }
      ];
    }

    if (includeDeclaration && !baseFields.some(f => f.type === 'checkbox')) {
      baseFields.push({
        key: 'policy_acknowledgment',
        label: 'I certify that the information provided above is accurate, complete, and compliant with organizational policies',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: 100,
        description: 'Mandatory policy affirmation.'
      });
    }

    fields = mergeBlueprintWithCustomFields(baseFields, customExtractedFields);

    const longAndCheckFields = fields.filter(f => f.type === 'textarea' || f.type === 'checkbox');
    const shortFields = fields.filter(f => f.type !== 'textarea' && f.type !== 'checkbox');
    const midpoint = Math.ceil(shortFields.length / 2);
    const section1Short = shortFields.slice(0, Math.max(2, midpoint));
    const section2Short = shortFields.slice(Math.max(2, midpoint));

    const tableSectionHtml = showTable ? `<p><br/></p>
<h3>${section2Short.length > 0 ? '3' : '2'}. ${isOvertime ? 'Overtime Shift & Hours Breakdown' : 'Itemized Schedule & Cost Breakdown'}</h3>
<table>
  <tbody>
    <tr>
      <td><strong>#</strong></td>
      <td><strong>${isOvertime ? 'Date & Shift Activity Description' : 'Item / Service Specification'}</strong></td>
      <td><strong>${isOvertime ? 'Hours' : 'Qty'}</strong></td>
      <td><strong>${isOvertime ? 'Rate Multiplier' : 'Unit Cost'}</strong></td>
      <td><strong>Line Total</strong></td>
    </tr>
    <tr>
      <td>01</td>
      <td>Primary item / activity specification</td>
      <td>1</td>
      <td>—</td>
      <td>—</td>
    </tr>
    <tr>
      <td>02</td>
      <td>Secondary item / operational provision</td>
      <td>1</td>
      <td>—</td>
      <td>—</td>
    </tr>
  </tbody>
</table>` : '';

    let nextSec = 2;
    const sec2Html = section2Short.length > 0 ? `<p><br/></p>
<h3>${nextSec++}. Specifications & Parameters</h3>
${renderFieldRowsHtml(section2Short)}` : '';

    if (showTable) nextSec++;

    htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner('Complete all required applicant and specification fields accurately. Attach any supporting documentation prior to routing for departmental approval.') : ''}
<h3>1. Applicant & Identification Details</h3>
${renderFieldRowsHtml(section1Short)}
${sec2Html}
${tableSectionHtml}
<p><br/></p>
<h3>${nextSec++}. Details, Justification & Declarations</h3>
${renderFieldRowsHtml(longAndCheckFields)}
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Applicant Digital Signature', nextSec)}
`;
  }

  // Strictly normalize fields to Manual Mode defaults (width: null Auto, In-Text placeholder locked to 'text')
  const normalizedFields = fields.map(f => ({
    ...f,
    type: f.mode === 'placeholder' ? 'text' : f.type,
    width: null
  }));

  return {
    success: true,
    title,
    department: resolvedDept,
    description,
    style,
    complexity,
    htmlContent,
    fields: normalizedFields,
    workflow,
    source: 'builtin-nlp'
  };
}

/**
 * Calls Local Ollama LLM (http://127.0.0.1:11434/api/generate)
 * Combines Ollama's generative field/section design with SmartDoc's A4 Word HTML Layout Compiler
 * so even 1.5B-3B local models produce 100% valid, pristine Word templates every time.
 */
async function callOllamaLocalLlm({
  prompt,
  department = 'General',
  style = 'form',
  complexity = 'standard',
  sections = {},
  model = ''
}) {
  const status = await getOllamaStatus();
  if (!status.online) {
    throw new Error(`Local Ollama server is not reachable at ${status.baseUrl}`);
  }

  const targetModel = model || status.defaultModel;
  if (!targetModel) {
    throw new Error('No local Ollama model installed. Run "ollama pull llama3.2" or "ollama pull qwen2.5:3b" in terminal.');
  }

  const systemPrompt = `You are SmartDoc AI, an expert enterprise form and legal document architect.
Design a structured corporate ${style} based on the user's prompt.
Do NOT include pricing/billing fields unless the prompt is about expenses, procurement, or budgets.
Respond ONLY with a valid JSON object matching this exact structure:
{
  "title": "Formal Corporate Title",
  "department": "${department || 'Administration'}",
  "description": "One-sentence summary of the form purpose",
  "introParagraph": "Optional formal introductory clause or instructions",
  "workflow": ["${department || 'Administration'}"],
  "fields": [
    {
      "key": "snake_case_key",
      "label": "Clear Field Label",
      "type": "text" | "textarea" | "date" | "number" | "dropdown" | "checkbox",
      "required": true,
      "options": ["Option 1", "Option 2"],
      "description": "Helpful hint"
    }
  ]
}
Include 6 to 10 relevant fields covering applicant details, domain-specific inputs, a textarea for details/justification, and a final compliance checkbox.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  const startTime = Date.now();
  const endpointUrl = `${status.baseUrl}/api/generate`;
  const requestPayload = {
    model: targetModel,
    system: systemPrompt,
    prompt: `Create a ${style} (${complexity} detail) for department "${department}": ${prompt}`,
    format: 'json',
    stream: false,
    think: false,
    options: {
      temperature: 0.2,
      num_ctx: 4096
    }
  };

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(requestPayload)
    });
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const errLog = recordOllamaLog({
        type: 'OLLAMA_GENERATE',
        engine: 'ollama',
        status: 'ERROR',
        model: targetModel,
        endpoint: `POST ${endpointUrl}`,
        httpStatus: response.status,
        durationMs,
        error: `Ollama HTTP ${response.status}${errText ? `: ${errText.slice(0, 240)}` : ''}`,
        request: {
          method: 'POST',
          url: endpointUrl,
          headers: { 'Content-Type': 'application/json' },
          body: requestPayload
        },
        response: {
          httpStatus: response.status,
          rawText: errText
        }
      });
      const err = new Error(`Ollama HTTP ${response.status}`);
      err.ollamaLog = errLog;
      throw err;
    }

    const data = await response.json();
    const rawResponseStr = String(data?.response || '');
    const rawJsonText = rawResponseStr
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(rawJsonText);
    } catch (parseErr) {
      const errLog = recordOllamaLog({
        type: 'OLLAMA_GENERATE',
        engine: 'ollama',
        status: 'ERROR',
        model: targetModel,
        endpoint: `POST ${endpointUrl}`,
        httpStatus: response.status,
        durationMs,
        error: `Failed to parse Ollama JSON response: ${parseErr.message}`,
        request: {
          method: 'POST',
          url: endpointUrl,
          headers: { 'Content-Type': 'application/json' },
          body: requestPayload
        },
        response: {
          httpStatus: response.status,
          rawText: rawResponseStr,
          cleanedJsonText: rawJsonText
        }
      });
      const err = new Error(`Ollama JSON parse failed: ${parseErr.message}`);
      err.ollamaLog = errLog;
      throw err;
    }

    if (!parsed || (!Array.isArray(parsed.fields) && !parsed.htmlContent)) {
      const errLog = recordOllamaLog({
        type: 'OLLAMA_GENERATE',
        engine: 'ollama',
        status: 'ERROR',
        model: targetModel,
        endpoint: `POST ${endpointUrl}`,
        httpStatus: response.status,
        durationMs,
        error: 'Ollama returned incomplete schema (missing fields array)',
        request: {
          method: 'POST',
          url: endpointUrl,
          headers: { 'Content-Type': 'application/json' },
          body: requestPayload
        },
        response: {
          httpStatus: response.status,
          rawText: rawResponseStr,
          parsedJson: parsed
        }
      });
      const err = new Error('Ollama returned incomplete schema');
      err.ollamaLog = errLog;
      throw err;
    }

    // Normalize LLM-generated fields so widths never truncate in Word Form Studio
    const usedKeys = new Set();
    const validTypes = new Set(['text', 'textarea', 'date', 'number', 'dropdown', 'checkbox']);
    let llmFields = (Array.isArray(parsed.fields) ? parsed.fields : []).map((f, idx) => {
      const label = toTitleCase(f.label || f.key || `Field ${idx + 1}`);
      let key = toSnakeKey(f.key || label, idx);
      while (usedKeys.has(key)) key = `${key}_${idx + 1}`;
      usedKeys.add(key);

      const rawType = String(f.type || 'text').toLowerCase();
      const type = validTypes.has(rawType) ? rawType : 'text';
      const mode = style === 'contract' && type === 'text' ? 'placeholder' : 'input';
      const options = type === 'dropdown'
        ? (Array.isArray(f.options) && f.options.length >= 2 ? f.options.map(String) : ['Option 1', 'Option 2', 'Option 3'])
        : undefined;

      return {
        key,
        label,
        type: mode === 'placeholder' ? 'text' : type,
        required: f.required !== false,
        mode,
        bold: type === 'number' && /total|amount|budget|days/i.test(label),
        width: null,
        options,
        description: f.description || `${label}`
      };
    });

    // Merge any explicit custom fields from prompt so nothing requested by user is missed
    const customExtracted = extractCustomFieldsFromPrompt(prompt, style);
    llmFields = mergeBlueprintWithCustomFields(llmFields, customExtracted);

    const includeHeaderMeta = sections.includeHeaderMeta !== false;
    const includeDeclaration = sections.includeDeclaration !== false;
    const includeOfficialUse = sections.includeOfficialUse === true || complexity === 'comprehensive';
    const includeInstructions = complexity === 'comprehensive' || Boolean(parsed.introParagraph);

    if (includeDeclaration && !llmFields.some(f => f.type === 'checkbox')) {
      llmFields.push({
        key: 'compliance_declaration',
        label: 'I certify that the information provided above is accurate and compliant with company policies',
        type: 'checkbox',
        required: true,
        mode: 'input',
        bold: false,
        width: null,
        description: 'Mandatory compliance affirmation.'
      });
    }

    const title = parsed.title || 'Enterprise Request & Approval Form';
    const resolvedDept = parsed.department || department || 'Administration';
    const workflow = Array.isArray(parsed.workflow) && parsed.workflow.length > 0
      ? parsed.workflow
      : [resolvedDept];

    const longAndCheckFields = llmFields.filter(f => f.type === 'textarea' || f.type === 'checkbox');
    const shortFields = llmFields.filter(f => f.type !== 'textarea' && f.type !== 'checkbox');
    const midpoint = Math.ceil(shortFields.length / 2);
    const sec1Fields = shortFields.slice(0, Math.max(2, midpoint));
    const sec2Fields = shortFields.slice(Math.max(2, midpoint));

    const pLower = String(prompt || '').toLowerCase();
    const naturallyNeedsTable = /\b(expense|reimbursement|purchase|procurement|invoice|itemized|table|checklist|inspection|audit|overtime)\b/i.test(pLower) && !/\b(leave|vacation|sick)\b/i.test(pLower);
    const showTable = sections.includeTable === true || (sections.includeTable === 'auto' && naturallyNeedsTable);

    let secNum = 1;
    const htmlContent = `
${renderDocumentHeader(title, includeHeaderMeta)}
${includeInstructions ? renderInstructionsBanner(parsed.introParagraph || 'Complete all mandatory fields accurately before signing and submitting for departmental approval.') : ''}
<h3>${secNum++}. Primary Information & Identification</h3>
${renderFieldRowsHtml(sec1Fields)}
<p><br/></p>
${sec2Fields.length > 0 ? `<h3>${secNum++}. Operational Details & Specifications</h3>
${renderFieldRowsHtml(sec2Fields)}
<p><br/></p>` : ''}
${showTable ? `<h3>${secNum++}. Structured Schedule & Breakdown</h3>
<table>
  <tbody>
    <tr>
      <td><strong>#</strong></td>
      <td><strong>Description / Specification</strong></td>
      <td><strong>Reference / Qty</strong></td>
      <td><strong>Status / Notes</strong></td>
    </tr>
    <tr>
      <td>01</td>
      <td>Primary entry specification</td>
      <td>1</td>
      <td></td>
    </tr>
    <tr>
      <td>02</td>
      <td>Secondary entry specification</td>
      <td>1</td>
      <td></td>
    </tr>
  </tbody>
</table>
<p><br/></p>` : ''}
<h3>${secNum++}. Supporting Notes & Compliance</h3>
${renderFieldRowsHtml(longAndCheckFields)}
<p><br/></p>
${includeOfficialUse ? renderOfficialUseSection(workflow) : ''}
${renderSignaturesBlock(workflow, 'Applicant Digital Signature', secNum)}
`;

    const logEntry = recordOllamaLog({
      type: 'OLLAMA_GENERATE',
      engine: 'ollama',
      status: 'SUCCESS',
      model: targetModel,
      endpoint: `POST ${endpointUrl}`,
      httpStatus: response.status,
      durationMs,
      metrics: {
        totalDurationMs: data?.total_duration ? Math.round(data.total_duration / 1e6) : durationMs,
        loadDurationMs: data?.load_duration ? Math.round(data.load_duration / 1e6) : 0,
        promptTokens: data?.prompt_eval_count || 0,
        completionTokens: data?.eval_count || 0,
        doneReason: data?.done_reason || 'stop'
      },
      request: {
        method: 'POST',
        url: endpointUrl,
        headers: { 'Content-Type': 'application/json' },
        body: requestPayload
      },
      response: {
        httpStatus: response.status,
        rawText: rawResponseStr,
        cleanedJsonText: rawJsonText,
        parsedJson: parsed,
        synthesizedSummary: {
          title,
          department: resolvedDept,
          workflow,
          fieldCount: llmFields.length,
          fields: llmFields
        },
        ollamaMeta: {
          model: data?.model || targetModel,
          created_at: data?.created_at,
          done: data?.done,
          done_reason: data?.done_reason,
          total_duration: data?.total_duration,
          load_duration: data?.load_duration,
          prompt_eval_count: data?.prompt_eval_count,
          eval_count: data?.eval_count
        }
      }
    });

    return {
      success: true,
      title,
      department: resolvedDept,
      description: parsed.description || `Generated by Local Ollama LLM (${targetModel})`,
      style,
      complexity,
      htmlContent,
      fields: llmFields,
      workflow,
      source: `ollama (${targetModel})`,
      ollamaModel: targetModel,
      ollamaLog: logEntry
    };
  } catch (err) {
    if (!err.ollamaLog) {
      const durationMs = Date.now() - startTime;
      err.ollamaLog = recordOllamaLog({
        type: 'OLLAMA_GENERATE',
        engine: 'ollama',
        status: 'ERROR',
        model: targetModel,
        endpoint: `POST ${endpointUrl}`,
        httpStatus: 0,
        durationMs,
        error: err.message || 'Ollama request failed',
        request: {
          method: 'POST',
          url: endpointUrl,
          headers: { 'Content-Type': 'application/json' },
          body: requestPayload
        },
        response: {
          httpStatus: 0,
          rawText: '',
          error: err.message || 'Connection or timeout error'
        }
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main AI Form Generation Controller
 * Supports:
 * - engineMode = 'builtin' (Instant <15ms Built-in NLP Synthesizer)
 * - engineMode = 'ollama'  (Local Ollama LLM at 127.0.0.1:11434 with automatic fallback to Built-in NLP)
 * - engineMode = 'auto'    (Tries Local Ollama if online, otherwise Instant Built-in NLP)
 */
export async function generateFormWithAi({
  prompt,
  department,
  style = 'form',
  complexity = 'standard',
  sections = {},
  engineMode = 'builtin',
  ollamaModel = ''
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('A prompt description is required to generate a form.');
  }

  let fallbackError = null;
  // If user requested Local Ollama LLM (or Auto), attempt local Ollama first
  if (engineMode === 'ollama' || engineMode === 'auto') {
    try {
      const ollamaRes = await callOllamaLocalLlm({
        prompt: prompt.trim(),
        department,
        style,
        complexity,
        sections,
        model: ollamaModel
      });
      if (ollamaRes && ollamaRes.htmlContent) {
        return ollamaRes;
      }
    } catch (err) {
      fallbackError = err;
      console.warn('[aiFormEngine] Local Ollama unavailable or failed, falling back to Built-in NLP Synthesizer:', err.message);
    }
  }

  // Instant <15ms Built-in NLP & Semantic Synthesizer
  const startTime = Date.now();
  const nlpResult = synthesizeFormTemplate({
    prompt: prompt.trim(),
    department,
    style,
    complexity,
    sections
  });
  const durationMs = Date.now() - startTime;

  const nlpLog = recordOllamaLog({
    type: fallbackError ? 'FALLBACK_NLP' : 'BUILTIN_NLP',
    engine: 'builtin',
    status: fallbackError ? 'FALLBACK' : 'SUCCESS',
    model: 'Built-in NLP Synthesizer (<15ms)',
    endpoint: 'INTERNAL synthesizeFormTemplate()',
    httpStatus: 200,
    durationMs,
    error: fallbackError ? `Ollama fallback reason: ${fallbackError.message}` : undefined,
    request: {
      method: 'INTERNAL',
      engineMode,
      requestedOllamaModel: ollamaModel || undefined,
      body: {
        prompt: prompt.trim(),
        department,
        style,
        complexity,
        sections
      }
    },
    response: {
      httpStatus: 200,
      parsedJson: {
        title: nlpResult.title,
        department: nlpResult.department,
        style: nlpResult.style,
        complexity: nlpResult.complexity,
        workflow: nlpResult.workflow,
        fieldsCount: (nlpResult.fields || []).length,
        fields: nlpResult.fields
      }
    }
  });

  return {
    ...nlpResult,
    ollamaLog: fallbackError?.ollamaLog || nlpLog,
    fallbackLog: fallbackError ? nlpLog : undefined
  };
}
