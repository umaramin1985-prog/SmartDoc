# SmartDoc Workspace Guidelines

> **CRITICAL RULE FOR ALL ASSISTANTS**:
> SmartDoc is an **Enterprise Word-Template Forms & Approval Workflow** system with a **Windows Explorer file/folder hierarchy** and integrated **Word Form Studio** (`SmartWordStudio.jsx`).
> Admins manage department drives and folders, create/edit Word templates with rich text ribbon & interactive form elements (text, textarea, date, number, dropdown, checkbox, signatures, system tags), mark fields mandatory, and define an ordered department approval chain.
> Users explore folders, fill forms, sign once with their saved signature, and submit; department admins approve / raise objection / reject.
>
> **Refer to [CONTEXT.md](file:///c:/Code/SmartDoc/CONTEXT.md) for the full architecture, API, state and rules.**

---

## 1. Route & Component Mapping (`SmartSidebar.jsx` → `App.jsx`)

1. `dashboard` → `<SmartDashboard />`
2. `forms` → `<FormsHub />` ("Forms & Templates": Windows Explorer + `<SmartWordStudio />`, `<TemplateUploadModal />`, `<BulkImportModal />`, `<FillFormModal />`, `<TemplatePermissionsModal />`, `<VersionHistoryModal />`)
3. `reviews` → `<ReviewsHub />` (+ `<ReviewChangesModal />`, `<SendForReviewModal />`)
4. `approvals` → `<FormApprovals />` ("Submissions & Approvals" + `<SubmissionDetailModal />`)
5. `dept-messaging` → `<DepartmentMessaging />`
6. `activity` → `<ActivityHub />` ("Activity Log": role-scoped audit trail, database pagination, search & filters)
7. `settings` → `<SmartSettingsAdmin />` (superadmin only: users, departments, and System Reset)

Sidebar utilities: `<NotificationBell />` (real-time approval, signature, and review alerts drawer), Collapsible Sidebar (`Ctrl+B` / `Cmd+B`).
Global modals: `ProfileAndSignatureModal` (unified Digital Signature, PKI X.509 Certificate + Profile Photo), `DocumentPreviewModal`, `ToastContainer`, `TemplatePermissionsModal`, `VersionHistoryModal`.

---

## 2. Global State (`src/context/AppContext.jsx`)

All cross-module state and mutations live in `AppContext.jsx` — do not duplicate them locally:
- Data: `users`, `departments`, `folders`, `formTemplates`, `formSubmissions`, `departmentMessages`, `myApprovalQueue`, `mySubmissions`, `templateReviews`, `reviewsNeedingMe`, `notifications`, `unreadNotificationsCount`, `activityLogs`, `activityLogsMeta`.
- Actions: `canManageDepartment(dept)`, `createFolder`, `updateFolder`, `deleteFolder`, `createTemplate`, `bulkImportTemplates`, `updateTemplate`, `updateTemplatePermissions`, `addTemplateComment`, `updateTemplateComment`, `moveTemplate`, `archiveTemplate`, `submitForm`, `resubmitForm`, `workflowAction(id, action, notes)`, `addSubmissionComment`, `updateSubmissionComment`, `sendTemplateForReview`, `submitReviewChanges`, `saveReviewDecisions`, `finalizeReview`, `cancelReview`, `saveSignature`, `saveAvatar`, `getPkiCertificate`, `generatePkiCertificate`, `verifySubmissionSignatures`, `openProfileModal`, `closeProfileModal`, `markNotificationRead`, `markAllNotificationsRead`, `wipeAllData`, `wipeFormsOnly`, user/department CRUD, messaging.
- Use `addToast(title, message, type)` for all alerts. Audit logging is done server-side.

---

## 3. Strict Development Rules

1. **Brand**: The app name is strictly **SmartDoc**.
2. **Scope**: Keep it simple. Do not re-add removed modules (custom form designer, SurveyJS, Vault, Reviewer, E-Sign vault, AI Suite, Tasks, Reports, AD matrix) unless the user explicitly asks.
3. **No mock data**: Never seed or display fake users, counts, or records. Only the super admin from `.env` is seeded.
4. **Auth**: Username + password (not email).
5. **Styling**: Vanilla CSS only (`src/App.css`, `src/index.css`) using **Pure Black Dark Mode** (`#000000`) and **Electric Lime** (`#a4fb4f`) accents. No TailwindCSS.
6. **Build Verification**: Run `npm run build` after edits; must have 0 errors.
7. **Context Maintenance**: Update [CONTEXT.md](file:///c:/Code/SmartDoc/CONTEXT.md) in the same change whenever components, state, routes, API, or rules change.
8. **No Git Commands**: Never check, get status, or run any `git` commands unless explicitly requested by the user.
