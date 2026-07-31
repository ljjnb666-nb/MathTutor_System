import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { StudentProvider } from './contexts/StudentContext'
import { SmartGenProvider } from './contexts/SmartGenContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const SmartGen = lazy(() => import('./pages/SmartGen'))
const QuestionBank = lazy(() => import('./pages/QuestionBank'))
const StudentMgmt = lazy(() => import('./pages/StudentMgmt'))
const ExamPreview = lazy(() => import('./pages/ExamPreview'))
const ExamList = lazy(() => import('./pages/ExamList'))
const ImportExam = lazy(() => import('./pages/ImportExam'))
const PPTGenerator = lazy(() => import('./pages/PPTGenerator'))
const MistakeBook = lazy(() => import('./pages/MistakeBook'))
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'))
const Reports = lazy(() => import('./pages/Reports'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))
const AIChat = lazy(() => import('./pages/AIChat'))
const TeacherAgent = lazy(() => import('./pages/TeacherAgent'))
const AdminUserPage = lazy(() => import('./pages/AdminUserPage'))
const SchedulePage = lazy(() => import('./pages/SchedulePage'))
const HomeworkProgress = lazy(() => import('./pages/HomeworkProgress'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Settings = lazy(() => import('./pages/Settings'))

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">
      页面加载中...
    </div>
  )
}

function App() {
  // 初始化主题设置
  useEffect(() => {
    const savedTheme = localStorage.getItem('ui_theme') || 'dark'
    const savedAccent = localStorage.getItem('ui_accent') || 'indigo'
    const savedDensity = localStorage.getItem('ui_density') || 'comfortable'

    document.documentElement.dataset.theme = savedTheme
    document.documentElement.dataset.accent = savedAccent
    document.documentElement.dataset.density = savedDensity
  }, [])

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          success: { duration: 3000 },
          error: { duration: 5500 },
          style: { maxWidth: 420 },
        }}
      />
      <AuthProvider>
      <SubscriptionProvider>
      <StudentProvider>
      <SmartGenProvider>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="smart-gen" element={<SmartGen />} />
            <Route path="chat" element={<AIChat />} />
            <Route path="teacher-agent" element={<TeacherAgent />} />
            <Route path="question-bank" element={<QuestionBank />} />
            <Route path="knowledge-base" element={<KnowledgeBase />} />
            <Route path="mistake-book" element={<MistakeBook />} />
            <Route path="knowledge-graph" element={<KnowledgeGraph />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="homework-progress" element={<HomeworkProgress />} />
            <Route path="reports" element={<Reports />} />
            <Route path="after-class-report" element={<Navigate to="/reports" replace />} />
            <Route path="learning-report" element={<Navigate to="/reports?tab=learning" replace />} />
            <Route path="student-mgmt" element={<StudentMgmt />} />
            <Route path="exams" element={<ExamList />} />
            <Route path="exams/import" element={<ImportExam />} />
            <Route path="ppt" element={<PPTGenerator />} />
            <Route path="exams/:id" element={<ExamPreview />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="settings" element={<Settings />} />
            <Route element={<AdminRoute />}>
              <Route path="admin-users" element={<AdminUserPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
      </Suspense>
      </SmartGenProvider>
      </StudentProvider>
      </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
