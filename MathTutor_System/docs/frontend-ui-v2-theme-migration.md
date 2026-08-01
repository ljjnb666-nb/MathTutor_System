# Frontend UI V2 Theme Migration Audit

**Generated**: 2026-07-31  
**Total Files with Light Theme Hardcoding**: 42

## Audit Scope

Searched for hardcoded light theme classes:
```
bg-white|bg-gray-50|bg-gray-100|bg-slate-50|bg-slate-100
text-gray-[6789]00|text-slate-[789]00
border-gray-100|border-gray-200|border-slate-100|border-slate-200
from-white|to-white
```

## Classification

### Category 1: 普通业务页面 (需要迁移)

**Priority: HIGH**

1. `frontend/src/pages/Dashboard.jsx` ⚠️ **PARTIALLY MIGRATED** - some cards remain
2. `frontend/src/pages/AIChat.jsx` ✅ **MIGRATED** (Commit d79b58c)
3. `frontend/src/pages/TeacherAgent.jsx` ✅ **MIGRATED** (Commit 423e5e0)
4. `frontend/src/pages/StudentMgmt.jsx` ✅ **MIGRATED** (Commit 6be49c2)
5. `frontend/src/pages/Reports.jsx` ✅ **MIGRATED** (Commit 0c0cb9c)
6. `frontend/src/pages/Pricing.jsx` ✅ **MIGRATED** (Commit 9568ed4)
7. `frontend/src/pages/PPTGenerator.jsx` ✅ **MIGRATED** (Commit 4234a34)
8. `frontend/src/pages/KnowledgeGraph.jsx` ✅ **MIGRATED** (Commit a002536)
9. `frontend/src/pages/ImportExam.jsx` ✅ **MIGRATED** (Commit be227e3)
10. `frontend/src/pages/HomeworkProgress.jsx` ✅ **MIGRATED** (Commit c1152d9)
11. `frontend/src/pages/ExamList.jsx` ✅ **MIGRATED** (Commit 2138fab)
12. `frontend/src/pages/AdminUserPage.jsx` ✅ **MIGRATED** (Commit c576845)
13. `frontend/src/pages/KnowledgeBase.jsx` ✅ **MIGRATED** (Commit bfac249)
14. `frontend/src/pages/MistakeBook.jsx` ✅ **MIGRATED** (Commit 6c722b7)
15. `frontend/src/pages/QuestionBank.jsx` ✅ **MIGRATED** (Commit faecc45)

### Category 2: 共用组件 (需要优先迁移)

**Priority: CRITICAL**

1. `frontend/src/components/QuestionCard.jsx` 🔥 **Used by SmartGen, QuestionBank**
2. `frontend/src/components/FilterPanel.jsx` 🔥 **Used by multiple pages**
3. `frontend/src/components/KnowledgeCard.jsx`
4. `frontend/src/components/ExampleList.jsx`
5. `frontend/src/components/QuestionSelectModal.jsx`
6. `frontend/src/components/TextbookSelector.jsx`
7. `frontend/src/components/StudentSelectorModal.jsx`
8. `frontend/src/components/SettingsModal.jsx`

### Category 3: 弹窗、下拉框和表单 (需要迁移)

**Priority: HIGH**

1. `frontend/src/features/student-mgmt/components/StudentFormModal.jsx` ✅ **MIGRATED** (Commit 041ba21)
2. `frontend/src/features/homework/components/QuestionPickerModal.jsx` ✅ **MIGRATED** (Commit 98b6834)
3. `frontend/src/features/schedule/components/ScheduleFormModal.jsx` ✅ **MIGRATED** (Commit 7e57f2a)

### Category 4: Teacher Agent 组件 (需要迁移)

**Priority: HIGH**

1. `frontend/src/components/teacher-agent/AgentActionStatus.jsx`
2. `frontend/src/components/teacher-agent/ConfirmPracticeSaveDialog.jsx`
3. `frontend/src/components/teacher-agent/PracticeDraftPanel.jsx`
4. `frontend/src/components/teacher-agent/PracticeQuestionEditor.jsx`

### Category 5: 工作区页面 (需要显式迁移)

**Priority: CRITICAL**

1. `frontend/src/features/smart-gen/SmartGenView.jsx` 🔥 **CRITICAL - Main Workspace**

### Category 6: 业务特性组件

**Priority: MEDIUM**

1. `frontend/src/features/student-mgmt/components/StudentGrid.jsx` ✅ **MIGRATED** (Commit 3307655)
2. `frontend/src/features/homework/components/HomeworkProgressPanel.jsx` ✅ **MIGRATED** (Commit 314e28e)
3. `frontend/src/features/homework/components/HomeworkManagePanel.jsx` ✅ **MIGRATED** (Commit 861ce22)
4. `frontend/src/features/schedule/components/ScheduleList.jsx` ✅ **MIGRATED** (Commit 8d466df)
5. `frontend/src/features/schedule/components/ScheduleToolbar.jsx` ✅ **MIGRATED** (Commit bedd5a6)

### Category 7: 试卷预览和报告 (需检查是否应保留白色)

**Priority: REVIEW REQUIRED**

1. `frontend/src/pages/ExamPreview.jsx` 📄 **Contains A4 paper preview - white backgrounds preserved**
2. `frontend/src/pages/AfterClassReport.jsx` ✅ **MIGRATED** (Commit 854582e)
3. `frontend/src/pages/LearningReport.jsx` ✅ **MIGRATED** (Commit 032cf13)

**Status**: Category 7 complete - AfterClassReport and LearningReport migrated with semantic colors preserved (emerald for success, amber for warnings, indigo for templates). ExamPreview A4 paper areas intentionally excluded from migration.

### Category 8: 路由守卫 (可能包含加载状态)

**Priority: LOW**

1. `frontend/src/components/ProtectedRoute.jsx`
2. `frontend/src/components/AdminRoute.jsx`

### Category 9: Layout 组件

**Priority: MEDIUM**

1. `frontend/src/components/Layout.jsx` ⚠️ **Global layout component**

## Migration Strategy

### Phase 1: Foundation (COMPLETED ✅)
- ✅ `design-tokens.css`: Dark/Light theme variables
- ✅ `index.css`: Remove hardcoded white from `.bg-mesh-canvas`, `.pro-glass-card`
- ✅ `Dashboard.jsx`: Migrate to CSS tokens
- ✅ `Settings.jsx`: Migrate to CSS tokens
- ✅ `App.jsx`: Theme switching with system detection

### Phase 2: Shared Components (COMPLETED ✅)
1. ✅ Add semantic tokens to `design-tokens.css`
2. ✅ Migrate `QuestionCard.jsx` (Commit 60f5a52)
3. ✅ Migrate `FilterPanel.jsx` (Commit afe50ad)
4. ✅ Migrate `KnowledgeCard.jsx` (Commit 838708f)
5. ✅ Migrate `ExampleList.jsx` (Commit f9cab18)
6. ✅ Migrate `QuestionSelectModal.jsx` (Commit 99d7e5a)
7. ✅ Migrate `TextbookSelector.jsx` (Commit 99d7e5a)
8. ✅ Migrate `StudentSelectorModal.jsx` (Commit 81eb97b)
9. ✅ Migrate `SettingsModal.jsx` (Commit cb74a3e)
10. ✅ Migrate Teacher Agent components (Commit 297392c)
    - AgentActionStatus.jsx
    - ConfirmPracticeSaveDialog.jsx
    - PracticeDraftPanel.jsx
    - PracticeQuestionEditor.jsx

### Phase 3: Critical Workspaces (COMPLETED ✅)
1. ✅ Migrate `SmartGenView.jsx` (Commit e445bd1)
2. ✅ Migrate `AIChat.jsx` (Commit d79b58c)
3. ✅ Migrate `TeacherAgent.jsx` (Commit 423e5e0)

### Phase 4: Remaining Pages (COMPLETED ✅)
1. ✅ Migrate all other pages in Category 1
2. ✅ Migrate all feature components in Category 6
   - StudentGrid.jsx (Commit 3307655)
   - HomeworkProgressPanel.jsx (Commit 314e28e)
   - HomeworkManagePanel.jsx (Commit 861ce22)
   - ScheduleList.jsx (Commit 8d466df)
   - ScheduleToolbar.jsx (Commit bedd5a6)
3. ✅ Migrate Category 7 report pages
   - AfterClassReport.jsx (Commit 854582e)
   - LearningReport.jsx (Commit 032cf13)
   - ExamPreview.jsx A4 paper areas intentionally excluded

### Phase 5: Verification
1. Browser computed style checks
2. Screenshot acceptance (1440×900)
3. Theme switching regression tests
4. A4 paper white preservation verification

## Semantic Tokens Needed

Add to `design-tokens.css`:

```css
/* Dark theme */
html[data-theme="dark"] {
  --color-bg-elevated: #111827;
  --color-bg-panel: #0d1320;
  --color-bg-panel-muted: #151e2e;
  --color-bg-option: #1b2536;
  --color-bg-overlay: rgba(8, 12, 20, 0.82);
  --color-text-disabled: #475569;
  --color-border-subtle: rgba(148, 163, 184, 0.12);
  --color-border-strong: rgba(148, 163, 184, 0.24);
}

/* Light theme */
html[data-theme="light"] {
  --color-bg-elevated: #ffffff;
  --color-bg-panel: #f8fafc;
  --color-bg-panel-muted: #f1f5f9;
  --color-bg-option: #ffffff;
  --color-bg-overlay: rgba(248, 250, 252, 0.92);
  --color-text-disabled: #94a3b8;
  --color-border-subtle: rgba(15, 23, 42, 0.08);
  --color-border-strong: rgba(15, 23, 42, 0.16);
}
```

## Migration Checklist

- [ ] Phase 2: Shared Components
- [ ] Phase 3: Critical Workspaces (SmartGen, AIChat, TeacherAgent)
- [ ] Phase 4: Remaining Pages
- [ ] Phase 5: Verification
  - [ ] Dark theme browser checks
  - [ ] Light theme browser checks
  - [ ] A4 paper white preservation
  - [ ] Theme switching regression
  - [ ] Screenshot acceptance

## Constraints

- ❌ Do NOT use global Tailwind overrides like `.bg-white { ... }`
- ❌ Do NOT use `!important` for global theme forcing
- ❌ Do NOT convert A4 paper/print previews to dark theme
- ✅ DO use CSS custom properties for all theme-dependent colors
- ✅ DO verify both dark and light themes after migration
- ✅ DO wrap intentional white areas in semantic classes (`.exam-paper`, `.print-preview`)
