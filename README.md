# SmartDoc — Enterprise Word-Template Forms & Department Approval Workflow

**SmartDoc** is a modern, unified enterprise web platform for managing Word-template forms, hierarchical document folders, digital signatures, and multi-stage department approval workflows.

---

## 🚀 Key Features

### 1. Windows Explorer Forms & Documents Hub (`FormsHub.jsx`)
- **Hierarchical Enterprise Drives**: Top-level Department drives organizing folders, subfolders, templates, and submissions.
- **Arbitrary Depth Nesting**: Create, rename, and delete nested folders to any arbitrary depth.
- **Strict Role-Based User Rights**:
  - `superadmin`: Global control across all departments.
  - `admin` (Department Admin): Full folder CRUD and template management within their assigned department.
  - `user` (Regular User): Read-only exploration of authorized templates and folders.
- **Explorer Navigation**: Breadcrumb address bar (`SmartDoc Drive > Human Resources > Onboarding`), Back/Forward/Up buttons, real-time search, item counts, and access rights indicators.
- **Storage Space Tracking & Display**: Real-time storage space tracking (B, KB, MB, GB) for each file/template, recursive folder storage space (including all nested subfolders to any depth), department drive total storage, and live total storage calculation in the Explorer status bar.
- **Strict Duplicate File Prevention**: Uniqueness on document Title (`title`) and File Name (`fileName`) is strictly enforced within each folder and department drive root. Prevents duplicate uploads, renaming collisions, and conflicting folder moves.
- **Draft Documents & Direct Staging**: Department admins can upload documents and templates purely as unpublished drafts (`status = 'DRAFT'`) without defining an approval chain. Drafts are private to department admins and can be promoted to active forms at any time.
- **Dual View Modes**: Switch seamlessly between Grid (Card/Tiles) and Details (Table) views with dedicated Size columns.
- **Safe Re-Parenting**: Deleting a folder automatically re-parents its contents to the parent folder to prevent data loss.

### 2. Microsoft Word & Form Creation Studio (`SmartWordStudio.jsx`)
- **Full Union of Word Processor + Custom Form Creator**: Design professional documents and interactive forms on an authentic A4 sheet canvas.
- **Authentic Microsoft Word Ribbon**:
  - **Home Tab**: Undo / Redo (with `Ctrl+Z` / `Ctrl+Y` shortcuts and history snapshot stack), font family, font size, bold, italic, underline, strikethrough, paragraph alignment (left, center, right, justify), bullet/numbered lists, heading styles (Normal, H1, H2, H3).
  - **Text Color & Highlight Color Tools**: Authentic Word-style split buttons for **Font Color** (`Baseline` icon with color underline bar) and **Highlight Color** (`Highlighter` icon with color bar). Includes curated 24-color palettes, "Automatic / Reset" and "No Color / Clear" options, and custom hex color pickers.
  - **Insert Elements Tab**:
    - **Interactive Form Fields**: Short Text Box, Multiline Text Area, Date Picker, Number Input, Dropdown / Select menu, and Checkbox.
    - **In-Text Placeholders (Legal & Contracts)**: Dedicated quick-insert tools for flowing agreements (Party / Name, Agreement Date, Contract Amount, Governing Law) that sit directly within paragraph prose.
    - **Signature Blocks**: Submitter Signature slot and Department Approval Signature slots.
    - **System Tags**: `{{Form ID}}`, `{{Submitted By}}`, `{{Submitted Date}}`, `{{Department}}`, and `{{Version}}`.
    - **Word-Style Tables**: 10×8 hover grid picker, plus contextual **Table Tools** ribbon tab (Insert Row/Col Above/Below/Left/Right, Delete Row/Col/Table, Merge Cells, Split Cell, Shading, Alignment, Borders, Column resize).
    - **Document Layout**: Horizontal dividers and page breaks.
  - **Page Layout Tab**: Margins (Normal, Narrow, Wide), Page sizes (A4, Letter), and Orientation (Portrait, Landscape).
  - **Workflow & Approvals Tab**: Target department, destination folder, target audience (All Users vs Department Only), decision deadline in days, and ordered department approval chains (auto-synced with department signature slots).
- **Authentic Microsoft Word Print Engine**: Dedicated print pipeline (`printWordDocument` and `POST /api/forms/render-print-document`) that renders genuine Word documents (`.docx`) for printing with authentic Word margins, headers, tables, and page layout rather than basic browser HTML print.
- **Save as Draft Option**: Dedicated `[ Save Draft ]` action allows saving work directly into folders without configuring an approval chain until ready to publish.
- **In-Document Interactive Widgets**: Clickable field pills (`.sd-doc-field-pill`), signature blocks (`.sd-doc-sig-block`), and system tags open inline customization popovers directly inside the document canvas for:
  - **Field Format**: Switch between `🏷️ In-Text Placeholder (Dialog)` and `📝 Direct Input Box`.
  - **Text Weight (Template Level)**: Switch between **Normal Text** (standard document body weight) and **Bold (700)** (heavier emphasis for filled values like names or amounts) saved into the template schema (`fields[].bold`).
  - **Field Sizing & Options**: Setting labels, mandatory toggles, placeholders, dropdown options, and field widths (Auto / 25% / 33% / 50% / 66% / 75% / 100%). Each element features a quick-remove (×) button.
  - **Field Guidance & Description**: Add rich multi-line instructions and filling guidance stored on the field schema.
  - **Staging & Clean Cancellation**: Inserting a placeholder stages the field and opens the customizer; canceling or closing the dialog cleanly removes the draft field from the document canvas without leaving orphan tags.
- **Backdrop Outside-Click Protection**: All dialogs, popovers, and modals in Word Form Studio and across the app feature outside-click protection so accidental clicks on the dark backdrop never discard unsaved changes.
- **Live Form Preview**: Header toggle (Edit / Side by side / Preview) renders the document as end-users will experience it with live interactive form fields and approval steps.
- **Full `.docx` & `.doc` Roundtrip**: Import existing `.docx` and legacy `.doc` (Word 97-2004) files, edit directly in the studio, or start with a clean blank canvas; compile and export valid `.docx` files via `html-to-docx`.

### 3. Cross-Department Pre-Publication Review & Diff/Merge Workflow (`ReviewsHub.jsx`)
- **Collaborative Template Review Before Publishing**:
  - Authors can send uncommitted form templates for review to selected colleagues across **any department** prior to publishing to the folder drive.
  - **Multi-Department Reviewer Selection (`SendForReviewModal.jsx`)**: Search users by name/username, quick department-level select/clear all, role indicators, and custom instructions/notes.
- **Reviewer Studio Session Mode**:
  - Reviewers receive real-time review notifications and open the document in a focused review mode within Word Form Studio.
  - Reviewers can modify document copy, tables, and form controls, submit with reviewer comments, or indicate no changes needed.
- **Granular Diff & Merge Engine (`reviewDiff.js`)**:
  - Block-level parsing and fine-grained paragraph run alignment.
  - Word-level HTML diff generator displaying additions (`<ins>`) in green and deletions (`<del>`) in red.
  - Overlap and conflict detection across multiple reviewers modifying the same paragraph.
- **Initiator Reconciliation Dashboard (`ReviewChangesModal.jsx`)**:
  - Real-time reviewer progress indicators (e.g. `2 / 2 submitted`).
  - Per-reviewer diff cards with granular accept/reject controls per modified paragraph.
  - Bulk actions: "Accept all from this reviewer", "Reject all from this reviewer", or "Reset".
  - Live side-by-side Resulting Document preview updating in real-time as decisions are accepted or rejected.
  - Finalized merge opens directly in Word Form Studio with a "Review finished" banner.
- **In-Place Template Update on Finalization**:
  - Resuming and publishing a review that originated from an existing template updates that template in-place with a version bump (e.g., `v1.8` → `v1.9`) and a Git commit summary, preventing duplicate templates in the department folder.

### 4. Executive Control Dashboard (`SmartDashboard.jsx`)
- **Real-Time KPIs**: Live counts for Pending Approvals (in current user's department queue), My Submissions, and Active Form Templates.
- **Submission Activity Stream**: Status tracking for recent form submissions across all departments.
- **Zero Mock Data**: Operates strictly on live PostgreSQL records with zero seeded fake data.

### 5. Form Submissions & Fill Workflow (`FillFormModal.jsx`)
- **Dynamic Form Filling**: Auto-generates form controls from detected template placeholders and Word Form Studio widgets.
- **Dedicated Right-Side Interactive Form Rail**: Docked panel containing clean input cards for all placeholders and form fields, complete with live completion counters, mandatory indicators, field index tags, and type-specific controls (date shortcuts, number, dropdown, textarea).
- **Field Descriptions & Guidance**: Interactive fields display rich multi-line instructional guidance in the right rail cards, single-field dialogs, and canvas tooltips to help users complete complex forms accurately.
- **Zero-Highlight Natural Text & Baseline Alignment**: In-text placeholders blend seamlessly into document prose with zero colored boxes or borders (`border: none; background: transparent;`), sitting directly on the typographic baseline (`line-height: inherit !important`) with zero line displacement.
- **Template-Governed Text Weight**: Automatically renders values in bold (`font-weight: 700`) or normal weight strictly according to template author specifications, with zero fill-level formatting distractions.
- **Dynamic Visual Leader Connector Line**: Animated curved SVG leader line connecting the active right-rail input card to its exact location in the document prose, with a downward pointer arrow and a header toggle switch (`localStorage` persisted) to turn on/off.
- **Bidirectional Two-Way Interaction**: Real-time typing reflection in the document canvas, automatic rail focus when clicking document placeholders, and single-field modal editing via double-click.
- **Rigorous Validation & Missing Prompts**: Real-time validation for required fields, plus an alert modal listing any incomplete mandatory fields with direct "Fill Now →" navigation.
- **Digital Signature Binding**: Submissions require a saved personal signature created via the built-in **Profile & Signature** Studio (`ProfileAndSignatureModal.jsx`), featuring Freehand Draw, Typed Calligraphy (4 fonts), and Scanned Paper Signature upload.
- **Exact 1:1 Visual Fidelity Print & PDF Download**:
  - Printing (`window.print()`, `Ctrl+P`) and downloading PDF (`exportFormSheetToPdf` via `html2canvas` 3.5× + `jsPDF`) produce an exact 1:1 replica of the on-screen form sheet (`.sd-form-filler-sheet`).
  - Retains authentic input boxes, light gray `#cbd5e1` borders, labels, and typed text with zero layout shifts or degradation.
  - Submitter & workflow digital signatures retain their authentic cards with dashed border (`#6366f1`), `Step 0 (Originator)` badge, drawn signature strokes, signer name, and cryptographic RSA-2048 PKI seal.
  - **Intelligent Field Highlighting Suppression**: Rail-selected input glow and accent focus rings (`.is-active-target`) are cleanly suppressed during print and PDF export across CSS (`@media print`, `body:not(.sd-printing-live-form)`) and DOM cloning, ensuring all fields render with clean, professional, uniform borders without editing rings.
  - **Input Field Placeholders Removed**: All input field placeholders (e.g. `Enter First Name…`, `YYYY-MM-DD`) are automatically stripped during print and PDF download, leaving clean, empty input boxes for unentered fields.
  - **Empty Placeholders Replaced with Dash**: Any unfilled in-text legal or contract placeholders in document prose (e.g. `{{Contract Amount}}`) are automatically replaced with a clean typographic dash (`—`), preventing raw tags or curly braces from appearing in printed or downloaded documents.
  - **Dedicated Header Ribbon Actions**: Direct **Download PDF** (`#btn-download-live-form-pdf`), **Print Form**, and **Print Blank** buttons in the top ribbon for instant document generation.

### 6. Enterprise PKI Digital Signatures & X.509 Cryptographic Verification
- **Authentic Asymmetric Cryptography (RSA-2048)**: Beyond visual graphical signatures, every user account is automatically provisioned an RSA 2048-bit keypair and a standardized **X.509 v3 Digital Certificate** (`server/pkiEngine.js`).
- **Deterministic Content Digesting**: Computes a canonical, sorted JSON SHA-256 hash of form answers upon submission or resubmission, ensuring whitespace and key ordering do not cause signature drift.
- **Cryptographic Envelope Signing**: Submitter and approving department private keys sign the document digest using RSA-SHA256, storing immutable signature envelopes in PostgreSQL (`pki_signature`).
- **Real-Time Tamper Detection & Verification**: Anyone inspecting a submission can click **Verify Digital Signatures** in `SubmissionDetailModal.jsx` to test the stored signatures against the current document content and public certificates. Any post-signing tampering or database manipulation immediately trips a high-visibility warning.
- **Certificate Management**: Users can inspect their X.509 certificate subject, issuer, serial number, and SHA-256 fingerprint, download their public `.crt` certificate, or renew their keys directly in the **PKI Certificate** tab of `ProfileAndSignatureModal.jsx`.

### 7. Multi-Stage Department Approval Engine (`FormApprovals.jsx`)
- **Dedicated Operational Queues**:
  - **My Queue**: Submissions currently waiting at the user's department approval step.
  - **My Submissions**: Real-time tracking of forms submitted by the user.
  - **Department Forms**: Department-wide submission directory for admins.
- **Submission Detail Modal (`SubmissionDetailModal.jsx`)**:
  - Submitted values and metadata.
  - Live visual workflow track showing approval progress across each department.
  - Complete chronological audit history and in-form comments.
  - **Unified Form Sheet Preview, PDF Save & Print**: Features dedicated "Preview Form Sheet", "Save as PDF", and "Print" actions that mount the authentic `<FillFormModal isViewOnly={true} />` canvas, guaranteeing exact visual fidelity for submitted forms.
- **Three Core Operational Actions**:
  - **Approve**: Department admin stamps their saved signature and moves the form to the next department in the chain (or completes the workflow if at final step).
  - **Raise Objection**: Department admin provides mandatory objection notes, changing status to `OBJECTION_RAISED`. The submitter can modify answers, bumping the document version (e.g., 1.0 → 1.1) and restarting approval from Step 1.
  - **Reject**: Final termination with mandatory rejection reason.

### 8. Document Preview & Signature Stamping (`DocumentPreviewModal.jsx`)
- **High-Fidelity Rendering**: In-browser preview of generated Word documents using `docx-preview`, interactive embedded PDF viewer, responsive image viewer, and completed form submissions (rendered natively via `<FillFormModal isViewOnly={true} />`).
- **Dynamic Signature & PKI Stamping**: Server-side engine (`server/docxEngine.js`) injects actual PNG signatures, merges all form field values, and prints cryptographic verification lines (`[PKI Certified: <fingerprint> · Cert #<serial>]`) directly beneath each signature and in the appended approval audit block.
- **Direct Export**: Immediate Download (`.docx`, `.pdf`, `.png`) and Print actions.

### 9. Word Template (.docx & .doc) & Non-Editable Document Uploader (`TemplateUploadModal.jsx`)
- **Universal Word Document Ingestion**: Automatically scans uploaded `.docx` and legacy `.doc` files for `{{placeholders}}`, signature slots (`{{Signature:...}}` and `{{sig:...}}`), and system tags. Legacy `.doc` templates are parsed via `word-extractor` and compiled to valid `.docx` upon publishing.
- **Placeholder Configuration Table**: Authors can review detected placeholders, customize labels, set **Fill Style** (`🏷️ Placeholder (Dialog)` vs `📝 Direct Input`), toggle mandatory status, and select typographic **Weight** (`Bold` vs `Normal`).
- **Direct Draft Upload**: Upload templates as unpublished drafts (`status = 'DRAFT'`) without requiring an approval workflow.
- **Folder Duplicate Detection**: Real-time validation alerts if a document with the same title or file name already exists in the destination folder.
- **Static Reference Documents**: Multi-format support for `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp`. Static files are stored with `is_editable: false` and are shielded from accidental schema modifications in Word Form Studio.
- **Native Browser Viewing**: Rendered cleanly in `DocumentPreviewModal.jsx` with quick print, download, and non-editable indicators.

### 10. High-Speed Bulk Document & Template Ingestion (`BulkImportModal.jsx`)
- **Batch Drag & Drop Ingestion**: Upload dozens of documents simultaneously across `.docx`, `.doc`, `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp`.
- **Automatic Draft Staging**: All bulk-imported files are automatically staged as unpublished drafts, skipping approval workflows until individual documents are reviewed and ready to publish.
- **Batch Duplicate Conflict Detection**: Scans staged files for naming collisions within the batch and against files already present in the target folder, with visual warning badges and a one-click **"Remove Duplicates"** cleaning tool.
- **Destination Folder Routing**: Allows targeting either the department root drive or any specific subfolder within the department.

### 11. Granular Form Access Rights & Permissions (`TemplatePermissionsModal.jsx`)
- **Three-Tier Scope Control**:
  - **All Users (`ALL`)**: Public access across the entire organization.
  - **Specific Departments (`DEPARTMENTS`)**: Restricted to designated department drives and their members.
  - **Specific Persons Only (`USERS`)**: Individual-level access whitelist for confidential executive forms.
- **Strict Query Filtering**: Backend enforces access checks on template listing and file access to prevent unauthorized viewing.

### 12. Real-Time Enterprise Notification System (`NotificationBell.jsx`)
- **Instant Alerts Drawer**: Notification bell in sidebar with live unread counter badge and 15s background polling.
- **Automated Workflow Events**:
  - Signature requests for required approvers.
  - Form submission arrivals and departmental handoffs.
  - Approval decisions, objections, and rejections.
  - Pre-publication review requests and reviewer completion notifications.
- **Deep Linking**: Click any notification to navigate directly to the relevant submission, form, or review.

### 13. Git-Like Versioning System (`VersionHistoryModal.jsx`)
- **Commit History & Hashes**: Tracks version bumps (1.0 → 1.1 → 2.0) with author, timestamp, commit hash, and summary note.
- **Mandatory Commit Messages**: Every template update prompts the editor for a change summary before saving.
- **Branch Timeline View**: Interactive vertical Git-style timeline displaying all prior iterations and change logs.

### 14. MS Word-Style In-Form Comments & Objections
- **Margin Comments Rail**: Docked side panel in `SmartWordStudio.jsx` and `SubmissionDetailModal.jsx` with full comment author resilience (supporting both user profiles and legacy accounts).
- **Categorized Feedback**: Tag comments as General Note, Suggestion, Objection, or Change Request.
- **In-Document Resolution**: Direct "✓ Accept" and "✕ Reject" actions recording resolution status and resolving user.

### 15. Departmental Messaging (`DepartmentMessaging.jsx`)
- **Team Collaboration**: Department-scoped messaging hub allowing team members and admins to coordinate on reviews, policies, and template approvals.

### 16. System Administration & Security (`SmartSettingsAdmin.jsx`)
- **User Lifecycle Management**: Superadmin can create users, edit details, toggle active/inactive status, and delete accounts (minimum password length: 6 characters).
- **Department Administration**: Superadmin can create departments and delete unused departments (deletion is protected if users are currently assigned).
- **System Reset & Data Purge (Danger Zone)**:
  - **Option 1: Wipe Out Every Data (Factory Reset)**: Completely purges all templates, folders, submissions, reviews, messages, notifications, and non-superadmin accounts, restoring default enterprise departments and preserving the Superadmin.
  - **Option 2: Wipe Only Forms**: Purges all form templates, folders, submissions, reviews, and form alerts while strictly preserving all user accounts, roles, signatures, departments, and chat messages.
- **Audit Logging**: Comprehensive server-side logging for all security events, logins, folder modifications, template updates, and workflow actions.

### 17. Activity Log & Audit Trail (`ActivityHub.jsx`)
- **Role-Scoped Activity Ledger**: Role-based access enforcement (Superadmin sees all departments; Department Admins view their department; Standard Users view their personal history).
- **Database Pagination**: High-performance backend pagination (`page`, `pageSize`, total counts) supporting massive enterprise audit volume.
- **Standalone Window Console (`/activity?popup=true`)**: Dedicated popout window mode without app navigation chrome.
- **Search, Filtering & CSV Export**: Real-time debounced keyword search, category pills, and complete CSV ledger export.
- **Cryptographic Fingerprinting**: Every event is recorded with a verified SHA-256 integrity hash.

### 18. Application Version Tracking & Automated Cache Clearing ("Ctrl + F5")
- **Live Footer Version Badge**: The footer (`AppFooter.jsx`) displays the real-time application version (`v1.2.0`) with a pulsing status dot and manual cache-clear action.
- **Automated Cache Clearing**: Automatically purges `CacheStorage` and service workers with cache-busting reload (`Ctrl + F5` equivalent) whenever a new client or server build version is detected, guaranteeing instant deployment pickup without stale cached chunks.
- **Universal Backdrop Click Immunity**: All dialogs, popovers, and modals (folder CRUD, field customizers, single-field dialogs, missing fields alerts, commit modals) feature backdrop outside-click protection to safeguard against accidental data loss.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Vanilla CSS (`src/App.css`, `src/index.css`), Pure Black Dark Mode (`#000000`), Multi-Accent Support (Electric Lime, Orange, Blue, Red, Purple), Lucide React Icons |
| **PKI Cryptography** | Native `node:crypto` (RSA 2048-bit, SHA-256 digests) + `node-forge` (X.509 v3 Digital Certificates) |
| **Document Rendering** | `docx-preview` (high-fidelity in-browser `.docx` renderer), native PDF embed, image preview, WYSIWYG form-isolated sheet printing |
| **PDF Export Engine** | `jspdf` (v4.2.1) + `html2canvas` (v1.4.1) (`src/utils/pdfExportEngine.js`) — 3.5× ultra-HD client-side form sheet PDF export with dynamic input capture |
| **Word Processing Engine** | `docxtemplater`, `pizzip`, `mammoth` (HTML parsing), `html-to-docx` (Word compilation) |
| **Diff & Merge Engine** | Custom block/word-level LCS diff with conflict detection and merge synthesis (`reviewDiff.js`) |
| **Backend** | Node.js, Express (`server/server.js`, port 3001; Vite proxies `/api`) |
| **Database** | PostgreSQL (`server/pgDb.js`), automatic schema initialization, zero mock data |

---

## 📁 Project Architecture & Routes

### Route Mapping (`SmartSidebar.jsx` → `App.jsx`)
- `dashboard` → `<SmartDashboard />` (Live executive metrics & activity)
- `forms` → `<FormsHub />` (Windows Explorer + `<SmartWordStudio />`, `<TemplateUploadModal />`, `<FillFormModal />`, `<TemplatePermissionsModal />`, `<VersionHistoryModal />`)
- `reviews` → `<ReviewsHub />` (Pre-publication reviews, reviewer edit mode, diff & accept/reject reconciliation)
- `approvals` → `<FormApprovals />` (+ `<SubmissionDetailModal />`)
- `dept-messaging` → `<DepartmentMessaging />` (Department team chat)
- `activity` → `<ActivityHub />` (Role-scoped Activity Log, database pagination, CSV export)
- `settings` → `<SmartSettingsAdmin />` (Superadmin only: user & department management, System Reset)

### Global Modals & Controls (with Backdrop Outside-Click Immunity)
- `NotificationBell.jsx`: Real-time notification drawer with unread counter.
- `ProfileAndSignatureModal.jsx`: Unified digital signature creation (Freehand, Type cursive, Upload paper scan), PKI X.509 Digital Certificate management (view, copy SHA-256 fingerprint, download `.crt`, renew), and custom profile photo management (upload, zoom slider, center-crop).
- `SubmissionDetailModal.jsx`: Complete form review, in-form Word-style comments, Git-like version history, and interactive **PKI Cryptographic Integrity Seal** with live signature verification.
- `SendForReviewModal.jsx`: Multi-department reviewer picker with instructions.
- `ReviewChangesModal.jsx`: Initiator diff visualizer, per-change accept/reject controls, and live preview.
- `TemplatePermissionsModal.jsx`: Modern, compact access rights configuration with 3-way segmented scope switcher (All Employees, Departments with live employee counts, Specific Persons user picker) and dynamic theme adaptability.
- `VersionHistoryModal.jsx`: Git-like commit timeline and version diffs.
- `DocumentPreviewModal.jsx`: In-browser preview for `.docx`, `.pdf`, and images with Print and Download actions.
- `ToastContainer.jsx`: Global notification toast system.
- *Outside-Click Immunity*: All shared and contextual dialogs across the application ignore backdrop clicks to ensure in-progress work is never lost; modals are dismissed only via explicit action buttons or `Escape`.

---

## ⚙️ Getting Started

### 1. Prerequisites
- **Node.js**: v18+ or v20+
- **PostgreSQL**: v14+ running locally or remotely

### 2. Configuration (`.env`)
Create a `.env` file in the root directory:

```env
# PostgreSQL Configuration
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_postgres_password
PGDATABASE=smartdoc

# Initial Super Admin Account (Auto-seeded on first run; login is username + password)
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_NAME=Super Administrator
SUPER_ADMIN_EMAIL=admin@smartdoc.com
SUPER_ADMIN_PASSWORD=admin123

# Backend port
PORT=3001
```

### 3. Installation & Run

#### Development (Hot-Reloading):
```bash
# Install dependencies
npm install

# Terminal 1: Start backend server
node server/server.js

# Terminal 2: Start frontend development server
npm run dev
```

#### Production (Single-Service Unified App):
```bash
# Build frontend and launch unified server on a single port
npm run build:start

# Or start the server directly after building
npm start
```

### 4. Build Verification
```bash
# Validate production bundle (0 errors)
npm run build
```

---

## 📚 Documentation

- **[USER_MANUAL.md](USER_MANUAL.md)** — Complete step-by-step user and administrator manual.
- **[CONTEXT.md](CONTEXT.md)** — Master architectural context, database schema, and API specification.
- **[GEMINI.md](GEMINI.md)** — Workspace developer guidelines and behavioral constraints.
