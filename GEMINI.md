# SmartDoc Workspace Guidelines

> **CRITICAL RULE FOR ALL ASSISTANTS**:
> SmartDoc is an **Enterprise Word-Template Forms & Approval Workflow** system with a **Windows Explorer file/folder hierarchy** and integrated **Word Form Studio** (`SmartWordStudio.jsx`).
> Admins manage department drives and folders, create/edit Word templates with rich text ribbon & interactive form elements (text, textarea, date, number, dropdown, checkbox, signatures, system tags), mark fields mandatory, and define an ordered department approval chain.
> Users explore folders, fill forms, sign once with their saved signature, and submit; department admins approve / raise objection / reject.
>
> **Refer to [CONTEXT.md](file:///c:/Code/SmartDoc/CONTEXT.md) for the full architecture, API, state and rules.**

---

## 1. Route & Component Mapping (`SmartSidebar.jsx` → `App.jsx`)

1. `dashboard` → `<SmartDashboard />` ("Smart Cockpit": `100vh` zero-scroll 2×3 Bento Grid, interactive scope switcher, time window filters, 6 smart metric cards, interactive SVG velocity trend & horizontal status donut charts, department workload bars, template leaderboard, priority radar, live searchable feed + `<DashboardCharts />`)
2. `forms` → `<FormsHub />` ("Forms & Templates": Windows Explorer + `<SmartWordStudio />`, `<AiFormGeneratorModal />`, `<TemplateUploadModal />`, `<BulkImportModal />`, `<FillFormModal />`, `<TemplatePermissionsModal />`, `<VersionHistoryModal />`)
3. `reviews` → `<ReviewsHub />` (+ `<ReviewChangesModal />`, `<SendForReviewModal />`)
4. `approvals` → `<FormApprovals />` ("Submissions & Approvals" + `<SubmissionDetailModal />` mounting the actual filled `<FillFormModal />` sheet with locked fields, Reviewer Decision & Notes Rail, Submitter Read-Only mode, and Dual Filer/Reviewer role toggle)
5. `dept-messaging` → `<DepartmentMessaging />`
6. `activity` → `<ActivityHub />` ("Activity Log": role-scoped audit trail, database pagination, search & filters)
7. `settings` → `<SmartSettingsAdmin />` (superadmin only: users, departments [add/edit/delete], and System Reset)

Sidebar utilities: `<NotificationBell />` in brand header; Light/Dark Mode toggle, 5-Accent Color Swatches, and Collapsible Sidebar (`Ctrl+B` / `Cmd+B`) in sidebar footer.
Global modals: `ProfileAndSignatureModal` (unified Digital Signature, PKI X.509 Certificate, Profile Photo + App Theme), `DocumentPreviewModal`, `ToastContainer`, `TemplatePermissionsModal`, `VersionHistoryModal`.
Global layout: All pages (except the full-screen `Word Form Studio` overlay) enforce a `100vh` zero-scroll viewport with `<AppFooter />` permanently pinned at the bottom.

---

## 2. Global State (`src/context/AppContext.jsx`)

All cross-module state and mutations live in `AppContext.jsx` — do not duplicate them locally:
- Data: `users`, `departments`, `folders`, `formTemplates`, `formSubmissions`, `departmentMessages`, `myApprovalQueue`, `mySubmissions`, `templateReviews`, `reviewsNeedingMe`, `notifications`, `unreadNotificationsCount`, `activityLogs`, `activityLogsMeta`, `theme`, `accentColor`.
- Actions: `canManageDepartment(dept)`, `createFolder`, `updateFolder`, `deleteFolder`, `createTemplate`, `bulkImportTemplates`, `updateTemplate`, `updateTemplatePermissions`, `addTemplateComment`, `updateTemplateComment`, `moveTemplate`, `archiveTemplate`, `submitForm`, `resubmitForm`, `workflowAction(id, action, notes)`, `addSubmissionComment`, `updateSubmissionComment`, `sendTemplateForReview`, `submitReviewChanges`, `saveReviewDecisions`, `finalizeReview`, `cancelReview`, `saveSignature`, `saveAvatar`, `getPkiCertificate`, `generatePkiCertificate`, `verifySubmissionSignatures`, `openProfileModal`, `closeProfileModal`, `markNotificationRead`, `markAllNotificationsRead`, `wipeAllData`, `wipeFormsOnly`, `setTheme`, `toggleTheme`, `setAccentColor`, `createDepartment`, `updateDepartment`, `deleteDepartment`, user CRUD, messaging.
- Use `addToast(title, message, type)` for all alerts. Audit logging is done server-side.

---

## 3. Strict Development Rules

1. **Brand**: The app name is strictly **SmartDoc**.
2. **Scope**: Keep it simple. Do not re-add removed modules (custom form designer, SurveyJS, Vault, Reviewer, E-Sign vault, AI Suite, Tasks, Reports, AD matrix) unless the user explicitly asks.
3. **No mock data**: Never seed or display fake users, counts, or records. Only the super admin from `.env` is seeded.
4. **Auth**: Username + password (not email).
5. **Styling & Layout**: Vanilla CSS only (`src/App.css`, `src/index.css`) supporting both **Pure Black Dark Mode** (`#000000`) and **High-Contrast Light Mode** (`#f8fafc` / `#ffffff`) with 5 selectable accent themes (`green` / Electric Lime `#a4fb4f`, `red`, `orange`, `purple`, `blue`), and a `100vh` zero-scroll page viewport with pinned `<AppFooter />`. No TailwindCSS.
6. **Build Verification**: Run `npm run build` after edits; must have 0 errors.
7. **Context Maintenance**: Update [CONTEXT.md](file:///c:/Code/SmartDoc/CONTEXT.md) in the same change whenever components, state, routes, API, or rules change.
8. **No Git Commands**: Never check, get status, or run any `git` commands unless explicitly requested by the user.
9. **Strict Manual-Mode Parity (Upload & AI Generation)**: Neither Word Upload (`server/docxEngine.js`, `TemplateUploadModal.jsx`, `loadDocxFile`) nor AI Form Generation (`server/aiFormEngine.js`, `AiFormGeneratorModal.jsx`) may introduce HTML tags, inline styles (e.g., `margin`/`padding`), or field configurations that cannot be created manually inside `SmartWordStudio.jsx`. Use `<p><br/></p>` for vertical line spacing, lock `mode: 'placeholder'` fields to `type: 'text'`, default field widths to `null` (`Auto`), and place each signature block on its own `<p>` line at `100%` width.
