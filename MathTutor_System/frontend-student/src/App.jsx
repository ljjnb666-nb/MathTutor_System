import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import MistakeBookPage from './pages/MistakeBookPage'
import KnowledgeGraphPage from './pages/KnowledgeGraphPage'
import ExamListPage from './pages/ExamListPage'
import ExamDoPage from './pages/ExamDoPage'
import ProfilePage from './pages/ProfilePage'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
