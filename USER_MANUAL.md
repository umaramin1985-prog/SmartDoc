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

---

# 1. Signing In

- Sign in with your **username and password** (not email).
- The first account is the **super admin**, created automatically from the `.env` file (`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`).
- Use **Collapse sidebar** (or `Ctrl+B` / `Cmd+B`) at the bottom of the sidebar to toggle between full width (248px) and compact rail mode (72px).
- SmartDoc operates in **Pure Black Dark Mode** (`#000000`) with high-contrast **Electric Lime** (`#a4fb4f`) accents.

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

### Collapsible Sidebar
- **Toggle Button**: Click the collapse button in the sidebar header (`PanelLeftClose` / `PanelLeftOpen`) or at the bottom of the sidebar (`Collapse sidebar` with chevrons) to collapse the sidebar into a slim 72px icon rail.
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
  - Submissions from reviewers on reviews you initiated.
- Clicking any notification automatically marks it as read and navigates directly to the referenced document. Use **Mark all as read** to clear the badge.

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

---

# 4. Dashboard

Shows **real counts only**, with no demo data:
- My pending approvals.
- My submissions.
- Available templates.

Empty counts simply show zero until you start using the system.

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
- **Archive**: removes a template from active use (soft delete).

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

---

# 6. Word Form Studio

A Microsoft Word-style editor on an authentic A4 sheet canvas. **It opens blank by default.** Type, format, and drop in form elements directly inside the document.

## 6.1 Ribbon tabs

| Tab | What it does |
|---|---|
| **Home** | Undo / Redo (with `Ctrl+Z` / `Ctrl+Y`), Font family & size, bold, italic, underline, strikethrough, Text Color & Highlight Color (split palettes with 24 theme colors & custom hex), alignment, bullet / numbered lists, headings (Normal, H1–H3) |
| **Insert Elements** | Form fields, signatures, system tags, tables (10×8 grid picker), dividers |
| **Table Tools** | Contextual tab when inside a table: insert/delete rows/cols, merge/split cells, cell shading, borders, alignment |
| **Page Layout** | Margins (Normal / Narrow / Wide), page size (A4 / Letter), orientation |
| **Workflow & Approvals** | Department, destination folder, audience, decision deadline (days), approval steps |

## 6.2 Form elements, In-Text Placeholders & field widths
Place the cursor where you want the element, then click it in **Insert Elements**:
- **Field types**: Short Text, Long Text, Date, Number, Dropdown, Checkbox.
- **In-Text Placeholders (Legal & Contracts)**: Placeholders designed for flowing contracts, agreements, NDAs, and legal instruments where values like party names, execution dates, payment sums, and governing jurisdictions sit directly within paragraph prose. Quick-insert tools available:
  - **Party / Name** (`placeholder`, text)
  - **Agreement Date** (`placeholder`, date)
  - **Contract Amount** (`placeholder`, number)
  - **Governing Law** (`placeholder`, dropdown)
- **Draft Staging & Clean Cancellation**:
  - Clicking any placeholder insertion tool stages the element directly in your document canvas and immediately opens the **Customize Form Field** modal.
  - If you click **Cancel**, **×**, or press **Escape**, the staged draft element is cleanly removed from the document canvas without leaving orphan tags or text fragments behind.
- **Field Customization Options**: Click any inserted field pill inside the document canvas to adjust:
  - **Field Format**: Switch between `🏷️ In-Text Placeholder (Dialog)` (opens a single-field dialog on click) and `📝 Direct Input Box` (renders an on-page input control).
  - **Text Weight (for In-Text Placeholders)**: Switch between **Normal Text** (standard document body weight) and **Bold (700)** (heavier typographic emphasis for filled values like names, sums, or key contractual dates).
  - **Field Description & Guidance**: Add multi-line instructions and contextual guidance shown to users when filling this field in the right rail cards, single-field dialog, and tooltips.
  - Label (name) & placeholder prompt hint.
  - **Required (Mandatory)** toggle: Enforces that the placeholder must be filled before submission.
  - **Field Width** (for direct inputs: Auto, 25%, 33%, 50%, 66%, 75%, 100% of row).
  - Dropdown options list.
  - Quick remove (×) button.
- **Backdrop Outside-Click Protection**: All field customizers, dialogs, and popovers feature outside-click protection so accidental clicks on the dark background never dismiss your work unexpectedly.
- **Coexistence**: Direct input controls and in-text placeholders can freely coexist on the exact same document sheet.

## 6.3 Signatures & system tags
- **Submitter signature**: stamped with the submitter's saved signature.
- **Department signature**: one slot per approving department. Slots are kept in sync with the approval steps.
- **System tags** are auto-filled on the final document: Form ID, Submitted By, Submitted Date, Department, Version.

## 6.4 Live Preview
Use the header view toggle (**Edit / Side by side / Preview**) to view the form exactly as end users will see it with interactive inputs and the approval chain, without having to save first.

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

## 6.8 Text Color & Highlight Color Tools
Word Form Studio includes authentic Microsoft Word text styling tools in the **Home** ribbon:
- **Text Color Tool (`Baseline` icon with color stripe)**:
  - Click the main icon to apply the active font color directly to selected text.
  - Click the dropdown arrow to open the **Text Color** popover palette.
  - Choose from 24 curated enterprise theme colors, click **Automatic / Reset** to restore document default text color, or choose any custom hex value via the native color picker.
- **Highlight Color Tool (`Highlighter` icon with color stripe)**:
  - Click the main icon to apply the active highlight color directly to selected text.
  - Click the dropdown arrow to open the **Highlight Color** popover palette.
  - Choose from authentic highlighter tints (Classic Yellow, Electric Lime, Mint, Light Cyan, Sky Blue, Neon Pink, Soft Peach, Warm Amber, Lavender, Pastel Rose, and more).
  - Click **No color / Clear** to remove text highlighting.
- **Cursor Continuation**: If no text is selected, applying a color places the cursor inside a styled insertion point so subsequent typing inherits the selected text or highlight color.

## 6.9 Authentic Microsoft Word Document Printing
Unlike ordinary web applications that print raw HTML pages via browser printing, SmartDoc features a dedicated Word Print Pipeline:
- Clicking the **Print** button in the studio toolbar renders the document through the server's Word processing engine (`POST /api/forms/render-print-document`).
- Generates genuine Word `.docx` pagination, authentic A4/Letter margins, Word-style table formatting, and embedded signatures.
- Automatically opens the native print dialog formatted identically to printing directly from Microsoft Word.

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
1. Open **Approvals → My Submissions**.
2. Open the submission and read the objection notes and in-form comments.
3. Edit your answers and **Resubmit**.
4. The version increases (1.0 → 1.1) and approval **restarts from step 1**.

## 8.2 In-Form Comments & Submission Timeline
- **Comments Rail**: Both submitters and approvers can view or add contextual comments directly within `SubmissionDetailModal.jsx`.
- **Git Version History**: Click the commit history icon in submission details to view every iteration, author, and timestamp across objections and resubmissions.

## 8.3 On-Form WYSIWYG "Print As-Is" Engine
When filling out or reviewing forms in `FillFormModal.jsx`:
- **Direct Sheet Printing**: Click the **Print** button in the header toolbar to trigger the native browser print engine formatted specifically for physical A4 paper sheets.
- **Form-Only Isolation**: All outer user interface chrome — including sidebars, explorer navigation, page headers, the interactive form filler rail, the visual leader connector SVG, and sequential workflow approval widgets — is strictly suppressed.
- **Preserved Margins & Single-Page Fit**: Configured with standard **24mm (~0.95 in)** left and right margins and **18mm** top and bottom margins, ensuring filled forms print cleanly on exactly 1 physical page without spilling onto empty blank sheets.
- **100% Visual Fidelity**: Form input boxes maintain their percentage-based widths without horizontal overlap, and submitter digital signatures retain their dashed borders, originator badges, drawn signature strokes, and cryptographic PKI integrity seals.

---

# 9. Approvals & Objection Workflows

The **Approvals** page has three tabs:
- **My Queue**: submissions waiting at your department's step.
- **My Submissions**: forms you submitted.
- **Department**: all forms involving your department.

Open a submission to see:
- Submitted values.
- The **workflow track** showing each department's step status.
- Full history.
- **Preview** and **Download** of the filled Word document with signatures.

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
- **Add** a department by name.
- **Delete** is blocked while users are still assigned to it.

## System Reset & Data Purge (Super Admin)
Accessible via the **System Reset** tab in Settings:
- **Option 1: Wipe Out Every Data (Factory Reset)**: Completely purges all form templates, folder structures, submissions, approvals, reviews, departmental chat messages, and non-superadmin accounts. Resets the standard enterprise departments while preserving the Super Administrator login.
- **Option 2: Wipe Only Forms**: Purges all form templates, folders, submissions, reviews, and form-related notifications, while strictly preserving all user accounts, roles, signatures, departments, and departmental chat messages.
- **Confirmation Safety**: Requires typing the exact uppercase confirmation phrase (`WIPE ALL DATA` or `WIPE FORMS`) before the action can be executed.

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
The footer displays the live application version (e.g. `v1.2.0`) with a status indicator. When a new version is deployed to production, SmartDoc automatically detects the update, purges stale browser caches, and performs a hard reload. You can also click the version pill at any time to trigger an immediate cache-clearing hard reload (`Ctrl + F5` equivalent).

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


