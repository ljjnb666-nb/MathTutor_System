# Teacher Frontend UI V2 Phase 2 Reference Analysis

Date: 2026-08-01

Baseline: `d1b13de73c39d6246ecfc37daa86c471c18a4bba`

Reference directory: `MathTutor_System/docs/ui-reference/v2`

## Reference Set

All 18 reference images were inspected:

1. `01-首页.png` - Dashboard
2. `02-智能出题.png` - SmartGen
3. `03-AI对话.png` - AIChat
4. `04-AI教师助手.png` - TeacherAgent
5. `05-题库管理.png` - QuestionBank
6. `06-知识库管理.png` - KnowledgeBase
7. `07-导入试卷.png` - ImportExam
8. `08-Magic-PPT.png` - PPTGenerator
9. `09-排课.png` - Schedule
10. `10-学生做题情况.png` - HomeworkProgress
11. `11-错题本.png` - MistakeBook
12. `12-学情图谱.png` - KnowledgeGraph
13. `13-课后与学习报告.png` - Reports
14. `14-我的试卷.png` - ExamList / ExamPreview
15. `15-学生管理与总览.png` - StudentMgmt
16. `16-套餐与定价.png` - Pricing
17. `17-用户管理.png` - AdminUserPage
18. `18-设置.png` - Settings

## Shared Visual Model

The V2 references use a consistent teacher-console layout: fixed dark sidebar, compact top context/search strip, dense rounded panels, subtle borders, metric cards, table-first data pages, and right-side context/detail panels. The visual density is closer to an operations dashboard than a marketing surface. Desktop should prioritize scanning, comparison, and repeated actions; mobile should collapse secondary panels below the primary workflow and replace large tables with stable card rows.

The refactor should reuse real existing API state. Unsupported reference-only elements should become disabled affordances, empty states, or be omitted. No fake analytics, fake payments, fake notifications, PR #2 practice-draft behavior, or backend-only features should be introduced by the UI pass.

## Mapping Matrix

| Page | Target reference structure | Backend support | Phase 2 status |
|---|---|---|---|
| Dashboard | Hero, metrics, quick actions, tasks, recent records, charts, side panels | Partial | MATCHED_WITH_ADAPTATION |
| SmartGen | Parameter toolbar, generation workspace, result preview, coverage/distribution side panel, bottom actions | Partial | MATCHED_WITH_ADAPTATION |
| AIChat | Conversation list, central transcript, right context/quick actions, fixed input | Partial | MATCHED_WITH_ADAPTATION |
| TeacherAgent | Left history, central goal/run surface, right context and safety panels | Read-only run support | MATCHED_WITH_ADAPTATION |
| QuestionBank | Top filters, metric row, table-first question list, right preview panel | Supported | MATCHED_WITH_ADAPTATION |
| KnowledgeBase | KB cards, document table, detail/retrieval side panel, coverage overview | Supported | MATCHED_WITH_ADAPTATION |
| ImportExam | Stepper, upload/dropzone, files, OCR preview, result side panel | Supported | MATCHED_WITH_ADAPTATION |
| PPTGenerator | Config, outline, preview, templates, scenarios, bottom actions | Partial | MATCHED_WITH_ADAPTATION |
| Schedule | Week calendar canvas, today/conflict/month side panel | Supported | MATCHED_WITH_ADAPTATION |
| HomeworkProgress | Filters, metrics, trend/chart, detail table, anomaly/intervention side panel | Partial | MATCHED_WITH_ADAPTATION |
| MistakeBook | Filters, metrics, mistake table, detail side panel, trends/distribution | Supported | MATCHED_WITH_ADAPTATION |
| KnowledgeGraph | Filters, metrics, graph canvas, heat/segment/suggestion side panel | Partial | MATCHED_WITH_ADAPTATION |
| Reports | Filters, metrics, report summaries/charts, structure/export side panel | Partial | MATCHED_WITH_ADAPTATION |
| ExamList / ExamPreview | Filters, metrics, exam table, preview/analysis/activity side panel | Supported | MATCHED_WITH_ADAPTATION |
| StudentMgmt | Filters, metrics, student table, distribution/risk/action side panel, trends | Supported | MATCHED_WITH_ADAPTATION |
| Pricing | Plan cards, feature comparison, subscription/usage/FAQ side panel | Partial | MATCHED_WITH_ADAPTATION |
| AdminUserPage | Search/filter, metrics, user table, detail/role/log side panel | Partial | MATCHED_WITH_ADAPTATION |
| Settings | Category sidebar, settings forms, security/status side panel | Local preferences | MATCHED_WITH_ADAPTATION |

## Implemented Adaptations

Dashboard was rebuilt around real dashboard stats, mistake data, student trends, and recent exams. Empty/error states use real fetch outcomes; reference-only activity and recommendation data were not faked.

Dashboard browser recheck was completed for dark desktop, light desktop, and mobile. It matches the reference dashboard structure with hero, metric cards, quick actions, trend/knowledge chart, today task panel, and recent exams. Subscription and student context are read from existing state; no fake notification or unsupported action workflow was added.

SmartGen was rebuilt around the reference workspace anatomy: top generation context, left condition settings, center AI result preview, right distribution/coverage/status panels, and bottom action strip. Distribution and coverage are derived only from generated questions. Unsupported copy/export controls were removed from the page-level action bar; remaining visible actions map to existing upload, generate, save-as-exam, and add-to-today-homework handlers. Browser screenshots were captured for dark desktop, light desktop, and mobile.

StudentMgmt was rebuilt as a table-first management console with search, real-data metrics, responsive student rows, and right-side grade/risk/ranking panels. Distribution and risk panels are derived from the existing student and overview payloads. Reference-only charts/trends were adapted to real summary panels rather than faked. Browser screenshots were captured for dark desktop, light desktop, and mobile.

Schedule was rebuilt around the reference week-calendar canvas with real schedule records, existing filters, add/edit/copy/delete actions, today-course panel, conflict panel, and month overview. The reference-only auto-arrange/export actions were not added. Browser screenshots were captured for dark desktop, light desktop, and mobile.

HomeworkProgress was rebuilt around the reference progress dashboard: filters, real completion/accuracy metrics, accuracy trend bars, student summary rows, anomaly reminders, recommended interventions, and assignment details. Data is derived from existing assigned exam records. Browser screenshots were captured for dark desktop, light desktop, and mobile.

QuestionBank was rebuilt as a table-first page with toolbar filters, metrics, selection, delete, compose-preview entry, mobile cards, and a right preview panel. Existing question-bank behaviors are retained.

QuestionBank browser recheck was completed for dark desktop, light desktop, and mobile. It keeps the existing bank read/delete/compose-preview handlers and adapts the reference list/detail layout without introducing unsupported question-bank write flows.

TeacherAgent was rebuilt as a read-only three-column workbench. It keeps existing run creation/history/detail behavior and explicitly avoids practice-draft save, question-bank write, confirmation-save, or publishing workflows.

TeacherAgent browser recheck was completed for dark desktop, light desktop, and mobile. Desktop keeps the reference three-column workbench, while mobile stacks history, run input, execution state, context, and safety panels in normal page scroll. The route remains read-only and does not expose PR #2 practice-draft behavior.

KnowledgeBase was rebuilt around the reference knowledge-library cards, document table, coverage summary, document detail panel, and upload settings. It keeps existing RAG upload/list/chunk-preview/delete APIs, preserves `document_id` identity for same-name documents, and does not fake retrieval results when no real document data exists. Browser screenshots were captured for dark desktop, light desktop, and mobile.

ImportExam was rebuilt around the reference stepper and ingestion workspace. It keeps existing Word/PDF parse, batch save, collect, and analysis APIs; unsupported image/OCR import is shown only as a disabled affordance. Browser screenshots were captured for dark desktop, light desktop, and mobile.

ExamList was rebuilt as a saved-content asset console with metrics, search/type filtering, assignment modal entry, delete, preview, and import/generation links. ExamPreview was rebuilt as a print/preview/grading workspace with existing save, assign, print, quick-grade, knowledge-card, AI-chat, and graph-navigation flows. Browser screenshots were captured for both pages in dark desktop, light desktop, and mobile.

MistakeBook was rebuilt around reference metrics, tabs, responsive mistake cards, manual add modal, review/master/delete, AI-chat handoff, homework insertion, and review-practice generation. It uses only existing mistake, exam, and generation APIs. Browser screenshots were captured for dark desktop, light desktop, and mobile.

KnowledgeGraph was rebuilt around the reference mastery metrics, textbook tree, selected-node focus panel, weak-point action pack, unmapped weak-point list, and outline overview. It keeps existing mastery fetch, URL knowledge-point targeting, wrong-question navigation, SmartGen handoff, and weak-point generation APIs. Browser screenshots were captured for dark desktop, light desktop, and mobile.

Reports was rebuilt as a report workspace with student/period/type filters, real student metrics, embedded after-class and learning report editors, report outline, and explicit empty states for missing persistent report history/trend APIs. It keeps the existing after-class comment generation and learning-report draft parsing APIs, and does not fake report history, exports, or trend series.

LearningReport was rebuilt as a V2 structured report editor with manual-input and AI-parse modes. Manual output is derived from teacher-entered fields, and AI output is rendered only from `parseLearningReportDraft`. Empty and error states remain usable without inventing persisted learning analytics.

AfterClassReport was rebuilt as a V2 parent-feedback editor with real selected-student context, star ratings, keyword chips, optional local template/draft input, and preview/copy behavior. It keeps the existing `generateAfterClassComment` API and does not add unsupported messaging or export flows.

AIChat was rebuilt as a three-column conversation workbench with session list, central transcript/composer, and right context/status panel. It preserves existing session loading, pin/delete/edit, streaming/non-stream reply, retry, student-context toggle, and knowledge/subject context parameters. Reference-only upload, voice, web-search, and model-switch controls were omitted.

PPTGenerator was rebuilt as a V2 Magic PPT workbench with generation config, template empty state, slide preview, outline, and download action. It uses only the existing `generatePPT` and `buildPPTFile` APIs; no fake template marketplace or unsupported presentation editing workflow was added.

Pricing was rebuilt around real plan cards, current subscription metrics, payment capability state, and a guarded order modal. Purchase actions are hidden/disabled when `getPaymentConfig` reports payment disabled, and no fake payment provider or upgrade success state is shown.

AdminUserPage was rebuilt as an admin console with metrics, search/filter, responsive user table/cards, create-user modal, subscription controls for teachers, batch subscription panel, history modal, and delete confirmation. It keeps existing user/subscription APIs and does not add unsupported reset-password, ban, or role-edit features.

Settings was rebuilt as a V2 settings console with category sidebar, appearance controls, local AI provider preferences, readonly notification/security blocks, privacy/local-storage clearing, and right-side status cards. It preserves light/dark/auto theme resolution, accent and density persistence, and API Key masking/local-only storage.

## Remaining Gaps

All 18 referenced teacher pages have been rebuilt or adapted within existing API boundaries. Remaining differences are intentional adaptations where the reference shows unsupported backend capabilities: persistent report history/trend/export, PPT template marketplace, fake payment providers, notification channels, password reset/ban/role mutation, and PR #2 practice-draft behavior.
