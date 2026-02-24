import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { StudentProvider } from './contexts/StudentContext'
import { SmartGenProvider } from './contexts/SmartGenContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SmartGen from './pages/SmartGen'
import QuestionBank from './pages/QuestionBank'
import StudentMgmt from './pages/StudentMgmt'
import ExamPreview from './pages/ExamPreview'
import ExamList from './pages/ExamList'
import ImportExam from './pages/ImportExam'
import PPTGenerator from './pages/PPTGenerator'
import MistakeBook from './pages/MistakeBook'
import KnowledgeGraph from './pages/KnowledgeGraph'
import Reports from './pages/Reports'
import KnowledgeBase from './pages/KnowledgeBase'
import AIChat from './pages/AIChat'
import AdminUserPage from './pages/AdminUserPage'
import SchedulePage from './pages/SchedulePage'
import HomeworkProgress from './pages/HomeworkProgress'
import LoginPage from './pages/LoginPage'
import Pricing from './pages/Pricing'

function App() {
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="smart-gen" element={<SmartGen />} />
            <Route path="chat" element={<AIChat />} />
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
            <Route element={<AdminRoute />}>
              <Route path="admin-users" element={<AdminUserPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
      </SmartGenProvider>
      </StudentProvider>
      </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
