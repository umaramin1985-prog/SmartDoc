import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { synthesizeFormTemplate, enhancePromptOffline } from '../../server/aiFormEngine';
import {
  Sparkles,
  Loader2,
  FileText,
  ScrollText,
  ClipboardCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Wand2,
  Zap,
  BookOpen,
  Cpu,
  RefreshCw,
  Terminal,
  Copy,
  Trash2,
  Play,
  ArrowRight,
  FlaskConical
} from 'lucide-react';

const PRESET_CATEGORIES = [
  { id: 'all', label: 'All Blueprints' },
  { id: 'hr', label: 'HR & People' },
  { id: 'it', label: 'IT & Security' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal & Policy' },
  { id: 'ops', label: 'Operations' }
];

const INSPIRATION_PROMPTS = [
  // HR & People
  {
    category: 'hr',
    icon: '🏖️',
    label: 'Employee Leave & Handover',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create an Employee Leave Request & Handover Form with employee full name, staff payroll ID, designation, leave classification dropdown (Annual Vacation, Sick / Medical Leave, Casual Personal Leave, Compassionate Leave, Parental Leave), first day of leave, last day of leave, total working days, designated handover colleague, emergency contact, handover plan textarea, and HR approval.'
  },
  {
    category: 'hr',
    icon: '⭐',
    label: 'Performance Appraisal & KPIs',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create an Employee Performance Appraisal & KPI Review with employee full name, job title, appraisal cycle dropdown, evaluating supervisor, overall performance rating dropdown, competency evaluation matrix, key achievements textarea, next cycle development goals, and HR sign-off.'
  },
  {
    category: 'hr',
    icon: '🚀',
    label: 'New Hire Onboarding & IT Setup',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create a New Hire Onboarding & Provisioning Request with new hire full name, job title, official joining date, hiring manager, workstation preference dropdown (MacBook Pro, Windows ThinkPad, Linux), work arrangement dropdown, Day-1 provisioning matrix table, software & access notes, and approval by Human Resources and IT & Systems.'
  },
  {
    category: 'hr',
    icon: '🚪',
    label: 'Employee Exit & Clearance',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create an Employee Offboarding & Exit Clearance Form with departing employee name, staff ID, final working date, separation category dropdown, personal forwarding email, handover recipient, departmental asset de-provisioning table, returned assets summary, and approval by Human Resources and IT & Systems.'
  },
  {
    category: 'hr',
    icon: '⏱️',
    label: 'Overtime & Shift Allowance',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create an Overtime & Shift Allowance Authorization Form with employee full name, staff ID, effective date, overtime rate tier dropdown (Weekday 1.5x, Weekend 2.0x, Holiday 2.5x), total overtime hours, project cost center, shift breakdown table, deliverable justification, and HR approval.'
  },
  // IT & Security
  {
    category: 'it',
    icon: '💻',
    label: 'IT Hardware & Laptop Request',
    style: 'form',
    dept: 'IT & Systems',
    prompt: 'Create an IT Equipment & Hardware Requisition Form with requester full name, cost center code, required delivery date, hardware category dropdown (MacBook Pro, ThinkPad Workstation, 4K Monitor, Docking Bundle, Mobile Device), priority SLA dropdown, estimated budget, operational justification, acceptable use policy checkbox, and approval by IT & Systems and Finance.'
  },
  {
    category: 'it',
    icon: '🔐',
    label: 'System & Cloud Access Request',
    style: 'form',
    dept: 'IT & Systems',
    prompt: 'Create a System & Network Access Authorization Request with requester full name, job role, request date, target system environment dropdown (Production Database, Cloud AWS/GCP, Enterprise ERP, Git / CI-CD, CRM), requested privilege level dropdown (Read-Only, Standard Operator, Elevated Admin, Temporary 14-Day), authorization duration, security justification, and IT & Systems approval.'
  },
  {
    category: 'it',
    icon: '🛠️',
    label: 'Production Change Request (RFC)',
    style: 'form',
    dept: 'IT & Systems',
    prompt: 'Create an IT Change Management & Deployment Request (RFC) with change owner name, scheduled maintenance date, affected system, change risk classification dropdown (Low, Medium, High, Critical Hotfix), estimated downtime minutes, peer QA reviewer, implementation & rollback plan textarea, staging verification checkbox, and IT & Systems approval.'
  },
  // Finance & Procurement
  {
    category: 'finance',
    icon: '💰',
    label: 'Travel & Expense Reimbursement',
    style: 'form',
    dept: 'Finance & Accounting',
    prompt: 'Design a Travel & Business Expense Reimbursement Claim Form with claimant full name, staff ID, claim submission date, expense category dropdown (Flight & Hotel, Client Meals, Local Transport, Software & Supplies, Conference), billing currency dropdown, total claim amount, itemized expense table, business justification, receipts declaration checkbox, and Finance approval.'
  },
  {
    category: 'finance',
    icon: '🛒',
    label: 'Purchase Order & Procurement',
    style: 'form',
    dept: 'Finance & Accounting',
    prompt: 'Create a Purchase Requisition & Vendor Approval Form with requester full name, cost center code, required delivery date, procurement category dropdown, priority SLA dropdown, estimated total cost, itemized bill of quantities table, vendor selection justification, and approval by Finance & Accounting and Executive Management.'
  },
  {
    category: 'finance',
    icon: '💵',
    label: 'Petty Cash Advance Voucher',
    style: 'form',
    dept: 'Finance & Accounting',
    prompt: 'Create a Petty Cash & Advance Disbursement Voucher with claimant full name, staff ID, submission date, expense category dropdown, billing currency, total advance amount, itemized voucher breakdown table, operational purpose, and Finance approval.'
  },
  // Legal & Policy
  {
    category: 'legal',
    icon: '🤝',
    label: 'Mutual Non-Disclosure (NDA)',
    style: 'contract',
    dept: 'Legal & Compliance',
    prompt: 'Draft a formal Mutual Non-Disclosure & Confidentiality Agreement (NDA) between two commercial parties with effective date, disclosing party legal name, receiving party legal name, governing jurisdiction, agreement term years, termination notice days, commercial scope of disclosure, confidentiality covenant checkbox, and signature blocks.'
  },
  {
    category: 'legal',
    icon: '📜',
    label: 'Commercial Service Agreement',
    style: 'contract',
    dept: 'Legal & Compliance',
    prompt: 'Draft a Master Commercial Service Agreement (MSA) with effective date, client entity name, service provider entity name, governing jurisdiction, agreement term years, termination notice days, statement of work deliverables & payment scope, binding signatory checkbox, and Legal & Compliance approval.'
  },
  {
    category: 'legal',
    icon: '📢',
    label: 'Corporate Policy Directive Memo',
    style: 'memo',
    dept: 'Legal & Compliance',
    prompt: 'Draft an Official Corporate Policy Directive & Memorandum with target audience division, issuing authority, effective date, security classification dropdown, executive policy summary, required departmental compliance actions, and authorization sign-off.'
  },
  // Operations & Safety
  {
    category: 'ops',
    icon: '📋',
    label: 'Facility Safety & QA Checklist',
    style: 'checklist',
    dept: 'Operations',
    prompt: 'Generate a Facility Safety & Quality Inspection Checklist with lead inspector name, inspection date, audit category dropdown, facility site zone, overall assessment grade dropdown, 5-point standardized pass/fail inspection matrix table, corrective action plan (CAPA) textarea, and Operations approval.'
  },
  {
    category: 'ops',
    icon: '⚠️',
    label: 'Workplace Incident & Hazard Report',
    style: 'form',
    dept: 'Operations',
    prompt: 'Create a Workplace Incident & Safety Hazard Report with reporter full name, date of incident, exact facility location, incident classification dropdown (Near Miss, Minor First-Aid, Property Damage, Environmental Hazard, Critical Injury), witnesses involved, detailed incident narrative & immediate containment, and Operations and HR approval.'
  },
  {
    category: 'ops',
    icon: '🪪',
    label: 'Visitor & Contractor Work Permit',
    style: 'form',
    dept: 'Operations',
    prompt: 'Create a Visitor, Contractor & Site Work Permit with visitor full name, representing company, authorized visit date, internal host employee, permitted facility zone dropdown (Reception, General Office, Data Center, Warehouse, Plant Floor), government ID number, work scope & safety precautions, and Operations approval.'
  }
];

const LOCAL_LOGS_STORAGE_KEY = 'smartdoc_ollama_logs_v1';

function loadStoredLogs() {
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function saveStoredLogs(logs) {
  try {
    localStorage.setItem(LOCAL_LOGS_STORAGE_KEY, JSON.stringify((logs || []).slice(0, 30)));
  } catch {
    // ignore storage quota errors
  }
}

function formatTimeShort(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function AiFormGeneratorModal({ isOpen, onClose, onGenerated, currentDepartment }) {
  const { departments, addToast } = useApp();
  const [prompt, setPrompt] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [style, setStyle] = useState('form'); // 'form' | 'contract' | 'checklist' | 'memo'
  const [complexity, setComplexity] = useState('standard'); // 'compact' | 'standard' | 'comprehensive'
  const [department, setDepartment] = useState(currentDepartment || 'IT & Systems');
  const sections = {
    includeHeaderMeta: true,
    includeTable: 'auto',
    includeDeclaration: true,
    includeOfficialUse: false
  };

  // Dual Offline Engine State: 'builtin' (<15ms NLP) | 'ollama' (Local Ollama LLM)
  const [engineMode, setEngineMode] = useState(() => localStorage.getItem('smartdoc_offline_engine') || 'builtin');
  const [ollamaStatus, setOllamaStatus] = useState({ online: false, models: [], defaultModel: '', checking: false });
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('smartdoc_ollama_model') || '');

  // Ollama Logs, Request & Response Inspector State
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [logsTab, setLogsTab] = useState('logs'); // 'logs' | 'request' | 'response'
  const [ollamaLogs, setOllamaLogs] = useState(() => loadStoredLogs());
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [lastSynthesizedResult, setLastSynthesizedResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pushLogEntry = useCallback((entry) => {
    setOllamaLogs(prev => {
      const filtered = prev.filter(item => item.id !== entry.id);
      const next = [entry, ...filtered].slice(0, 30);
      saveStoredLogs(next);
      return next;
    });
    setSelectedLogId(entry.id);
  }, []);

  useEffect(() => {
    if (currentDepartment) {
      setDepartment(currentDepartment);
    }
  }, [currentDepartment]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose]);

  const checkOllama = useCallback(async (recordInLog = false) => {
    setOllamaStatus(prev => ({ ...prev, checking: true }));
    const t0 = Date.now();
    try {
      let status = null;
      try {
        status = await apiService.getOllamaStatus();
      } catch {
        status = null;
      }

      if (!status || !status.online) {
        const res = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          const rawModels = (data?.models || []).map(m => m.name || m.model).filter(Boolean);
          const models = rawModels.filter(n => !/embed|bge-|all-minilm/i.test(n));
          status = {
            online: true,
            baseUrl: 'http://127.0.0.1:11434',
            models: models.length > 0 ? models : rawModels,
            defaultModel: models[0] || rawModels[0] || 'llama3.2:latest'
          };
        }
      }

      const elapsed = Date.now() - t0;

      if (status && status.online) {
        const modelsList = status.models || [];
        const defModel = status.defaultModel || modelsList[0] || 'llama3.2:latest';
        setOllamaStatus({
          online: true,
          models: modelsList,
          defaultModel: defModel,
          checking: false
        });
        setOllamaModel(prev => {
          if (prev && modelsList.includes(prev)) return prev;
          if (defModel) localStorage.setItem('smartdoc_ollama_model', defModel);
          return defModel;
        });

        if (recordInLog) {
          pushLogEntry({
            id: `olog_ping_${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'STATUS_PROBE',
            engine: 'ollama',
            status: 'SUCCESS',
            model: defModel,
            endpoint: `GET ${status.baseUrl || 'http://127.0.0.1:11434'}/api/tags`,
            httpStatus: 200,
            durationMs: elapsed,
            request: {
              method: 'GET',
              url: `${status.baseUrl || 'http://127.0.0.1:11434'}/api/tags`,
              headers: { Accept: 'application/json' }
            },
            response: {
              httpStatus: 200,
              online: true,
              modelsCount: modelsList.length,
              models: modelsList,
              defaultModel: defModel
            }
          });
        }
      } else {
        setOllamaStatus({ online: false, models: [], defaultModel: '', checking: false });
        if (recordInLog) {
          pushLogEntry({
            id: `olog_ping_${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'STATUS_PROBE',
            engine: 'ollama',
            status: 'ERROR',
            model: 'N/A',
            endpoint: 'GET http://127.0.0.1:11434/api/tags',
            httpStatus: 0,
            durationMs: elapsed,
            error: 'Ollama daemon is unreachable at http://127.0.0.1:11434',
            request: {
              method: 'GET',
              url: 'http://127.0.0.1:11434/api/tags'
            },
            response: {
              online: false,
              error: 'Connection refused or timed out'
            }
          });
        }
      }
    } catch (err) {
      setOllamaStatus({ online: false, models: [], defaultModel: '', checking: false });
      if (recordInLog) {
        pushLogEntry({
          id: `olog_ping_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'STATUS_PROBE',
          engine: 'ollama',
          status: 'ERROR',
          model: 'N/A',
          endpoint: 'GET http://127.0.0.1:11434/api/tags',
          httpStatus: 0,
          durationMs: Date.now() - t0,
          error: err.message || 'Probe failed',
          request: { method: 'GET', url: 'http://127.0.0.1:11434/api/tags' },
          response: { error: err.message || 'Probe failed' }
        });
      }
    }
  }, [pushLogEntry]);

  // Sync server logs when modal opens
  useEffect(() => {
    if (isOpen) {
      checkOllama(false);
      apiService.getOllamaLogs()
        .then(res => {
          if (Array.isArray(res?.logs) && res.logs.length > 0) {
            setOllamaLogs(prev => {
              const map = new Map();
              [...res.logs, ...prev].forEach(item => {
                if (item && item.id && !map.has(item.id)) map.set(item.id, item);
              });
              const merged = Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                .slice(0, 30);
              saveStoredLogs(merged);
              return merged;
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen, checkOllama]);

  const handleEngineModeChange = (mode) => {
    setEngineMode(mode);
    localStorage.setItem('smartdoc_offline_engine', mode);
    if (mode === 'ollama' && !ollamaStatus.online) {
      checkOllama(false);
    }
  };

  const handleOllamaModelChange = (e) => {
    const val = e.target.value;
    setOllamaModel(val);
    localStorage.setItem('smartdoc_ollama_model', val);
  };

  const handleClearLogs = async () => {
    setOllamaLogs([]);
    setSelectedLogId(null);
    saveStoredLogs([]);
    try {
      await apiService.clearOllamaLogs();
    } catch {
      // ignore
    }
  };

  const handleCopyJson = (obj, label) => {
    const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    navigator.clipboard?.writeText(text);
    addToast?.('Copied to Clipboard', `${label} copied to clipboard.`, 'info');
  };

  if (!isOpen) return null;

  const filteredPresets = activeCategory === 'all'
    ? INSPIRATION_PROMPTS
    : INSPIRATION_PROMPTS.filter(item => item.category === activeCategory);

  const activeLog = ollamaLogs.find(l => l.id === selectedLogId) || ollamaLogs[0] || null;

  const handleSelectInspiration = (item) => {
    setPrompt(item.prompt);
    setStyle(item.style);
    if (item.dept) setDepartment(item.dept);
    setError(null);
  };

  const handleEnhancePrompt = () => {
    const enhanced = enhancePromptOffline(prompt, department, style);
    setPrompt(enhanced);
    setError(null);
  };

  /**
   * Executes AI generation and records full Request & Response logs.
   * When inspectOnly === true, stays inside the modal and opens the Logs/Response tab
   * so the user can inspect the exact Ollama request, raw response, and parsed JSON.
   */
  const runGeneration = async ({ inspectOnly = false } = {}) => {
    if (!prompt.trim()) {
      setError('Please describe the form you want to create or click one of the preset blueprints below.');
      return;
    }

    setLoading(true);
    setError(null);

    const activeModelName = ollamaModel || ollamaStatus.defaultModel || 'qwen3:8b';
    const pendingLogId = `olog_req_${Date.now()}`;
    const tStart = Date.now();

    const previewRequestPayload = engineMode === 'ollama'
      ? {
          model: activeModelName,
          system: `You are SmartDoc AI, an expert enterprise form and legal document architect. Design a structured corporate ${style} based on the user's prompt. Respond ONLY with valid JSON...`,
          prompt: `Create a ${style} (${complexity} detail) for department "${department}": ${prompt.trim()}`,
          format: 'json',
          stream: false,
          think: false,
          options: { temperature: 0.2, num_ctx: 4096 }
        }
      : {
          engine: 'builtin-nlp',
          prompt: prompt.trim(),
          department,
          style,
          complexity,
          sections
        };

    // Immediately push PENDING entry so user can inspect the live request in flight
    pushLogEntry({
      id: pendingLogId,
      timestamp: new Date().toISOString(),
      type: engineMode === 'ollama' ? 'OLLAMA_GENERATE' : 'BUILTIN_NLP',
      engine: engineMode,
      status: 'PENDING',
      model: engineMode === 'ollama' ? activeModelName : 'Built-in NLP (<15ms)',
      endpoint: engineMode === 'ollama'
        ? 'POST http://127.0.0.1:11434/api/generate'
        : 'INTERNAL synthesizeFormTemplate()',
      httpStatus: null,
      durationMs: null,
      request: {
        method: 'POST',
        url: engineMode === 'ollama' ? 'http://127.0.0.1:11434/api/generate' : '/api/ai/generate-form',
        headers: { 'Content-Type': 'application/json' },
        body: previewRequestPayload
      },
      response: {
        status: 'Waiting for response from model…'
      }
    });

    if (inspectOnly) {
      setShowLogsPanel(true);
    }

    try {
      let result = null;
      try {
        result = await apiService.generateAiForm({
          prompt: prompt.trim(),
          department,
          style,
          complexity,
          sections,
          engineMode,
          ollamaModel: activeModelName
        });
      } catch {
        result = synthesizeFormTemplate({
          prompt: prompt.trim(),
          department,
          style,
          complexity,
          sections
        });
      }

      if (!result || !result.htmlContent) {
        throw new Error('Failed to synthesize document content.');
      }

      const elapsed = Date.now() - tStart;
      const serverLog = result.ollamaLog || {
        id: pendingLogId,
        timestamp: new Date().toISOString(),
        type: engineMode === 'ollama' ? 'OLLAMA_GENERATE' : 'BUILTIN_NLP',
        engine: result.source?.startsWith('ollama') ? 'ollama' : 'builtin',
        status: 'SUCCESS',
        model: result.ollamaModel || (engineMode === 'ollama' ? activeModelName : 'Built-in NLP (<15ms)'),
        endpoint: result.source?.startsWith('ollama')
          ? 'POST http://127.0.0.1:11434/api/generate'
          : 'INTERNAL synthesizeFormTemplate()',
        httpStatus: 200,
        durationMs: elapsed,
        request: {
          method: 'POST',
          url: result.source?.startsWith('ollama') ? 'http://127.0.0.1:11434/api/generate' : '/api/ai/generate-form',
          headers: { 'Content-Type': 'application/json' },
          body: previewRequestPayload
        },
        response: {
          httpStatus: 200,
          parsedJson: {
            title: result.title,
            department: result.department,
            workflow: result.workflow,
            fieldsCount: (result.fields || []).length,
            fields: result.fields
          }
        }
      };

      // Replace the pending entry with the completed entry
      setOllamaLogs(prev => {
        const withoutPending = prev.filter(item => item.id !== pendingLogId && item.id !== serverLog.id);
        const next = [serverLog, ...withoutPending].slice(0, 30);
        saveStoredLogs(next);
        return next;
      });
      setSelectedLogId(serverLog.id);
      setLastSynthesizedResult(result);

      if (inspectOnly) {
        setLogsTab('response');
        return;
      }

      onGenerated(result);
      onClose();
    } catch (err) {
      console.error('[AiFormGeneratorModal] Generation failed:', err);
      const elapsed = Date.now() - tStart;
      setOllamaLogs(prev => {
        const withoutPending = prev.filter(item => item.id !== pendingLogId);
        const errEntry = {
          id: pendingLogId,
          timestamp: new Date().toISOString(),
          type: engineMode === 'ollama' ? 'OLLAMA_GENERATE' : 'BUILTIN_NLP',
          engine: engineMode,
          status: 'ERROR',
          model: engineMode === 'ollama' ? activeModelName : 'Built-in NLP',
          endpoint: engineMode === 'ollama' ? 'POST http://127.0.0.1:11434/api/generate' : '/api/ai/generate-form',
          httpStatus: err.status || 500,
          durationMs: elapsed,
          error: err.message || 'Generation failed',
          request: {
            method: 'POST',
            body: previewRequestPayload
          },
          response: {
            error: err.message || 'Generation failed'
          }
        };
        const next = [errEntry, ...withoutPending].slice(0, 30);
        saveStoredLogs(next);
        return next;
      });
      setError(err.message || 'Failed to generate form. Please try refining your prompt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sd-modal-backdrop sd-ai-studio-backdrop">
      <div className="sd-ai-studio-dialog" role="dialog" aria-modal="true">
        {/* ============================================================
            TOP COMMAND HEADER BAR (Fixed Height — Never Shifts)
           ============================================================ */}
        <header className="sd-ai-studio-topbar">
          <div className="sd-ai-topbar-left">
            <div className="sd-ai-icon-badge">
              <Sparkles size={22} className="sd-ai-sparkle-glow" />
            </div>
            <div className="sd-ai-header-text">
              <div className="sd-ai-header-title-row">
                <h2 className="sd-ai-modal-title">AI Form &amp; Document Studio</h2>
                <span className="sd-ai-beta-badge" title="This AI synthesis & Local Ollama integration module is currently in Beta phase">
                  <FlaskConical size={11} />
                  <span>BETA</span>
                </span>
              </div>
              <p className="sd-ai-modal-subtitle">
                Author enterprise forms, contracts, checklists, and memos from natural language prompts or one-click blueprints.
              </p>
            </div>
          </div>

          <div className="sd-ai-topbar-right">
            <span className="sd-ai-beta-phase-notice">
              Beta Release · Experimental AI Synthesis
            </span>
            <button
              type="button"
              className="sd-ai-close-btn"
              onClick={onClose}
              disabled={loading}
              title="Close AI Form Studio (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ============================================================
            DEDICATED FIXED-HEIGHT ENGINE & OLLAMA TOOLBAR
            All controls stay permanently mounted so toggling engines causes 0px UI shift
           ============================================================ */}
        <div className="sd-ai-engine-Dedicated-bar">
          <div className="sd-ai-engine-modes">
            <button
              type="button"
              className={`sd-ai-engine-btn ${engineMode === 'builtin' ? 'is-active' : ''}`}
              onClick={() => handleEngineModeChange('builtin')}
              disabled={loading}
            >
              <Zap size={14} />
              <span>Instant Built-in NLP (&lt;15ms)</span>
            </button>
            <button
              type="button"
              className={`sd-ai-engine-btn ${engineMode === 'ollama' ? 'is-active' : ''}`}
              onClick={() => handleEngineModeChange('ollama')}
              disabled={loading}
            >
              <Cpu size={14} />
              <span>Local Ollama LLM</span>
              <span className="sd-ai-engine-beta-pill">Beta</span>
              <span className={`sd-ai-status-dot ${ollamaStatus.online ? 'is-online' : 'is-offline'}`} />
            </button>
          </div>

          {/* Right-side Ollama Model & Logs Controls — Always Mounted to Prevent Any Layout Shift */}
          <div className="sd-ai-ollama-controls">
            <div className={`sd-ai-ollama-model-group ${engineMode !== 'ollama' ? 'is-muted' : ''}`}>
              {ollamaStatus.online ? (
                <span className="sd-ai-ollama-online-tag">● Ollama Online</span>
              ) : (
                <span className="sd-ai-ollama-offline-tag">○ Ollama Offline</span>
              )}

              <select
                className="sd-ai-ollama-select"
                value={ollamaModel || ollamaStatus.defaultModel || ''}
                onChange={(e) => {
                  handleOllamaModelChange(e);
                  if (engineMode !== 'ollama') handleEngineModeChange('ollama');
                }}
                disabled={loading || !ollamaStatus.online || ollamaStatus.models.length === 0}
                title="Select installed local Ollama model"
              >
                {ollamaStatus.models.length > 0 ? (
                  ollamaStatus.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))
                ) : (
                  <option value="">No local model detected</option>
                )}
              </select>

              <button
                type="button"
                className="sd-ai-refresh-btn"
                onClick={() => checkOllama(true)}
                disabled={ollamaStatus.checking}
                title="Probe Local Ollama server (127.0.0.1:11434) & log status"
              >
                <RefreshCw size={13} className={ollamaStatus.checking ? 'sd-spin' : ''} />
              </button>
            </div>

            <button
              type="button"
              id="btn-toggle-ollama-logs"
              className={`sd-ai-logs-toggle-btn ${showLogsPanel ? 'is-active' : ''}`}
              onClick={() => setShowLogsPanel(prev => !prev)}
              title="Show or hide Ollama Logs, Request Payload & Raw Response Inspector"
            >
              <Terminal size={13} />
              <span>Ollama Logs &amp; Req/Res</span>
              <span className="sd-ai-logs-count">{ollamaLogs.length}</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="sd-ai-error-banner" style={{ margin: '10px 24px 0' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* ============================================================
            MAIN SINGLE-PANE WORKSPACE
           ============================================================ */}
        <div className="sd-ai-studio-workspace">
          <div className="sd-ai-left-pane">
            {/* Collapsible Ollama Logs, Request & Response Inspector Console */}
            {showLogsPanel && (
              <div className="sd-ai-logs-console">
                <div className="sd-ai-logs-header">
                  <div className="sd-ai-logs-tabs">
                    <button
                      type="button"
                      className={`sd-ai-log-tab ${logsTab === 'logs' ? 'is-active' : ''}`}
                      onClick={() => setLogsTab('logs')}
                    >
                      <Terminal size={13} />
                      <span>Console Logs ({ollamaLogs.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`sd-ai-log-tab ${logsTab === 'request' ? 'is-active' : ''}`}
                      onClick={() => setLogsTab('request')}
                    >
                      <span>Request Payload</span>
                    </button>
                    <button
                      type="button"
                      className={`sd-ai-log-tab ${logsTab === 'response' ? 'is-active' : ''}`}
                      onClick={() => setLogsTab('response')}
                    >
                      <span>Response &amp; Output</span>
                    </button>
                  </div>

                  <div className="sd-ai-logs-actions">
                    {ollamaLogs.length > 1 && (
                      <select
                        className="sd-ai-log-history-select"
                        value={activeLog?.id || ''}
                        onChange={(e) => setSelectedLogId(e.target.value)}
                        title="Select a logged request/response entry"
                      >
                        {ollamaLogs.map((l, idx) => (
                          <option key={l.id} value={l.id}>
                            #{ollamaLogs.length - idx} · {formatTimeShort(l.timestamp)} · {l.model || l.engine} ({l.status})
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      className="sd-ai-log-action-btn is-test"
                      onClick={() => runGeneration({ inspectOnly: true })}
                      disabled={loading || !prompt.trim()}
                      title="Send current prompt to engine and inspect the Request & Response without closing modal"
                    >
                      {loading ? <Loader2 size={12} className="sd-spin" /> : <Play size={12} />}
                      <span>Test &amp; Inspect</span>
                    </button>

                    {lastSynthesizedResult && !loading && (
                      <button
                        type="button"
                        className="sd-ai-log-action-btn is-open-studio"
                        onClick={() => {
                          onGenerated(lastSynthesizedResult);
                          onClose();
                        }}
                        title="Open the last inspected result in Word Form Studio"
                      >
                        <span>Load into Studio</span>
                        <ArrowRight size={12} />
                      </button>
                    )}

                    {ollamaLogs.length > 0 && (
                      <button
                        type="button"
                        className="sd-ai-log-action-btn"
                        onClick={handleClearLogs}
                        title="Clear all logged requests and responses"
                      >
                        <Trash2 size={12} />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="sd-ai-logs-body">
                  {ollamaLogs.length === 0 ? (
                    <div className="sd-ai-logs-empty">
                      <span>No Ollama requests recorded yet. Click <strong>Test &amp; Inspect</strong>, <strong>↻ Refresh</strong>, or <strong>Generate Form into Studio</strong> to capture live logs, request payloads, and raw model responses.</span>
                    </div>
                  ) : logsTab === 'logs' ? (
                    <div className="sd-ai-logs-list">
                      {ollamaLogs.map((item) => {
                        const isSelected = activeLog?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`sd-ai-log-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setSelectedLogId(item.id)}
                          >
                            <div className="sd-ai-log-row-main">
                              <span className="sd-ai-log-time">[{formatTimeShort(item.timestamp)}]</span>
                              <span className={`sd-ai-log-status status-${(item.status || '').toLowerCase()}`}>
                                {item.status}
                              </span>
                              <span className="sd-ai-log-endpoint">{item.endpoint}</span>
                              <span className="sd-ai-log-model">Model: {item.model}</span>
                              {item.durationMs != null && (
                                <span className="sd-ai-log-duration">{item.durationMs} ms</span>
                              )}
                              {item.metrics?.promptTokens > 0 && (
                                <span className="sd-ai-log-tokens">
                                  Tokens: {item.metrics.promptTokens} in / {item.metrics.completionTokens} out
                                </span>
                              )}
                            </div>
                            {item.error && (
                              <div className="sd-ai-log-error-line">{item.error}</div>
                            )}
                            <div className="sd-ai-log-row-links">
                              <button
                                type="button"
                                className="sd-ai-log-inline-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLogId(item.id);
                                  setLogsTab('request');
                                }}
                              >
                                View Request →
                              </button>
                              <button
                                type="button"
                                className="sd-ai-log-inline-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLogId(item.id);
                                  setLogsTab('response');
                                }}
                              >
                                View Response →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : logsTab === 'request' ? (
                    <div className="sd-ai-log-json-pane">
                      <div className="sd-ai-log-json-toolbar">
                        <span>
                          <strong>{activeLog?.endpoint}</strong> · {formatTimeShort(activeLog?.timestamp)} · Model: <code>{activeLog?.model}</code>
                        </span>
                        <button
                          type="button"
                          className="sd-ai-copy-btn"
                          onClick={() => handleCopyJson(activeLog?.request, 'Request Payload')}
                        >
                          <Copy size={12} />
                          <span>Copy Request JSON</span>
                        </button>
                      </div>
                      <pre className="sd-ai-log-pre">
                        {JSON.stringify(activeLog?.request || {}, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="sd-ai-log-json-pane">
                      <div className="sd-ai-log-json-toolbar">
                        <span>
                          Status: <strong>{activeLog?.status}</strong>
                          {activeLog?.httpStatus ? ` (HTTP ${activeLog.httpStatus})` : ''}
                          {activeLog?.durationMs != null ? ` · ${activeLog.durationMs} ms` : ''}
                          {activeLog?.metrics?.completionTokens ? ` · ${activeLog.metrics.promptTokens} prompt / ${activeLog.metrics.completionTokens} eval tokens` : ''}
                        </span>
                        <button
                          type="button"
                          className="sd-ai-copy-btn"
                          onClick={() => handleCopyJson(activeLog?.response, 'Response Payload')}
                        >
                          <Copy size={12} />
                          <span>Copy Response JSON</span>
                        </button>
                      </div>
                      <pre className="sd-ai-log-pre">
                        {JSON.stringify(activeLog?.response || {}, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 1. Natural Language Prompt Card */}
            <div className="sd-ai-card sd-ai-prompt-card">
              <div className="sd-ai-label-row">
                <label className="sd-ai-field-label">
                  What kind of form or document do you want to create?
                </label>
                <div className="sd-ai-prompt-actions">
                  <button
                    type="button"
                    className="sd-ai-enhance-btn"
                    onClick={handleEnhancePrompt}
                    disabled={loading}
                    title="Expand a short 2-3 word idea into a detailed form specification"
                  >
                    <Wand2 size={13} />
                    <span>{prompt.trim() ? 'Enhance Prompt' : 'Suggest Prompt'}</span>
                  </button>
                  {prompt && !loading && (
                    <button
                      type="button"
                      className="sd-ai-clear-inline-btn"
                      onClick={() => setPrompt('')}
                    >
                      Clear
                    </button>
                  )}
                  <span className="sd-ai-char-counter">{prompt.length} chars</span>
                </div>
              </div>

              <textarea
                className="sd-ai-prompt-textarea"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe any corporate form, contract, or checklist — or list custom fields (e.g. 'Create a Blood Donation Registration Form with donor full name, blood group dropdown (A+, A-, B+, B-, O+, O-, AB+, AB-), age, weight in kg, last donation date, medical history notes, and donor consent checkbox')..."
                disabled={loading}
                autoFocus
              />
            </div>

            {/* 2. 3-Column Configuration Strip: Style, Detail Level, Department */}
            <div className="sd-ai-config-grid-3">
              <div className="sd-ai-option-card">
                <label className="sd-ai-sublabel">Document Style</label>
                <div className="sd-ai-style-segmented">
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${style === 'form' ? 'is-active' : ''}`}
                    onClick={() => setStyle('form')}
                    disabled={loading}
                  >
                    <FileText size={14} />
                    <span>Form</span>
                  </button>
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${style === 'contract' ? 'is-active' : ''}`}
                    onClick={() => setStyle('contract')}
                    disabled={loading}
                  >
                    <ScrollText size={14} />
                    <span>Contract</span>
                  </button>
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${style === 'checklist' ? 'is-active' : ''}`}
                    onClick={() => setStyle('checklist')}
                    disabled={loading}
                  >
                    <ClipboardCheck size={14} />
                    <span>Checklist</span>
                  </button>
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${style === 'memo' ? 'is-active' : ''}`}
                    onClick={() => setStyle('memo')}
                    disabled={loading}
                  >
                    <BookOpen size={14} />
                    <span>Memo</span>
                  </button>
                </div>
              </div>

              <div className="sd-ai-option-card">
                <label className="sd-ai-sublabel">Detail &amp; Clauses</label>
                <div className="sd-ai-style-segmented">
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${complexity === 'compact' ? 'is-active' : ''}`}
                    onClick={() => setComplexity('compact')}
                    disabled={loading}
                  >
                    <span>Compact</span>
                  </button>
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${complexity === 'standard' ? 'is-active' : ''}`}
                    onClick={() => setComplexity('standard')}
                    disabled={loading}
                  >
                    <span>Standard</span>
                  </button>
                  <button
                    type="button"
                    className={`sd-ai-style-btn ${complexity === 'comprehensive' ? 'is-active' : ''}`}
                    onClick={() => setComplexity('comprehensive')}
                    disabled={loading}
                  >
                    <span>Detailed</span>
                  </button>
                </div>
              </div>

              <div className="sd-ai-option-card">
                <label className="sd-ai-sublabel">Owning Department</label>
                <div className="sd-ai-select-wrap">
                  <Building2 size={15} className="sd-ai-input-icon" />
                  <select
                    className="sd-ai-select"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={loading}
                  >
                    {departments && departments.length > 0 ? (
                      departments.map((d) => (
                        <option key={d.id || d.name} value={d.name}>
                          {d.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="IT & Systems">IT & Systems</option>
                        <option value="Finance & Accounting">Finance & Accounting</option>
                        <option value="Human Resources">Human Resources</option>
                        <option value="Legal & Compliance">Legal & Compliance</option>
                        <option value="Operations">Operations</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Categorized Enterprise Blueprints Grid */}
            <div className="sd-ai-blueprints-card">
              <div className="sd-ai-inspiration-header-row">
                <div className="sd-ai-inspiration-header">
                  <Wand2 size={14} className="sd-ai-text-accent" />
                  <span>Instant Enterprise Blueprints ({filteredPresets.length})</span>
                </div>
                <div className="sd-ai-category-tabs">
                  {PRESET_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`sd-ai-cat-tab ${activeCategory === cat.id ? 'is-active' : ''}`}
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sd-ai-chips-grid-large">
                {filteredPresets.map((item, idx) => {
                  const isSelected = prompt === item.prompt;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`sd-ai-blueprint-tile ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleSelectInspiration(item)}
                      disabled={loading}
                    >
                      <span className="sd-ai-tile-icon">{item.icon}</span>
                      <div className="sd-ai-tile-info">
                        <span className="sd-ai-tile-title">{item.label}</span>
                        <span className="sd-ai-tile-meta">{item.dept} · {item.style.toUpperCase()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            BOTTOM PINNED FOOTER BAR
           ============================================================ */}
        <footer className="sd-ai-studio-footer">
          <div className="sd-ai-footer-status">
            {loading ? (
              <span className="sd-ai-loading-text">
                <Loader2 size={16} className="sd-spin" />
                <span>
                  {engineMode === 'ollama' && ollamaStatus.online
                    ? `Synthesizing via Local Ollama LLM (${ollamaModel || ollamaStatus.defaultModel || 'model'})…`
                    : 'Synthesizing Word layout, interactive pills & approval chain…'}
                </span>
              </span>
            ) : (
              <span className="sd-ai-ready-text">
                <CheckCircle2 size={16} className="sd-ai-text-accent" />
                <span>
                  {engineMode === 'ollama' && ollamaStatus.online
                    ? `Active Engine: Local Ollama LLM (${ollamaModel || ollamaStatus.defaultModel}) · Beta`
                    : 'Active Engine: Instant Built-in NLP Synthesizer (<15ms)'}
                </span>
              </span>
            )}
          </div>

          <div className="sd-ai-footer-buttons">
            <button
              type="button"
              className="btn btn-secondary sd-ai-cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              id="btn-confirm-ai-generate"
              className="btn btn-primary sd-ai-generate-submit-btn"
              onClick={() => runGeneration({ inspectOnly: false })}
              disabled={loading || !prompt.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="sd-spin" />
                  <span>Synthesizing Document…</span>
                </>
              ) : (
                <>
                  <Sparkles size={17} />
                  <span>Generate Form into Studio</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
