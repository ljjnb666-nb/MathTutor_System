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
4. `frontend/src/pages/StudentMgmt.jsx`
5. `frontend/src/pages/Reports.jsx`
6. `frontend/src/pages/Pricing.jsx`
7. `frontend/src/pages/PPTGenerator.jsx`
8. `frontend/src/pages/KnowledgeGraph.jsx`
9. `frontend/src/pages/ImportExam.jsx`
10. `frontend/src/pages/HomeworkProgress.jsx`
11. `frontend/src/pages/ExamList.jsx`
12. `frontend/src/pages/AdminUserPage.jsx`
13. `frontend/src/pages/KnowledgeBase.jsx`
14. `frontend/src/pages/MistakeBook.jsx`
15. `frontend/src/pages/QuestionBank.jsx`

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

1. `frontend/src/features/student-mgmt/components/StudentFormModal.jsx`
2. `frontend/src/features/homework/components/QuestionPickerModal.jsx`
3. `frontend/src/features/schedule/components/ScheduleFormModal.jsx`

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

1. `frontend/src/features/student-mgmt/components/StudentGrid.jsx`
2. `frontend/src/features/homework/components/HomeworkProgressPanel.jsx`
3. `frontend/src/features/homework/components/HomeworkManagePanel.jsx`
4. `frontend/src/features/schedule/components/ScheduleList.jsx`
5. `frontend/src/features/schedule/components/ScheduleToolbar.jsx`

### Category 7: 试卷预览和报告 (需检查是否应保留白色)

**Priority: REVIEW REQUIRED**

1. `frontend/src/pages/ExamPreview.jsx` 📄 **May contain A4 paper preview**
2. `frontend/src/pages/AfterClassReport.jsx` 📄 **May contain printable report**
3. `frontend/src/pages/LearningReport.jsx` 📄 **May contain printable report**

**Action**: Review these files to identify intentional white backgrounds for:
- A4 paper simulation (`.exam-paper`, `.a4-paper`)
- Print preview areas (`.print-preview`)
- PDF/Word export preview

These areas should be wrapped in specific classes and excluded from theme migration.

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

### Phase 4: Remaining Pages
1. Migrate all other pages in Category 1
2. Migrate all feature components in Category 6
3. Review and handle Category 7 (print/paper areas)

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
