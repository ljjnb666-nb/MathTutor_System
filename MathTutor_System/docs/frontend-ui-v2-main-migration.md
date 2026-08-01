# Teacher Frontend UI V2 Main Migration Audit

Date: 2026-08-01

Goal: create a UI-only branch directly based on `origin/main`, using PR #4 as the visual migration source while excluding PR #2 practice-draft persistence functionality.

## Baseline

- New branch: `feat/frontend-ui-v2-main`
- Base: `origin/main`
- Source UI branch: `origin/feat/frontend-ui-v2-foundation`
- PR #2 branch: `origin/feat/teacher-agent-practice-draft`
- PR #4 head at audit time: `e26b2db6104b6262c94872619a3ab5485bc92f61`

## A. PR #2 Only Backend Functionality

These files are PR #2 business functionality and must not be migrated into the UI-only branch.

- `MathTutor_System/backend/app/api/endpoints/question_bank.py`
- `MathTutor_System/backend/app/api/endpoints/teacher_agent.py`
- `MathTutor_System/backend/app/api/endpoints/tools.py`
- `MathTutor_System/backend/app/models/__init__.py`
- `MathTutor_System/backend/app/models/agent_artifact.py`
- `MathTutor_System/backend/app/models/question_bank.py`
- `MathTutor_System/backend/app/schemas/practice_draft_dto.py`
- `MathTutor_System/backend/app/schemas/question_bank_dto.py`
- `MathTutor_System/backend/app/services/llm_key_test_service.py`
- `MathTutor_System/backend/app/services/practice_draft_generator.py`
- `MathTutor_System/backend/app/services/practice_draft_validator.py`
- `MathTutor_System/backend/app/services/question_bank_service.py`
- `MathTutor_System/backend/app/services/teacher_agent_artifact_service.py`
- `MathTutor_System/backend/migrations/versions/b4d8e2c9a713_add_agent_artifacts_actions.py`
- `MathTutor_System/backend/migrations/versions/c6f0a2d9e8b1_add_question_bank_owner_and_action_guard.py`

## B. PR #2 Only Frontend Business Functionality

These files introduce or support practice-draft confirmation workflows and are excluded unless manually restyled from the `main` capability surface.

- `MathTutor_System/frontend/src/components/teacher-agent/AgentActionStatus.jsx`
- `MathTutor_System/frontend/src/components/teacher-agent/ConfirmPracticeSaveDialog.jsx`
- `MathTutor_System/frontend/src/components/teacher-agent/PracticeDraftPanel.jsx`
- `MathTutor_System/frontend/src/components/teacher-agent/PracticeQuestionEditor.jsx`
- `MathTutor_System/frontend/src/pages/TeacherAgent.jsx`
- `MathTutor_System/frontend/src/pages/TeacherAgent.test.jsx`
- `MathTutor_System/frontend/src/services/teacherAgentApi.js`
- `MathTutor_System/frontend/src/services/toolsApi.js`
- `MathTutor_System/frontend/src/services/toolsApi.test.js`
- `MathTutor_System/frontend/src/components/SettingsModal.jsx`
- `MathTutor_System/frontend/src/components/SettingsModal.test.jsx`
- `MathTutor_System/frontend/vite.config.js`
- `MathTutor_System/frontend-student/vite.config.js`
- `MathTutor_System/shared/frontend/createApiClient.js`

## C. PR #4 Pure UI Files

These files are safe UI migration candidates when restored by explicit path.

- `MathTutor_System/frontend/index.html`
- `MathTutor_System/frontend/src/App.jsx`
- `MathTutor_System/frontend/src/index.css`
- `MathTutor_System/frontend/src/styles/design-tokens.css`
- `MathTutor_System/frontend/src/utils/theme.js`
- `MathTutor_System/frontend/src/utils/theme.test.js`
- `MathTutor_System/frontend/src/components/Layout.jsx`
- `MathTutor_System/frontend/src/components/Sidebar.jsx`
- `MathTutor_System/frontend/src/components/TopHeader.jsx`
- `MathTutor_System/frontend/src/config/navigation.js`
- `MathTutor_System/frontend/src/config/route-meta.js`
- `MathTutor_System/frontend/src/pages/Settings.jsx`
- `MathTutor_System/frontend/src/pages/Settings.test.jsx`
- Shared visual components: `ExampleList.jsx`, `FilterPanel.jsx`, `KnowledgeCard.jsx`, `QuestionCard.jsx`, `QuestionSelectModal.jsx`, `StudentSelectorModal.jsx`, `TextbookSelector.jsx`
- Feature visual components under `features/homework`, `features/schedule`, `features/smart-gen`, and `features/student-mgmt`
- Teacher pages restyled for theme tokens: Dashboard, SmartGen, AIChat, QuestionBank, KnowledgeBase, ImportExam, PPTGenerator, Schedule, HomeworkProgress, MistakeBook, KnowledgeGraph, Reports, ExamList, ExamPreview, StudentMgmt, Pricing, AdminUserPage

## D. PR #4 and PR #2 Overlap Files

These files need special handling because PR #4 modified files first introduced or materially changed by PR #2.

- Excluded PR #2 practice components:
  - `MathTutor_System/frontend/src/components/teacher-agent/AgentActionStatus.jsx`
  - `MathTutor_System/frontend/src/components/teacher-agent/ConfirmPracticeSaveDialog.jsx`
  - `MathTutor_System/frontend/src/components/teacher-agent/PracticeDraftPanel.jsx`
  - `MathTutor_System/frontend/src/components/teacher-agent/PracticeQuestionEditor.jsx`
- Special manual migration:
  - `MathTutor_System/frontend/src/pages/TeacherAgent.jsx`
  - `MathTutor_System/frontend/src/pages/TeacherAgent.test.jsx`
- Keep from `main` unless a later explicit UI reason is proven:
  - `MathTutor_System/frontend/src/services/teacherAgentApi.js`
  - `MathTutor_System/frontend/src/services/toolsApi.js`
  - `MathTutor_System/frontend/src/components/SettingsModal.jsx`
  - Vite config and shared API client changes from PR #2

## E. Tests

Safe UI tests to migrate:

- `MathTutor_System/frontend/src/utils/theme.test.js`
- `MathTutor_System/frontend/src/pages/Settings.test.jsx`
- `MathTutor_System/frontend/src/pages/TeacherAgent.test.jsx`, rewritten for the real `main` Teacher Agent capability only

Excluded PR #2 tests:

- Backend practice artifact, owner, migration, and LLM key tests
- `MathTutor_System/frontend/src/services/toolsApi.test.js`
- PR #2-specific `SettingsModal.test.jsx`

## F. Documentation And Screenshots

Safe source docs and reference images:

- `MathTutor_System/docs/frontend-ui-v2-handoff.md`
- `MathTutor_System/docs/frontend-ui-v2-theme-migration.md`
- `MathTutor_System/docs/frontend-ui-v2-verification.md`
- `MathTutor_System/docs/ui-reference/v2/**`

PR #4 final screenshots cannot be copied blindly because TeacherAgent screenshots may show PR #2 practice-draft persistence flows. New UI-only acceptance screenshots must be generated from this branch.

## G. Build Artifacts

No `dist/`, `node_modules`, `coverage`, `playwright-report`, or `test-results` files should be included.

## H. Unknown Files

No unknown file category was identified from the two diff layers at audit time.

## Excluded Business Symbols

The UI-only branch must not introduce these PR #2 symbols into frontend source:

- `PracticeDraft`
- `PracticeArtifact`
- `preparePracticeSave`
- `confirmPracticeAction`
- `cancelPracticeAction`
- `createPracticeDraft`
- `updatePracticeArtifact`
- `pending_confirmation`
- `idempotency_key`

