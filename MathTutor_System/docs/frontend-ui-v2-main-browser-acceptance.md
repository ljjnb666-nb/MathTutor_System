# UI V2 Main Browser Acceptance

Date: 2026-08-01

Branch: `feat/frontend-ui-v2-main`

## Scope

This acceptance pass verifies the UI-only migration directly on top of `main`.

It does not verify or include PR #2 practice-draft confirmation, artifact versioning, question-bank write transactions, or backend persistence features.

## Environment

- Teacher frontend: `http://127.0.0.1:5173`
- API proxy target: `http://127.0.0.1:8000`
- Login: repository default admin account
- Browser automation: Playwright Chromium, headless

## Route Coverage

Checked with `dark`, `light`, and `auto` theme modes:

- Dashboard
- SmartGen
- AIChat
- Base TeacherAgent
- QuestionBank
- KnowledgeBase
- ImportExam
- PPT
- Schedule
- HomeworkProgress
- MistakeBook
- KnowledgeGraph
- Reports
- ExamList
- ExamPreview
- StudentMgmt
- Pricing
- AdminUserPage
- Settings

## Assertions

- 57 route/theme combinations checked
- No blank pages
- No horizontal overflow at desktop route checks
- No PR #2 practice-draft or confirmation-entry text leaked into the UI
- `auto` theme resolved to a real DOM `light` or `dark` theme
- ExamPreview retained a white A4 paper surface
- Console error count: 0
- 404 response count: 0

## Evidence

Screenshots and machine-readable route results are stored in:

- `MathTutor_System/docs/ui-verification/ui-v2-main/`

