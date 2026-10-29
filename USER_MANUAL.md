# SmartDoc — User & Administrator Manual

SmartDoc is an enterprise **Word-template forms & department approval workflow** system. Departments own drives with a Windows Explorer-style folder structure. Admins design Word templates in the built-in **Word Form Studio**. Users fill forms, sign once with a saved signature, and submit. Department admins approve, object, or reject.

---

# Table of Contents
1. [Signing In](#1-signing-in)
2. [Roles & Permissions](#2-roles--permissions)
3. [Navigation & Notifications](#3-navigation--notifications)
4. [Dashboard](#4-dashboard)
5. [Forms & Documents (Explorer)](#5-forms--documents-explorer)
6. [Word Form Studio](#6-word-form-studio)
7. [Pre-Publication Reviews](#7-pre-publication-reviews)
8. [Filling & Submitting a Form](#8-filling--submitting-a-form)
9. [Approvals, Objections & PKI Verification](#9-approvals--objection-workflows)
10. [Team Messaging](#10-team-messaging)
11. [Activity Log & Audit Trail](#11-activity-log--audit-trail)
12. [Users, Departments & System Reset (Super Admin)](#12-users-departments--system-reset-super-admin)
13. [Statuses & Business Rules](#13-statuses--business-rules)
14. [FAQ & Troubleshooting](#14-faq--troubleshooting)
15. [Deployment (Single-Service Unified App)](#15-deployment-single-service-unified-app)
16. [Disk / Object Storage & Backup Management](#16-disk--object-storage--backup-management)

---

# 1. Signing In

- Sign in with your **username and password** (not email).
- The first account is the **super admin**, created automatically from the `.env` file (`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`).
- Use **Collapse sidebar** (or `Ctrl+B` / `Cmd+B`) at the bottom of the sidebar to toggle between full width (248px) and compact rail mode (72px).
- **Dark & Light Mode + 5 Accent Color Themes**: SmartDoc supports both **Pure Black Dark Mode** (`#000000`) and **High-Contrast Light Mode** (`#f8fafc` / `#ffffff`), along with 5 selectable accent themes (**Electric Lime / Green**, **Crimson Red**, **Sunset Orange**, **Royal Purple**, and **Ocean Blue**). You can switch themes anytime from the Login top bar, the Sidebar footer bar, or the **App Theme** tab in **Profile & Signature**.
- **`100vh` Zero-Scroll Viewport & Pinned Footer**: Every page (except the full-screen **Word Form Studio** editor) is locked to the screen height with zero page-level vertical scrolling and the application footer (`Powered by prynivo.com • v1.4.0`) permanently visible at the bottom.

---

# 2. Roles & Permissions

| Capability | Super Admin | Dept Admin (own dept) | Dept Admin (other dept) | User |
|---|---|---|---|---|
| Explore departments & folders | ✅ | ✅ | ✅ (visible items) | ✅ (visible items) |
| Create / rename / delete folders | ✅ any | ✅ own dept | ❌ | ❌ |
| Create / edit templates in Word Form Studio | ✅ any | ✅ own dept | ❌ | ❌ (fill/view only) |
| Configure form access rights (Permissions) | ✅ any | ✅ own dept | ❌ | ❌ |
| Upload PDF & image static documents | ✅ any | ✅ own dept | ❌ | ❌ |
| Move / archive templates | ✅ any | ✅ own dept | ❌ | ❌ |
| Fill & submit forms | ✅ | ✅ | ✅ if permitted | ✅ if permitted |
| Pre-publication review invitations | ✅ any | ✅ own dept | ❌ | ❌ |
| Review & modify forms assigned to me | ✅ | ✅ | ✅ | ✅ |
| Approve / Object / Reject submissions | ✅ any step | ✅ own dept step | ❌ | ❌ |
| Manage users & departments | ✅ | ❌ | ❌ | ❌ |
| System Reset & Data Purge (Danger Zone) | ✅ | ❌ | ❌ | ❌ |

- A department can have several admins. **Any** admin of the step's department can act on that step.
- Everyone must save a signature (**My Signature**) before submitting or approving.

---

# 3. Navigation & Notifications

### Sidebar Items
| Item | Page | Visible to |
|---|---|---|
| **Dashboard** | Live executive summary counts | Everyone |
| **Forms & Documents** | Windows Explorer + Word Form Studio | Everyone |
| **Reviews** | Assigned to me / Started by me (badge shows active reviews needing your action) | Everyone |
| **Approvals** | My Queue / My Submissions / Department (badge shows pending approvals) | Everyone |
| **Team Messaging** | Department chat | Everyone |
| **Activity Log** | Role-scoped ledger & audit trail (SHA-256 verified, CSV export, standalone window) | Everyone (role-scoped) |
| **Users & Departments** | Administration & System Reset | Super admin only |

### Opening Forms & Actions in a New Tab
Every action that opens something has its own link, so you can work on several things side by side:
- **Ctrl+Click** (Cmd+Click on macOS), **Middle-Click**, or **Right-Click → "Open link in new tab"** on any of these opens it in a new browser tab, straight into that action:
  - Forms & Documents: **Fill form**, **Print**, **Edit template / Edit & Publish**, **Preview (eye)**, **View doc**, **Version History** (clock icon or version badge), **Word Form Studio**, folders, departments and breadcrumbs.
  - Submissions & Approvals: any submission row or its **View** button.
  - Reviews: **Review document**, **Review changes**, **Continue to publish**.
  - Dashboard cards and lists, sidebar items, and notifications (opening a notification in a new tab also marks it read).
- A normal click still opens the item in the current tab, exactly as before.
- The links can be bookmarked or shared with colleagues (e.g. `/forms?action=fill&id=…`). Access rights are always enforced — if the recipient cannot see the form, they get a "Not Found" message.
- Once the item has opened, the link details are cleared from the address bar, so refreshing the page will not reopen it.

### Collapsible Sidebar
- **Toggle Button**: Click the collapse button at the bottom of the sidebar (`Collapse sidebar` with chevrons) to collapse the sidebar into a slim 72px icon rail. The top sidebar brand header cleanly displays only the SmartDoc brand and the Notification Bell.
- **Keyboard Shortcut**: Press `Ctrl+B` (or `Cmd+B` on macOS) from anywhere in the application to toggle the sidebar instantly. Note that `Ctrl+B` is safely passed through as bold formatting whenever you are actively editing in Word Studio or typing in text inputs.
- **Icon Rail Mode**: When collapsed, the sidebar preserves quick single-click access to all features, displays native browser hover tooltips for every navigation item, retains compact pending badge counters, and gives you maximum screen width for Word Form Studio, document comparisons, and large tables.
- **State Persistence**: Your collapsed or expanded preference is automatically remembered across browser tabs and reloads.
- **Mobile Mode**: On screens under 760px wide, the sidebar defaults to the compact 72px rail. Clicking expand smoothly opens a full-featured overlay drawer.

### Real-Time Notification System (`NotificationBell.jsx`)
- Located in the sidebar with a dynamic unread counter badge.
- Automatically polls every 15 seconds for new events:
  - Submissions requiring your signature or department approval.
  - Approvals, objections, and rejections on your submitted forms.
  - Invitations to review draft form templates across any department.
  - Clicking any notification automatically marks it as read and navigates directly to the referenced document. Use **Mark all as read** to clear the badge.

### Interactive Actionable Toast Banners (`ToastContainer.jsx`)
SmartDoc uses a modern, interactive toast notification system for instant feedback across all modules:
- **Synchronized Countdown Timer**: Each toast displays an animated countdown progress bar at its base showing remaining display time.
- **Hover-to-Pause**: Moving your cursor over any toast instantly freezes the countdown timer, keeping the toast visible indefinitely while you read details or interact with action buttons. Moving the mouse away resumes the timer.
- **Direct Action Buttons (CTAs)**: Contextual toasts feature one-click action buttons for immediate navigation without switching pages manually (e.g. `[ Go to Forms Hub ]` after a reset, `[ View Approvals ]` after form submission, or quick-retry triggers).
- **Expandable Diagnostic Details**: Toasts with extended diagnostic data feature a `Details ▾` accordion toggle, displaying structured multi-line reports or error explanations without cluttering the initial message.
- **Instant Dismissal**: Click the close (`×`) button at any time to immediately dismiss the notification.

### Profile & Signature Studio
- **Unified Identity Modal**: Click **Profile & Signature** in the sidebar footer (or click your avatar / profile card at the bottom left) to open the unified **Profile & Signature** modal (`ProfileAndSignatureModal.jsx`).
  - **Digital Signature Tab**: Create your official digital signature using any of three flexible methods:
    1. **Draw Freehand**: Sign naturally using your mouse, touchpad, pen stylus, or touch screen with ink color selection (Executive Navy or Classic Black).
    2. **Type to Sign**: Type your full name and choose from 4 authentic cursive handwriting styles (*Executive Script*, *Modern Calligraphy*, *Natural Pen*, *Classic Monoline*).
    3. **Upload Scan**: Upload a photo or scan of your physical signature on paper; SmartDoc automatically strips the paper background to pure transparency with an adjustable threshold slider.
    Your saved signature is stored securely and automatically stamped into official Word documents on submission and approval steps.
  - **PKI Certificate Tab**: View and manage your standardized enterprise **X.509 v3 Digital Certificate** and RSA 2048-bit cryptographic keypair.
    - Inspect your Subject Common Name (`CN`), Department (`OU`), Key Algorithm, unique Serial Number, and validity window.
    - **SHA-256 Certificate Fingerprint**: Instant one-click copy of your cryptographic hash identity.
    - **Download .crt**: Export your public X.509 certificate file for external validation.
    - **Renew Certificate**: Re-issue your RSA-2048 keypair and certificate on-demand.
    - **Raw PEM Viewer**: Toggle to inspect base64-encoded X.509 certificate data.
  - **Profile Photo Tab**: Drag and drop or upload any photo (JPEG, PNG, WebP), adjust zoom (1x–2.5x) and circular cropping in real time, or remove your photo to revert to your initials. Updating your photo applies immediately across team chat, comments, reviews, and approval logs.
  - **App Theme Tab**: Switch between **Dark Mode** and **Light Mode** and choose from 5 enterprise accent color palettes (**Green / Lime**, **Red**, **Orange**, **Purple**, **Blue**) with live preview cards.

---

# 4. Dashboard (Smart Analytics Cockpit)

The SmartDoc Dashboard is a comprehensive, interactive **Analytics Cockpit** (`SmartDashboard.jsx` & `DashboardCharts.jsx`) designed to give managers, department heads, and team members immediate clarity on workflow velocity, pending bottlenecks, and compliance health.

It operates strictly on **live data** with zero mock metrics. If no records exist in a selected time window or department, charts cleanly reflect zero states without crashing or displaying artificial numbers.

---

### 4.1 Scope & Time Horizon Controls
At the top of the dashboard, use the interactive controls bar to dynamically reshape the entire analytics view:
- **Workspace Scope Switcher**:
  - **My Workspace**: Focuses exclusively on your submissions, decisions awaiting your action, and templates you author.
  - **Department Drive**: Aggregates throughput, active templates, and approval bottlenecks for your assigned department.
  - **Enterprise Global**: Provides an organization-wide executive view across all departments (especially valuable for administrators and leadership).
- **Time Horizon Filter**:
  - Choose between **7 Days**, **30 Days**, **90 Days**, or **All Time**.
  - All smart statistics, timeline trend series, status distributions, and volume counters recalculate instantly on the client based on document creation and decision timestamps.
- **Sync / Refresh Button**: Located in the top header action row with an animated indicator to pull fresh records from PostgreSQL on demand.

---

### 4.2 6-Card Smart Stats Grid
Each card provides a high-level KPI accompanied by contextual micro-metrics and interactive click behavior:
1. **Awaiting My Action / In Review Progress**:
   - Displays forms currently waiting at your department's approval step (or your forms currently under review).
   - Features an automatic **⚡ Urgent (<48h)** alert badge if any document is nearing or past its decision deadline.
   - Click to jump straight into the Approvals Hub.
2. **Approval Turnaround & SLA Velocity**:
   - Calculates real-time average turnaround time from submission creation to final approval or rejection (e.g. `1.4 days avg` or `< 12 hrs avg`).
   - Displays on-time SLA compliance rate (`% on-time SLA`) measuring documents decided before their expiry date.
3. **Approval Pass Rate**:
   - Percentage of completed forms approved vs rejected or revised.
   - Subtitle displays a breakdown of `approved · revisions · rejected`.
   - Click to filter recent submissions below by **Approved** status.
4. **Revisions Requested (Objections Queue)**:
   - Tracks forms with `OBJECTION_RAISED` requiring originator amendments.
   - Highlights whether immediate revision is needed to unblock stalled approval chains.
   - Click to filter recent submissions below by **Changes Requested**.
5. **Digital PKI Cryptographic Coverage**:
   - Percentage of submissions protected by cryptographic RSA-2048 and X.509 non-repudiation seals.
   - Click to open the unified **Profile & Signature** modal on the PKI Certificate tab.
6. **Active Catalog Throughput**:
   - Measures how many published templates are actively being utilized versus the total templates available in the catalog.
   - Displays the total submissions processed in the active time window.
   - Click to open the Forms & Templates Explorer.

---

### 4.3 Interactive Data Visualizations (`DashboardCharts.jsx`)

#### 1. Submission & Approval Velocity Trend (Area / Bar Chart)
- **Visual Presentation**: Responsive SVG timeline plotting daily submission volume alongside approved completions with glowing gradient area fills under the curve.
- **Mode Toggle**: Use the top-right button toggle to switch between **Smooth Area Trend** (cubic Bézier curve) and **Daily Volume Bars**.
- **Interactive Hover Tooltips**: Hover over any data point or bar to inspect a floating dark tooltip showing the formatted calendar date, submissions count, approved count, and in-review/objection breakdowns.
- **Click-to-Filter by Date**: Click any data point or bar to filter the recent submissions table below to only show documents submitted on that specific date. A tag pill appears allowing you to clear the date filter at any time.

#### 2. Status Breakdown Donut Chart
- **Visual Presentation**: Circular SVG donut chart with proportional arcs colored by status:
  - **Approved** (Emerald Green `#10b981`)
  - **In Review** (Theme Accent / Lime `var(--primary-500)`)
  - **Changes Requested / Objections** (Amber `#f59e0b`)
  - **Rejected** (Rose Red `#ef4444`)
- **Dynamic Center Readout**: The center of the donut displays the total document count and overall pass rate by default. When you hover over any arc or legend pill, the center dynamically animates to display that specific status label, item count, and percentage share of the total.
- **Click-to-Filter by Status**: Click any slice or legend button to instantly filter the submissions feed below to that status.

#### 3. Department Workload & Pipeline
- Compares throughput and pending approvals across all corporate departments (Human Resources, Finance, Legal, IT, Operations, etc.).
- Segmented horizontal progress bars display the ratio of completed vs in-review documents.
- Highlights department bottlenecks (e.g. `2 awaiting approval`).
- Click any department row to filter the submissions feed to only show that department's documents.

#### 4. Most Utilized Word Templates (Leaderboard)
- Ranks corporate form templates by submission frequency.
- Displays template title, department badge, usage count, pass rate, and document version.
- Includes a direct **"Fill →"** action button to launch into form filling immediately.

---

### 4.4 Priority Action Radar & Live Submissions Explorer

#### Priority Action Radar
A focused inbox helping you stay ahead of pending obligations:
- **Approvals Tab**: Submissions waiting at your current department step.
- **Objections Tab**: Submissions you originated where reviewers requested changes, showing the reviewer's objection quote and due date.
- **Urgent Tab**: Submissions with decision deadlines expiring within 48 hours or already overdue.
- **Reviews Tab**: Pre-publication template reviews where you have been invited to review draft forms or where reviewers have submitted feedback.
- Each item includes a direct **Eye** button to inspect the full document in `SubmissionDetailModal.jsx`.

#### Live Searchable Submissions Feed
- **Live Search**: Debounced search input filtering records in real time across title, document number (`FRM-2026-XXXX`), submitter name, and department.
- **Status Filter Chips**: One-click status pills (`All`, `Review`, `Approved`, `Revisions`, `Rejected`) with live selection styling.
- **Active Filter Banner**: Whenever a graph point, donut slice, department bar, or search query is active, a top banner displays the active filter tags with individual clear buttons and a **"Reset All"** action.
- **Submission Rows**: Click anywhere on a submission row to open the full submission detail modal, inspect workflow progress, download PDFs, or approve/object.

---

### 4.5 Enterprise Quick Launch Dock
Located at the bottom of the dashboard for rapid access to core workflows:
- **Fill Form**: Jump straight into the template catalog to fill out and sign a new form.
- **Approvals Queue**: Open your active decision queue with pending count indicator.
- **Signature & PKI**: Quick status check for your digital signature and X.509 certificate with one-click access to the drawing pad.
- **Activity Trail**: Navigate directly to the cryptographic audit log.

---

# 5. Forms & Documents (Explorer)

## 5.1 Layout
- **Left pane (tree)**: Departments → Folders → Subfolders. Click to open and use the chevrons to expand or collapse.
- **Address bar**: breadcrumbs such as `SmartDoc Drive > Human Resources > Recruitment`, with **Back / Forward / Up** buttons.
- **Toolbar**: search, filter pills (**All / Templates / Submissions**), a **Grid ↔ Details** view toggle, and a rights badge showing whether you can manage the current location.
- **Main pane**: department drive cards at the root. Inside a department you see folder tiles, template cards, and submitted document cards.

## 5.2 Managing folders (admins)
1. Open your department (super admin: choose the department when prompted at root).
2. Click **+ New Folder**, enter a name, and confirm.
3. **Rename**: use the pencil icon on hover, or **Rename** in the toolbar while inside the folder.
4. **Delete**: use the trash icon or **Delete Folder**. Contents are safely moved up to the parent folder, so nothing is lost.
5. Folders can be nested to any depth.

Regular users see folders read-only. The folder management buttons are hidden and the server returns 403 if attempted.

## 5.3 Word Templates (.docx & .doc)
- Click **Word Form Studio** (header) to create a template from a blank page, or open an existing `.doc` or `.docx` file in the studio.
- Use the **quick uploader** for ready Word documents (`.doc` or `.docx`) with `{{placeholders}}`: detected fields, signature slots (`{{Signature:...}}` and `{{sig:...}}`), and system tags are extracted automatically. Authors can configure each field's Fill Style (`🏷️ Placeholder` vs `📝 Direct Input`), Mandatory toggle, and **Weight** (`Bold` vs `Normal`). Legacy `.doc` templates are automatically compiled to `.docx` format upon saving for seamless downstream filling and signature stamping.
- **Move template**: choose a different folder within the department.
- **Remove / Delete Template (Submission-Aware)**:
  - If **no user has filled or submitted a form** for this template, it is **permanently deleted** from both the server disk drive (`storage/templates/`) and the database.
  - If **one or more users have filled or submitted forms**, the template is **archived** (`status = 'ARCHIVED'`). The document file is preserved on disk so historical submissions can still be rendered, printed, and PKI-verified. The confirmation modal dynamically reflects whether the item will be permanently erased or archived.

## 5.4 Non-Editable Documents (PDF & Images)
Admins can upload static reference documents that cannot be modified:
- Supported formats: `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp`.
- Marked with a **Non-Editable** badge (`is_editable: false`).
- Clicking **View document** opens `DocumentPreviewModal.jsx` featuring an embedded PDF iframe or high-resolution image viewer with built-in Print and Download capabilities.

## 5.5 View/Fill vs Edit Separation
- **Regular Users**: Can click **Fill form** to enter answers and submit Word forms, or **View document** to read static PDFs/images. They cannot modify template fields, layouts, or approval workflows.
- **Department Admins & Superadmin**: Have a dedicated **Edit form** button that opens `SmartWordStudio.jsx` in design mode to adjust form questions, layouts, tables, and sequential approval chains.

## 5.6 Form Access Rights & Permissions
Admins can click **Assign Rights** (lock icon) on any template card to open `TemplatePermissionsModal.jsx`:
- **Sleek 3-Way Segmented Scope Switcher**: Instantly switch between scope definitions via the compact horizontal control:
  - **All Employees (`ALL`)**: Open company-wide access with instant visibility in Forms Hub and searchability across all corporate departments.
  - **Departments (`DEPARTMENTS`)**: 2-column grid showing authorized departments without truncation, live employee counts per department, `Owning Dept` badge, custom checkboxes, and toolbar actions (**Select All**, **Reset to Owning Dept**). Includes an integrated filter bar for organizations with many departments.
  - **Specific Persons Only (`USERS`)**: Searchable user picker with employee avatars, `@usernames`, department tags, and system role badges (`Admin`, `Superadmin`). Quick actions include **Select All Listed** and **Clear All**.
- **Live Footer Scope Summary**: The modal footer displays a real-time summary of the active permission scope (e.g. `Scope: 1 Department (Finance & Accounting)`) alongside **Cancel** and **Save Access Rights** buttons with guaranteed viewport visibility and zero off-screen clipping.
- **Dynamic Theme Adaptability**: All selection highlights, checkboxes, counter pills, and scope icons dynamically adapt to whichever accent color is active in user preferences (Electric Lime, Orange, Blue, Red, Purple).

## 5.7 Version History & Git Commit Timeline
Click the **Version History** button (commit icon) on any template card to open `VersionHistoryModal.jsx`:
- Displays a Git-style vertical commit timeline.
- Shows version bumps (1.0 → 1.1 → 2.0), commit hash, author name, timestamp, and commit summary note.

## 5.8 Storage Space Tracking & Display
SmartDoc automatically tracks and displays the storage space consumed by documents, folders, and departments:
- **File Storage Space**: Displayed in human-readable units (B, KB, MB, GB). In Details/Table view, a dedicated **Size** column shows the exact size of each template and document. In Grid view, each template card shows its storage badge in the title row and in its metadata footer.
- **Recursive Folder Storage Space**: Folders calculate the total cumulative storage size of all direct templates plus all nested subfolders to any arbitrary depth. In Details/Table view, this is shown in the **Size** column; in Grid view, it is shown on each folder tile (e.g. `4 items · 145.2 KB`); in the tree view, it appears as a tooltip on the folder counter badge.
- **Department Drive Total Storage**: The root drive view displays total department storage space directly on department cards and in the **Storage Size** column of the department table.
- **Explorer Status Bar**: The bottom status bar computes and displays live **Total Storage** for the current location (e.g., `Total Storage: 1.2 MB`).

## 5.9 Draft Documents & Direct Staging
Department admins can upload or create documents and Word templates purely as unpublished **Drafts** (`status = 'DRAFT'`) without defining an approval chain:
- **Single Upload Modal**: Step 3 (Approval Workflow) provides an **Upload as Draft** action when no approvers are specified.
- **Word Form Studio**: The dedicated **[ Save Draft ]** action saves the document directly into your folder as a draft.
- **Permissions**: Draft documents are completely private to admins of that department (and the superadmin). Regular users cannot see or fill drafts.
- **Promotion to Live Form**: Department admins can open any draft, configure the required approval steps, and click **[ Publish Form ]** to activate it for end-user filling.

## 5.10 Strict Duplicate File Prevention in Same Folder
To prevent naming confusion and accidental overwrites, duplicate documents or templates are strictly forbidden within the same folder (or department drive root):
- **Uniqueness Criteria**: Both **Title** (`title`) and **File Name** (`fileName`) must be unique (checked case-insensitively with whitespace trimmed) among unarchived files in that folder.
- **Upload Validation**: Single upload alerts if a duplicate name exists and disables submission.
- **Bulk Import**: Automatically flags intra-batch duplicates and folder collisions, offering a one-click **"Remove Duplicates"** cleaning tool.
- **Word Form Studio**: Displays a danger badge in the header title block and blocks publishing or saving if the title matches another file in that folder.
- **Move Template**: Folders with duplicate collisions are highlighted with a danger badge and disabled in the Move dialog.

## 5.11 High-Speed Bulk Document & Template Ingestion
Admins can upload multiple files at once using the **Bulk Import** tool:
1. In the Explorer toolbar, click **Bulk Import** (upload cloud icon).
2. Choose a destination: either the current department root or a specific folder.
3. Drag and drop multiple files (`.docx`, `.doc`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`).
4. SmartDoc automatically inspects the batch:
   - Detects any duplicate filenames within the batch or against the destination folder.
   - Click **Remove Duplicates** to clean up the queue in one click.
5. Click **Import Documents as Drafts**: Files are ingested instantly and staged as unpublished drafts, ready for subsequent review and publication.

## 5.12 Universal Document Download, Preview Parity & Client-Side "Save as PDF"
SmartDoc allows users to preview and download any document or template across the system with exact 1:1 Filling Form parity:
- **Exact Filling Form Visual Parity (`—` for Unfilled Fields)**: Previewing any template (`DocumentPreviewModal.jsx`) or downloading it as `.pdf` or `.docx` renders the exact same typography, fonts, multi-column rows, labels, field guidance, input boxes, and signature cards as the **Fill Form** screen — the only difference is that unfilled input boxes and in-text placeholders display a clean dash (`—`) instead of placeholder hints or raw `{{tags}}`.
- **Direct Download for PDFs & Images**: Clicking the **Download** button on any static PDF or image document instantly downloads the original file without additional prompts.
- **Dual Formats for Word Documents (.docx & .doc)**: Clicking the **Download** button on any Word document opens the **Download Document** dialog, providing two options:
  1. **Download Microsoft Word (.docx)**: Downloads a 100% Microsoft Word desktop-compliant `.docx` file (validated and repaired by SmartDoc's OpenXML/OPC engine `renderTemplateAsWordDocx` & `repairDocxBuffer`) matching the Filling Form layout with `—` in unfilled fields.
  2. **Save as PDF (.pdf)**: Automatically converts the form sheet into an authentic, print-ready, high-resolution A4 `.pdf` file directly inside the browser using SmartDoc's upgraded 3.5× (~336 DPI) lossless client-side PDF export engine (`exportFormSheetToPdf`).
- **In-Preview Downloads (`DocumentPreviewModal.jsx`)**: When viewing any document in the preview modal, dedicated header/footer buttons provide 1-click access to **Download PDF**, **Download .docx**, and **Print Form**.
- **Vector PDF Alternative via Native Print**: Clicking **Print** in the preview modal or submission view triggers the browser's native print engine. Selecting "Save as PDF" in the print destination creates 100% vector, selectable text with infinite zoom clarity.

---

# 6. Word Form Studio

A Microsoft Word-style editor on an authentic A4 sheet canvas. **It opens blank by default.** Type, format, and drop in form elements directly inside the document.

## 6.1 Ribbon tabs

| Tab | What it does |
|---|---|
| **Home** | Undo / Redo (with `Ctrl+Z` / `Ctrl+Y`), Font family & size (−/input/+ stepper), bold, italic, underline, strikethrough, Text Color & Highlight Color (split palettes with 24 theme colors & custom hex), alignment, bullet / numbered lists, Indent / Outdent, Line spacing (Single, 1.15, 1.5, Double), Clear formatting, Insert / Edit Link (`Ctrl+K`), headings (Normal, H1–H3) |
| **Insert Elements** | Form fields, in-text placeholders, signatures, system tags, tables (10×8 grid picker), dividers, page breaks, Insert Link |
| **Table Tools** | Contextual tab when inside a table: insert/delete rows/cols, merge/split cells, cell shading, borders, alignment |
| **Page Layout** | Margins (Normal / Narrow / Wide), page size (A4 / Letter), orientation |
| **Workflow & Approvals** | Department, destination folder, audience, decision deadline (days), approval steps |

## 6.2 Form elements, Drag & Drop, In-Text Placeholders & field widths
Place the cursor where you want the element and click it in **Insert Elements**, or **drag and drop** any form control button directly from the Ribbon onto the document sheet:
- **Drag-and-Drop Form Controls**:
  - **Drag from Ribbon**: Drag any form control button in the **Home** or **Insert Elements** tabs (`Placeholder`, `Name / Text`, `Date Placeholder`, `Amount / Number`, `Governing Law`, `Text Box`, `Long Text`, `Date Picker`, `Number`, `Dropdown`, `Checkbox`, `Submitter Signature`, `Horizontal Rule`) and drop it at any target spot on the page.
  - **Reorder Existing Controls on the Page**: Click and drag any existing form pill (`.sd-doc-field-pill`), signature block (`.sd-doc-sig-block`), system tag (`.sd-doc-system-tag`), or image (`.sd-doc-image-wrap`) to move it onto the same horizontal row beside another control, onto a different line, or inside/outside a table cell. A live indigo drop caret indicator (`.sd-drop-caret-indicator`) highlights the exact landing spot.
- **Field types**: Short Text, Long Text, Date, Number, Dropdown, Checkbox.
- **In-Text Placeholders (Legal & Contracts)**: Placeholders designed for flowing contracts, agreements, NDAs, and legal instruments where values like party names, execution dates, payment sums, and governing jurisdictions sit directly within paragraph prose. **In-Text tags strictly use text input type**:
  - **Party / Name** (`placeholder`, text)
  - **Agreement Date** (`placeholder`, text)
  - **Contract Amount** (`placeholder`, text)
  - **Governing Law** (`placeholder`, text)
- **Draft Staging & Clean Cancellation**:
  - Clicking any placeholder insertion tool stages the element directly in your document canvas and immediately opens the **Customize Form Field** modal.
  - If you click **Cancel**, **×**, or press **Escape**, the staged draft element is cleanly removed from the document canvas without leaving orphan tags or text fragments behind.
- **Field Customization Options**: Click any inserted field pill inside the document canvas to adjust:
  - **Display Mode**: Switch between `🏷️ In-Text Tag` (flows inline within document sentences) and `📝 Input Box` (renders an on-page form control).
    - **In-Text Tag Text-Only Enforcement**: In-Text tags strictly support text input type (`Short Text`). When In-Text Tag is selected, the Input Type selector is automatically locked to Short Text, and non-text controls (dropdown options, date pickers, numbers, checkboxes) are disabled to guarantee seamless inline typography.
    - **Input Box Controls & Side-by-Side Row Widths**: Selecting Input Box unlocks all input types (Short Text, Long Text, Date Picker, Number, Dropdown Select, Checkbox) and on-form grid row widths (`Auto`, `25%`, `33%`, `50%`, `66%`, `75%`, `100%`). Placing multiple fractional-width fields (e.g. four `25%` fields, three `33%` fields, or two `50%` fields) on the same line renders them side-by-side on a single aligned row in both the Studio editor, Live Preview, and Fill Form sheet.
  - **Text Weight (for In-Text Placeholders)**: Switch between **Normal Text** (standard document body weight) and **Bold (700)** (heavier typographic emphasis for filled values like names, sums, or key contractual dates).
  - **Field Description & Guidance**: Add multi-line instructions and contextual guidance shown to users when filling this field in the right rail cards, single-field dialog, and tooltips.
  - Label (name) & placeholder prompt hint.
  - **Required (Mandatory)** toggle: Enforces that the placeholder must be filled before submission.
  - **Dropdown Choices & Options**: When an **Input Box** field is set to **Dropdown Select**, a dedicated choices editor appears directly under the input type:
    - View live option badges with one-click **×** deletion.
    - Type or paste options as comma-separated values (e.g. `California, Delaware, New York, Texas`).
    - SmartDoc automatically pre-fills sensible default choices (`Option 1`, `Option 2`) when first switching to a dropdown.
  - **Universal Element Removal (Fields, Tables, Horizontal Lines, Images)**:
    - Every field pill, signature block, system tag, and image includes a quick-remove (**×**) button.
    - Hovering over any **Table** or **Horizontal Line (`<hr>`)** (or clicking a line/table cell) displays a floating **× Remove Table** / **× Remove Line** popover, alongside quick-delete buttons in the **Home** and **Insert Elements** ribbons, the bottom status bar, and `Backspace` / `Delete` keyboard support.
- **Backdrop Outside-Click Protection**: All field customizers, dialogs, and popovers feature outside-click protection so accidental clicks on the dark background never dismiss your work unexpectedly.
- **Coexistence**: Direct input controls and in-text placeholders can freely coexist on the exact same document sheet.

## 6.3 Signatures & system tags
- **Submitter signature**: stamped with the submitter's saved signature when a user fills and signs the form.
- **Department signature**: one slot per approving department. Slots are kept in sync with the approval steps.
- **Signature Block Widths**: Signature blocks sit on their own dedicated line at `100%` width by default and can be resized or removed via the signature customizer or quick-remove (**×**) button.
- **System tags** are auto-filled on the final document: Form ID, Submitted By, Submitted Date, Department, Version.

## 6.4 Live Preview & MS Word-Style Page Zoom (`50%`–`200%`)
- **Live Preview**: Use the header view toggle (**Edit / Side by side / Preview**) to view the form exactly as end users will see it with interactive inputs, multi-column field rows, and the approval chain, without having to save first. In Studio Preview mode, signature slots display a clean neutral placeholder (`Sign on Submit / Approval`) rather than stamping the template author's personal signature.
- **MS Word-Style Page Zoom (`50%`–`200%`)**: Adjust page sheet zoom from **50% to 200%** using the zoom stepper in the top header bar or the interactive zoom slider and preset buttons (`75%`, `100%`, `125%`, `150%`) in the bottom status bar. Click the percentage readout at any time to reset to `100%`.

## 6.5 In-Form Margin Comments & Objections
- Docked side panel accessible via the **Comments** toggle button in the header.
- Add targeted feedback cards categorized as:
  - **Suggestion**: General formatting or text improvement.
  - **Objection**: Critical issue blocking publication.
  - **Change Request**: Requested addition or modification.
  - **General Note**: Reference comment.
- Each comment displays the author, department, and timestamp.
- Direct **✓ Accept** and **✕ Reject** buttons record resolution decisions directly on the document.

## 6.6 Mandatory Git Commit Messages on Save
When modifying an existing form template:
- Clicking **Save Changes** opens a Git Commit modal.
- Admins must enter a concise summary describing the modification.
- Automatically records a new Git commit node in the version history and bumps the version number.

## 6.7 Publishing & Versioning
- **Publish Template**: Compiles the document into a real `.docx` and saves it into the selected folder.
- **Save & Commit**: Records incremental changes to an existing template with a version commit note.
- **Save as Draft**: Dedicated action to save the form as an unpublished draft without configuring an approval chain.
- **Review Publishing (In-Place Update)**: Resuming and publishing a pre-publication review that was initiated from an existing template prompts for a Git commit message and updates that existing template in-place with an incremented version number (e.g. `v1.8` → `v1.9`), preventing duplicate template entries in the drive.

## 6.8 Text Styling, Google Docs Parity Formatting & History
Word Form Studio features a high-fidelity inline formatting and history engine modeled after Google Docs and Microsoft Word:
- **Selection-Scoped Formatting**:
  - Changing font family, font size, bold, italic, underline, strikethrough, text color, or highlight color applies **strictly to the selected text range**.
  - It does not restyle the whole document or alter the base document template defaults.
  - If applied with a collapsed cursor (no text highlighted), the styling attaches to an invisible caret point so that newly typed characters immediately inherit the formatting.
- **Font Size Stepper (− / Input / +)**:
  - Click **−** or **+** to step font size down or up, or type any point size directly into the numeric box and press `Enter` to apply. Pressing `Escape` cancels changes and restores original size. Both actions seamlessly return focus to the document canvas.
- **Text Color & Highlight Color Tools**:
  - **Text Color Tool (`Baseline` icon with color stripe)**: Click the button to apply the current color, or click the dropdown arrow to pick from 24 curated enterprise theme colors, a custom hex picker, or **Automatic / Reset** to return to document base color.
  - **Highlight Color Tool (`Highlighter` icon with color stripe)**: Click the button to highlight text, or use the dropdown to choose from curated highlighter tints (Yellow, Electric Lime, Mint, Cyan, Sky Blue, Pink, Peach, Amber, Lavender, Rose) or **No color / Clear** to remove highlighting.
- **Paragraph Indentation**:
  - Click **Increase Indent** (`Ctrl+]`) or **Decrease Indent** (`Ctrl+[`) in the Home ribbon to adjust paragraph margin by ±36pt.
  - In bulleted or numbered lists, indentation automatically adjusts list nesting depth.
- **Line Spacing Control**:
  - Select between **Single (1.0)**, **1.15**, **1.5**, and **Double (2.0)** spacing directly from the ribbon dropdown to format line height without adding unwanted paragraph block gaps.
- **Clear Formatting (`Ctrl+\`)**:
  - Instantly strips inline font family, font size, colors, highlights, and inline text spans from the selection, reverting text back to the clean document base typography.
- **Active Toolbar States & Focus Retention**:
  - Ribbon buttons (`Bold`, `Italic`, `Underline`, `Strikethrough`, alignment, lists, headings, links) display live `.is-active` accent highlights matching the exact styling at the cursor.
  - Toolbar controls prevent focus theft, ensuring you never lose your document cursor or selection when clicking ribbon tools.
- **100-Step History Stack with Cursor Restoration**:
  - Undo (`Ctrl+Z`) and Redo (`Ctrl+Y` / `Ctrl+Shift+Z`) maintain a complete 100-snapshot history stack.
  - Typing is intelligently grouped in 500ms bursts; commands, pastes, cuts, and formatting changes create discrete undo points.
  - Undoing or redoing automatically restores the cursor to the exact text position where the change occurred and scrolls it into view.
  - Native browser Edit menu and context menu undo/redo actions are seamlessly routed through Studio history.

## 6.9 Hyperlinks & Interactive Link Quick Bubble (Google Docs Parity)
Word Form Studio provides comprehensive Google Docs-parity hyperlink tools:
- **Inserting a Hyperlink (`Ctrl+K`)**:
  - Press `Ctrl+K` (or `Cmd+K` on macOS), click **Insert Link** in the Home ribbon, or click **Link** in the Insert Elements tab.
  - The floating **Link Dialog (`#sd-link-dialog-popover`)** opens directly adjacent to your selection.
  - **Text**: Displays the currently selected text, or allows entering custom link anchor text.
  - **Link (URL)**: Enter any destination web address or email. Addresses lacking a protocol automatically default to `https://` (or `mailto:` if an email is detected).
  - Press `Enter` to insert or apply changes; press `Escape` or click Cancel to close without saving.
- **Interactive Link Quick Bubble (`.sd-link-bubble`)**:
  - Moving the cursor into or clicking on any hyperlink in the document canvas displays a floating quick bubble directly above the link.
  - **Target Display**: Shows the destination URL with a clean link icon.
  - **Open in New Tab**: Single-click button opens the URL in a new browser tab with full security headers (`target="_blank" rel="noopener noreferrer"`).
  - **Copy Link**: One-click clipboard copy with an instant confirmation toast (`Link copied to clipboard`).
  - **Edit Link**: Re-opens the link popover dialog to update the anchor text or URL.
  - **Remove Link (Unlink)**: Converts the hyperlink back into clean plain text while preserving the wording.
- **Google Docs Autolink on Space**:
  - Typing any valid web address (e.g. `https://example.com` or `www.smartdoc.com`) followed by `Space` automatically detects the URL and converts it into a clickable hyperlink.
- **Paste URL to Link**:
  - Highlighting any text in your document and pasting a valid URL (`Ctrl+V`) instantly converts that selected text into a hyperlink pointing to the pasted URL.
- **Sanitization & Secure Export**:
  - Previews, form filling sheets, and exported Word `.docx` documents run `finalizeLinks` to guarantee dangerous protocols (`javascript:`, `data:`) are stripped while all valid links carry `rel="noopener noreferrer"`.

## 6.10 Word Form Studio Keyboard Shortcuts
Word Form Studio supports the complete suite of Google Docs and Word productivity shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo last edit (restores exact cursor position) |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo last edit |
| `Ctrl+B` / `Cmd+B` | Toggle **Bold** |
| `Ctrl+I` / `Cmd+I` | Toggle *Italic* |
| `Ctrl+U` / `Cmd+U` | Toggle <u>Underline</u> |
| `Ctrl+Shift+X` / `Alt+Shift+5` | Toggle ~~Strikethrough~~ |
| `Ctrl+K` / `Cmd+K` | Insert or edit hyperlink |
| `Ctrl+Shift+.` / `Ctrl+Shift+,` | Increase / Decrease font size |
| `Ctrl+]` / `Ctrl+[` | Increase / Decrease paragraph indent (or list nesting) |
| `Ctrl+\` | Clear formatting (resets inline styles to document base) |
| `Ctrl+Shift+L` | Align text Left |
| `Ctrl+Shift+E` | Align text Center |
| `Ctrl+Shift+R` | Align text Right |
| `Ctrl+Shift+J` | Justify text |
| `Ctrl+Shift+7` | Toggle Numbered list |
| `Ctrl+Shift+8` | Toggle Bulleted list |
| `Ctrl+Alt+0` | Apply Normal text style |
| `Ctrl+Alt+1` – `3` | Apply Heading 1, Heading 2, Heading 3 |
| `Tab` | Insert em space; indents highlighted blocks/lists; moves to next table cell (adds row in final cell) |
| `Shift+Tab` | Decreases list/block indent; moves to previous table cell |
| `Ctrl+P` / `Cmd+P` | Authentic WYSIWYG Print document |

## 6.11 Authentic WYSIWYG Document Printing (Zero Image Loss)
SmartDoc features an authentic on-screen WYSIWYG document printing engine:
- Clicking **Print** (`Ctrl+P` / `Cmd+P` or the printer icon in the top header) renders the live on-screen canvas sheet directly to the browser print engine with zero lossy intermediate conversions.
- **Zero Image Loss & 100% Fidelity**: All embedded images, diagrams, logos, and signatures print at full resolution, exact widths (25%, 50%, 75%, 100%), and alignments (Left, Center, Right).
- **Print Isolation**: Editor controls, ribbon toolbars, side panels, comments, and field remove buttons are cleanly excluded during print, generating a pristine white A4/Letter document sheet with professional headers and footers.

## 6.12 AI Form & Document Studio (Offline, Free & Instant)
Word Form Studio includes a built-in **Dual Offline AI Form & Document Studio** (`AiFormGeneratorModal.jsx`, `server/aiFormEngine.js`) combining the **Instant Built-in NLP Synthesizer (`<15ms`)** with **Local Ollama LLM (`http://127.0.0.1:11434`)** support — 100% offline and free with zero API keys:
- **Opening the AI Studio**:
  - Click the highlighted **`✨ AI Form Studio`** button in the Forms & Templates Explorer header, click **`✨ AI Prompt`** in the top header bar of Word Form Studio, or click **`AI Prompt`** in the **Home** ribbon tab.
- **Dedicated Engine & Ollama Inspector Bar**:
  - Switch seamlessly between **Instant Built-in NLP (<15ms)** and **Local Ollama LLM · BETA** in the fixed-height top bar with zero layout shift.
  - Click **`>_ Ollama Logs & Req/Res`** to open the built-in developer inspector console featuring 3 tabs (**Console Logs**, **Request Payload** with Copy JSON, and **Response & Output** with Copy JSON) and a **`▶ Test & Inspect`** button to test prompts and inspect live LLM payloads without closing the modal.
- **Writing or Enhancing a Prompt**:
  - Describe any corporate form, contract, checklist, or policy memo in plain English.
  - **Custom Field Parsing**: List specific fields in your prompt (e.g. *"with blood group dropdown (A+, B+, O+, AB+), age, weight, last donation date, and donor consent checkbox"*) — the engine automatically extracts each field, infers its input type (`text`, `textarea`, `date`, `number`, `dropdown`, `checkbox`), populates custom dropdown options from parentheses, and builds a clean 2-column & full-width layout.
  - **`✨ Suggest / Enhance Prompt` Button**: Type a brief 2–3 word topic (like *"leave form"* or *"laptop request"*) and click **Enhance Prompt** to expand it into a comprehensive specification before generating.
- **17 Categorized One-Click Enterprise Blueprints**:
  - Browse and filter blueprints across **All Blueprints**, **HR & People**, **IT & Security**, **Finance**, **Legal & Policy**, and **Operations**.
- **Customization Controls**:
  - **Document Style**: Choose between **Form**, **Contract** (flowing prose with in-text placeholders), **Checklist** (audit evaluation matrix), or **Memo** (executive policy directive).
  - **Detail & Clauses**: Choose **Compact**, **Standard**, or **Detailed** (adds an executive governance notice and an Official Review & Verification table).
  - **Owning Department**: Select the target department to automatically configure the approval chain and department signature slots.
- **Undo Support**: Applying an AI-generated form pushes a snapshot to the Studio history stack and shows a toast with a one-click **`[ Undo ]`** button.

---

# 7. Pre-Publication Reviews

Admins can invite colleagues from any department to review and suggest changes to a form template before or alongside production use.

## 7.1 Sending a Form for Review
1. In **Forms & Documents Explorer**, click the **Send for review** icon (`Send`) on any editable template card or row (or click **Send for review** in the **Reviews** section and select a template).
2. In the modal, pick reviewers from **any department** (use search or select entire departments).
3. Optionally add instructions or notes for the reviewers.
4. Click **Send for review**. The review enters `IN_REVIEW` status.

## 7.2 For Reviewers: Reviewing & Modifying
1. When assigned, a badge appears on the **Reviews** sidebar item.
2. Open **Reviews → Assigned to me** and click **Review & edit form**.
3. The form opens in Word Form Studio in **Review Mode** with an amber instruction banner.
4. Review and modify the document text, tables, or form elements directly on the canvas.
5. Click **Submit review** in the header. Enter any feedback/comments and confirm submission.

## 7.3 For Initiators: Reconciling Changes (Accept / Reject)
1. In **Reviews → Started by me**, view real-time status chips showing reviewer progress (e.g. `2 / 2 submitted`).
2. When reviewers have submitted, click **Review changes**.
3. In the reconciliation dashboard:
   - Browse changes per reviewer or across all reviewers.
   - View word-level diffs with green additions (`<ins>`) and red deletions (`<del>`).
   - Click **Accept** or **Reject** on each individual modified paragraph or element.
   - Use bulk shortcuts: **Accept all from this reviewer** or **Reject all**.
   - If multiple reviewers modified the same paragraph, the system flags the conflict and locks conflicting edits once one is accepted.
   - Inspect the **Resulting Document** preview tab to verify the merged document in real time.
4. Click **Accept & Open in Studio**. Word Form Studio opens with the accepted changes applied and a green "Review finished" banner.
5. You can make final touches and click **Publish & Save** into the department folder. If the review was initiated from an existing template, saving prompts for a Git commit message and updates that existing template in-place (incrementing its version, e.g. `v1.0` → `v1.1`), ensuring you never get duplicate templates in your folder drive.

---

# 8. Filling & Submitting a Form

1. Open **Forms & Documents** and navigate to the template.
2. Click **Fill form** on the template card. The document canvas opens displaying the authentic A4 Word document sheet on the left/center and the dedicated **Document Form Fields** rail on the right side.
3. **Dedicated Right-Side Interactive Form Rail**:
   - The right side features a docked, scrollable form panel containing clean cards for every document placeholder and form field.
   - Shows the live completion ratio (e.g. `2 / 2 Filled`) and a warning badge for any remaining mandatory fields.
   - Each card displays the field index number, title, required badge (`* Required` vs `Optional`), and field type chip (`TEXT`, `DATE`, `NUMBER`, `DROPDOWN`, etc.).
   - **Field Descriptions & Filling Guidance**: Any instructions entered by the template author are displayed directly on the card with an `ℹ Instructions` guidance banner, in the single-field dialog, and as canvas hover tooltips.
   - Type-specific inputs:
     - **Date**: Standard HTML5 date picker plus one-click shortcut buttons (**Today**, **+1 Wk**, **+30 D**).
     - **Number**: Numeric input with validation.
     - **Dropdown**: Clean selector with template options.
     - **Textarea**: Expandable multiline input.
     - **Checkbox**: Clear confirmed/unconfirmed toggle.
     - **Text**: Standard inline text input.
   - Includes a quick **Sign & Submit Form** button at the base of the rail.
4. **Zero-Highlight Natural Text, Line-Height Synchronization & Template Weight**:
   - **Identical to Normal Text**: In-text placeholders have zero colored background boxes and zero borders (`border: none; background: transparent;`), inheriting the document's font, color, and size so filled text looks 100% like authentic typed prose.
   - **Strict Line-Height Alignment**: Placeholders sit directly on the text baseline with inherited line height (`line-height: inherit !important`), ensuring zero vertical displacement, line expansion, or paragraph shifts.
   - **Template Weight Rendering**: Placeholders automatically render in bold (`font-weight: 700`) if the template author marked them as bold, or standard text weight if normal, ensuring exact adherence to official department template guidelines without distracting fill-time formatting controls.
5. **Dynamic Visual Leader Connector Line & Bidirectional Interaction**:
   - **Real-Time Visual Connector Line**: When an input field is active on the right rail, an animated curved SVG leader line extends across the workspace directly to that placeholder in the document, ending in a crisp downward pointer arrow above the word so you instantly see what you are filling.
   - **Toggle On/Off Anytime**: Click the **Line ON / Line OFF** toggle switch in the "Document Form Fields" header to show or hide the visual guide line at any time. Your preference is automatically remembered on your device.
   - **Smooth Auto-Tracking**: When enabled, the line dynamically repositions as you scroll the document canvas or right rail, type text, or resize the window.
   - **Two-Way Interaction**: Typing in any right rail field updates the document canvas immediately. Clicking any placeholder in the document automatically scrolls to and focuses its card in the right rail. Double-clicking opens the focused single-field dialog.
6. **Mandatory Field Enforcement & Missing Fields Prompt**:
   - All mandatory fields and placeholders are marked with a red asterisk (`*`).
   - If you attempt to submit while mandatory fields are missing, the system intercepts submission and displays the **Mandatory Fields Incomplete** prompt modal.
   - The modal lists each missing required field with a **Fill Now →** button that automatically focuses that field.
   - **Backdrop Outside-Click Protection**: Dialogs (such as the single-field editor and missing fields prompt) cannot be accidentally dismissed by clicking the backdrop.
7. Choose a **decision date** (it must be in the future).
8. **Submit**. If you haven't saved a signature yet, you'll be prompted to draw one first (**My Signature** pad).

Upon submission:
- A form ID `FRM-YYYY-XXXX` is assigned.
- **Cryptographic PKI Sealing**: A deterministic SHA-256 content digest of all your answers is calculated and cryptographically signed using your private RSA-2048 key. The resulting verifiable envelope is permanently bound to the submission.
- The approval chain starts at Step 1.

## 8.1 After an objection
If an approver raises an objection:
1. Open **Approvals → My Submissions** and click the submission.
2. The actual filled form sheet opens with the reviewer's objection banner and notes at the top.
3. Click **Unlock & Modify Form** in the banner (or top header) to unlock the form fields directly on the sheet.
4. Edit your answers, enter a brief change summary, and click **Sign & Resubmit**.
5. The version increases (1.0 → 1.1) and approval **restarts from step 1**.

## 8.2 In-Form Comments & Submission Timeline
- **Reviewer Decision & Notes Rail**: Reviewers can add categorized comments (`General Note`, `Change Request`, `Objection`, `Suggestion`) directly in the right-side rail while inspecting the locked form sheet, and submitters can view all reviewer notes and comments on the form.
- **Git Version History**: Click the **Version History** button in the top header bar of the submission viewer to inspect every iteration, commit hash, author, and timestamp across objections and resubmissions.

## 8.3 Exact 1:1 Visual Fidelity "Print As-Is" & PDF Download
When filling out or reviewing forms in `FillFormModal.jsx`:
- **Print Form (`window.print()`, `Ctrl+P`)**: Click **Print Form** in the header toolbar to trigger the native browser print engine formatted specifically for physical A4 paper sheets.
- **Download PDF (`#btn-download-live-form-pdf`)**: Click the dedicated **Download PDF** button directly adjacent to **Print Form** in the header ribbon for instant, client-side 3.5× ultra-HD (~336 DPI) PDF generation via `exportFormSheetToPdf`.
- **Exact 1:1 Visual Fidelity**:
  - Both outputs produce an exact replica of the on-screen form sheet (`.sd-form-filler-sheet`).
  - Form input elements retain their authentic boxes, labels (`First Name *`, `Last Name *`, `DOB *`), light gray borders (`#cbd5e1`), and typed user entries. Form fields are never flattened into plain text runs or floating captions.
  - Submitter and workflow signatures render as clean, authentic document signature blocks displaying strictly only the signature, signer name, and department (no card boxes, dashed borders, step badges, or cryptographic text on paper).
  - In-text placeholders seamlessly integrate into body prose with zero baseline or line-height displacement.
- **Automated Input Highlight Suppression**:
  - Active input field focus outlines and neon glow rings (`.is-active-target`) from the right rail are automatically and cleanly suppressed during print and PDF export across both CSS (`@media print`, `body:not(.sd-printing-live-form)`) and DOM cloning.
  - All input boxes render with clean, uniform, professional `#cbd5e1` borders without editing rings.
- **Input Field Placeholders Removed**:
  - All input field placeholder text (e.g. `Enter First Name…`, `YYYY-MM-DD`) is automatically stripped during print and PDF download, leaving clean, empty input boxes for unentered fields.
- **Empty In-Text Placeholders Replaced with Dash**:
  - Any unfilled in-text legal or contract placeholders in document prose (e.g. `{{Contract Amount}}`) are automatically replaced with a clean typographic dash (`—`), preventing raw tags or curly braces from appearing in printed or downloaded documents.
- **Print Blank Form**: The **Print Blank** button produces a clean physical paper copy with clean handwriting fill-in lines and blank signature spaces for offline use.
- **Template Card Print Button**: Clicking the **Print** button on any template card in the Forms Hub opens the live form sheet directly and triggers the exact same native print engine as the "Print Form" option inside Fill Form.
- **Form-Only Isolation**: All outer user interface chrome — including sidebars, explorer navigation, page headers, the interactive form filler rail, the visual leader connector SVG, and sequential workflow approval widgets — is strictly suppressed in print.
- **Preserved Margins & Single-Page Fit**: Configured with standard **24mm (~0.95 in)** left and right margins and **18mm** top and bottom margins, ensuring filled forms print cleanly on exactly 1 physical page without spilling onto empty blank sheets.

---

# 9. Approvals & Objection Workflows

The **Approvals** page has three tabs:
- **My Queue**: submissions waiting at your department's step.
- **My Submissions**: forms you submitted.
- **Department**: all forms involving your department.

### On-Form Locked Submission Viewer (`SubmissionDetailModal.jsx` + `FillFormModal.jsx`)
Clicking any submission opens the **actual filled A4 Form Sheet** (with the submitter's entered values, dropdowns, checkboxes, and stamped signatures locked in place) instead of a separate text summary popup:
- **For Reviewers (Department Admin of the active step, or Super Admin)**:
  - **Left / Center Workspace**: The exact A4 form sheet filled by the submitter with all form controls locked (`disabled` / `readOnly`) so answers cannot be altered by reviewers.
  - **Right-Side Reviewer Decision & Notes Rail**:
    - **Make Your Decision**: Enter optional approval notes or a mandatory objection/rejection reason and click **Approve & Sign**, **Raise Objection**, or **Reject**.
    - **Comments, Change Requests & Notes**: Post categorized feedback (`General Note`, `Change Request`, `Objection`, `Suggestion`) directly onto the form, optionally check *"Also trigger official workflow objection"* to pause approval and return the form to the submitter in one click, or resolve existing comments (`✓ Accept` / `✕ Reject`).
    - **PKI Cryptographic Integrity Seal**: Verify RSA-2048 X.509 digital signatures in real time.
    - **Workflow History**: Inspect the chronological audit trail of all steps.
- **For Submitters (Filer Only)**:
  - While the form is `IN_REVIEW` with no objections (or after it is `APPROVED` / `REJECTED`), the submitter views the form in a clean **Read-Only** mode (no edit controls and no reviewer action rail).
  - If a reviewer raises an objection (`OBJECTION_RAISED`) or posts a Change Request/Objection comment, the reviewer's feedback is displayed and the submitter can click **Unlock & Modify Form** to edit the fields directly on the sheet and resubmit.
- **When a User is BOTH the Filer AND the Reviewer (Dual Role)**:
  - If a Department Admin submits a form routed to their own department (or when a Super Admin submits and reviews a form), SmartDoc detects that you hold **both** roles (`isOriginator && canAct`).
  - The form automatically opens in **Reviewer Mode** (even when clicked from **My Submissions**) so you immediately have the **Reviewer Decision & Notes Rail** on the right alongside the locked form sheet.
  - A **Dual Role: Filer & Reviewer** badge and a 1-click toggle button (**View as Submitter (Read-Only)** ↔ **Switch to Reviewer Mode**) appear in both the top banner and header bar so you can switch between the Reviewer workspace and the pure Read-Only Submitter view at any time.
- **Header Export & History Actions**:
  - **Download PDF** (`#btn-download-live-form-pdf`): Exports the filled form sheet directly to a 3.5× ultra-HD PDF.
  - **Download .docx** (`#btn-download-submission-docx`): Downloads the filled submission with stamped signatures and PKI seals as a Microsoft Word `.docx` document.
  - **Print Form**: Launches the native print engine for the filled form sheet.
  - **Version History**: Opens the Git-like commit timeline for the submission.

## 9.1 Actions (department admin of the current step, or super admin)
| Action | Notes required | Result |
|---|---|---|
| **Approve** | No | Your saved signature is stamped; moves to the next step, or completes the chain |
| **Raise Objection** | Yes | Status `OBJECTION_RAISED`; the submitter edits and resubmits |
| **Reject** | Yes | Final. Status `REJECTED` |

Actions are blocked once the decision date has passed (`EXPIRED`).

## 9.2 PKI Cryptographic Verification & Tamper Detection
Every submission and workflow action is cryptographically sealed with Public Key Infrastructure (PKI):
1. Open any submission in **Approvals** or **Dashboard**.
2. Locate the **PKI Cryptographic Integrity Seal** panel.
3. Click **Verify Digital Signatures**:
   - The system re-hashes the current form answers in the database and verifies the submitter’s RSA-SHA256 signature against their public X.509 certificate.
   - It also cryptographically validates the digital signature of each department approver in the sequential workflow.
4. **Status Badges**:
   - `✓ RSA-SHA256 Valid`: All digital seals match the document content and authentic user certificates.
   - `✕ Data Tampered`: The data has been modified or corrupted since signing.
5. In exported or printed Word documents (`.docx`), a cryptographic certification line (`[PKI Certified: <fingerprint> · Cert #<serial>]`) is printed beneath each signature and in the appended approval block.

---

# 10. Team Messaging

A simple chat for each department. You see your own department's messages (super admin sees all). Type a message and press send.

---

# 11. Activity Log & Audit Trail

SmartDoc maintains a role-scoped, database-paginated activity ledger in PostgreSQL with cryptographic SHA-256 integrity verification.

## 11.1 Role-Based Access Scoping
The ledger strictly enforces role-based access control at the database query level:
1. **Super Administrator**: Full visibility across all enterprise departments and all user accounts. Can filter logs by specific department, action category, user, or date range.
2. **Department Heads (Dept Admin)**: Strictly scoped to view their own department's activity and actions performed by members of their department. Cannot see other departments' private actions.
3. **Standard Users**: Strictly scoped to view only their own personal activity history (their form submissions, signatures, approvals, and sign-ins). Cannot see other users' activities.

## 11.2 Database Pagination & High-Volume Scale
Because activity records grow continuously over time, the system uses server-side database pagination:
- **Fast Execution**: PostgreSQL executes `COUNT(*)` and uses indexed `LIMIT` / `OFFSET` queries for instantaneous results regardless of total dataset size.
- **Paging Controls**: Select between 25, 50, or 100 records per page. Use First (`«`), Previous (`<`), numbered pages, Next (`>`), and Last (`»`) to navigate.
- **Decoupled Layout**: Clean pagination footer separated from data tables for optimal legibility.

## 11.3 Search, Category Filters & CSV Export
- **Live Debounced Search**: Fast server search by keyword, document code, actor username, action type, or SHA-256 hash.
- **Category Filter Pills**: Quickly filter by action category: Submissions, Approvals & Objections, Templates & Folders, Pre-Publication Reviews, Identity & Access, Comments.
- **Full CSV Export**: The **Export CSV** button queries the complete matching database recordset (up to 5,000 records) without restricting to the currently viewed page.

## 11.4 Standalone Monitoring Window (`/activity?popup=true`)
Click **Separate Window** (`ExternalLink`) to pop the Activity Console out into its own dedicated floating window without the application sidebar chrome, ideal for multi-monitor setups or persistent compliance monitoring.

## 11.5 Cryptographic SHA-256 Fingerprint Verification
Every event is stamped with a cryptographic SHA-256 hash generated from its immutable payload. Click any hash pill to copy the fingerprint for tamper verification and audit compliance.

---

# 12. Users, Departments & System Reset (Super Admin)

## Users
- **Add user**: full name, username, password (at least 6 characters), role (`user` / `admin`), department.
- **Edit**, **activate / deactivate**, or **delete** users.

## Departments
- **Add** a department by entering its Name, Code (e.g. `HR`, `FIN`, `IT`), and Description.
- **Edit** a department by clicking the **Edit (pencil)** icon on any department card:
  - Update the department's **Name**, **Code**, or **Description**.
  - Renaming a department **automatically cascades** across the entire system in a single transaction — updating all assigned users, Explorer folders, form templates, allowed department permission lists, approval workflow steps, signature slots, active/historical submissions, pre-publication reviews, team messages, and audit logs.
- **Delete** is blocked while users are still assigned to the department.

## System Reset & Data Purge (Super Admin)
Accessible via the **System Reset** tab in Settings:
- **Option 1: Wipe Out Every Data (Factory Reset)**: Completely purges all form templates, folder structures, submissions, approvals, reviews, departmental chat messages, and non-superadmin accounts. Resets the standard enterprise departments while preserving the Super Administrator login.
- **Option 2: Wipe Only Forms**: Purges all form templates, folders, submissions, reviews, and form-related notifications, while strictly preserving all user accounts, roles, signatures, departments, and departmental chat messages.
- **Confirmation Safety**: Requires typing the exact uppercase confirmation phrase (`WIPE ALL DATA` or `WIPE FORMS`) before the action can be executed.
- **Interactive Clean-Slate Completion Modal (`#modal-wipe-success`)**:
  - Rather than closing abruptly with only a corner notification, executing a reset immediately opens an interactive, executive verification modal.
  - **Pulsing Emerald Verification Halo**: Visual badge confirming successful system purge.
  - **Live 0-State Metrics Grid**: Interactive metric cards verifying clean counts (`Templates: 0`, `Submissions: 0`, `Reviews: 0`).
  - **Verified Operations Breakdown**: Clear distinction between elements wiped (templates, folders, submissions, reviews) and elements preserved (departments, user accounts, digital certificates).
  - **Direct Executive Navigation**: Single-click actions to jump straight into action:
    - **Go to Smart Cockpit** (`/dashboard`): Inspect live real-time dashboard analytics.
    - **Open Forms Drive** (`/forms`): Immediately begin designing new templates or creating folder hierarchies in Windows Explorer.
    - **Close**: Dismiss modal and remain on Settings.
- **Actionable Toast Notification**: Accompanied by a persistent toast banner equipped with a pause-on-hover timer and a one-click `[ Go to Forms Hub ]` action button.

All important actions are recorded server-side in the audit log.

---

# 13. Statuses & Business Rules

### Form Submissions
| Status | Meaning |
|---|---|
| `IN_REVIEW` | Waiting on the current approval step |
| `APPROVED` | All steps approved |
| `OBJECTION_RAISED` | Sent back to the submitter for changes |
| `REJECTED` | Final rejection |
| `EXPIRED` | Decision date passed without a decision |

### Pre-Publication Reviews
| Status | Meaning |
|---|---|
| `PENDING_REVIEW` | Draft sent out; waiting for reviewer modifications |
| `READY_FOR_DECISION` | All assigned reviewers have submitted their versions |
| `DECIDED` | Author accepted/rejected changes and merged into Word Form Studio |
| `PUBLISHED` | Template saved into department folder drive |
| `CANCELLED` | Review aborted by initiator |

Template conventions (also usable in an uploaded `.docx`):
- `{{Field Name}}`: a fillable field.
- `{{Signature: Submitter}}` and `{{Signature: <Department Name>}}`: signature slots.
- `{{Form ID}}`, `{{Submitted By}}`, `{{Submitted Date}}`, `{{Version}}`, `{{Department}}`: system tags.
- If a template has no signature tags, a **Signatures** block is appended at the end.

---

# 14. FAQ & Troubleshooting

**I can't see the "+ New Folder" or "Word Form Studio" buttons.**
Only department admins (for their own department) and the super admin can manage folders and templates.

**I can't submit a form.**
Check that you've saved a signature, all mandatory fields are filled, and the decision date is in the future.

**Why is the studio blank?**
It is intentionally a blank page. Click **Open Word (.doc / .docx)** to load an existing `.doc` or `.docx` document, or just start typing.

**An approval button is missing.**
You can only act on the step belonging to your department, and only while the submission is `IN_REVIEW` and not expired.

**I can't delete a department.**
Reassign or delete its users first.

**Can't log in as admin.**
Use the username and password from your `.env` (`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`).

**What is the difference between my graphical signature and my PKI Digital Signature?**
A graphical signature is the drawn or uploaded image stamped onto the Word document page. The PKI Digital Signature is an underlying mathematical seal generated using an asymmetric RSA-2048 private key and an X.509 v3 certificate. It cryptographically binds your identity to the exact form answers, guaranteeing non-repudiation and detecting any unauthorized data alterations.

**What does "Data Tampered" mean in the verification panel?**
If a signature displays "Data Tampered", it means the form values stored in the database no longer match the cryptographic SHA-256 hash that was signed when the form was submitted. This provides proof that the record was altered after signing.

**Where can I find or download my X.509 certificate?**
Click your profile/avatar in the sidebar footer → **Profile & Signature** → **PKI Certificate** tab. You can inspect all attributes, copy your SHA-256 fingerprint, or click **Download .crt** to save the certificate file.

**Why don't dialogs or modals close when I click outside them?**
All dialogs and modals in SmartDoc have backdrop outside-click protection enabled. This protects you from accidentally losing unsaved form fields, document edits, commit notes, or folder names if you click outside the modal window. To close any dialog intentionally, click the explicit **Cancel** or **Close (×)** buttons, or press the **Escape** key.

**What does the version number in the footer do?**
The footer displays the live application version (e.g. `v1.4.0`) with a status indicator. When a new version is deployed to production, SmartDoc automatically detects the update, purges stale browser caches, and performs a hard reload. You can also click the version pill at any time to trigger an immediate cache-clearing hard reload (`Ctrl + F5` equivalent).

---

# 15. Deployment (Single-Service Unified App)

You do **not** need to deploy the frontend and backend as two separate services. SmartDoc is pre-configured to build into a single, unified service:

1. **Build the frontend**:
   ```bash
   npm run build
   ```
   This compiles the React application into the `dist/` directory.

2. **Start the single unified server**:
   ```bash
   npm start
   ```
   (or `npm run build:start` to build and run in one step).

3. **How it operates**:
   - The Express server (`server/server.js`) listens on a single port (e.g. `PORT=3001` or standard HTTP/HTTPS `80`/`443`).
   - Serves the REST API under `/api/*`.
   - Directly hosts all static web assets from `dist/`.
   - Handles SPA fallback for direct navigation (`/dashboard`, `/forms`, `/approvals`, etc.).
   - Eliminates CORS configurations and separate domain requirements.

---

# 16. Disk / Object Storage & Backup Management

SmartDoc stores binary files (Word templates, documents, attachments) directly on disk rather than in PostgreSQL table cells:

- **Storage Location**: `storage/` directory in the application root:
  - `storage/templates/`: Template files keyed by ID (e.g. `TMPL-1793011299603.docx`).
  - `storage/submissions/`: Submission documents and rendered outputs.
  - `storage/temp/`: Working scratchpad for streaming operations.
- **Backups**:
  - To back up your SmartDoc deployment, back up two elements:
    1. The PostgreSQL database (e.g., `pg_dump smartdoc > backup.sql`).
    2. The physical `storage/` folder.
- **Zero-Downtime Migration**:
  - When upgrading from legacy database storage, SmartDoc automatically migrates all template binaries from PostgreSQL to `storage/templates/` on boot, hashes each file with SHA-256, and clears `docx_base64` from PostgreSQL to free database memory.



