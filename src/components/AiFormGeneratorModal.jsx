import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal } from './ui';
import {
  Sparkles,
  Send,
  Loader2,
  FileText,
  ScrollText,
  ClipboardCheck,
  Building2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  X,
  Wand2
} from 'lucide-react';

const INSPIRATION_PROMPTS = [
  {
    icon: '💻',
    label: 'IT Hardware & Equipment Requisition',
    style: 'form',
    dept: 'IT & Systems',
    prompt: 'Create an IT equipment and hardware requisition form with employee details, required date, hardware category dropdown (MacBook, ThinkPad, Monitor), estimated budget, business need justification, acceptable use policy checkbox, and sequential approval by IT Systems and Finance.'
  },
  {
    icon: '🤝',
    label: 'Mutual Non-Disclosure Agreement (NDA)',
    style: 'contract',
    dept: 'Legal & Compliance',
    prompt: 'Draft a formal mutual non-disclosure and confidentiality agreement between two commercial parties with effective date, disclosing party name, receiving party name, 2-year confidentiality term, governing law jurisdiction, commercial purpose scope, confidentiality acknowledgment checkbox, and signature slots for both parties.'
  },
  {
    icon: '💰',
    label: 'Travel & Expense Reimbursement Claim',
    style: 'form',
    dept: 'Finance & Accounting',
    prompt: 'Design an employee travel and business expense reimbursement claim form with staff name, employee ID, submission date, expense category dropdown, billing currency, total claimed amount, itemized expenses table, commercial justification, receipt attachment declaration checkbox, and Finance department approval.'
  },
  {
    icon: '📋',
    label: 'Facility Safety & Operations Checklist',
    style: 'checklist',
    dept: 'Operations',
    prompt: 'Generate a comprehensive workplace safety and facility inspection audit checklist with inspector name, inspection date, facility location, 4-point compliance criteria table with pass/fail evaluation, remediation plan textarea, compliance sign-off checkbox, and Operations department authorization.'
  },
  {
    icon: '👤',
    label: 'Employee Performance Review & Goals',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Create an employee performance appraisal and quarterly development review with employee name, job title, review period, key achievements textarea, core competency rating dropdown, next quarter goals, employee acknowledgment, and HR department sign-off.'
  },
  {
    icon: '🏥',
    label: 'Medical Leave & Handover Request',
    style: 'form',
    dept: 'Human Resources',
    prompt: 'Formulate an employee medical and sick leave application with employee details, leave start and end dates, total days, doctor certificate verification checkbox, work handover summary textarea, and HR manager approval.'
  }
];

export function AiFormGeneratorModal({ isOpen, onClose, onGenerated, currentDepartment }) {
  const { departments, addToast } = useApp();
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('form'); // 'form' | 'contract' | 'checklist'
  const [department, setDepartment] = useState(currentDepartment || 'IT & Systems');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Optional Provider / API Key settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [provider, setProvider] = useState(() => localStorage.getItem('smartdoc_ai_provider') || 'builtin');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('smartdoc_ai_api_key') || '');

  useEffect(() => {
    if (currentDepartment) {
      setDepartment(currentDepartment);
    }
  }, [currentDepartment]);

  if (!isOpen) return null;

  const handleSelectInspiration = (item) => {
    setPrompt(item.prompt);
    setStyle(item.style);
    if (item.dept) setDepartment(item.dept);
    setError(null);
  };

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    localStorage.setItem('smartdoc_ai_provider', newProvider);
  };

  const handleApiKeyChange = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('smartdoc_ai_api_key', val);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      setError('Please provide a prompt describing the form you want to generate.');
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage('Analyzing requirements and domain…');

    const timer1 = setTimeout(() => {
      setStatusMessage('Synthesizing form fields, tables & approval steps…');
    }, 400);

    const timer2 = setTimeout(() => {
      setStatusMessage('Formatting Word canvas and A4 typography…');
    }, 800);

    try {
      const result = await apiService.generateAiForm({
        prompt: prompt.trim(),
        department,
        style,
        provider,
        apiKey: apiKey.trim() || undefined
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (!result || !result.htmlContent) {
        throw new Error('AI engine did not return valid document content.');
      }

      onGenerated(result);
      onClose();
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      console.error('[AiFormGeneratorModal] Generation failed:', err);
      setError(err.message || 'Failed to generate form. Please try refining your prompt.');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="lg"
      className="sd-ai-generator-modal-content"
    >
      <div className="sd-ai-generator-wrapper">
        {/* Header with Cyber-Glow Sparkles */}
        <div className="sd-ai-modal-header">
          <div className="sd-ai-icon-badge">
            <Sparkles size={22} className="sd-ai-sparkle-glow" />
          </div>
          <div className="sd-ai-header-text">
            <div className="sd-ai-header-title-row">
              <h2 className="sd-ai-modal-title">Generate Form with AI</h2>
              <span className="sd-ai-badge-chip">Smart Engine</span>
            </div>
            <p className="sd-ai-modal-subtitle">
              Describe any corporate form, contract, or checklist. AI will automatically author fields, tables, in-text tags, and approval chains.
            </p>
          </div>
          <button
            type="button"
            className="sd-modal-close-btn"
            onClick={onClose}
            disabled={loading}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="sd-ai-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Prompt Input Area */}
        <div className="sd-ai-section">
          <div className="sd-ai-label-row">
            <label className="sd-ai-field-label">
              What kind of form or document do you want to create?
            </label>
            <span className="sd-ai-char-counter">{prompt.length} characters</span>
          </div>
          <div className="sd-ai-textarea-wrap">
            <textarea
              className="sd-ai-prompt-textarea"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Employee equipment requisition form with staff details, requested date, hardware category dropdown (MacBook, ThinkPad, Monitor), business justification, asset policy agreement checkbox, and dual approval by IT Systems and Finance..."
              disabled={loading}
              autoFocus
            />
            {prompt && !loading && (
              <button
                type="button"
                className="sd-ai-clear-btn"
                onClick={() => setPrompt('')}
                title="Clear prompt"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Inspiration Prompt Chips */}
        <div className="sd-ai-section">
          <div className="sd-ai-inspiration-header">
            <Wand2 size={13} className="sd-ai-text-accent" />
            <span>Prompt Presets & Inspiration</span>
          </div>
          <div className="sd-ai-chips-grid">
            {INSPIRATION_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className={`sd-ai-prompt-chip ${prompt === item.prompt ? 'is-selected' : ''}`}
                onClick={() => handleSelectInspiration(item)}
                disabled={loading}
              >
                <span className="sd-ai-chip-icon">{item.icon}</span>
                <span className="sd-ai-chip-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Options Row: Form Style & Department */}
        <div className="sd-ai-options-grid">
          {/* Form Style Segmented Control */}
          <div className="sd-ai-option-card">
            <label className="sd-ai-sublabel">Document Style</label>
            <div className="sd-ai-style-segmented">
              <button
                type="button"
                className={`sd-ai-style-btn ${style === 'form' ? 'is-active' : ''}`}
                onClick={() => setStyle('form')}
                disabled={loading}
              >
                <FileText size={15} />
                <span>Corporate Form</span>
              </button>
              <button
                type="button"
                className={`sd-ai-style-btn ${style === 'contract' ? 'is-active' : ''}`}
                onClick={() => setStyle('contract')}
                disabled={loading}
              >
                <ScrollText size={15} />
                <span>Legal Contract</span>
              </button>
              <button
                type="button"
                className={`sd-ai-style-btn ${style === 'checklist' ? 'is-active' : ''}`}
                onClick={() => setStyle('checklist')}
                disabled={loading}
              >
                <ClipboardCheck size={15} />
                <span>Audit Checklist</span>
              </button>
            </div>
          </div>

          {/* Department Destination */}
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

        {/* Advanced Provider & API Key Toggle (Optional) */}
        <div className="sd-ai-advanced-section">
          <button
            type="button"
            className="sd-ai-advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <KeyRound size={14} />
            <span>AI Model & API Key (Optional)</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAdvanced && (
            <div className="sd-ai-advanced-panel">
              <div className="sd-ai-provider-row">
                <label className="sd-ai-sublabel">Engine Provider:</label>
                <div className="sd-ai-radio-group">
                  <label className="sd-ai-radio-label">
                    <input
                      type="radio"
                      name="ai-provider"
                      value="builtin"
                      checked={provider === 'builtin'}
                      onChange={() => handleProviderChange('builtin')}
                    />
                    <span>Smart Built-in (Instant, no API key needed)</span>
                  </label>
                  <label className="sd-ai-radio-label">
                    <input
                      type="radio"
                      name="ai-provider"
                      value="gemini"
                      checked={provider === 'gemini'}
                      onChange={() => handleProviderChange('gemini')}
                    />
                    <span>Google Gemini API</span>
                  </label>
                  <label className="sd-ai-radio-label">
                    <input
                      type="radio"
                      name="ai-provider"
                      value="openai"
                      checked={provider === 'openai'}
                      onChange={() => handleProviderChange('openai')}
                    />
                    <span>OpenAI API</span>
                  </label>
                </div>
              </div>

              {provider !== 'builtin' && (
                <div className="sd-ai-key-input-row">
                  <label className="sd-ai-sublabel">
                    {provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'} (or configure in .env):
                  </label>
                  <input
                    type="password"
                    className="sd-ai-api-key-input"
                    placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                    value={apiKey}
                    onChange={handleApiKeyChange}
                  />
                  <p className="sd-ai-key-hint">
                    Key is stored locally in your browser. Leave blank if configured on the server.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sd-ai-modal-footer">
          <div className="sd-ai-footer-status">
            {loading ? (
              <span className="sd-ai-loading-text">
                <Loader2 size={14} className="sd-spin" />
                <span>{statusMessage || 'Generating document…'}</span>
              </span>
            ) : (
              <span className="sd-ai-ready-text">
                <CheckCircle2 size={14} className="sd-ai-text-accent" />
                <span>Ready to synthesize document and fields</span>
              </span>
            )}
          </div>

          <div className="sd-ai-footer-buttons">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              id="btn-confirm-ai-generate"
              className="btn btn-primary sd-ai-generate-submit-btn"
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="sd-spin" />
                  <span>Synthesizing…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Generate Form</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

