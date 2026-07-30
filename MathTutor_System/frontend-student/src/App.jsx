import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const MistakeBookPage = lazy(() => import('./pages/MistakeBookPage'))
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage'))
const ExamListPage = lazy(() => import('./pages/ExamListPage'))
const ExamDoPage = lazy(() => import('./pages/ExamDoPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">
      页面加载中...
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="mistakes" element={<MistakeBookPage />} />
              <Route path="knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="exams" element={<ExamListPage />} />
              <Route path="exams/:id" element={<ExamDoPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
