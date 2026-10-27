# SmartDoc — Architecture & Context (Living Source of Truth)

> **Scope (simplified build with Windows Explorer, 2026-10-20):** SmartDoc is a **Word-template forms & approval workflow** system with a **Windows Explorer file & folder structure**.
> - At the top level are **Departments** (enterprise drives).
> - Under each department, respective department admins can create their own folder structure (subfolders to any arbitrary depth) to save, organize, and view forms and documents.
> - Admins upload `.docx` templates into departments/folders, mark detected fields mandatory, and define an ordered department approval chain.
> - Users explore the structure, fill forms, sign once with their saved signature, and submit. Department admins approve/object/reject.
> - The final output is the original Word file with answers merged and all signatures stamped (download / print).
> - **User rights are strictly enforced**: only department admins can create/modify/delete folders or upload templates in their department; regular users have read-only folder exploration access.

---

## 1. Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, **Vanilla CSS** (`src/App.css`, `src/index.css`), `docx-preview` for in-browser rendering |
| PDF Export Engine | `jspdf` (v4.2.1) + `html2canvas` (v1.4.1) (`src/utils/pdfExportEngine.js`) — authentic client-side Word & live form sheet to PDF conversion (3.5× HD, dynamic input capture, zero layout degradation) |
| Backend | Node/Express (`server/server.js`, port 3001; Vite proxies `/api`) |
| PKI Engine | Native `node:crypto` (RSA-2048, SHA-256) + `node-forge` (`server/pkiEngine.js`) for X.509 v3 Digital Certificates |
| Database | PostgreSQL (`server/pgDb.js`), auto-creates DB + tables on start, seeds super admin from `.env` |
| Word engine | `docxtemplater` + `pizzip` + `word-extractor` + `mammoth` + `html-to-docx` (`server/docxEngine.js`) — universal parser and editor for `.docx` and legacy `.doc` (Word 97-2004 OLE2 / RTF) |

`.env` keys: PG connection (host/port/user/password/db) and `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`.
No mock data is ever seeded — only the super admin.

---

## 2. Roles & Permissions (User Rights)

| Capability | `superadmin` | `admin` (Own Dept) | `admin` (Other Dept) | `user` (Regular User) |
|---|---|---|---|---|
| Explore departments & folders | ✅ Yes | ✅ Yes | ✅ Yes (visible items) | ✅ Yes (visible items) |
| Create folder | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Rename folder | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Delete folder | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Upload template into folder | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Upload static PDF / image document | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Bulk import documents & templates | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Configure access permissions | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Move template to folder | ✅ Any dept | ✅ Own dept only | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Download document & Save as PDF | ✅ Yes | ✅ Yes | ✅ If permitted | ✅ If permitted |
| Fill form & submit | ✅ Yes | ✅ Yes | ✅ If permitted | ✅ If permitted |
| Approve / Object / Reject | ✅ Any step | ✅ Own dept step | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Manage users & depts | ✅ Yes (Settings) | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| System Reset & Data Purge | ✅ Yes (Settings) | ❌ Hidden | ❌ Hidden | ❌ Hidden |

- A department can have multiple admins; **any** admin of the step's department can act on that step.
- Every user must save a signature ("Profile & Signature" pad) before submitting or approving.
- **Workflow & Approvers Mandatory for Filling**: A document/form template cannot be filled or submitted if it has no approval workflow (`workflow.length === 0`). The "Fill form" action in `FormsHub` is disabled with a warning badge and tooltip, `FillFormModal` disables submission with a warning alert, and the backend rejects templates and submissions without approval steps.
- **Draft Documents & Templates (`status: 'DRAFT'`, `isDraft: true`)**:
  - Department admins and superadmins can upload Word templates, PDFs, or images into department folders purely as unpublished **Drafts** without configuring an approval workflow chain.
  - Draft creation is accessible via:
    - **Single Upload Modal (`TemplateUploadModal.jsx`)**: Step 3 displays a draft hint banner when no workflow steps are set, with a dedicated `Upload as Draft` footer button.
    - **Bulk Import Modal (`BulkImportModal.jsx`)**: "Upload as Drafts only" checkbox bypasses workflow validation for batch document uploads.
    - **Word Form Studio (`SmartWordStudio.jsx`)**: Dedicated `[ Save Draft ]` action saves templates as drafts without requiring approval steps.
  - **Permissions & Visibility**: Unpublished drafts are visible and editable exclusively by admins of the owning department and superadmins. Regular users cannot see or fill draft forms.
  - **Promotion to Live**: Department admins can edit drafts in Word Form Studio (`SmartWordStudio.jsx`), configure sequential approval chains and fields, and click `[ Publish Form ]` to promote the status from `DRAFT` to `ACTIVE`. Backend rejects any attempts to submit forms against draft templates.
- **Duplicate File Prevention in Same Folder**:
  - Duplicate documents and templates are strictly forbidden within the same folder (or department drive root where `folder_id IS NULL`).
  - Uniqueness is validated against unarchived documents (`status != 'ARCHIVED'`) across both **Title** (`title`) and **File Name** (`docx_filename` / `fileName`), matching case-insensitively with leading/trailing whitespace trimmed.
  - Enforced comprehensively across all intake and management vectors:
    - **Single Upload (`TemplateUploadModal.jsx`)**: Real-time detection of name/title collisions against the selected folder; displays conflict alert banner and disables submission.
    - **Bulk Import (`BulkImportModal.jsx`)**: Detects conflicts within the staged batch and against target folder templates; provides one-click `Remove Duplicates` cleaning tool; blocks import if any duplicates remain.
    - **Word Form Studio (`SmartWordStudio.jsx`)**: Validates against duplicate document titles in the active folder before publishing or saving drafts; highlights conflict badge in the editor header.
    - **Move Template (`FormsHub.jsx`)**: Validates destination folder before moving; displays `Name Conflict` badge on conflicting destination folder items in the Move dialog and blocks execution.
    - **Backend API & Database**: `findDuplicateTemplateInFolder()` enforces uniqueness on `POST /api/forms/templates`, `POST /api/forms/templates/bulk-import`, `PUT /api/forms/templates/:id`, and `PUT /api/forms/templates/:id/move`, returning HTTP 409 Conflict with descriptive messages.

---

## 3. Routes / Sidebar (`SmartSidebar.jsx` → `App.jsx`)

SmartDoc uses native HTML5 History API client-side routing (`src/utils/router.js` + `AppContext.jsx`) so that every page has a proper, bookmarkable canonical URL, browser Back/Forward works seamlessly, and refreshing the page (`F5`) stays on the exact active page.

| `activeTab` | Canonical URL | URL Aliases | Component | Document Title | Who |
|---|---|---|---|---|---|
| `dashboard` | `/` | `/dashboard` | `SmartDashboard.jsx` — real counts only (my pending approvals, my submissions, templates) | `SmartDoc \| Dashboard` | all |
| `forms` | `/forms` | `/templates`, `/forms-templates` | `FormsHub.jsx` — **Forms & Templates** (Windows Explorer departments & nested folders tree, template studio, search, view modes) | `SmartDoc \| Forms & Templates` | all |
| `reviews` | `/reviews` | — | `ReviewsHub.jsx` — **Pre-Publication Reviews** (Assigned to me / Started by me, reviewer feedback, diffs, accept/reject) | `SmartDoc \| Pre-Publication Reviews` | all |
| `approvals` | `/approvals` | `/submissions`, `/submissions-approvals` | `FormApprovals.jsx` — **Submissions & Approvals** (tabs: My Action Required / My Submissions / All Department Submissions) | `SmartDoc \| Submissions & Approvals` | all |
| `dept-messaging` | `/dept-messaging` | `/messages`, `/messaging`, `/chat` | `DepartmentMessaging.jsx` — department team chat | `SmartDoc \| Team Messaging` | all |
| `activity` | `/activity` | `/audit`, `/audit-log`, `/activity-log` | `ActivityHub.jsx` — **Activity Log & Audit Trail** (role-scoped ledger, SHA-256 integrity, CSV export, standalone popup window) | `SmartDoc \| Activity Log & Audit Trail` | all |
| `settings` | `/settings` | `/admin` | `SmartSettingsAdmin.jsx` — Users, Departments & System Reset | `SmartDoc \| Users & Departments` | superadmin only |

- **Activity Log & Role-Based Scoping (`ActivityHub.jsx`, `GET /api/audit-logs`)**:
  - **Super Admin (`superadmin`)**: Full visibility across all enterprise departments and user accounts. Can filter by department, action category, or search query.
  - **Department Head (`admin`)**: Strictly scoped to actions within their department (`a.department = actor.department` or actor in their department). Cannot view other departments' activity.
  - **Ordinary User (`user`)**: Strictly scoped to their own actions (`a.actor_email = actor.username`). Cannot see other users' activities.
  - **Standalone Window Mode (`/activity?popup=true`)**: Accessible via the "Separate Window" button (`window.open`). Renders an independent, focused activity monitoring window without app navigation chrome.
  - **Security & Non-Repudiation**: Every recorded event has a cryptographic SHA-256 integrity hash and verified flag. Includes real-time CSV export.

- **Sidebar Navigation**: Links render as semantic `<a href={getPathForTab(id)}>` anchors with `e.preventDefault()`, preserving native link UX (hover status bar, right click copy link) while preventing full page reloads.
- **Refresh & PopState**: Page reload reads `window.location.pathname` on initial state resolution. Browser `popstate` events keep `activeTab` and `document.title` in sync.
- **Auth & Guarding**: Logging in preserves the requested URL; `/settings` is protected such that non-superadmins navigating to `/settings` are automatically redirected to `/dashboard`.
- **Production SPA Serving**: `server/server.js` serves `dist/` static files and provides a wildcard fallback to `dist/index.html` for all non-API GET routes.
- **Collapsible Sidebar (`SmartSidebar.jsx`)**:
  - Global `sidebarCollapsed` state in `AppContext.jsx` persisted in `localStorage` (`smartdoc_sidebar_collapsed`).
  - Toggle triggers: Header button (`#btn-toggle-sidebar` with `PanelLeftClose` / `PanelLeftOpen`), footer button (`#btn-sidebar-collapse-footer` with `ChevronLeft` / `ChevronRight`), and keyboard shortcut `Ctrl+B` / `Cmd+B` (safely ignored when focus is inside text inputs, textareas, or contentEditable elements to preserve Word Studio bold shortcut).
  - Collapsed rail mode: Smooth width transition from `248px` to `72px` with centered navigation icons, tooltips, compact badge indicators (`smart-nav-dot-badge`), and responsive profile avatar. The main viewport expands seamlessly to maximize canvas space for Word Studio, Explorer, and approvals.
  - Mobile responsiveness (<760px): Sidebar defaults to compact 72px rail; tapping expand presents an overlay drawer (`width: 248px; z-index: 2000`) with backdrop shadow.
- **Explorer View Modes (`FormsHub.jsx`)**: The toolbar view toggle (`[Grid] [List]`) seamlessly switches between **Tiles / Grid View** and **Details / Table View** at all levels of the drive hierarchy: both at the root Enterprise Departments level and inside department/folder drives, persisted via `localStorage` (`smartdoc_explorer_view`).

### Components (`src/components/`)
- `SmartWordStudio.jsx` — **Microsoft Word & Custom Form Creation Studio**:
  - Full union of MS Word document editor and custom form builder on an authentic A4 sheet canvas.
  - **Typographic Line Spacing**: Document canvas uses authentic MS Word single line spacing (`line-height: 1.25`, `margin: 0` on `<p>` and `<div>`, `min-height: 1.25em`) ensuring zero/minimal vertical gap between consecutive lines and within table cells. Pressing Enter moves directly to the next line without an artificial paragraph block gap.
  - Word Ribbon interface:
    - **Home**: **Undo / Redo** (custom snapshot history of the editor HTML, max 100 steps; also `Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z` inside the canvas), font family, font size, bold, italic, underline, strikethrough, paragraph alignment, bullet/numbered lists, headings (H1, H2, H3, normal).
    - **Insert Elements**: In-document interactive form fields (Text Box, Long Text, Date Picker, Number, Dropdown, Checkbox), In-Text Placeholders (Party / Name, Agreement Date, Contract Amount, Governing Law), Signatures (Submitter & Department approval slots), System tags (`{{Form ID}}`, `{{Submitted By}}`, `{{Submitted Date}}`, `{{Department}}`, `{{Version}}`), Tables, Dividers.
    - **Page Layout**: Margins (normal, narrow, wide), Page sizes (A4, Letter), Orientation (portrait, landscape).
    - **Workflow & Approvals**: Department selector, destination folder, audience, decision deadline (days), and sequential approval steps auto-synced with document signatures.
  - In-document widgets: interactive field pills (`.sd-doc-field-pill`), signature blocks (`.sd-doc-sig-block`) and system tags (`.sd-doc-system-tag`). Each has an **×** quick-remove button (`data-remove`); clicking a field/signature opens an inline popover for labels, required/mandatory toggle, types, placeholders, dropdown options, **Field Format switcher** (`🏷️ In-Text Placeholder (Dialog)` vs `📝 Direct Input Box`), **Text Weight switcher** (Normal Text vs Bold `font-weight: 700` for in-text placeholders, stored in `data-field-bold` and compiled into `fields[].bold`), and **Field Width** (Auto / 25 / 33 / 50 / 66 / 75 / 100 % of the row, stored as `data-width` and saved in `fields[].width`). All mutations (insert, edit, remove, typing, docx load) are recorded for undo/redo.
  - **Live form preview**: header toggle **Edit / Side by side / Preview** (`viewMode`). `FormPreviewPane` renders the whole document as users would see it: the editor HTML is cloned and converted by `buildPreviewHtml` (text/tables/headings kept; in-text placeholders become styled preview chips `.sd-pv-placeholder-chip` honoring configured bold weight; direct input fields become live inline inputs at their configured `width`; signature blocks become signature boxes; system tags become `[Tag]` markers), rebuilt on every history snapshot, plus the approval chain and a disabled submit button. Inputs are interactive but never submitted.
  - **Word-style tables**: Insert tab → **Table ▾** opens `TableGridPicker` (10×8 hover grid) to insert any R×C table at the caret. While the caret is inside a table a contextual **Table Tools** ribbon tab (`#tab-table-tools`) appears with: Insert Row Above/Below, Column Left/Right, Delete Row/Column/Table, **Merge Cells / Split Cell**, cell Shading, horizontal/vertical alignment, Borders, Table Width and Equal Columns. Interactions: drag across cells to select a range (`.sd-cell-selected`, editor-only; stripped from history, compile and preview via `stripEditorState`), drag a column border to resize, `Tab` / `Shift+Tab` move between cells (Tab in the last cell adds a row), `Delete` clears the selected cells. Field pills, signatures and system tags work inside cells. Module helpers: `buildTableGrid`, `cellsInRange`, `mergeRange`, `splitCell`, `insertRowAt/insertColAt`, `deleteRowAt/deleteColAt`, `createTableElement`; component handler `runTableOp`. All table edits are undoable and shown in the preview. Manual column widths reset to equal after adding/deleting a column.
  - **Send for Review & Review Modes**:
    - **No "Send for review" on Form Creation / Edit**: The Word Form Studio editor is strictly reserved for authoring, editing, and publishing/committing templates. Sending for review is not placed on form creation or edit actions.
    - **Send for review**: Accessible on published editable templates in **Forms & Documents Explorer** (`FormsHub.jsx`, quick tools and row actions) or via the **Reviews** section (`ReviewsHub.jsx`, header action with template picker) to invite reviewers across any department.
    - **Review mode (`reviewSession`)**: Opened by assigned reviewers from `ReviewsHub.jsx`. Displays an amber banner with instructions, initiator message, locks title, hides the publishing workflow tab, and offers "Submit review" with optional comments and change indicators.
    - **Resume mode (`resume`)**: Opened after accepting/rejecting reviewer changes in `ReviewChangesModal.jsx`. Displays a green "Review finished" banner with the merged HTML loaded, ready to publish directly to the folder.
  - Full `.docx` roundtrip: uploads/opens existing `.docx` files via `mammoth.js`, or creates from blank, compiling into valid `.docx` binaries via `html-to-docx`.
- `SendForReviewModal.jsx` — Multi-department reviewer selector dialog:
  - Search by name or username across all active users in all departments.
  - Quick department-level select/clear all.
  - Distinct badges for department and role with `@username` disambiguation.
  - Optional instructions/notes textarea sent to all selected reviewers.
- `ReviewChangesModal.jsx` — Initiator review reconciliation dashboard:
  - Accessible once reviewers have submitted (or when review is ready).
  - Tabbed or filterable per-reviewer cards showing submitted comments and modification status.
  - Word-level diff visualizer (`inlineTextDiff`) with green `<ins>` and red `<del>` styling.
  - Per-paragraph hunk accept/reject buttons with status badges (Pending, Accepted, Rejected).
  - Quick bulk actions ("Accept all from this reviewer", "Reject all from this reviewer", "Reset").
  - Overlap / conflict detection: if two reviewers modify the same paragraph, conflicting changes are flagged and locked once one is accepted.
  - Live side-by-side or tabbed "Resulting Document" preview with real-time merged changes.
  - Saves decisions and applies merged output directly into Word Form Studio.
- `ReviewsHub.jsx` — Dedicated Pre-Publication Reviews management center:
  - Tabs: **Assigned to me** (reviews where current user must review & submit modifications) and **Started by me** (reviews created by current user).
  - Reviewer progress chips (Pending vs Submitted) with reviewer count ratios (e.g. `2 / 2 submitted`).
  - Action buttons: "Review & edit form" (for reviewers), "Review changes" (for initiators once all submit), "Resume in Studio", "Cancel review", "Publish to Drive".
- `reviewDiff.js` — High-fidelity document diffing & merge utility:
  - Block-level parsing (`splitBlocks`), similarity scoring (`blockSimilarity`), and fine-grained paragraph run alignment (`refineRun`).
  - Word-level HTML diff generator (`inlineTextDiff`) wrapping inserted/deleted tokens in `.sd-rv-ins` / `.sd-rv-del`.
  - Overlap & conflict detector (`hunksOverlap`).
  - Merged document generator (`mergeBlocks`) applying accepted hunks onto base document.
  - HTML sanitizer (`sanitizeHtml`) preventing XSS while keeping layout and form pill widgets intact.
- `FormsHub.jsx` — Windows Explorer interface:
  - Header actions: `+ New Folder` and `Word Form Studio` persistently accessible for admins (department selector dialog at root for superadmin).
  - Left pane: Hierarchical tree view (Departments -> Folders -> Subfolders) with expand/collapse, item counts with storage space tooltips, "+" quick button, Rename (`Edit2`), and Delete (`Trash2`) on hover for admins.
  - Top bar: Explorer address bar / breadcrumbs (e.g. `SmartDoc Drive > Human Resources > Recruitment`), Back/Forward/Up buttons, Search bar, New Folder button in toolbar, contextual "Rename" and "Delete Folder" buttons when inside a folder, View toggle (Details/Table vs Grid/Tiles), Filter pills (All, Templates, Submissions), Rights badge.
  - Main pane: Department drive cards at root with direct `+ New Folder` button and total storage indicators; folder tiles with item counts and recursive storage sizes, Word template cards with file size badges and Print action (which opens the live form sheet and triggers the identical print engine as Fill Form's Print Form option), and submitted documents cards.
  - Details/Table view: Dedicated "Size" / "Storage Size" columns for templates, folders (recursive cumulative size), and department drives; row-level action buttons for Rename and Delete folders.
  - Bottom status bar: Displays dynamic `Total Storage: X KB/MB` for the current explorer view.
  - Contextual modals: Create folder (with target department selector if at root), Rename folder, Delete folder (with safe re-parenting of sub-items), Move template to folder.
- `ui.jsx` — shared: `Modal` (configured with outside-click immunity so dialogues never close accidentally when clicking the backdrop; closed only via explicit action buttons or Esc), `StatusBadge`, `EmptyState`, `PageHeader`, `WorkflowTrack`, `formatDate`, `formatSize`, `initials`, `roleLabel`, `fileToBase64`, `downloadBlob`.
- `TemplateUploadModal.jsx` — document uploader for `.docx`, `.pdf`, and image files. `.docx` files can be uploaded with or without initial `{{placeholders}}`; custom placeholders can be defined in-modal or added anytime after upload in **Word Form Studio** (`SmartWordStudio.jsx`). Authors can set each field's Fill Style to `🏷️ Placeholder (Dialog)` (default for in-text legal tags) or `📝 Direct Input`, and configure **Weight** (`Bold` vs `Normal`). Features a quick-switcher link to the Bulk Importer.
- `BulkImportModal.jsx` — **Enterprise Bulk Document Importer**: supports multi-file drag-and-drop and computer browsing for batch importing Word Form Templates (`.doc`, `.docx`), Adobe PDFs (`.pdf`), and image documents (`.png`, `.jpg`, `.jpeg`, `.webp`). Features staged files queue table with editable document titles, file size indicators, format detection badges, batch destination selectors (Department, Folder, Audience visibility), and a visual sequential Department Approval Workflow chain builder automatically applied to all imported Word form templates to guarantee they are immediately valid and fillable.
- `TemplatePermissionsModal.jsx` — granular form access rights manager (All Users company-wide, Specific Departments multi-select grid with owning dept badge, or Specific Persons with live search).
- `VersionHistoryModal.jsx` — Git-like revision log showing version badges, author, timestamps, change summaries, and rollback / inspection.
- `FillFormModal.jsx` — **On-Form Document Filling Studio**: full document canvas experience rendering authentic A4 Word document paper sheet (`.sd-form-filler-sheet`) with top action ribbon (Decision Needed by, approval chain, submit).
  - **In-Text Placeholders & Direct Inputs Coexistence**: Supports both in-text placeholders and direct input boxes on the exact same form sheet.
  - **Dedicated Right-Side Interactive Form Rail (`.sd-form-filler-rail`)**:
    - Leverages the spacious right side of the screen with a docked, scrollable form rail containing clean cards for every document placeholder and form field.
    - Features live completion ratio (e.g. `2 / 2 Filled`), remaining mandatory counter, field index numbers, required indicators (`* Required` vs `Optional`), and type chips.
    - Type-specific inputs: Text, Date with one-click shortcuts (**Today**, **+1 Wk**, **+30 D**), Number, Dropdowns with parsed options, Checkboxes, and Multiline Textareas.
    - Secondary quick-submit button at the bottom of the rail.
  - **Strict Line-Height Synchronization, Zero-Highlight Natural Prose & Template Bold Rendering**:
    - In-text placeholders (`.sd-doc-live-placeholder`, both empty `{{label *}}` and filled values) and their slot wrappers (`.sd-live-slot-field`, `.sd-live-slot-inline`, `.sd-doc-live-placeholder-wrapper`) use strict inline formatting (`display: inline !important; vertical-align: baseline !important; line-height: inherit !important; margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important;`).
    - Eliminates any `inline-block` box offsets, top vertical-align drops, and margins, ensuring filled values sit with sub-pixel precision directly on the typographic baseline of the surrounding prose.
    - **Faithful Template Weight Rendering**: Strictly honors the template author's bold setting (`f.bold`). If marked bold at the template level, `.is-bold` applies `font-weight: 700 !important;` seamlessly while preserving font-family, font-size, and line-height. Form filler users focus purely on completing form data without formatting controls.
  - **Dynamic Visual Leader Connector Line (`.sd-filler-connector-svg`)**:
    - Renders a real-time SVG visual leader line curving smoothly from the active input card in the right rail across the desk to the target placeholder in the document canvas.
    - Features animated dashed flow (`sdDashFlow`), ambient glow, an anchor pulse dot on the right-rail card, and a downward indicator arrow pointer hovering directly above the placeholder word so users clearly see which part of the text they are editing.
    - **Toggle ON / OFF**: Dedicated micro-switch button (`#btn-toggle-visual-line`) in the right-side rail header allows users to toggle the visual connector line ON or OFF at any time. The preference is automatically persisted across browser reloads via `localStorage` (`smartdoc_form_show_visual_line`).
    - Automatically updates in real time on field focus, document or rail scrolling, content resizing, and window resize events via `requestAnimationFrame`.
  - **Bidirectional Two-Way Interaction**:
    - Typing in any right rail input immediately updates the document canvas on paper in real time.
    - Focusing a field in the right rail scrolls to the placeholder and directs the dynamic leader line to it.
    - Clicking or tapping any placeholder in the document canvas immediately scrolls to and focuses that exact card and input in the right-side form rail.
    - Double-clicking opens the focused single-field dialog (`FieldFillDialog`) for concentrated editing.
  - **Printing & PDF Export Fidelity**:
    - **Exact Visual Matching**: Print output (`window.print()`) and PDF export (`exportFormSheetToPdf` via `html2canvas` 3.5× + `jsPDF`) produce an exact replica of the on-screen form sheet (`.sd-form-filler-sheet`). All input boxes, borders (`#cbd5e1`), labels, typed values, and clean document signatures (strictly displaying signature image, signer name, and department without card chrome, dashed boxes, or cryptographic badges) remain identical with zero layout changes or degradation.
    - **Highlighting Suppression**: Rail-selected input glow and neon accents (`.is-active-target`) are cleanly suppressed during print and PDF export, ensuring all fields render with clean, professional, uniform borders without editing rings.
    - **Input Field Placeholders Removed**: All input field placeholders (e.g. `Enter First Name…`, `YYYY-MM-DD`) are automatically stripped during print and PDF download, leaving clean, empty input boxes for unentered fields.
    - **Empty Placeholders Replaced with Dash**: Any unfilled in-text legal/contract placeholders (e.g. `{{Contract Amount}}`) are automatically replaced with a clean typographic dash (`—`), preventing raw tags or curly braces from appearing in printed or downloaded documents.
    - **Header Actions**: Dedicated **Download PDF** (`#btn-download-live-form-pdf`) alongside **Print Form** and **Print Blank** in the action ribbon.
    - **Dual-Mode Canvas (`isViewOnly`)**: Supports read-only viewing of completed submissions. In view-only mode, form inputs are marked `disabled` and `readOnly` with clean white backgrounds, the right-side rail is hidden, and top controls display a simple Close button alongside Print and Download PDF.
- `SubmissionDetailModal.jsx` — values, workflow track, audit history, approve/object/reject. "Preview Form Sheet" (`#btn-preview-submission-doc`), "Save as PDF" (`#btn-download-submission-pdf`), and "Print" (`#btn-print-submission-word`) seamlessly mount `<FillFormModal isViewOnly={true} />` to deliver the identical authentic form sheet layout, input boxes, and PKI signatures.
- `ProfileAndSignatureModal.jsx` — unified identity modal with top-level tabs for **Digital Signature** (freehand drawing with pointer-capture, typed cursive calligraphy with 4 styles and 2 ink colors, paper scan upload with transparency threshold) and **Profile Photo** (upload, drag-and-drop, zoom slider 1x-2.5x, circular center-crop, remove photo). Backwards-compatible aliases `SignaturePadModal.jsx` and `ProfilePictureModal.jsx` re-export this unified modal.
- `DocumentPreviewModal.jsx` — full-screen document viewer supporting Word `.docx` (via `docx-preview`), static `.pdf` (via in-browser viewer iframe), static image files, and completed submissions (`kind === 'submission'`), which automatically renders the authentic `<FillFormModal isViewOnly={true} />` sheet with unified Print and Download.
- `ActivityHub.jsx` — **Activity Log & Cryptographic Audit Trail**: displays role-scoped activity records with database pagination (`page`, `pageSize` 25/50/100, `category`, `search`, `department`, `exportAll`). Features debounced server search, category pill filters, per-page selector, smart numbered pagination controls, SHA-256 integrity hash verification pills, complete CSV export, and standalone window popup support (`/activity?popup=true`).
- `PrePublishReviewPromptModal.jsx` — **Pre-Publication Peer Review Prompt**: Intercepts template publishing from both **Word Form Studio** (`SmartWordStudio.jsx`) and **Upload Modal** (`TemplateUploadModal.jsx`). Gives authors a clear choice before going live: **Send for Review (Recommended)** with multi-user feedback, or **Publish Directly** to the department drive.
- `AppFooter.jsx` — Global branding footer displaying **"Powered by prynivo.com"** linked to `https://prynivo.com`, consistently integrated across main viewport, sidebar rail, and login screens.
- `ColorThemePicker.jsx` — App accent color customization enabling instant theme switching across 5 curated tones: **Current Green (Default)**, **Red**, **Orange**, **Purple**, and **Blue**, with interactive popover and sidebar footer quick-switcher.
- `Login.jsx`, `ToastContainer.jsx`.

---

## 4. Global State (`src/context/AppContext.jsx`)

State: `theme`, `accentColor` (`'green' | 'red' | 'orange' | 'purple' | 'blue'`), `toasts`, `currentUser`, `authLoading`, `activeTab`, `users`, `departments`, `folders`, `formTemplates`,
`formSubmissions`, `departmentMessages`, `documentPreview` (`{kind:'submission'|'template', id, title, fileName}`),
`isSignatureModalOpen`, `isProfileModalOpen`, `profileModalTargetUser`, `templateReviews`, `isReviewChangesModalOpen`, `activeReviewDetail`, `notifications`, `unreadNotificationsCount`,
`activityLogs`, `activityLogsLoading`, `activityLogsMeta` (`{ totalCount, page, pageSize, totalPages, from, to, hasNextPage, hasPrevPage }`).

Derived: `myApprovalQueue`, `mySubmissions`, `reviewsNeedingMe`.

Actions: `login`, `logout`, `refreshAll`/`refreshUsers`/`refreshDepartments`/`refreshFolders`/`refreshTemplates`/`refreshSubmissions`/`refreshReviews`/`refreshNotifications`,
`setAccentColor(color)`, `saveSignature`, `saveAvatar`, `openProfileModal`, `closeProfileModal`, `canManageDepartment(deptName)`, `createFolder`, `updateFolder`, `deleteFolder`,
`createTemplate`, `bulkImportTemplates`, `updateTemplate`, `updateTemplatePermissions`, `addTemplateComment`, `updateTemplateComment`, `moveTemplate`, `archiveTemplate`,
`submitForm`, `resubmitForm`, `workflowAction(id, 'APPROVE'|'OBJECTION'|'REJECT', notes)`, `addSubmissionComment`, `updateSubmissionComment`,
`sendTemplateForReview`, `submitReviewChanges`, `saveReviewDecisions`, `finalizeReview`, `cancelReview`,
`markNotificationRead`, `markAllNotificationsRead`, `wipeAllData`, `wipeFormsOnly`,
`createUser`, `updateUser`, `toggleUserStatus`, `deleteUser`, `createDepartment`, `deleteDepartment`,
`fetchDepartmentMessages`, `sendDepartmentMessage`, `addToast(title, message, type)`, `removeToast`.

`src/services/apiService.js`: stores session user id in localStorage `smartdoc_session_user_id`, sends `X-User-Id` header,
handles blob downloads, `parseDocx`, `htmlToDocx`, notification endpoints, and template review endpoints.

---

## 5. API (`server/server.js`)

| Method & path | Notes |
|---|---|
| `GET /api/health` | |
| `POST /api/auth/login`, `GET /api/auth/me` | **username + password** |
| `GET/POST /api/users`, `PUT/DELETE /api/users/:id` | superadmin only (password ≥ 6) |
| `POST /api/system/wipe-data` | `{ mode: 'everything' \| 'forms' }` — superadmin only; wipes entire system or only forms |
| `PUT /api/users/:id/signature` | self only |
| `PUT /api/users/:id/avatar` | self or superadmin; upload square cropped image or null to revert to initials |
| `GET/POST /api/departments`, `DELETE /api/departments/:id` | delete blocked if dept has users |
| `GET /api/folders` | optional `?department=...` |
| `POST /api/folders` | `{ name, department, parentId }` — requires superadmin or admin of that department |
| `PUT /api/folders/:id` | `{ name }` — requires superadmin or admin of folder's department |
| `DELETE /api/folders/:id` | re-parents templates and subfolders to avoid data loss; requires admin of department |
| `POST /api/forms/templates/parse` | base64 docx/doc → `{fields, signatureSlots, systemTags}` |
| `POST /api/forms/templates/parse-docx` / `parse-word` | base64 docx/doc → `{html, fields, signatureSlots, systemTags, messages, isLegacyDoc}` via `mammoth` (docx) & `word-extractor` (doc) |
| `POST /api/forms/templates/html-to-docx` | HTML → `.docx` buffer via `html-to-docx` |
| `GET /api/forms/templates`, `GET /:id/file` | visibility: own dept or audience `ALL`; superadmin all |
| `POST /api/forms/templates/:id/render-print-document` | `{ values, blank, customHtml }` → `.docx` buffer formatted for authentic Word printing (filled or pristine blank with handwriting lines) |
| `POST /api/forms/templates` | admin (forced to own dept) / superadmin; supports `htmlContent`, `folderId`, `reviewId`, `isDraft: boolean`, and `status: 'DRAFT'` bypassing mandatory workflow requirement |
| `POST /api/forms/templates/bulk-import` | `{ department, folderId, audience, defaultExpiryDays, files }` — bulk intake of docx/doc/pdf/images; all imported files are strictly saved as unpublished drafts (`status: 'DRAFT'`, `workflow: []`) |
| `PUT /api/forms/templates/:id` | admin of owning dept / superadmin; updates template in-place with Git-style version commit; supports transitioning from `DRAFT` to `ACTIVE` (validates workflow on publish) or saving draft updates |
| `PUT /api/forms/templates/:id/move` | `{ folderId }` — moves template within department; requires dept admin |
| `DELETE /api/forms/templates/:id` | soft archive |
| `GET /api/template-reviews` | reviews involving current user (as initiator or reviewer) |
| `GET /api/template-reviews/:id` | review detail (initiator gets all reviewer submissions + decisions; reviewer gets own copy) |
| `POST /api/template-reviews` | initiate review with `{ templateId, title, department, folderId, htmlContent, fields, workflow, reviewerUserIds, notes }` |
| `POST /api/template-reviews/:id/submit` | reviewer submits modified HTML `{ modifiedHtml, comments, hasChanges }` |
| `PUT /api/template-reviews/:id/decisions` | initiator updates accept/reject choices `{ decisions }` |
| `POST /api/template-reviews/:id/finalize` | initiator commits decisions and produces merged HTML `{ mergedHtml }` |
| `POST /api/template-reviews/:id/cancel` | initiator cancels review |
| `GET/POST /api/forms/submissions` | submit requires saved signature, mandatory fields, future expiry; inherits `folder_id` |
| `PUT /api/forms/submissions/:id/modify` | submitter only, only when `OBJECTION_RAISED`; bumps version (1.0→1.1), restarts chain at step 1 |
| `POST /api/forms/submissions/:id/workflow-action` | `APPROVE`/`OBJECTION`/`REJECT`; dept admin of current step or superadmin; blocked if expired |
| `GET /api/forms/submissions/:id/document` | filled docx with signatures |
| `GET /api/users/:id/pki-certificate` | retrieves user's X.509 certificate and parsed cryptographic metadata |
| `POST /api/users/:id/pki-certificate/generate` | re-issues / renews user's RSA-2048 keypair and X.509 certificate |
| `GET /api/users/:id/pki-certificate/download` | downloads public X.509 certificate file (`.crt`) |
| `POST /api/forms/submissions/:id/verify-signatures` | cryptographically verifies submitter and approval workflow signatures against document digest |
| `GET/POST /api/departments/messages` | own dept unless superadmin |
| `GET /api/audit-logs` | Activity Log ledger with database pagination (`page`, `pageSize`, `category`, `search`, `department`, `exportAll`); role-scoped (Super Admin = enterprise, Dept Head = department, User = self) |

Audit entries are written server-side to `audit_logs` with SHA-256 verification hashes and indexed columns (`timestamp DESC`, `actor_email`, `department`, `action_type`).

---

## 6. Word Template Conventions (`server/docxEngine.js`)

- `{{Field Name}}` → a fillable field (admin marks mandatory).
- `{{Signature: Submitter}}` or `{{sig: Submitter}}` → submitter's signature image.
- `{{Signature: <Department Name>}}` or `{{sig: <Department Name>}}` → signature of the admin who approved that department's step.
- System tags (auto-filled): `{{Form ID}}`, `{{Submitted By}}`, `{{Submitted Date}}`, `{{Version}}`, `{{Department}}`.
- Supports both modern `.docx` (Office OpenXML ZIP format) and legacy `.doc` (Word 97-2004 OLE2 Compound File Binary & RTF format) documents. Legacy `.doc` templates are parsed via `word-extractor`, converted to semantic HTML with interactive fields, and compiled to `.docx` via `html-to-docx` on save so downstream filling, previewing (`docx-preview`), and signature stamping (`docxtemplater`) work 100% seamlessly.
- If a template has no signature tags, a "Signatures" block is appended at the end of the document.

---

## 7. Business Rules

- Form IDs: `FRM-YYYY-XXXX`; versions logged in submission history.
- Statuses: `IN_REVIEW`, `APPROVED`, `OBJECTION_RAISED`, `REJECTED`, `EXPIRED` (computed when decision date passes).
- **Originator Immutability & Edit Locking**:
  - Once a form is filled and submitted, it enters `IN_REVIEW`. The originator (submitter) is **strictly locked out** and cannot edit or modify any values or fields on the form.
  - A form only becomes editable if an authorized reviewer/approver explicitly raises an objection (`status === 'OBJECTION_RAISED'`).
  - When an objection is raised, the originator is notified, granted permission to modify answers, and can resubmit with a change summary. Resubmitting bumps the version (e.g. 1.0 → 1.1), restarts the approval chain at Step 1, and immediately re-locks the form back into `IN_REVIEW`.
  - Once fully approved (`APPROVED`), the document is permanently frozen and archived with stamped digital signatures; no further edits are permitted.
- **Section Separation: Forms & Templates vs. Submissions & Approvals**:
  - **Forms & Templates (`FormsHub.jsx`)**: Dedicated catalog for departmental drives, folders, blank Word templates, template definitions, and Word Form Studio (`SmartWordStudio.jsx`). Filled & submitted documents are strictly excluded from this hub to keep the template catalog clean and focused.
  - **Submissions & Approvals (`FormApprovals.jsx`)**: The unified hub for all filled and submitted forms. Features tabs for "Awaiting my decision" (for active workflow approvers), "My submissions" (originator forms), "Department documents" (all submissions belonging to user's department), and "All submitted forms" (enterprise-wide), complete with live search and status filters.
  - **Dashboard (`SmartDashboard.jsx`)**: Live submissions feed with toggle between "Mine", "Department", and "All", plus stat counters and urgent objection action items.
  - **Backend Access Control (`canSeeSubmission`)**: Originator, all members of the originating department, all members of any department in the workflow chain, and all admins can view submitted forms.
- **Pre-Publication Review Workflow**:
  - Before publishing a form template to a department folder, an admin can send it for review to selected users across ANY department.
  - Statuses: `PENDING_REVIEW` (waiting for reviewer submissions) → `READY_FOR_DECISION` (all reviewers submitted) → `DECIDED` (initiator accepted/rejected changes and finalized merge) → `PUBLISHED` (template saved into folder) or `CANCELLED`.
  - Reviewers can modify the document layout, text, tables, and form fields in SmartWordStudio, and submit with comments.
  - The initiator receives granular block/word diffs, accepts or rejects individual changes from each reviewer (with automatic conflict detection if multiple reviewers touched the same block), previews the live merged document, and resumes in Word Form Studio to publish.

---

## 8. Database (`server/pgDb.js`)

Tables in use:
- `users` (incl. `signature_image`, `pki_certificate_pem`, `pki_public_key_pem`, `pki_private_key_pem`, `pki_serial_number`, `pki_fingerprint`, `pki_issued_at`, `pki_expires_at`)
- `departments`
- `folders` (`id`, `name`, `department`, `parent_id`, `created_by_id`, `created_by_name`, `created_at`, `updated_at`)
- `form_templates` (`docx_base64`, `docx_filename`, `html_content`, `font_family`, `font_size`, `file_type`, `file_size`, `is_editable`, `access_type`, `allowed_departments`, `allowed_users`, `version_history`, `comments`, `audience`, `fields`, `workflow`, `signature_slots`, `system_tags`, `folder_id`, archived flag)
- `form_submissions` (`folder_id`, workflow, version history, signatures, comments, `pki_signature` JSONB envelope)
- `notifications` (`id`, `user_id`, `title`, `message`, `type`, `link_type`, `link_id`, `is_read`, `created_at`)
- `template_reviews` (`id`, `title`, `department`, `folder_id`, `base_html`, `base_fields`, `base_workflow`, `status`, `decisions`, `merged_html`, `notes`, `initiator_id`, `initiator_name`, `published_template_id`)
- `template_review_reviewers` (`id`, `review_id`, `user_id`, `user_name`, `user_department`, `status`, `modified_html`, `comments`, `has_changes`, `submitted_at`)
- `department_messages`
- `audit_logs`

---

## 9. Revision Log

- **2026-10-25** — Authentic Microsoft Word Document Printing Engine:
  - **MS Word-Grade Document Print Engine (`src/utils/wordPrintEngine.js`)**:
    - Completely eliminated ordinary/crude HTML web printing (`window.print()` of web page DOM) across all modules in SmartDoc.
    - Built dedicated client-side Word Print Engine rendering `.docx` binaries inside an isolated, hidden print iframe targeting `docx-preview` styles directly into the iframe's `<head>`.
    - Guarantees 100% Microsoft Word print fidelity: exact page sizes (A4 portrait / landscape auto-detection), authentic Word document page margins (e.g. 25.4mm), document font families, headers, footers, and table borders.
    - Zero browser HTML chrome: injected `@page { margin: 0; }` eliminates browser header URLs (`http://localhost...`) and footer timestamps.
    - Word pagination safeguards: enforces `page-break-after: always;` between Word pages, protects table rows from awkward cuts across page boundaries (`tr { page-break-inside: avoid; }`), and prevents orphaned headings (`h1..h6 { page-break-after: avoid; }`).
    - Preloads and verifies all images (digital signatures, company logos, seals) and document fonts before invoking native print.
  - **Backend Print Document Generation (`server/server.js`, `server/docxEngine.js`)**:
    - Added `POST /api/forms/templates/:id/render-print-document` supporting `{ values, blank, customHtml }`.
    - Enhanced `renderFilledDocument(templateBase64, { values, system, signatures, blank })`:
      - `blank: true`: Replaces field placeholders with clean handwriting underline rules (`________________________________________`), replaces signature slots with clean blank signature lines, and appends blank signature sections if no tags exist.
      - `blank: false`: Merges answers, system tags, and stamps submitter digital signature images with PKI certification seals into the `.docx` binary.
  - **Full Module Integration**:
    - `DocumentPreviewModal.jsx`: Replaced broken unstyled `win.document.write` with authentic Word printing via `printWordDocument`.
    - `FillFormModal.jsx`: "Print Form" (filled values & digital signature) and "Print Blank" (pristine paper template with handwriting fill lines) now compile and print genuine Word documents, along with keyboard shortcut `Ctrl+P`.
    - `SubmissionDetailModal.jsx`: Added dedicated "Print Word document" action button (`#btn-print-submission-word`) allowing users and approvers to print approved/submitted documents with 1-click Word fidelity.
    - `FormsHub.jsx`: Updated template card and table row "Print" actions to directly print pristine blank Word templates.
    - `SmartWordStudio.jsx`: Added "Print" button to Studio header actions allowing authors to print their authored Word document directly from the Studio.

- **2026-10-25** — Enterprise Bulk Document & Template Importer:
  - **Batch Intake Endpoint (`server/server.js`)**:
    - Implemented `POST /api/forms/templates/bulk-import` supporting batch ingestion of Word documents (`.docx`, legacy `.doc`), Adobe PDFs (`.pdf`), and image files (`.png`, `.jpg`, `.jpeg`, `.webp`).
    - Validates department admin rights, resolves target folder existence within department, parses Word documents for `{{placeholders}}` via `parseWordDocument`, converts `.doc` to `.docx` via `htmlToDocx`, applies sequential approval workflow, generates `TPL-DEPT-...` codes, inserts records into `form_templates`, and logs audit activity.
    - Error isolation: each file in the batch is processed in an individual `try/catch` block so corrupt files do not fail the remainder of the import.
  - **Bulk Import Modal (`BulkImportModal.jsx`)**:
    - **Progressive Disclosure Architecture**: When 0 files are staged, displays a sleek top Destination Ribbon (Department, Folder, Audience) and an inviting, high-impact Hero Dropzone with glowing accent ring, bold typography, format chips, and prominent "Browse Computer Files" CTA. Eliminates empty table boxes and premature settings clutter.
    - **Active Staged Workspace**: Staging files smoothly transitions the modal into an organized 2-column console:
      - Header summary strip with green glowing indicator, staged count, total file size, and file breakdown.
      - Compact quick-drop strip allowing users to drop additional files at any time.
      - Left column (62%): Staged files table with color-coded type icons (Electric Lime for Word, Crimson for PDF, Violet for Images), high-contrast editable title inputs, format tags, and trash actions.
      - Right column (38%): Department destination selectors, Audience visibility toggle, and visual Sequential Approval Workflow builder for Word forms.
    - **Celebratory Success Screen**: On import completion, displays celebratory banner, checkmark halo, and list of imported items with direct "Done & View in Explorer" action.
  - **Explorer & Upload Modal Integration (`FormsHub.jsx`, `TemplateUploadModal.jsx`)**:
    - Added "Bulk Import" header button (`#btn-explorer-bulk-import`) in the explorer toolbar.
    - Added quick-switcher banner in single-file upload modal (`TemplateUploadModal.jsx`) linking directly to the bulk importer.
    - Context actions automatically refresh template and folder registries upon batch completion.

- **2026-10-25** — Version History Modal Fix & Form Changes Inspector:
  - **Granular Form Changes & Diff Inspector (`VersionHistoryModal.jsx`, `SmartWordStudio.jsx`, `server.js`)**:
    - Users can now click **"View changes"** on any commit in the Version History timeline to inspect exact modifications made to the form.
    - **Interactive Field Diffs**: Highlights added fields (green `+` tags with types, required status, in-text placeholder vs direct input mode, bold weight), removed fields (red `-` tags), and modified field parameters (amber `~` tags with label/type/required updates).
    - **Sequential Approval Chain Diffs**: Shows previous vs updated departmental workflow chains.
    - **Form Schema & Answers Snapshot**: Tabbed schema table displaying all registered form fields at that version, or submitted form answer values (for form submissions with before/after diffs).
    - **Document Preview Tab**: Renders authentic document HTML layout snapshot at each revision.
    - **Arbitrary Version Comparison**: Dedicated "Compare Versions" mode allowing users to pick any two revisions (e.g. `v1.0` vs `v1.6`) and see comprehensive field and workflow diffs.
    - **Backend Commit Tracking (`server/server.js`)**: Updated `PUT /api/forms/templates/:id` to resolve commit summaries, compute field and workflow diffs, and persist structured change envelopes (`changes`, `fields`, `workflow`, `htmlContent`).
  - **Prop & Target Resolution (`VersionHistoryModal.jsx`, `FormsHub.jsx`, `SubmissionDetailModal.jsx`)**:
    - Fixed issue where clicking the Version History clock button did nothing due to prop mismatch (`target` vs `item`).
    - Standardized `VersionHistoryModal` to accept both `item` and `target` props (`activeItem = item || target`), auto-detecting template vs submission context.
    - Added resilient history parsing supporting both array and serialized string inputs across `versionHistory` and `version_history`.
    - Hardened author lookup (`rawAuthor`) to safely handle string names, object payloads, and missing users without throwing errors.
  - **Interactive Version Badge Triggers (`FormsHub.jsx`)**:
    - Made the `v1.6` version badge in template cards and the `Word Form v...` badge in table view interactive (`.sd-badge-clickable`) so users can click either the badge or the toolbar history button to open the version modal.
  - **Modal Stacking & Timeline Aesthetics (`src/App.css`)**:
    - Elevated modal backdrop z-index (`100460`) for `#version-history-modal`, ensuring it renders smoothly over template sheets and submission detail views.
    - Styled complete Git commit graph (`.sd-git-timeline`, `.sd-git-rail`, `.sd-git-dot`, `.sd-git-commit-card`, `.sd-git-hash`) with pure black surfaces and dynamic accent glow highlights.

- **2026-10-24** — Enterprise PKI Digital Signature & X.509 Cryptographic Infrastructure:
  - **Cryptographic PKI Engine (`server/pkiEngine.js`)**:
    - Built with native OpenSSL `node:crypto` (RSA 2048-bit keypairs, SHA-256 digests) and `node-forge` for authentic X.509 v3 Digital Certificate generation.
    - Standard X.509 v3 attributes: Subject Common Name (CN), Department (OU), SmartDoc Enterprise (O), digital signature / non-repudiation / key encipherment key usages, subject key identifiers, 2-year validity windows, and unique hex serial numbers.
    - Deterministic JSON content hashing (`createContentDigest`) preventing whitespace/order drift.
    - RSA-SHA256 digital signature creation (`signPayload`) and tamper-evident verification (`verifySignatureBundle`) against user public certificates.
  - **Database Migration & Auto-Provisioning (`server/pgDb.js`)**:
    - Added columns to `users`: `pki_certificate_pem`, `pki_public_key_pem`, `pki_private_key_pem`, `pki_serial_number`, `pki_fingerprint`, `pki_issued_at`, `pki_expires_at`.
    - Added `pki_signature` JSONB column to `form_submissions`.
    - Implemented database startup auto-provisioning step (Step 6) ensuring all existing and newly created users automatically receive a valid X.509 certificate and RSA keypair.
  - **Document Stamping (`server/docxEngine.js`)**:
    - Enhanced Word document generator to append PKI certification lines `[PKI Certified: <fingerprint>...]` below in-document signatures and digital seal blocks in the appended approval summary.
  - **API Endpoints (`server/server.js`)**:
    - `GET /api/users/:id/pki-certificate`: Retrieves certificate details, subject, issuer, and fingerprint.
    - `POST /api/users/:id/pki-certificate/generate`: Renews / re-issues certificate and RSA keypair.
    - `GET /api/users/:id/pki-certificate/download`: Downloads standalone `.crt` X.509 public certificate.
    - `POST /api/forms/submissions/:id/verify-signatures`: Cryptographically verifies submission data against submitter and approver certificate signatures, detecting any unauthorized tampering.
    - Integrated automatic RSA signing into `POST /api/forms/submissions`, `PUT /api/forms/submissions/:id/modify`, and `POST /api/forms/submissions/:id/workflow-action`.
  - **UI & Experience Integration**:
    - **Profile & Signature Modal (`ProfileAndSignatureModal.jsx`)**: Added dedicated "PKI Certificate" tab with active status badge, subject metadata grid, SHA-256 fingerprint copy box, downloadable `.crt` action, certificate renewal action, and raw PEM inspection.
    - **Form Filler (`FillFormModal.jsx`)**: Added live PKI Cryptographically Sealed indicator and certificate fingerprint to the submitter signature card.
    - **Submission Details & Approvals (`SubmissionDetailModal.jsx`)**: Added interactive "PKI Cryptographic Integrity Seal" panel with on-demand "Verify Digital Signatures" action, providing real-time cryptographic verification of originator and workflow approver signatures.
- **2026-10-23** — Theme Synchronization & Floating Toolbar Refinement for Word Form Studio:
  - Ensured all newly added Word Form Studio controls (Google Docs font size control, preset dropdown, Image dialog, and in-canvas floating toolbar) dynamically synchronize with the user's selected accent theme (Green, Red, Orange, Purple, Blue) via `var(--primary-500)` and `var(--primary-contrast)`.
  - Replaced hardcoded electric lime values across font size buttons, arrow dropdown hovers, preset item active states, image dialog tabs, UploadCloud icons, and image preview success badges.
  - Refined in-canvas image selection outline (`border-color: var(--primary-500) !important`) and active floating toolbar sizing pills (`background: var(--primary-500)`).
  - Fixed floating image quick toolbar positioning using `position: fixed` and real-time scroll/resize tracking (`window.addEventListener('scroll', ..., true)`), ensuring the toolbar always hovers directly above the selected image rather than overlapping the top ribbon bar.
- **2026-10-23** — Google Docs Font Size Controller & Image Insertion in Word Form Studio:
  - **Google Docs Font Size Control**: Replaced the static `<select>` font-size dropdown in [`SmartWordStudio.jsx`](file:///c:/Code/SmartDoc/src/components/SmartWordStudio.jsx) with a full Google Docs-style font-size controller:
    - Decrement `[-]` and Increment `[+]` buttons adjusting size by 1 pt step.
    - Editable numeric input displaying current point size and accepting custom numbers (e.g. `13`, `22`, `48`) with `Enter` and blur commit.
    - Preset dropdown chevron `[▼]` listing standard Google Docs point sizes: `[6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96]`.
    - Dynamic active selection tracking: moving the cursor or selecting text inspects `window.getComputedStyle(node).fontSize` (and inline `font-size`) and dynamically updates the displayed point size to match the active selection.
    - Seamlessly styles highlighted text selections or inserts a styled zero-width space point for immediate typing.
  - **Embedded Image Insertion & Interactive Floating Toolbar**:
    - Added dedicated **Image** button in both **Home** tab ribbon ("Media" group) and **Insert Elements** ribbon tab.
    - Designed [`ImageInsertDialog`] modal supporting:
      1. **Computer File Upload**: Drag-and-drop zone and file picker supporting PNG, JPG, JPEG, SVG, WebP, GIF, converting them into self-contained base64 data URLs.
      2. **Web Image URL**: Remote HTTPS link input with live preview validation.
      3. **Display Settings**: Quick pre-configured width (25%, 50%, 75%, 100%), alignment (Left, Center, Right), and optional caption/alt text.
    - Added direct **Clipboard Paste (`Ctrl+V`)** and **Canvas Drag-and-Drop** handlers on the editor canvas for instant image placement.
    - Integrated in-canvas **Interactive Floating Toolbar** appearing on image click with quick sizing toggles (`25%`, `50%`, `75%`, `100%`), alignment buttons (`Left`, `Center`, `Right`), quick remove `(×)` badge, and delete button (`Backspace`/`Delete` key support).
    - Cleaned up image selection states during `stripEditorState` to ensure clean saves, live preview, form filling ([`FillFormModal.jsx`](file:///c:/Code/SmartDoc/src/components/FillFormModal.jsx)), and backend DOCX generation.
- **2026-10-23** — Font Family Consistency Across Inserted Document Elements:
  - Ensured all inserted interactive form elements (inputs, textareas, dropdowns, checkboxes, field pills, signature blocks, and system tags) strictly inherit and match the font family of the document canvas and surrounding text.
  - Eliminated hardcoded `var(--font-sans)` overrides from `.sd-doc-live-field-label`, `.sd-pv-label`, `.sd-pv-sig`, `.sd-doc-field-pill`, and `.sd-doc-sig-title`.
  - Added comprehensive `font-family: inherit !important` CSS rules across all form controls, labels, and placeholders within `.sd-word-editor-body`, `.sd-form-filler-sheet`, and `.sd-pv-sheet`.
  - Persisted `fontFamily` and `fontSize` attributes on `form_templates` in both database and API payloads, syncing them seamlessly between Word Form Studio (`SmartWordStudio.jsx`), Live Form Filler (`FillFormModal.jsx`), and Live Previews.
- **2026-10-23** — Theme Synchronization for Template Cards, Icons & Badges:
  - Eliminated hardcoded indigo/blue (`rgba(99, 102, 241, ...)`, `#818cf8`) across Word Form Template cards and explorer views.
  - Linked `.sd-template-icon` and `.sd-icon-word` to the active theme accent tokens (`color: var(--primary-500)`, `background: color-mix(in srgb, var(--primary-500) 14%, transparent)`, `border: 1px solid color-mix(in srgb, var(--primary-500) 28%, transparent)`).
  - Created `.sd-badge-accent` / `.sd-badge-primary` and mapped `.sd-badge-blue` / `.sd-badge-violet` to `var(--primary-500)` so version badges (`v1.0`), document pills, and status tags dynamically adapt to the user's selected accent color (Green, Red, Orange, Purple, Blue).
  - Updated quick-tool hover icons (`.sd-icon-btn-sm:hover`), secondary button hovers (`.btn-secondary:hover`), and table view document icons (`.sd-icon-doc`) to dynamically illuminate with `var(--primary-500)` and `var(--primary-400)`.
- **2026-10-23** — Pre-Publication Peer Review Prompt Before Publishing:
  - Implemented pre-publish interception workflow across both **Word Form Studio** ([`SmartWordStudio.jsx`](file:///c:/Code/SmartDoc/src/components/SmartWordStudio.jsx)) and **Upload Modal** ([`TemplateUploadModal.jsx`](file:///c:/Code/SmartDoc/src/components/TemplateUploadModal.jsx)).
  - Designed [`PrePublishReviewPromptModal.jsx`](file:///c:/Code/SmartDoc/src/components/PrePublishReviewPromptModal.jsx) presenting users with two clear paths:
    1. **Send for Review (Recommended)**: Opens [`SendForReviewModal.jsx`](file:///c:/Code/SmartDoc/src/components/SendForReviewModal.jsx) allowing author to pick reviewers across departments, add review notes, and initiate a tracked review cycle where reviewers propose edits on their own copy.
    2. **Publish Directly**: Bypasses review and immediately creates/commits the template into the designated department drive and folder.
  - Added elevated z-index rules in [`src/App.css`](file:///c:/Code/SmartDoc/src/App.css) (`.sd-modal-backdrop:has(#modal-pre-publish-review-prompt)`, `.sd-modal-backdrop:has(#modal-send-for-review)` at `100450`) to guarantee seamless modal layering on top of full-screen Word Studio and Upload dialogs.
  - Added rich dark theme option cards with hover elevation, accent badges, and direct keyboard navigation.
- **2026-10-23** — App Accent Color Theme Picker (Green [Default], Red, Orange, Purple, Blue):
  - Added support for 5 user-selectable theme colors with **Current Green** (`#a4fb4f`) as default.
  - Implemented dynamic CSS variables (`--primary-500`, `--primary-400`, `--primary-600`, `--primary-contrast`, `--primary-glow`, `--shadow-glow`) via `[data-accent="..."]` attributes.
  - Cleaned up sidebar header actions by removing the palette button for minimal decluttering.
  - Added one-click quick color switcher dots in [`SmartSidebar.jsx`](file:///c:/Code/SmartDoc/src/components/SmartSidebar.jsx) footer.
  - Integrated dedicated "Theme Color" tab in [`ProfileAndSignatureModal.jsx`](file:///c:/Code/SmartDoc/src/components/ProfileAndSignatureModal.jsx).
  - Persisted user preference in `localStorage` (`smartdoc_accent_color`).
  - Harmonized all interactive button, input focus, and tree node hover states to use dynamic `--primary-400`, `--primary-contrast`, and `--primary-glow-hover` tokens to guarantee that hover effects strictly reflect the selected accent color.
- **2026-10-23** — Split-Screen Enterprise Showcase Login Page:
  - Redesigned [`Login.jsx`](file:///c:/Code/SmartDoc/src/components/Login.jsx) into an enterprise split-screen showcase replacing the empty black screen with an informative, high-aesthetic layout.
  - Left pane highlights SmartDoc's core pillars (**Word Form Studio**, **Multi-Tier Approvals**, **Explorer Hierarchy**) and includes a live interactive workflow preview card (`Procurement-Requisition-2026.docx` with visual step progression, admin sign-off, and tamper-evident audit badge).
  - Background features a dark technical dot-matrix grid with ambient breathing glow orbs that dynamically adapt to the active theme accent color.
  - Added interactive one-click theme accent dots directly to the login top bar so users can preview the app in **Current Green**, **Red**, **Orange**, **Purple**, or **Blue** prior to signing in.
  - Implemented a consistent **360° all-around live glow** for the sign-in card (`.login-glass-card`), replacing the rotating spot with a uniform, multi-layered neon border and synchronized ambient breathing aura (`.login-card-ambient-aura`) that radiates evenly on all four sides.
  - Removed default credentials hint from the sign-in card to maintain strict enterprise security standards.
- **2026-10-23** — Powered by prynivo.com Footer & Copyright:
  - Created reusable [`AppFooter.jsx`](file:///c:/Code/SmartDoc/src/components/AppFooter.jsx) with clean flex spacing (`gap: 8px`), high-contrast link to `https://prynivo.com`, copyright symbol (`©`), and dynamic year (`{new Date().getFullYear()}`).
  - Formatted branding consistently as `Powered by prynivo.com © {currentYear}` across the main app viewport ([`App.jsx`](file:///c:/Code/SmartDoc/src/App.jsx)) and login screen ([`Login.jsx`](file:///c:/Code/SmartDoc/src/components/Login.jsx)).
  - Kept the sidebar footer minimal and clean by removing branding beneath the user profile card.
- **2026-10-22** — Activity Log Header Decluttering:
  - Removed verbose badge soup, cryptographic tagline labels, and redundant description sentences in [`ActivityHub.jsx`](file:///c:/Code/SmartDoc/src/components/ActivityHub.jsx).
  - Streamlined header into clean, minimalistic title (**Activity Log**) and simple event counter.
- **2026-10-22** — Activity Log Database Pagination, Server Search & Decoupled Footers:
  - Upgraded [`ActivityHub.jsx`](file:///c:/Code/SmartDoc/src/components/ActivityHub.jsx) and `GET /api/audit-logs` endpoint with server-side database pagination (`page`, `pageSize` 25/50/100, `category`, `search`, `department`, `exportAll`).
  - Added debounced server search input (`smartdoc_activity_search`), dynamic category pill counts, per-page limit selector, and decoupled footer with smart numbered pagination controls (`«`, `<`, page numbers, `>`, `»`).
  - Implemented complete database CSV export (`exportAll=true`) generating filtered audit trail reports up to 5,000 records.
  - Added standalone popup window route (`/activity?popup=true`) for dedicated monitoring.
- **2026-10-22** — Electric Lime (#a4fb4f) Brand Accent & Navigation:
  - Replaced purple brand accent palette with vibrant electric lime / chartreuse (`#a4fb4f`) across primary buttons, brand icons, pills, docx icons, and focus rings.
  - Active sidebar navigation item styled with a solid electric lime pill (`#a4fb4f`) and high-contrast pitch-black icon and bold typography (`#000000`), matching user specification.
- **2026-10-22** — Pure Black Dark Mode Locked:
  - Removed theme toggling across the entire application (sidebar footer, login screen, and app context).
  - Permanently locked system to pure pitch black (`#000000`) dark mode (`color-scheme: dark`) with neutral charcoal/black card surfaces (`#0a0a0a`), clean borders (`#222222`), and crisp high-contrast typography, eliminating all previous blue/navy hues.
  - Unified badges and form controls for optimal contrast on true black backgrounds.
- **2026-10-22** — Unified Profile & Signature Sidebar Item and Modal:
  - Merged redundant "My Signature" and "Profile Photo" sidebar footer buttons into a single cohesive **"Profile & Signature"** item (`#nav-profile-signature-btn`) with `UserCheck` icon and warning dot indicator when signature is unset.
  - Unified [`ProfileAndSignatureModal.jsx`](file:///c:/Code/SmartDoc/src/components/ProfileAndSignatureModal.jsx) combining both Digital Signature (Draw, Type, Upload) and Profile Photo (Upload, Zoom, Center-crop, Remove) tabs.
  - Retained backwards compatibility with seamless exports in `SignaturePadModal.jsx` and `ProfilePictureModal.jsx`.
  - Upgraded [`SignaturePadModal.jsx`](file:///c:/Code/SmartDoc/src/components/SignaturePadModal.jsx) to support three signature creation methods:
    1. **Draw Freehand**: Pointer-capture canvas drawing with smooth stroke geometry and ink color toggles (Navy Blue `#0f1f4b` / Classic Black `#111827`).
    2. **Type to Sign**: Type full name or initials and select between 4 authentic cursive handwriting and calligraphy typography styles (*Executive Script*, *Modern Calligraphy*, *Natural Pen*, *Classic Monoline*), auto-rendered into crisp 2x retina PNG stamps.
    3. **Upload Scan**: Upload photograph or scan of a paper signature with automatic paper-to-transparency threshold filtering, darkness enhancement, and real-time sensitivity slider.
  - Generates transparent high-resolution PNG signatures stamped directly into Word `.docx` documents and submission approval chains.
- **2026-10-22** — User Profile Picture & Custom Avatar Management:
  - Added dedicated [`ProfilePictureModal.jsx`](file:///c:/Code/SmartDoc/src/components/ProfilePictureModal.jsx) enabling users to upload, zoom, and crop their profile photos into high-resolution square avatars with automatic client-side canvas compression.
  - Interactive sidebar user card with camera hover badge opening the profile photo modal directly.
  - Superadmin can manage or remove any user's profile photo directly from [`SmartSettingsAdmin.jsx`](file:///c:/Code/SmartDoc/src/components/SmartSettingsAdmin.jsx).
  - Built unified [`UserAvatar`](file:///c:/Code/SmartDoc/src/components/ui.jsx) component displaying custom photo images with fallback to initials across sidebar, messaging, review hub, permissions, and version history.
  - Added backend endpoint `PUT /api/users/:id/avatar` with audit logging and updated messaging queries to return sender avatars.
- **2026-10-22** — Unified Single-Service Deployment:
  - Enabled unified production deployment where the Express server ([`server/server.js`](file:///c:/Code/SmartDoc/server/server.js)) serves both the API endpoints (`/api/*`) and the built React SPA frontend (`dist/`) on the exact same port without requiring a separate API host.
  - Added `"start": "node server/server.js"` and `"build:start": "vite build && node server/server.js"` scripts to [`package.json`](file:///c:/Code/SmartDoc/package.json).
  - Hardened SPA fallback middleware to catch all non-API GET requests and route them to `dist/index.html`.
- **2026-10-22** — Parent Folder Renaming (`Test` → `SmartDoc`):
  - Standardized root project workspace directory from `c:\Code\Test` to `c:\Code\SmartDoc`.
  - Updated internal context file links and guidelines to reflect `SmartDoc`.
- **2026-10-22** — Project Branding & Package Name Standardization:
  - Standardized project name to **SmartDoc** (`smartdoc`) across [`package.json`](file:///c:/Code/SmartDoc/package.json), [`package-lock.json`](file:///c:/Code/SmartDoc/package-lock.json), metadata, and all client/server modules.
  - Added strict rule: Git commands (`git status`, `git diff`, etc.) are never executed unless explicitly instructed by the user.
- **2026-10-22** — On-Form Document Canvas Filling Experience (`FillFormModal.jsx`):
  - Completely replaced generic popup dialog boxes with an authentic **A4 Word Document Canvas** rendered on a full-screen studio desk workspace.
  - Interactive form fields (text, textarea, date, number, dropdown, checkbox) are embedded directly in place inside document paragraphs, tables, and sections via React portals.
  - Submitter digital signature is previewed and stamped directly in the document's signature block, with inline signature drawing.
  - Top action ribbon displays form metadata, sequential approval workflow track, decision deadline calendar picker, and submit actions.
  - Real-time in-place validation highlights missing mandatory fields with auto-scrolling.
  - Resubmission mode displays approver objection notes and change summary tracking.
- **2026-10-21** — Major Platform Enhancements (6 Core Capabilities):
  1. **Non-editable PDF and Image Documents**:
     - Upload `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp` via `TemplateUploadModal.jsx`.
     - Stored with `is_editable = false` and `file_type = 'pdf' | 'image'`.
     - Static documents cannot be modified in Word Studio (`PUT /api/forms/templates/:id` returns 400).
     - Previewed natively in `DocumentPreviewModal.jsx` using interactive PDF embed iframe and responsive image viewer with print, download, and non-editable indicators.
  2. **Separated View/Fill vs Edit Process**:
     - Regular users only have "Fill form" (for interactive Word forms) and "View document" (for static PDFs/images). Template schemas and approval chains cannot be modified by users.
     - Admins / Department managers have a dedicated "Edit form" action opening `SmartWordStudio.jsx` with `templateToEdit`, loading existing fields, markup, and workflow.
  3. **Granular Form Access Rights (Permissions) Screen**:
     - Dedicated `TemplatePermissionsModal.jsx` to configure form accessibility:
       - **All Users (`ALL`)**: Visible to everyone in the company.
       - **Specific Departments (`DEPARTMENTS`)**: Restricted to selected department drives/users.
       - **Specific Persons Only (`USERS`)**: Searchable user picker restricting form visibility to chosen individuals.
     - Enforced on backend query level (`canSeeTemplate`) preventing unauthorized listing or access.
  4. **Enterprise Notification System**:
     - Real-time notification drawer (`NotificationBell.jsx`) in the sidebar with unread counter badge.
     - Automated alerts triggered for:
       - New form submission approvals & next department handoffs.
       - Signature requests for approvers.
       - Form approval decisions, objections, and rejections.
       - Pre-publication review requests and reviewer submissions.
     - Polled every 15s with direct deep-linking to submissions, forms, and reviews.
  5. **Git-Like Versioning System**:
     - Permanent `version_history` tracking Git-like commits (commit hash, version number, author, timestamp, change summary).
     - Every template modification requires a Git commit message modal before version bumping.
     - Submissions record version history across modifications and resubmissions.
     - Interactive `VersionHistoryModal.jsx` displaying a vertical Git commit branch timeline with hash tags and diff summaries.
  6. **MS Word Style In-Form Comments & Objections**:
     - Docked right margin comments panel in `SmartWordStudio.jsx` and `SubmissionDetailModal.jsx`.
     - Form balloon cards displaying author avatar, name, department, timestamp, and status badges (Objection, Change Request, Suggestion, General Note).
     - Direct in-card "✓ Accept" and "✕ Reject" actions recording decision resolution and resolver name.
- **2026-10-21** — System Data Purge & Wipe Options (Superadmin):
  - Added dedicated "System Reset" tab in `SmartSettingsAdmin.jsx` with high-visibility hazard cards and multi-level safety confirmations.
  - Two distinct wipe capabilities:
    1. **Wipe Out Every Data (Factory Reset)**: Purges all templates, explorer folders, form submissions, review workflows, department chats, notifications, and non-superadmin accounts. Resets default enterprise departments and preserves the Superadmin.
    2. **Wipe Only Forms**: Purges all form templates, folders, submissions, reviews, and form notifications, while strictly preserving all user accounts, roles, saved signatures, departments, and departmental chat history.
  - Interactive safety confirmation modal requiring the administrator to type the exact uppercase confirmation phrase (`"WIPE ALL DATA"` or `"WIPE FORMS"`) to unlock the execute button.
  - Backend support via `POST /api/system/wipe-data` with mode handling (`everything` vs `forms`), PostgreSQL cascade truncations (`wipeAllData` & `wipeFormsOnly`), and tamper-evident SHA-256 audit logging.
- **2026-10-21** — Cross-Department Pre-Publication Form Review & Diff/Merge Workflow:
  - Added multi-department reviewer selection (`SendForReviewModal.jsx`) from Word Form Studio.
  - Reviewer editing experience (`SmartWordStudio.jsx` review session mode) with review instructions, modified HTML capture, comments, and submission tracking.
  - Diff & Merge engine (`reviewDiff.js`): block/paragraph LCS matching, similarity heuristic (`PAIR_THRESHOLD`), word-level inline `<ins>` / `<del>` highlighting, cross-reviewer overlap/conflict detection, and safe block merging with HTML sanitization.
  - Initiator reconciliation dashboard (`ReviewChangesModal.jsx`): granular per-change accept/reject controls, bulk reviewer actions, live resulting document preview, and studio resumption.
  - Dedicated Reviews navigation tab (`ReviewsHub.jsx`) with "Assigned to me" and "Started by me" queues, progress badges, and direct publishing into department folders.
  - Full PostgreSQL persistence (`template_reviews` and `template_review_reviewers`), audit logging, and 30-second polling for real-time review notifications.
- **2026-10-20** — Word Form Studio: added Word-style table element (grid picker, Table Tools tab with merge/split/insert/delete/shading/borders/resize), undo/redo, per-element width, and Edit / Side-by-side / Preview toggle.
- **2026-10-20** — Added Word Form Studio (`SmartWordStudio.jsx`):
  - Complete union of Microsoft Word document editor + custom form builder on an authentic A4 sheet canvas.
  - Microsoft Word Ribbon (Home, Insert Elements, Page Layout, Workflow & Approvals).
  - In-document interactive form widgets (Short text, multiline textarea, date picker, number, dropdown/select, checkbox).
  - Interactive signature blocks (Submitter and sequential Department Approval slots) and system tags.
  - Clickable field pills opening inline popovers for labels, mandatory/required toggles, types, placeholders, and dropdown options.
  - Full `.docx` roundtrip via `mammoth.js` (import/parse) and `html-to-docx` (compile/export).
- **2026-10-22** — Added form printing (filled or not filled): "Print Form" (filled values & stamped signatures) and "Print Blank" (pristine paper template with handwriting fill-in lines and blank signature block) in `FillFormModal`, direct "Print" action in `FormsHub` explorer, `Ctrl+P` shortcut, and high-fidelity `@media print` layout.
- **2026-10-22** — Fixed "Draw & Save Signature" in form filler: corrected modal backdrop z-index hierarchy (`z-index: 100400` / `100450` over `sd-form-filler-overlay` `100000`), smooth segment canvas drawing, defensive pointer capture, and submitter alias recognition (`submitter`, `applicant`, `originator`).
- **2026-10-20** — Added Windows Explorer structure for Forms & Documents:
  - Top level: Departments (enterprise drives).
  - Nested folders per department with arbitrary nesting.
  - Strict user rights: only department admins can create/rename/delete folders or upload templates in their department; regular users have read-only explorer access.
- **2026-10-23** — Custom App Icon (`SmartDocLogoIcon.jsx` & Favicon):
  - Implemented the official verified isometric cube brand mark requested by the user: a 3D isometric cube/hexagon with corner nodes (apex, lower-left, lower-right) and a centralized approval verification badge with a precision checkmark cutout.
  - Browser tab icon / favicon (`index.html`): Strictly **Black & White** (pure black `#000000` squircle with subtle border, pure white `#ffffff` isometric cube & nodes, and black `#000000` checkmark).
  - In-website brand icons (`Login.jsx` & `SmartSidebar.jsx`): Continue to dynamically follow the user's active theme accent colors (`var(--primary-500)`, `var(--primary-contrast)`, and glowing shadows across Green, Orange, Red, Purple, Blue).
- **2026-10-24** — In-Text Placeholder Fields, Visual Leader Connector Line, Template Text Weight & Single-Field Fill Dialog:
  - **In-Text Placeholders vs Direct Inputs**: Form templates support two coexisting field modes on the same document: in-text placeholders (designed for legal contracts, agreements, NDAs with names, dates, amounts, etc.) and direct on-form input controls.
  - **Word Form Studio (`SmartWordStudio.jsx`)**:
    - Ribbon Insert Elements tab: Dedicated "In-Text Placeholders (Legal / Contracts)" group with quick-insert tools for Party / Name, Agreement Date, Contract Amount, and Governing Law.
    - Field edit popover: Added **Field Format** switcher to toggle between `🏷️ In-Text Placeholder (Dialog)` and `📝 Direct Input Box`.
    - **Text Weight Switcher**: Configurable text weight (Normal Text vs Bold `font-weight: 700`) for in-text placeholders at authoring/editing time, stored in `data-field-bold` and persisted in `fields[].bold` in the database.
    - Live Studio Preview: In-text placeholders render seamlessly as `{{xxxx}}` tags (`.sd-pv-placeholder-tag`), accurately reflecting the configured text weight (`.is-bold`), keeping sentences and document prose intact.
    - Comment Author Resilience: Hardened comment rendering against both object and string author structures with safe initials and department extraction.
  - **Word Template Uploader (`TemplateUploadModal.jsx`)**:
    - Tag parsing: Detected Word tags (`{{Key}}`) default to in-text placeholders (`mode: 'placeholder'`).
    - Fill Style selector: Authors can toggle each field's Fill Style between `🏷️ Placeholder (Dialog)` and `📝 Direct Input`.
    - Text Weight selector: Added **Weight** column (`Bold` vs `Normal`) to detected fields table, and bold toggle to new custom placeholder creation.
  - **Form Filler (`FillFormModal.jsx`)**:
    - Dedicated Right-Side Interactive Form Rail (`.sd-form-filler-rail`) containing clean input cards for all placeholders and form fields with live completion counter.
    - Zero-Highlight Natural Text: Placeholders in the document canvas have zero background boxes and zero borders, rendering identically to surrounding normal prose with inherited font, baseline, and line-height.
    - **Faithful Template Weight**: Faithfully renders values in bold (`font-weight: 700`) or normal weight as configured by the template author, keeping the user interface completely clean of fill-level formatting toggles.
    - **Dynamic SVG Visual Leader Connector Line (`.sd-filler-connector-svg`)**: Draws a real-time animated curved leader line from the focused right-side form card across the desk to the target word in the document canvas with a downward pointer arrow hovering above the placeholder.
    - **Visual Line On/Off Toggle**: Dedicated header toggle switch (`#btn-toggle-visual-line`) allowing users to show or hide the visual leader line, with preference persisted in `localStorage` (`smartdoc_form_show_visual_line`).
    - Single-Field Fill Dialog (`FieldFillDialog`): Quick modal editing option accessible via double-click on any placeholder.
    - Missing Mandatory Fields Alert Modal (`showMissingPromptModal`): Intercepts submissions if required fields are missing and provides direct "Fill Now →" focus navigation.
    - Print support: Clean print presentation with `@media print` rules automatically hiding the connector SVG and form rail.
  - **Global State & API (`AppContext.jsx`)**:
    - Template Save & Commit: Fixed temporal dead zone reference in `updateTemplate`, ensuring Git-style version bumps and template saves complete reliably.
  - **Template Field Bold Weight & Fill Mode Persistence Fix (2026-10-25)**:
    - **Backend Persistence (`server/server.js`)**:
      - Fixed `POST /api/forms/templates` and `PUT /api/forms/templates/:id` dropping `bold` and `mode` attributes during `cleanFields` normalization.
      - Enabled `settings` map indexing by both `key` and `label` in lowercase to prevent mismatched casing or spaced keys from dropping field configurations.
      - Fully combined `parsed.fields` with frontend custom `fields` in PUT route handler to prevent custom fields from being skipped.
      - Preserved `mode: s.mode === 'input' ? 'input' : 'placeholder'` and `bold: !!(s.bold || s.isBold)` in PostgreSQL `form_templates.fields` JSONB column.
      - Fixed fields-only updates (`!htmlContent && Array.isArray(fields)`) to accurately normalize and persist field configurations.
    - **Word Form Studio (`SmartWordStudio.jsx`)**:
      - Updated `compileDocument` to wrap bold placeholders with `<strong>{{key}}</strong>` so generated docx runs retain native `<w:rPr><w:b/></w:rPr>` formatting.
      - Updated `convertRawHtmlToStudio` to unwrap any existing `<strong>/<b>` tags around placeholders and index fields by both key and label, preventing duplicate or phantom bold inheritance.
      - Updated `handleSaveFieldEdit` to toggle `.is-bold` class directly on the studio pill element for immediate visual feedback.
    - **Form Filler (`FillFormModal.jsx`)**:
      - Updated `fieldsMap` to index by both key and label for resilient placeholder lookups.
      - Attached `.is-bold` to `.sd-live-slot-field` when `f.bold` is configured, ensuring seamless child inheritance.
      - Added direct input styling support for bold fields and a prominent "BOLD" tag badge in the right-side form rail cards.
      - Unwrapped enclosing `<strong>/<b>` tags from template HTML before slot generation so template field configuration strictly controls font weight.
    - **Design System & CSS (`src/App.css`)**:
      - Cascaded `.is-bold` font weight (`font-weight: 700 !important`) across `.sd-doc-live-placeholder`, `.sd-live-slot-field`, `.sd-print-value`, `.sd-doc-field-pill`, and direct input controls.
  - **Word Form Studio Field Customizer Redesign (2026-10-25)**:
    - **Header & Live Document Preview**: Replaced bare modal header with icon badge, title/subtitle, and an interactive "Live Document Preview" card showing immediate visual feedback for the token pill (`{{Label}}`, tags, type, bold, required state).
    - **Segmented Control Architecture**: Replaced heavy stacked button pairs and essay hints with clean, compact 2-column segmented controls for `Display Mode` (`In-Text Tag` vs `Input Box`) and `Text Weight` (`Normal` vs `Bold (700)`).
    - **Requirement Toggle Button**: Replaced misaligned multiline native HTML checkbox with a modern requirement button featuring a live status indicator dot (`Mandatory (Required *)` vs `Optional Field`).
    - **Refined Aesthetics & Footer**: Styled with dark pure-black modal card (`#0d0d0d`), subtle border glow, and streamlined actions (`Remove Field` on left, `Cancel` and `Apply Changes` on right).
  - **Field Description & Guidance (2026-10-25)**:
    - **Word Form Studio (`SmartWordStudio.jsx`)**:
      - Added a dedicated "Field Description & Guidance" textarea to the Customize Form Field modal with clear role separation from the "Placeholder Hint" (which provides sample ghost text inside the input box).
      - Stores instructions as `data-description` on field pill elements in the Studio canvas.
      - Updated `readPillConfig`, `convertRawHtmlToStudio`, `handleInsertField`, field click popover, and `handleSaveFieldEdit` to ensure lossless authoring, serialization, and round-trip persistence.
    - **Backend & Version History (`server/server.js`)**:
      - Fully persists `description` attribute across `cleanFields` and PostgreSQL `form_templates.fields` JSONB.
      - Added granular diffing in version history (`'Description updated'`) whenever field instructions are modified.
    - **Form Filler (`FillFormModal.jsx`)**:
      - Right-side form rail card: Renders a `.sd-rail-field-desc` guidance callout with an Info icon directly above or below the input field.
      - Single-Field Fill Dialog: Renders `.sd-dialog-field-desc` banner with "INSTRUCTIONS & GUIDANCE" title and clear readable text.
      - Document Canvas Placeholders: Dynamic `title` tooltip includes description; unfilled placeholders display a subtle `.sd-ph-info-pill` info badge when instructions exist.
      - Direct Input on Sheet: Renders `.sd-doc-live-field-desc` for on-document form controls.
    - **Design System & CSS (`src/App.css`)**:
      - Added styles for `.sd-rail-field-desc`, `.sd-dialog-field-desc`, `.sd-ph-info-pill`, and `.sd-doc-live-field-desc`.
      - Optimized login card neon glow and ambient aura breathing animation speed from `3.5s` to `1.2s` for a lively, responsive pulse.
  - **Application Version Tracking & Automated Cache Clearing (2026-10-25)**:
    - **Footer Version Badge (`AppFooter.jsx`)**:
      - Displays the live application version (`v1.2.0`) in the footer across all layouts (login screen, main workspace, standalone popup windows).
      - Styled as a sleek cyber pill with a pulsing live status dot (`.smartdoc-version-status-dot`), version number, and `RefreshCw` icon.
      - **Manual Force-Refresh**: Clicking the version pill immediately runs `forceCacheClearReload(APP_VERSION)`, spins the icon, clears all browser caches, and hard-reloads the page.
    - **Automated Cache Clearing ("Ctrl + F5" Functionality) (`src/utils/versionManager.js`)**:
      - **Cache Eviction**: Automatically purges all `CacheStorage` keys, unregisters any active service workers, triggers a cache-bypass fetch (`cache: 'reload'`), and hard-reloads the page with a cache-buster query parameter (`_vcb`) which is cleanly stripped from the URL on load.
      - **Startup Check**: Compares `localStorage.getItem('smartdoc_app_version')` with the running bundle version. If a new version is detected, it immediately clears cache and forces a fresh load to prevent stale JS/CSS chunks.
      - **Server Version Poller & Auto-Reload**: Polls `GET /api/version` (every 45s and on window focus). If the backend is upgraded to a newer version, notifies the user via toast and automatically triggers a cache-clearing hard reload.
      - **Keyboard Shortcut**: Captures `Ctrl + F5`, `Ctrl + Shift + R`, and `Cmd + Shift + R` to guarantee caches are thoroughly purged.
    - **Backend & Static Asset Serving (`server/server.js`)**:
      - Added `GET /api/version` endpoint with `no-store, no-cache, must-revalidate` headers returning `{ version, app: 'SmartDoc', timestamp }`.
      - Configured Express static serving so that `index.html` is strictly served with `no-store, no-cache, must-revalidate`, guaranteeing browsers immediately fetch new Vite bundle hashes upon release.
  - **Notification Drawer Clipping Fix (2026-10-25)**:
    - **Portal Rendering (`NotificationBell.jsx`)**: Portaled the notification drawer (`.sd-notif-popover`) directly into `document.body` via `createPortal`. This eliminates clipping caused by `.smart-sidebar` overflow constraints (`overflow-x: hidden; overflow-y: auto`).
    - **Dynamic Viewport Placement**: Popover calculates position relative to the bell button (`getBoundingClientRect()`), floating smoothly to the right of the sidebar on desktop while automatically adjusting within viewport bounds on smaller screens.
    - **Layering & Styling (`src/App.css`)**: Switched `.sd-notif-popover` to `position: fixed` with `z-index: 100000` and enhanced box-shadow for dark-mode depth.
  - **Pre-Publication Review Field Pill Activation Fix (2026-10-25)**:
    - **Interactive Pill Conversion in Review Mode (`SmartWordStudio.jsx`)**: When opening a review copy (`reviewSession`) or resumed review (`resume`), the raw HTML was previously set directly to `editorRef.current.innerHTML` without invoking `convertRawHtmlToStudio`. As a result, placeholder tags (e.g. `{{Field_l3WD}}`) remained inert raw text strings instead of interactive field pills (`.sd-doc-field-pill`).
    - **Pill Activation**: Updated the initialization hook to call `convertRawHtmlToStudio(reviewSession.html, fields)`, turning all placeholders into clickable, configurable, and removable pills with full access to the "Customize Form Field" modal, live weights, and deletion controls.
    - **Field Config Round-Trip**: Ensured `fields` metadata is passed and preserved across `startReview` in both Studio and `ReviewsHub.jsx`, and saved in PostgreSQL `template_reviews.settings.fields`.
    - **Compilation on Review Submission**: Updated `handleSubmitReview` to run `compileDocument()`, cleanly compiling interactive pills back into standard placeholder tokens matching `base_html` for precise word-level diffing in `ReviewChangesModal`.
  - **Pre-Publication Review Finalization (In-Place Update) (2026-10-25)**:
    - **In-Place Template Update**: When a review started from an existing template is finalized and resumed in Word Form Studio, publishing triggers the Git commit message modal and executes `PUT /api/forms/templates/:id` with `reviewId`.
    - **Single Template Identity**: Prevents duplicate template entries from being created in the drive. The existing template's version history is updated with a Git commit node, its version number is incremented (e.g. `v1.8` → `v1.9`), and the review record is marked `PUBLISHED`.
    - **State Synchronization (`server.js`, `AppContext.jsx`)**: The backend links `templateId` on review creation and passes it when resuming in Studio (`resumedReview.templateId`). `updateTemplate` gracefully handles `reviewId` updates without recreating templates.
  - **Universal Outside-Click Immunity for Dialogs & Modals (2026-10-25)**:
    - **Work In-Progress Safeguarding**: Removed accidental backdrop click dismissals across all modals and dialogs in SmartDoc to prevent loss of user typing, configuration, or form data.
    - **Components Hardened**:
      - `ui.jsx`: Shared `<Modal>` removed backdrop `onClick={onClose}` so dialogs are closed strictly via explicit action buttons ("Cancel", "Close", "×") or `Escape`.
      - `FormsHub.jsx`: Folder creation, rename, and delete dialog backdrops decoupled from dismissal handlers.
      - `FillFormModal.jsx`: Single-field fill dialog (`FieldFillDialog`) and missing fields prompt modal (`showMissingPromptModal`) backdrop click dismissals disabled.
      - `SmartWordStudio.jsx`: Field customization modal, signature slot configurator, and Git commit modal backdrops protected against backdrop dismissal.
  - **Word Form Studio Placeholder Staging & Clean Cancellation (2026-10-25)**:
    - **Draft Staging**: When an author clicks a placeholder insertion tool (Party / Name, Agreement Date, Contract Amount, Governing Law), the element is staged in the canvas with a `data-staged="true"` attribute and a trailing space node before opening the customization modal.
    - **Clean Cancellation**: If the author clicks "Cancel", "×", or presses Escape in the customization modal, the staged field element and its adjacent space node are cleanly removed from the DOM, preventing unconfigured placeholder tags from remaining in the document.
  - **Universal Word Document (.doc & .docx) Editing & Template Support (2026-10-25)**:
    - **Dual-Engine Word Processing (`server/docxEngine.js`)**:
      - Integrated `word-extractor` for native, zero-dependency parsing of legacy Microsoft Word `.doc` (OLE2 Compound File Binary) and RTF document formats.
      - Retained `mammoth.js` for high-fidelity conversion of modern `.docx` (OpenXML) files into semantic HTML.
      - Universal `parseWordDocument(base64)` endpoint detects file signatures (PK ZIP vs OLE2 `0xd0cf` vs RTF `{\rtf`), converting both `.doc` and `.docx` into structured HTML paragraphs, headings, and tabbed tables with extracted form fields, signature slots, and system tags.
      - Dual signature tag syntax support: matches both `{{Signature: ...}}` and shorthand `{{sig: ...}}` (`SIGNATURE_RE = /^(?:signature|sig)\s*:\s*(.+)$/i`).
    - **Word Form Studio (.doc & .docx Direct Ingestion) (`SmartWordStudio.jsx`)**:
      - Updated "Open Word (.doc / .docx)" file picker to accept `.doc`, `.docx`, `application/msword`, and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
      - Automatically converts imported `.doc` text into styled HTML elements, activating interactive field pills, signature blocks, and system tags.
      - Upon saving, Word Form Studio compiles the HTML canvas into a valid `.docx` binary using `html-to-docx`, ensuring downstream form filling, `docx-preview`, and `docxtemplater` signature stamping work seamlessly.
    - **Quick Template Uploader (`TemplateUploadModal.jsx`)**:
      - Accepted `.doc` files in file dropzone, file input accept filters, and MIME validation.
      - Correctly categorizes `.doc` files as editable Word templates (`isDocx = true`, `isEditable = true`), parsing placeholders and generating the interactive configuration table and sequential approval chain.
    - **Backend Template Compilation & Storage (`server/server.js`)**:
      - Unified `POST /api/forms/templates/parse-docx` and route alias `POST /api/forms/templates/parse-word`.
      - In `POST /api/forms/templates`, automatically compiles legacy `.doc` HTML into valid `.docx` binaries via `htmlToDocx`, ensuring PostgreSQL stores a compliant `.docx` binary for downstream viewers and signature engines.
  - **Sidebar Navigation Single-Line Label Formatting (`src/App.css`) (2026-10-25)**:
    - **Single-Line Text Enforcement**: Added `white-space: nowrap;` to `.smart-nav-item` and `.smart-nav-text`, along with `min-width: 0;`, `overflow: hidden;`, and `text-overflow: ellipsis;` to guarantee navigation items (especially "Submissions & Approvals") never break onto multiple lines regardless of font metrics or browser zoom.
    - **Sidebar Width Optimization**: Adjusted sidebar width from `248px` to `268px` (desktop and mobile overlay) with optimized item gap (`10px`) and font size (`0.86rem`), giving ample breathing room for longer labels and pending counter badges.
  - **Profile & Signature Modal Width Expansion (`ProfileAndSignatureModal.jsx`, `src/App.css`) (2026-10-25)**:
    - **Expanded Modal Width (`size="lg"`)**: Upgraded the unified Profile & Signature modal from `size="md"` (580px) to `size="lg"` (820px).
    - **Enhanced Canvas & Layout**: Expanded the signature drawing canvas area to provide a more natural, generous signing surface, gave the top primary tabs (`Digital Signature`, `PKI Certificate`, `Profile Photo`, `Theme Color`) ample breathing room in a single clean row, and updated the backdrop high-z-index selector list.
  - **Forms & Documents Explorer Storage Space Tracking & Display (`FormsHub.jsx`, `pgDb.js`, `server.js`, `ui.jsx`) (2026-10-25)**:
    - **Database Schema Upgrade (`server/pgDb.js`)**: Added `file_size INTEGER` column to the `form_templates` table via safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
    - **Backend File Size Computation (`server/server.js`)**:
      - `mapTemplate(t)` computes and exposes `fileSize` (using stored `file_size` or calculating from `t.docx_base64` byte length via `Buffer.byteLength(cleanBase64, 'base64')` for instant backwards compatibility).
      - `POST /api/forms/templates` and `PUT /api/forms/templates/:id` compute and persist `file_size` on template creation and editing.
    - **Human-Readable Formatter (`src/components/ui.jsx`)**: Exported `formatSize(bytes)` helper formatting byte counts into `B`, `KB`, `MB`, and `GB`.
    - **Recursive Folder & Department Storage Space (`src/components/FormsHub.jsx`)**:
      - `getFolderStorageSize(folderId)`: Recursively aggregates storage sizes of direct templates and all descendant subfolders to any nesting depth.
      - `getDepartmentStorageSize(deptName)`: Aggregates storage sizes across all templates and folders belonging to the department.
      - `currentTotalStorageSize`: Real-time computation of storage size across currently visible items.
    - **Visual Integration in Explorer Views**:
      - **Details / Table View**: Added dedicated `Size` (and `Storage Size`) table column to all explorer tables (drive root departments table, folder contents table, root templates table, cross-department search results table).
      - **Grid / Tiles View**: Displayed formatted storage size on folder tiles (`X items · Y KB`), department drive cards (`HardDrive` icon with total department size), and template cards (header badge and metadata row).
      - **Navigation Tree View**: Displayed storage size tooltips on department and folder item count badges.
      - **Status Bar**: Displayed dynamic `Total Storage: X KB/MB` in the bottom explorer footer for both department drive root and inside-folder views.
  - **Draft Documents & Templates Upload Without Approval Workflow (2026-10-25)**:
    - **Draft Document Concept**: Department admins and superadmins can upload Word templates (.docx, .doc), PDFs, and images as unpublished **Drafts** (`status = 'DRAFT'`) without defining an approval chain (`workflow = []`).
    - **Backend & Database Infrastructure (`server/server.js`, `server/pgDb.js`)**:
      - `mapTemplate(t)` exposes `status: t.status || 'ACTIVE'` and boolean `isDraft: t.status === 'DRAFT'`.
      - Scoped visibility (`canSeeTemplate`): Unpublished drafts (`status === 'DRAFT'`) are restricted to admins of the owning department and superadmins.
      - `POST /api/forms/templates`: Accepts `isDraft: true` and `status: 'DRAFT'`, bypassing the mandatory approval workflow check on creation and recording audit action `TEMPLATE_DRAFT_CREATED`.
      - `POST /api/forms/templates/bulk-import`: Supports `isDraft: true` and `status: 'DRAFT'`, allowing entire batches of documents to be imported as drafts.
      - `PUT /api/forms/templates/:id`: Handles publishing transitions from `DRAFT` to `ACTIVE` (requiring at least 1 approval step upon publishing) or saving draft modifications.
      - `POST /api/forms/submissions`: Rejects any submissions against draft templates with HTTP 400 and clear error message.
    - **Single Upload Modal (`TemplateUploadModal.jsx`)**:
      - Added "Upload as Draft" button in the modal footer.
      - Step 3 (Approval Workflow) detects `workflow.length === 0` and presents an amber suggestion banner allowing one-click upload as draft.
    - **Bulk Import Modal (`BulkImportModal.jsx` & `POST /api/forms/templates/bulk-import`)**:
      - All bulk-imported documents (.docx, .doc, .pdf, images) are **always and automatically saved as unpublished drafts** (`status: 'DRAFT'`, `isDraft: true`, `workflow: []`).
      - Removed cumbersome approval chain requirements during batch intake.
      - Displays dedicated Draft Ingestion Mode banner and destination defaults summary.
    - **Word Form Studio (`SmartWordStudio.jsx`)**:
      - Added `[ Save Draft ]` button to save new templates or existing draft modifications without enforcing workflow steps.
      - Distinct visual indicators: displays amber `Unpublished Draft` badge in the header, and `[ Publish Form ]` button to promote drafts to live forms.
    - **Forms & Documents Explorer (`FormsHub.jsx`)**:
      - Displays amber `Draft · Unpublished` badge in both Grid card view and Details table view.
      - Disables form filling for drafts and provides department admins with a direct `Publish Form` / `Edit & Publish` action that opens the document in Word Form Studio.
  - **Duplicate File Prevention in Same Folder (2026-10-25)**:
    - **Strict Folder-Scoped Uniqueness**: Neither `title` nor `fileName` / `docx_filename` can duplicate another unarchived file in the same department folder (or root drive).
    - **Backend Defense (`server/server.js`)**:
      - Added helper `findDuplicateTemplateInFolder({ department, folderId, title, fileName, excludeId })`.
      - `POST /api/forms/templates`: Rejects duplicate creation with HTTP 409 and descriptive conflict message.
      - `POST /api/forms/templates/bulk-import`: Validates uniqueness within the staged batch and against existing templates in the destination folder, failing conflicting entries.
      - `PUT /api/forms/templates/:id`: Rejects renaming or updating into a duplicate name within the same folder.
      - `PUT /api/forms/templates/:id/move`: Checks target destination folder before moving and rejects with HTTP 409 if a file with that name/title exists.
    - **Single Upload UI (`TemplateUploadModal.jsx`)**:
      - Real-time detection of name/title conflict in target folder.
      - Displays warning banner and disables `Upload as Draft` and `Publish Form Template`.
    - **Bulk Import UI (`BulkImportModal.jsx`)**:
      - Detects duplicates within batch and against target folder.
      - Displays duplicate conflict alert banner with one-click `Remove Duplicates (N)` button.
      - Highlights duplicate cards/rows with `Duplicate: ...` warning chips and disables import button.
    - **Word Form Studio (`SmartWordStudio.jsx`)**:
      - Detects duplicate title in target folder with header conflict badge and alerts on `Publish`, `Save Draft`, and `Save Edit`.
    - **Move Template Dialog (`FormsHub.jsx`)**:
      - Validates destination folders, disabling conflicting destination options with `Name Conflict` badge and preventing accidental moves.
  - **Text Color & Highlight Color in Word Form Studio (`SmartWordStudio.jsx`, `App.css`) (2026-10-25)**:
    - **Authentic Microsoft Word / Google Docs Split Formatting Tools**:
      - Added **Text Color** (`Baseline` icon with active color underline stripe) and **Highlight Color** (`Highlighter` icon with active color stripe) split buttons to the Home ribbon Font group.
      - Clicking the main button applies the active color directly to the selection or insertion caret.
      - Clicking the dropdown arrow opens an authentic dark-themed popover with curated palettes and live preview.
    - **Rich Palette Selection**:
      - **Text Color Palette**: Standard neutrals (Black, Dark Slate, Charcoal, Slate Gray, Cool Gray, White), full spectrum (Crimson, Ruby, Coral, Amber, Gold, Electric Lime, Forest Green, Emerald, Teal, Cyan, Sky Blue, Royal Blue, Navy, Indigo, Deep Purple, Violet, Magenta, Hot Pink), "Automatic / Reset" button, plus custom color eyedropper / hex picker.
      - **Highlight Color Palette**: Classic Word marker tints (Yellow, Electric Lime, Mint, Cyan, Sky Blue, Neon Pink, Soft Peach, Warm Amber, Lavender, Pastel Rose, Aquamarine, Soft Lilac, Grays, and Dark Tones), "No Color / Clear" button with standard slash icon, plus custom hex color picker.
    - **Selection & Caret Engine**:
      - Non-collapsed selection: Wraps extracted contents in `<span style="color: ...">` or `<span style="background-color: ...">`, cleaning existing nested conflicting styles when reset/cleared.
      - Collapsed caret: Inserts a styled insertion span with zero-width space `\u200B` allowing seamless continuation typing.
      - Full integration with undo/redo stack (`pushHistory()`), outside click dismissals, and DOM range preservation.
      - Full fidelity with `html-to-docx` Word export and Microsoft Word printing engine.
  - **Release v1.1.0 (2026-10-25)**:
    - Bumped application version from `1.0.0` to `1.1.0` in `package.json`, `package-lock.json`, `server/server.js`, `vite.config.js`, and `src/utils/versionManager.js`.
    - Automated cache invalidation system propagates the update: background poller (`GET /api/version`) detects `v1.1.0`, triggers cache eviction, and delivers the upgraded bundle without stale asset interference.
  - **Direct Input Box Width Overlap Fix (2026-10-26)**:
    - **Root Cause**: `.sd-doc-live-field-wrap` had a legacy hardcoded `min-width: 190px;` (and `.sd-pv-field` had `min-width: 200px;`). On an A4 paper sheet with standard padding (content width ~692px), a `25%` width column is `~165px`. Because `min-width: 190px` took precedence, the inner wrapper and input box forced themselves to 190px and overflowed the parent slot by ~25px, causing subsequent sibling inputs on the same row to paint directly on top of each other.
    - **Fix Applied**:
      - Updated `.sd-doc-live-field-wrap` in `src/App.css` to `width: 100%; min-width: 0; max-width: 100%;` and `.sd-doc-live-input` to `min-width: 0; padding: 6px 8px;`.
      - Updated `.sd-pv-field` in `src/App.css` to `min-width: 0;`.
      - Enhanced `.sd-live-slot-field` slot styling in `FillFormModal.jsx` and `SmartWordStudio.jsx` to cleanly handle `100%` width (`width: 100%`) vs sub-percentages (`calc(width% - 8px)`), ensuring zero overlap and clean spacing across multi-column rows.
      - Added overflow ellipsis to `.sd-doc-live-field-label` with native hover tooltip to prevent long labels from breaking horizontal alignment.
  - **Word Print Fidelity & Signature Stamping Fix (2026-10-26)**:
    - **Root Causes**:
      1. In `server/server.js` (`POST /api/forms/templates/:id/render-print-document`), submitter signatures were checked using `if (!blank && actor.signature)`. The PostgreSQL user record stores signatures in `signature_image`, meaning `actor.signature` was undefined and signatures array was empty `[]`, causing `{{Signature: Submitter}}` to be replaced with empty string `''`.
      2. In `server/docxEngine.js`, `renderFilledDocument` only knew field keys without label metadata. When printing unfilled direct input fields, it replaced them with `''` or blank lines without labels, making fields completely disappear from the printed document.
    - **Fixes Applied**:
      - Updated `server/server.js` to extract `actor.signature_image` and register aliases (`Submitter`, `Applicant`, `Originator`), stamping the user's authentic signature PNG image, name, and cryptographic PKI seal into the Word document.
      - Passed template `fields` schema to `renderFilledDocument` in both template print (`renderPrintDocument`) and submission document download endpoints.
      - Enhanced `docxEngine.js` tag replacement: for direct inputs (`mode: 'input'`), it formats as `${fieldLabel}: ${val}` when filled, and `${fieldLabel}: ________________________________________` when blank/unfilled, guaranteeing field labels and pen-fill lines are preserved on printed paper.
  - **WYSIWYG On-Form "Print As-Is" Engine & Margin Maintenance (`FillFormModal.jsx`, `App.css`) (2026-10-26)**:
    - **Requirement**: Form printing must print **only the form** — strictly excluding outer app chrome (sidebar, background drive explorer container/breadcrumbs, app footer, right-side interactive form rail, top action ribbon, sequential approval workflow widget, and automated form engine footer marker) — while maintaining consistent standard A4 paper margins (20mm) and fitting cleanly on 1 single page without rogue empty pages.
    - **Implementation & Fixes**:
      - **Native Direct Sheet Printing**: Switched `FillFormModal.jsx` from hidden-iframe DOCX rendering to direct WYSIWYG sheet printing (`window.print()`), adding `beforeprint` and `afterprint` lifecycle event handlers and `sd-printing-live-form` body toggles.
      - **Strict Form Isolation**: In `src/App.css` `@media print`, `body:has(.sd-form-filler-sheet)` and `body.sd-printing-live-form` hide all outer chrome: `.smart-sidebar`, `.smartdoc-app-footer`, `.sd-page-header`, `.sd-explorer-container`, `.sd-explorer-topbar`, `.sd-explorer-address-bar`, `.sd-explorer-toolbar`, `.sd-explorer-body`, `.sd-explorer-footer`, `.sd-explorer-page > *:not(.sd-form-filler-overlay)`, `.sd-form-filler-header`, `.sd-form-filler-rail`, `.sd-filler-connector-svg`, `.sd-form-filler-objection-banner`, `.sd-studio-alert`, `.sd-form-filler-workflow-chain`, and `.sd-word-page-footer-mark`.
      - **Consistent Standard Margins**: Configured `@page { size: A4 portrait; margin: 0; }` with `.sd-form-filler-sheet { box-sizing: border-box; width: 100%; max-width: 210mm; margin: 0 auto; padding: 18mm 24mm; }` to maintain deterministic **24mm (~0.95 in)** left and right margins and **18mm** top/bottom margins, while suppressing browser URL/timestamp headers and ensuring the form fits comfortably on exactly 1 single page.
      - **1:1 Form Element Fidelity**: Direct form boxes (`.sd-doc-live-field-wrap`, `.sd-doc-live-input`) retain their labels, borders, placeholders/values, and exact percentage widths. The digital signature card (`.sd-doc-live-sig-card.submitter`) retains its authentic dashed border, `Applicant / Submitter Signature *` title, `Step 0 (Originator)` badge, inner white signature container, drawn signature stroke, and PKI RSA-2048 cryptographic seal with `-webkit-print-color-adjust: exact`.
  - **Form Filler Visual Leader Connector Line & Placeholder Parsing Fix (`FillFormModal.jsx`, `App.css`) (2026-10-26)**:
    - **User Issue**: "Line ON" was checked/active in the right rail of `FillFormModal`, but no leader line was present connecting the active rail card (e.g. Card 1: First Name) to the document field on the sheet, and placeholders with asterisks like `{{Contract Amount*}}` appeared as raw unparsed text.
    - **Root Causes**:
      1. **Element ID / Selector Target Mismatch**: `updateConnectorLine` previously only searched for IDs prefixed with `live-placeholder-`. Direct input boxes on the document sheet render as `live-field-${sanitizedKey}` inside `.sd-doc-live-field-wrap`. When `activeRailField` was a direct input field, `document.getElementById('live-placeholder-...')` returned `null`, immediately clearing `connectorCoords` to `null` and preventing `<svg>` from rendering.
      2. **Temporal Dead Zone (TDZ) State Order**: `const [mountedSlots, setMountedSlots] = useState([])` was declared lower in the component (line 349), while `useEffect` listening to `mountedSlots` was called earlier at line 208. During component mount, this triggered a minified `ReferenceError: Cannot access variable before initialization`.
      3. **Trailing Asterisks & Non-Word Characters in Placeholders**: The template placeholder replacement regex expected exact key matching `fieldsMap.get(fn.toLowerCase())`. If a user typed `{{Contract Amount*}}` or double spaces like `First  Name`, the raw text remained unparsed.
      4. **SVG Stroke & CSS Variable Resolution**: In certain browsers, SVG linear gradients using `stopColor="var(--primary-500)"` as an XML attribute can fail to resolve, causing `stroke="url(#sd-connector-gradient)"` to render invisibly.
    - **Fixes Applied**:
      - **Dual-Target Element Resolution (`getDocFieldElement` & `getRailFieldElements`)**: Enhanced element resolution in `FillFormModal.jsx` to dynamically resolve `live-wrap-${key}`, `live-field-${key}`, `live-placeholder-${key}`, `[data-field-key]`, and prefix queries with sanitization and trailing-symbol stripping. Added `data-rail-key` to rail cards and `data-field-key` + `live-wrap-${sanitizedKey}` to document field wrappers.
      - **Fixed State Declaration Ordering**: Moved `docBodyRef` and `[mountedSlots, setMountedSlots]` to the top of `FillFormModal.jsx` alongside other refs and states, completely eliminating the TDZ ReferenceError.
      - **Fuzzy Placeholder Normalization**: Enhanced `fieldsMap` and regex in `processedHtml` to strip trailing asterisks (`replace(/[*:\s]+$/, '')`) and normalize whitespace (`replace(/\s+/g, ' ')`), allowing placeholders like `{{Contract Amount*}}` to cleanly match `Contract Amount` and render as interactive slots.
      - **Robust Visual SVG Connector Line**: Configured direct stroke `var(--primary-500, #a4fb4f)` with glowing halo, crisp target pin dot and downward arrowhead pointing directly to the active document field, and pulsing radar dot on the active rail card.
      - **Active Direct Field Highlight**: Added CSS rules in `src/App.css` so that direct input boxes linked to the active rail card illuminate with the theme's active accent border and glow (`is-active-target`).
  - **Access Rights & Permissions Modal Modern Redesign (`TemplatePermissionsModal.jsx`, `App.css`) (2026-10-26)**:
    - **User Feedback & Issues with Legacy GUI**:
      1. **Vertical Bloat & Clutter**: Three massive, vertically stacked cards (`All Users`, `Specific Departments`, `Specific Persons`) took up >350px of vertical space with awkward centered icons and radio buttons.
      2. **Viewport Clipping**: The bottom department list and action buttons (`Cancel`, `Save Access Rights`) were pushed off-screen or cut off.
      3. **Text Truncation**: Department names in the 2-column checklist truncated (e.g. `Finance & Accoun...`) because the modal was too narrow (580px) while wasting huge vertical space.
      4. **CSS Conflicts**: Legacy conflicting `.sd-perm-card` rules forced accidental vertical flex stacking and centering.
    - **Redesign & Architectural Improvements**:
      - **3-Way Horizontal Segmented Scope Switcher**: Replaced the bulky stacked cards with a compact, modern 3-option segmented control (`All Employees`, `Departments`, `Specific Persons`) taking only ~55px of vertical height with subtle micro-animations and theme-aware active indicators.
      - **Spacious & Truncation-Free Department Grid**: Expanded dialog to `size="lg"` / `max-width: 680px`. Department names like `Finance & Accounting` now display in full without truncation, alongside real-time employee counts (`0 employees`, `2 employees`, `1 employee`), `Owning Dept` accent badges, and custom checkboxes.
      - **Informative Toolbars & Controls**: Included quick actions (`Select All`, `Reset to Owning Dept`), search filter bar for large organizations, and dedicated individual user picker with avatars and system roles (`Admin`, `Superadmin`).
      - **Live Footer Scope Summary**: Replaced static buttons with a live summary display (`Scope: 1 Department (Finance & Accounting)`) paired with `Cancel` and `Save Access Rights`.
      - **Full Dynamic Accent Theme Adaptability**: Replaced all hardcoded color literals (`#a4fb4f`, `rgba(164, 251, 79, ...)`) with `var(--primary-500)`, `var(--primary)`, and `color-mix(in srgb, var(--primary-500) ..., transparent)`. The permissions modal now flawlessly matches whichever accent color is active in user preferences (Orange, Green, Blue, Red, Purple) across active tab buttons, counter badges, department checkboxes, borders, and footer summary icons.
  - **Release v1.2.0 (2026-10-26)**:
    - **Application Version Bump**: Bumped version from `1.1.0` to `1.2.0` across `package.json`, `package-lock.json`, `server/server.js`, `src/utils/versionManager.js`, `README.md`, `USER_MANUAL.md`, and `CONTEXT.md`.
    - **Key Highlights**:
      - **Access Rights & Permissions Modal Redesign**: Modern horizontal 3-way segmented scope switcher (`All Employees`, `Departments`, `Specific Persons`), truncation-free 2-column department cards with live employee counts, `Owning Dept` badge, custom checkboxes, toolbar quick-actions (`Select All`, `Reset to Owning Dept`), and live footer scope summary.
      - **Full Theme Matching**: Completely eliminated hardcoded colors in favor of CSS variables (`var(--primary-500)`, `color-mix`), enabling 100% harmonious color alignment across all five user-selectable accent themes (Orange, Green, Blue, Red, Purple).
      - **WYSIWYG On-Form "Print As-Is" Engine**: Dedicated form-isolated printing pipeline suppressing all outer application chrome, with deterministic 24mm standard margins and guaranteed single-page A4 fit.
      - **Direct Input Width Alignment**: Resolved multi-column overlapping inputs by eliminating legacy `min-width: 190px` constraints and calculating sub-percentages cleanly.
      - **Visual Leader Connector Line**: Dual element target resolution (`live-wrap`, `live-field`, `live-placeholder`) with trailing-symbol normalization and glowing SVG stroke.
      - **Automated Cache Invalidation**: Automatic detection of `v1.2.0` deployment triggers background cache clearance and refresh.
  - **Universal Document Download & Client-Side "Save as PDF" Engine (2026-10-26)**:
    - **Requirement**: Allow options to download documents across the system. For Microsoft Word `.docx` or legacy `.doc` files (both blank templates and filled submissions with stamped signatures and PKI digital seals), provide an explicit option to **Save as PDF** (`.pdf`) alongside **Download .docx**.
    - **Architecture & Implementation**:
      - **Client-Side PDF Conversion Engine (`src/utils/pdfExportEngine.js`)**: Implemented `exportWordToPdf(source, fileName, onProgress)` utilizing `jspdf` (v4.2.1), `html2canvas` (v1.4.1), and `docx-preview`.
        - **Anti-Blur & Typography Sharpness Optimization**: Upgraded rendering scale to **3.5×** (~336 DPI laser-print resolution) and switched from lossy JPEG to **lossless PNG** encoding (`toDataURL('image/png')`), eliminating compression ringing halos and blurry text edges.
        - **Subpixel Antialiasing & Exact Geometry**: Placed staging container in active browser compositor space (`top: 0; left: 0; opacity: 0.01; z-index: -99999`) with `-webkit-font-smoothing: antialiased` and `text-rendering: geometricPrecision`. Configured exact bounding-box dimensions (`width: sectionWidth, height: sectionHeight, windowWidth: sectionWidth, windowHeight: sectionHeight, scrollX: 0, scrollY: 0`) to prevent squashing, margin drift, or off-center distortion.
        - **Isolated Staging**: Prioritizes raw Word binary blobs (`blobRef.current`) rendered with `inWrapper: false`, preventing inherited modal background colors, dark padding, or box shadows from bleeding into the PDF.
      - **Document Preview Modal Integration (`DocumentPreviewModal.jsx`)**: Added `#btn-download-pdf` ("Save as PDF") with loading spinner and status feedback, alongside `#btn-download-doc` ("Download .docx") and direct download for static PDFs and images.
      - **Submission Detail Modal Integration (`SubmissionDetailModal.jsx`)**: Added direct footer action buttons `#btn-download-submission-pdf` ("Save as PDF") and `#btn-download-submission-docx` ("Download .docx") to download or convert filled forms with stamped submitter and approver signatures without requiring users to open preview first.
      - **Forms & Documents Explorer Quick Tools (`FormsHub.jsx`)**:
        - Grid view (`#btn-tpl-download-...`) and Table view (`#btn-tbl-tpl-download-...`) quick download buttons.
        - Direct download for non-editable PDFs and images.
        - Dedicated **Download Document Modal** (`#download-document-modal`) for Word templates providing interactive format cards:
          - **Microsoft Word**: Download original `.docx` format compatible with Microsoft Word and SmartDoc Studio.
          - **PDF Document**: Save print-ready, high-resolution `.pdf` file with live progress indicator.

