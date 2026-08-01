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
| SmartGen | Parameter toolbar, generation workspace, result preview, coverage/distribution side panel, bottom actions | Partial | NOT_REBUILT |
| AIChat | Conversation list, central transcript, right context/quick actions, fixed input | Partial | NOT_REBUILT |
| TeacherAgent | Left history, central goal/run surface, right context and safety panels | Read-only run support | MATCHED_WITH_ADAPTATION |
| QuestionBank | Top filters, metric row, table-first question list, right preview panel | Supported | MATCHED_WITH_ADAPTATION |
| KnowledgeBase | KB cards, document table, detail/retrieval side panel, coverage overview | Supported | NOT_REBUILT |
| ImportExam | Stepper, upload/dropzone, files, OCR preview, result side panel | Supported | NOT_REBUILT |
| PPTGenerator | Config, outline, preview, templates, scenarios, bottom actions | Partial | NOT_REBUILT |
| Schedule | Week calendar canvas, today/conflict/month side panel | Supported | NOT_REBUILT |
| HomeworkProgress | Filters, metrics, trend/chart, detail table, anomaly/intervention side panel | Partial | NOT_REBUILT |
| MistakeBook | Filters, metrics, mistake table, detail side panel, trends/distribution | Supported | NOT_REBUILT |
| KnowledgeGraph | Filters, metrics, graph canvas, heat/segment/suggestion side panel | Partial | NOT_REBUILT |
| Reports | Filters, metrics, report summaries/charts, structure/export side panel | Partial | NOT_REBUILT |
| ExamList / ExamPreview | Filters, metrics, exam table, preview/analysis/activity side panel | Supported | NOT_REBUILT |
| StudentMgmt | Filters, metrics, student table, distribution/risk/action side panel, trends | Supported | NOT_REBUILT |
| Pricing | Plan cards, feature comparison, subscription/usage/FAQ side panel | Partial | NOT_REBUILT |
| AdminUserPage | Search/filter, metrics, user table, detail/role/log side panel | Partial | NOT_REBUILT |
| Settings | Category sidebar, settings forms, security/status side panel | Local preferences | NOT_REBUILT |

## Implemented Adaptations

Dashboard was rebuilt around real dashboard stats, mistake data, student trends, and recent exams. Empty/error states use real fetch outcomes; reference-only activity and recommendation data were not faked.

QuestionBank was rebuilt as a table-first page with toolbar filters, metrics, selection, delete, compose-preview entry, mobile cards, and a right preview panel. Existing question-bank behaviors are retained.

TeacherAgent was rebuilt as a read-only three-column workbench. It keeps existing run creation/history/detail behavior and explicitly avoids practice-draft save, question-bank write, confirmation-save, or publishing workflows.

## Remaining Gaps

Fifteen referenced pages are still not rebuilt in this checkpoint. SmartGen and AIChat were analyzed but not implemented. Full browser screenshot acceptance across all routes is still pending. Therefore this checkpoint is not PR-ready and must be reported as FAIL rather than PASS or PASS_WITH_LIMITATIONS.
