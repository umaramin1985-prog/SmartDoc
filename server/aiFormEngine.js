// SmartDoc — AI Form Generation Engine
// Supports Google Gemini API, OpenAI API, and an integrated Built-in Smart Form Synthesizer

/**
 * Escapes HTML characters
 */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Built-in Smart Form Synthesizer
 * Analyzes natural language prompts and synthesizes complete, high-fidelity corporate forms,
 * legal contracts, or inspection checklists with fields, tables, signatures, and approval chains.
 */
export function synthesizeFormTemplate({ prompt, department = 'General', style = 'form' }) {
  const p = (prompt || '').toLowerCase();

  // Determine domain / category
  const isNda = p.includes('nda') || p.includes('non-disclosure') || p.includes('confidentiality');
  const isContract = style === 'contract' || isNda || p.includes('agreement') || p.includes('contract') || p.includes('covenant');
  const isChecklist = style === 'checklist' || p.includes('checklist') || p.includes('inspection') || p.includes('audit');
  const isExpense = p.includes('expense') || p.includes('reimbursement') || p.includes('travel claim') || p.includes('petty cash');
  const isEquipment = p.includes('equipment') || p.includes('hardware') || p.includes('laptop') || p.includes('requisition') || p.includes('asset');
  const isLeave = p.includes('leave') || p.includes('vacation') || p.includes('time off') || p.includes('absence') || p.includes('sick') || p.includes('holiday');
  const isPerformance = p.includes('performance') || p.includes('appraisal') || p.includes('review') || p.includes('evaluation') || p.includes('kpi');
  const isIncident = p.includes('incident') || p.includes('accident') || p.includes('hazard') || p.includes('injury');
  const isAccess = p.includes('access') || p.includes('permission') || p.includes('system access') || p.includes('account') || p.includes('login');
  const isProcurement = p.includes('purchase') || p.includes('procurement') || p.includes('vendor') || p.includes('quote') || p.includes('order');

  // Determine Title
  let title = '';
  if (isNda) title = 'Mutual Non-Disclosure & Confidentiality Agreement';
  else if (isExpense) title = 'Travel & Business Expense Reimbursement Claim';
  else if (isEquipment) title = 'IT Equipment & Hardware Requisition Form';
  else if (isLeave) title = 'Employee Leave Request & Handover Form';
  else if (isPerformance) title = 'Employee Performance Appraisal & Development Review';
  else if (isIncident) title = 'Workplace Incident & Safety Hazard Report';
  else if (isAccess) title = 'System & Network Access Authorization Request';
  else if (isProcurement) title = 'Purchase Requisition & Vendor Approval Form';
  else if (isChecklist) title = 'Facility Safety & Operations Inspection Checklist';
  else if (isContract) title = 'Standard Corporate Service Agreement';
  else {
    const cleanPrompt = prompt.replace(/^(create|generate|make|build|design|a|an|the|form|for)\s+/i, '').trim();
    if (cleanPrompt.length > 5 && cleanPrompt.length < 50) {
      title = cleanPrompt.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + (cleanPrompt.toLowerCase().includes('form') ? '' : ' Form');
    } else {
      title = 'Enterprise Request & Approval Form';
    }
  }

  // Determine Department
  let resolvedDept = department && department !== 'General' ? department : 'General';
  if (resolvedDept === 'General') {
    if (isEquipment || isAccess) resolvedDept = 'IT & Systems';
    else if (isExpense || isProcurement) resolvedDept = 'Finance & Accounting';
    else if (isLeave || isPerformance) resolvedDept = 'Human Resources';
    else if (isIncident || isChecklist) resolvedDept = 'Operations';
    else if (isContract || isNda) resolvedDept = 'Legal & Compliance';
    else resolvedDept = 'Administration';
  }

  // Determine Workflow steps (sequential approval chain)
  let workflow = [];
  if (isExpense) workflow = ['Finance & Accounting'];
  else if (isEquipment) workflow = ['IT & Systems', 'Finance & Accounting'];
  else if (isProcurement) workflow = ['Finance & Accounting', 'Executive Management'];
  else if (isLeave) workflow = ['Human Resources'];
  else if (isPerformance) workflow = ['Human Resources'];
  else if (isAccess) workflow = ['IT & Systems'];
  else if (isIncident) workflow = ['Operations', 'Human Resources'];
  else if (isContract || isNda) workflow = ['Legal & Compliance'];
  else workflow = [resolvedDept];

  let fields = [];
  let htmlContent = '';
  let description = `Automated form generated from: "${prompt}"`;

  if (isContract || isNda) {
    // ==========================================
    // 1. Legal Contract / Agreement Archetype
    // ==========================================
    fields = [
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, mode: 'placeholder', bold: true, description: 'The legally binding start date of this agreement.' },
      { key: 'party_one_name', label: 'First Party (Disclosing)', type: 'text', required: true, mode: 'placeholder', bold: true, description: 'Legal entity name of the disclosing party.' },
      { key: 'party_two_name', label: 'Second Party (Receiving)', type: 'text', required: true, mode: 'placeholder', bold: true, description: 'Legal entity name of the receiving party.' },
      { key: 'governing_law', label: 'Governing Jurisdiction', type: 'text', required: true, mode: 'placeholder', bold: false, description: 'State or country laws governing this contract.' },
      { key: 'term_duration_years', label: 'Term Duration (Years)', type: 'number', required: true, mode: 'input', bold: false, width: 33, description: 'Duration of confidentiality obligations.' },
      { key: 'scope_of_disclosure', label: 'Scope of Discussion / Purpose', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed commercial purpose for sharing proprietary info.' },
      { key: 'confidentiality_agreed', label: 'Acknowledge Terms & Covenants', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Signatory affirmation of non-disclosure covenants.' }
    ];

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 24px;">
  Document Ref: <strong>FRM-CONTRACT-2026</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Version: <strong>{{Version}}</strong>
</p>

<p style="margin-bottom: 14px; text-align: justify;">
  This Non-Disclosure and Confidentiality Agreement (the <em>"Agreement"</em>) is entered into and made effective as of 
  <strong>{{effective_date}}</strong> (the <em>"Effective Date"</em>), by and between 
  <strong>{{party_one_name}}</strong> (<em>"Disclosing Party"</em>), and 
  <strong>{{party_two_name}}</strong> (<em>"Receiving Party"</em>).
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. Purpose of Disclosure</h3>
<p style="margin-bottom: 12px; text-align: justify;">
  The Parties wish to explore a mutually beneficial commercial relationship and, in connection with this purpose, may disclose to each other proprietary and non-public technical, commercial, or operational information.
</p>
<p style="margin-bottom: 14px;">
  <strong>Commercial Purpose & Scope:</strong><br/>
  {{scope_of_disclosure}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Confidentiality Obligations & Term</h3>
<p style="margin-bottom: 12px; text-align: justify;">
  The Receiving Party agrees to maintain the strict confidentiality of all proprietary materials for a period of {{term_duration_years}} years from the Effective Date, exercising at least the same standard of care used to protect its own sensitive trade secrets.
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Governing Law & Jurisdiction</h3>
<p style="margin-bottom: 14px; text-align: justify;">
  This Agreement and any dispute arising out of or related to it shall be governed by, and construed in accordance with, the laws of <strong>{{governing_law}}</strong>.
</p>

<p style="margin-top: 16px; margin-bottom: 16px;">
  {{confidentiality_agreed}}
</p>

<h3 style="margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Execution & Digital Signatures</h3>
<p style="font-size: 9.5pt; color: #475569; margin-bottom: 16px;">
  IN WITNESS WHEREOF, the Parties have caused this Agreement to be executed with binding digital signatures and cryptographic timestamps.
</p>

<div style="display: flex; gap: 20px; margin-top: 16px; margin-bottom: 24px;">
  <div style="flex: 1;">
    <p><strong>Originator / Submitter Signatory:</strong></p>
    {{Signature: Submitter}}
  </div>
  <div style="flex: 1;">
    <p><strong>Department Authorized Signatory:</strong></p>
    {{Signature: ${workflow[0] || 'Legal & Compliance'}}}
  </div>
</div>
`;

  } else if (isChecklist) {
    // ==========================================
    // 2. Audit & Inspection Checklist Archetype
    // ==========================================
    fields = [
      { key: 'inspector_name', label: 'Lead Inspector Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of the evaluating inspector.' },
      { key: 'inspection_date', label: 'Inspection Date', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Date the assessment was conducted.' },
      { key: 'inspection_type', label: 'Audit Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 25, options: ['Routine Monthly Audit', 'Annual Compliance Review', 'Emergency Safety Inspection', 'Quality Assurance Check'], description: 'Primary inspection purpose.' },
      { key: 'facility_location', label: 'Facility / Zone', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Building, warehouse, or lab inspected.' },
      { key: 'compliance_rating', label: 'Overall Result', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Satisfactory (Pass)', 'Conditional Pass (Minor Remediation)', 'Unsatisfactory (Immediate Action Required)'], description: 'Final compliance grading.' },
      { key: 'findings_summary', label: 'Observations & Corrective Actions', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Summary of findings, non-conformances, and required fixes.' },
      { key: 'audit_declaration', label: 'I certify this inspection was conducted truthfully according to company standards', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Inspector compliance sign-off.' }
    ];

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 20px;">
  Form ID: <strong>{{Form ID}}</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Date: <strong>{{Submitted Date}}</strong>
</p>

<h3 style="margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. Inspection Details & Metadata</h3>
<p style="margin-bottom: 8px;">
  {{inspector_name}} &nbsp; {{inspection_date}} &nbsp; {{inspection_type}}
</p>
<p style="margin-bottom: 16px;">
  {{facility_location}} &nbsp; {{compliance_rating}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Assessment Checklist Criteria</h3>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt;">
  <thead>
    <tr style="background-color: #f8fafc;">
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 8%;">#</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 42%;">Evaluation Item / Standard</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 25%;">Compliance Status</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 25%;">Notes / Remarks</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">01</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Work area cleanliness, safety exits clear, and emergency signage illuminated</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">[  ] Pass &nbsp; [  ] Fail &nbsp; [  ] N/A</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
    </tr>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">02</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Equipment operating within calibrated thresholds & maintenance logs up to date</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">[  ] Pass &nbsp; [  ] Fail &nbsp; [  ] N/A</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
    </tr>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">03</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Hazardous materials properly labelled and stored in designated containment</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">[  ] Pass &nbsp; [  ] Fail &nbsp; [  ] N/A</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
    </tr>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">04</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Personal Protective Equipment (PPE) compliant and accessible to all personnel</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">[  ] Pass &nbsp; [  ] Fail &nbsp; [  ] N/A</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
    </tr>
  </tbody>
</table>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Audit Findings & Remediation Plan</h3>
<p style="margin-bottom: 14px;">
  {{findings_summary}}
</p>
<p style="margin-bottom: 16px;">
  {{audit_declaration}}
</p>

<h3 style="margin-top: 22px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Verification & Sign-off</h3>
<div style="display: flex; gap: 20px; margin-top: 14px;">
  <div style="flex: 1;">
    <p><strong>Lead Inspector:</strong></p>
    {{Signature: Submitter}}
  </div>
  <div style="flex: 1;">
    <p><strong>Department Head Approval:</strong></p>
    {{Signature: ${workflow[0] || 'Operations'}}}
  </div>
</div>
`;

  } else if (isLeave) {
    // ==========================================
    // 3. Employee Leave Application Archetype
    // (NO itemized price table!)
    // ==========================================
    fields = [
      { key: 'employee_name', label: 'Employee Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of the staff member.' },
      { key: 'employee_id', label: 'Staff / Payroll ID', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Official employee payroll number.' },
      { key: 'department_name', label: 'Department / Unit', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Current organizational division.' },
      { key: 'leave_type', label: 'Leave Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['Annual Vacation Leave', 'Sick / Medical Leave', 'Casual Personal Leave', 'Unpaid Leave of Absence', 'Compassionate / Bereavement', 'Maternity / Paternity Leave'], description: 'Category of requested absence.' },
      { key: 'start_date', label: 'First Day of Leave', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'First date of absence from work.' },
      { key: 'end_date', label: 'Last Day of Leave', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Final date of absence from work.' },
      { key: 'total_days', label: 'Total Working Days', type: 'number', required: true, mode: 'input', bold: true, width: 17, description: 'Exact count of business days requested.' },
      { key: 'handover_colleague', label: 'Designated Handover Colleague', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Colleague covering urgent responsibilities during absence.' },
      { key: 'emergency_contact', label: 'Emergency Contact Details', type: 'text', required: false, mode: 'input', bold: false, width: 50, description: 'Phone number or email for emergency access.' },
      { key: 'leave_reason', label: 'Reason for Leave & Handover Plan', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed reason and status of delegated work.' },
      { key: 'handover_declaration', label: 'I confirm my pending duties have been delegated and I will resume work on the next scheduled business day', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Employee responsibility acknowledgment.' }
    ];

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 20px;">
  Form ID: <strong>{{Form ID}}</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Version: <strong>{{Version}}</strong>
</p>

<h3 style="margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. Employee & Position Overview</h3>
<p style="margin-bottom: 16px;">
  {{employee_name}} &nbsp; {{employee_id}} &nbsp; {{department_name}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Leave Schedule & Absence Details</h3>
<p style="margin-bottom: 8px;">
  {{leave_type}} &nbsp; {{start_date}} &nbsp; {{end_date}} &nbsp; {{total_days}}
</p>
<p style="margin-bottom: 16px;">
  {{handover_colleague}} &nbsp; {{emergency_contact}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Handover Plan & Employee Declaration</h3>
<p style="margin-bottom: 12px;">
  {{leave_reason}}
</p>
<p style="margin-bottom: 16px;">
  {{handover_declaration}}
</p>

<h3 style="margin-top: 22px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Authorization & Sign-Off</h3>
<div style="display: flex; gap: 20px; margin-top: 14px;">
  <div style="flex: 1;">
    <p><strong>Employee Signature:</strong></p>
    {{Signature: Submitter}}
  </div>
  ${workflow.map(dept => `
  <div style="flex: 1;">
    <p><strong>${esc(dept)} Authorized Approval:</strong></p>
    {{Signature: ${esc(dept)}}}
  </div>`).join('')}
</div>
`;

  } else if (isPerformance) {
    // ==========================================
    // 4. Employee Performance Review Archetype
    // ==========================================
    fields = [
      { key: 'employee_name', label: 'Employee Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee undergoing performance appraisal.' },
      { key: 'job_title', label: 'Job Title / Designation', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Current corporate position.' },
      { key: 'review_period', label: 'Appraisal Cycle', type: 'dropdown', required: true, mode: 'input', bold: false, width: 25, options: ['Q1 Performance Review', 'Q2 Mid-Year Review', 'Q3 Performance Review', 'Annual Year-End Appraisal'], description: 'Evaluation period.' },
      { key: 'manager_name', label: 'Evaluating Manager', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Direct supervisor leading evaluation.' },
      { key: 'overall_rating', label: 'Performance Rating', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Consistently Exceeds Expectations (5/5)', 'Meets & Often Exceeds Expectations (4/5)', 'Fully Meets Expectations (3/5)', 'Needs Improvement (2/5)', 'Unsatisfactory (1/5)'], description: 'Overall appraisal score.' },
      { key: 'achievements_summary', label: 'Key Milestones & Deliverables Accomplished', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Core deliverables and project accomplishments during cycle.' },
      { key: 'growth_goals', label: 'Next Period Objectives & Development Targets', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Specific measurable goals for subsequent appraisal cycle.' },
      { key: 'review_acknowledgment', label: 'I acknowledge this performance review has been formally discussed with my manager', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Review completion acknowledgment.' }
    ];

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 20px;">
  Form ID: <strong>{{Form ID}}</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Version: <strong>{{Version}}</strong>
</p>

<h3 style="margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. Employee & Review Metadata</h3>
<p style="margin-bottom: 8px;">
  {{employee_name}} &nbsp; {{job_title}} &nbsp; {{review_period}}
</p>
<p style="margin-bottom: 16px;">
  {{manager_name}} &nbsp; {{overall_rating}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Performance Highlights & Deliverables</h3>
<p style="margin-bottom: 14px;">
  {{achievements_summary}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Goals & Development Commitments</h3>
<p style="margin-bottom: 12px;">
  {{growth_goals}}
</p>
<p style="margin-bottom: 16px;">
  {{review_acknowledgment}}
</p>

<h3 style="margin-top: 22px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Multi-Tier Departmental Authorization</h3>
<div style="display: flex; gap: 20px; margin-top: 14px;">
  <div style="flex: 1;">
    <p><strong>Employee Signature:</strong></p>
    {{Signature: Submitter}}
  </div>
  ${workflow.map(dept => `
  <div style="flex: 1;">
    <p><strong>${esc(dept)} Authorized Approval:</strong></p>
    {{Signature: ${esc(dept)}}}
  </div>`).join('')}
</div>
`;

  } else if (isAccess) {
    // ==========================================
    // 5. System & Network Access Request
    // ==========================================
    fields = [
      { key: 'user_name', label: 'User Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Account holder requesting permissions.' },
      { key: 'job_title', label: 'Job Title / Role', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Role determining access entitlement.' },
      { key: 'request_date', label: 'Request Date', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Filing date.' },
      { key: 'system_category', label: 'Target System / Environment', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Production Database / Warehouse', 'Enterprise ERP / Financial Suite', 'Cloud Infrastructure (GCP/AWS/Azure)', 'Corporate Git Repository / CI/CD', 'CRM / Client Records'], description: 'Primary system requiring access.' },
      { key: 'access_level', label: 'Requested Privilege Level', type: 'dropdown', required: true, mode: 'input', bold: false, width: 50, options: ['Read-Only / Auditor Access', 'Standard Operator / Contributor', 'Elevated Admin / Superuser', 'Temporary Incident Access (30 Days)'], description: 'Privilege scope.' },
      { key: 'business_justification', label: 'Business Need & Project Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Explain specific technical tasks requiring these privileges.' },
      { key: 'security_agreement', label: 'I agree to comply with Corporate Cybersecurity and Data Protection Policies', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Cybersecurity agreement sign-off.' }
    ];

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 20px;">
  Form ID: <strong>{{Form ID}}</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Version: <strong>{{Version}}</strong>
</p>

<h3 style="margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. User & Identity Profile</h3>
<p style="margin-bottom: 16px;">
  {{user_name}} &nbsp; {{job_title}} &nbsp; {{request_date}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Access Specifications & Role Entitlements</h3>
<p style="margin-bottom: 16px;">
  {{system_category}} &nbsp; {{access_level}}
</p>

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Justification & Security Agreement</h3>
<p style="margin-bottom: 12px;">
  {{business_justification}}
</p>
<p style="margin-bottom: 16px;">
  {{security_agreement}}
</p>

<h3 style="margin-top: 22px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Multi-Tier Departmental Authorization</h3>
<div style="display: flex; gap: 20px; margin-top: 14px;">
  <div style="flex: 1;">
    <p><strong>Applicant Digital Signature:</strong></p>
    {{Signature: Submitter}}
  </div>
  ${workflow.map(dept => `
  <div style="flex: 1;">
    <p><strong>${esc(dept)} Authorized Approval:</strong></p>
    {{Signature: ${esc(dept)}}}
  </div>`).join('')}
</div>
`;

  } else {
    // ==========================================
    // 6. Corporate Procurement & General Forms
    // Only includes table if prompt is actually about items, expenses, or procurement!
    // ==========================================
    const hasItemizedTable = isExpense || isEquipment || isProcurement || p.includes('item') || p.includes('table') || p.includes('cost') || p.includes('price') || p.includes('budget') || p.includes('rate') || p.includes('inventory');

    if (isExpense) {
      fields = [
        { key: 'employee_name', label: 'Claimant Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee submitting reimbursement claim.' },
        { key: 'employee_id', label: 'Staff ID Number', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Unique payroll identification code.' },
        { key: 'claim_date', label: 'Submission Date', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Date report is filed.' },
        { key: 'expense_category', label: 'Primary Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['Client Entertainment & Meals', 'Flight & Accommodation', 'Local Transport & Mileage', 'Office Supplies & Software', 'Conference & Training'], description: 'Primary expense bucket.' },
        { key: 'currency', label: 'Currency', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['USD ($)', 'EUR (€)', 'GBP (£)', 'CAD ($)', 'AUD ($)'], description: 'Billing currency.' },
        { key: 'total_claimed_amount', label: 'Total Claim Amount', type: 'number', required: true, mode: 'input', bold: true, width: 34, description: 'Sum of all itemized receipt totals.' },
        { key: 'business_purpose', label: 'Business Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Detailed commercial rationale for the incurred expenses.' },
        { key: 'receipts_attached', label: 'I confirm all authentic receipts and tax invoices are attached', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Fiscal compliance confirmation.' }
      ];
    } else if (isEquipment) {
      fields = [
        { key: 'requester_name', label: 'Requester Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Employee requesting equipment.' },
        { key: 'job_title', label: 'Designation / Title', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Official role within the organization.' },
        { key: 'date_required', label: 'Date Required', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Desired fulfillment date.' },
        { key: 'hardware_type', label: 'Hardware Category', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['MacBook Pro / Apple Silicon', 'ThinkPad Workstation / Windows', 'High-Res Display Monitor', 'Peripheral & Docking Bundle', 'Mobile / Tablet Device'], description: 'Type of IT asset requested.' },
        { key: 'urgency_level', label: 'Priority SLA', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['Standard (5-7 Business Days)', 'Expedited (2-3 Business Days)', 'Urgent Critical (<24 Hours)'], description: 'Fulfillment priority.' },
        { key: 'estimated_budget', label: 'Estimated Cost ($)', type: 'number', required: false, mode: 'input', bold: false, width: 34, description: 'Approximate expenditure allocation.' },
        { key: 'business_need', label: 'Operational Need & Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Explain specific technical needs and workflow dependencies.' },
        { key: 'asset_agreement', label: 'I agree to abide by the Enterprise IT Acceptable Use Policy', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'IT policy compliance sign-off.' }
      ];
    } else {
      // General Adaptive Form
      fields = [
        { key: 'applicant_name', label: 'Applicant Full Name', type: 'text', required: true, mode: 'input', bold: false, width: 50, description: 'Full legal name of applicant.' },
        { key: 'applicant_email', label: 'Corporate Email', type: 'text', required: true, mode: 'input', bold: false, width: 25, description: 'Official organizational email address.' },
        { key: 'request_date', label: 'Date of Request', type: 'date', required: true, mode: 'input', bold: false, width: 25, description: 'Application filing date.' },
        { key: 'request_type', label: 'Request Classification', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['Standard Operational Request', 'Special Approval Requisition', 'Budget / Asset Allocation', 'Policy Exception Request'], description: 'Class of request.' },
        { key: 'priority', label: 'Urgency Priority', type: 'dropdown', required: true, mode: 'input', bold: false, width: 33, options: ['Low', 'Medium (Standard)', 'High', 'Critical / Urgent'], description: 'Decision urgency level.' },
        { key: 'reference_number', label: 'Reference Code', type: 'text', required: false, mode: 'input', bold: false, width: 34, description: 'Optional project or cost center code.' },
        { key: 'detailed_description', label: 'Details & Justification', type: 'textarea', required: true, mode: 'input', bold: false, width: 100, description: 'Provide full background, scope, and objectives.' },
        { key: 'policy_acknowledgment', label: 'I certify that the information provided is accurate and compliant with company policies', type: 'checkbox', required: true, mode: 'input', bold: false, width: 100, description: 'Affirmation of accuracy.' }
      ];
    }

    const fieldTag1 = fields[0]?.key ? `{{${fields[0].key}}}` : '';
    const fieldTag2 = fields[1]?.key ? `{{${fields[1].key}}}` : '';
    const fieldTag3 = fields[2]?.key ? `{{${fields[2].key}}}` : '';
    const fieldTag4 = fields[3]?.key ? `{{${fields[3].key}}}` : '';
    const fieldTag5 = fields[4]?.key ? `{{${fields[4].key}}}` : '';
    const fieldTag6 = fields[5]?.key ? `{{${fields[5].key}}}` : '';
    const fieldTag7 = fields[6]?.key ? `{{${fields[6].key}}}` : '';
    const fieldTag8 = fields[7]?.key ? `{{${fields[7].key}}}` : '';

    const tableHtml = hasItemizedTable ? `
<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Itemized Breakdown & Specification</h3>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt;">
  <thead>
    <tr style="background-color: #f8fafc;">
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 8%;">Line</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; width: 44%;">Item / Activity Description</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; width: 12%;">Qty</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; width: 18%;">Unit Rate</th>
      <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; width: 18%;">Total Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">01</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Primary item specification / requested service</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">1</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">—</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">02</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px;">Associated accessories, licenses, or operational provisions</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">1</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">—</td>
      <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">—</td>
    </tr>
  </tbody>
</table>` : `
<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">2. Operational Classification & Priority</h3>
<p style="margin-bottom: 16px;">
  ${fieldTag4} &nbsp; ${fieldTag5} &nbsp; ${fieldTag6}
</p>`;

    htmlContent = `
<h1 style="text-align: center; margin-bottom: 4px;">${esc(title)}</h1>
<p style="text-align: center; color: #64748b; font-size: 10pt; margin-top: 0; margin-bottom: 20px;">
  Form ID: <strong>{{Form ID}}</strong> &nbsp;·&nbsp; Department: <strong>{{Department}}</strong> &nbsp;·&nbsp; Version: <strong>{{Version}}</strong>
</p>

<h3 style="margin-top: 14px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">1. Submitter & Request Overview</h3>
<p style="margin-bottom: 16px;">
  ${fieldTag1} &nbsp; ${fieldTag2} &nbsp; ${fieldTag3}
</p>

${tableHtml}

<h3 style="margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">3. Justification & Acknowledgments</h3>
<p style="margin-bottom: 12px;">
  ${fieldTag7}
</p>
<p style="margin-bottom: 16px;">
  ${fieldTag8}
</p>

<h3 style="margin-top: 22px; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">4. Multi-Tier Departmental Authorization</h3>
<div style="display: flex; gap: 20px; margin-top: 14px;">
  <div style="flex: 1;">
    <p><strong>Applicant Digital Signature:</strong></p>
    {{Signature: Submitter}}
  </div>
  ${workflow.map(dept => `
  <div style="flex: 1;">
    <p><strong>${esc(dept)} Authorized Approval:</strong></p>
    {{Signature: ${esc(dept)}}}
  </div>`).join('')}
</div>
`;
  }

  return {
    success: true,
    title,
    department: resolvedDept,
    description,
    style,
    htmlContent,
    fields,
    workflow,
    source: 'synthesizer'
  };
}

/**
 * Main AI Form Generation Controller
 * Tries Gemini / OpenAI if API key provided or available in env; otherwise falls back gracefully to Built-in Synthesizer.
 */
export async function generateFormWithAi({ prompt, department, style = 'form', apiKey, provider }) {
  if (!prompt || !prompt.trim()) {
    throw new Error('A prompt description is required to generate a form.');
  }

  const geminiKey = apiKey && provider === 'gemini' ? apiKey : process.env.GEMINI_API_KEY;
  const openaiKey = apiKey && provider === 'openai' ? apiKey : process.env.OPENAI_API_KEY;

  // 1. Try Gemini API if key is present
  if (geminiKey) {
    try {
      const res = await callGeminiApi({ prompt, department, style, apiKey: geminiKey });
      if (res && res.title && res.htmlContent) {
        return { ...res, source: 'gemini' };
      }
    } catch (err) {
      console.warn('[aiFormEngine] Gemini API call failed, falling back to built-in synthesizer:', err.message);
    }
  }

  // 2. Try OpenAI API if key is present
  if (openaiKey) {
    try {
      const res = await callOpenAiApi({ prompt, department, style, apiKey: openaiKey });
      if (res && res.title && res.htmlContent) {
        return { ...res, source: 'openai' };
      }
    } catch (err) {
      console.warn('[aiFormEngine] OpenAI API call failed, falling back to built-in synthesizer:', err.message);
    }
  }

  // 3. Built-in Smart Synthesizer (instant, reliable, zero-config)
  return synthesizeFormTemplate({ prompt, department, style });
}

/**
 * Calls Google Gemini API
 */
async function callGeminiApi({ prompt, department, style, apiKey }) {
  const systemInstruction = `You are SmartDoc AI, an expert corporate form designer and legal document specialist.
The user wants to generate a complete Word Form Template based on their prompt.
Do NOT include itemized price/billing tables (Line, Qty, Unit Rate, Total Amount) unless the form is explicitly an expense report, procurement invoice, purchase order, or the prompt explicitly asks for a price/cost table.
Return ONLY a valid JSON object matching this schema:
{
  "title": "Clear Form Title",
  "department": "${department || 'General'}",
  "description": "Brief description of this form",
  "workflow": ["Dept 1", "Dept 2"],
  "fields": [
    {
      "key": "unique_snake_case_key",
      "label": "Human Readable Label",
      "type": "text" | "textarea" | "date" | "number" | "dropdown" | "checkbox",
      "required": true | false,
      "mode": "input" | "placeholder",
      "bold": false,
      "width": 25 | 33 | 50 | 66 | 75 | 100,
      "description": "Helpful guidance for the filler",
      "options": ["Option 1", "Option 2"] // only for dropdown
    }
  ],
  "htmlContent": "HTML string containing A4 Word form with {{field_key}}, {{Signature: Submitter}}, {{Signature: <DeptName>}}, {{Form ID}}, {{Submitted Date}}, {{Department}}, {{Version}}"
}
Ensure the HTML is clean semantic HTML with professional headers, sections, and ends with signature tags.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemInstruction}\n\nUser Prompt: ${prompt}\nTarget Department: ${department || 'General'}\nPreferred Style: ${style || 'form'}` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response text from Gemini');

  const parsed = JSON.parse(text);
  return parsed;
}

/**
 * Calls OpenAI API
 */
async function callOpenAiApi({ prompt, department, style, apiKey }) {
  const systemInstruction = `You are SmartDoc AI, an expert corporate form designer and legal document specialist.
Do NOT include itemized price/billing tables (Line, Qty, Unit Rate, Total Amount) unless the form is explicitly an expense report, procurement invoice, purchase order, or the prompt explicitly asks for a price/cost table.
Return ONLY a JSON object with title, department, description, workflow, fields, and htmlContent with {{field_key}} and {{Signature: ...}} tags.`;

  const url = 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Prompt: ${prompt}\nDepartment: ${department || 'General'}\nStyle: ${style || 'form'}` }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response text from OpenAI');

  const parsed = JSON.parse(text);
  return parsed;
}
