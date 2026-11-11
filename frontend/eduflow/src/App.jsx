import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Navbar } from './components/common/Navbar'
import { Footer } from './components/common/Footer'
import { AuthModal } from './components/auth/AuthModal'

import { LandingPage } from './pages/landing/LandingPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { AcceptInvitationPage } from './pages/auth/AcceptInvitationPage'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { SchoolRegisterPage } from './pages/schools/SchoolRegisterPage'
import { CampusWorkspacePage } from './pages/workspace/CampusWorkspacePage'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-100 selection:text-blue-900">
          <Navbar />
          <main className="flex-1 flex flex-col">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvitationPage />} />
              <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
              <Route path="/admin" element={<AdminLoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/school-register" element={<SchoolRegisterPage />} />
              <Route path="/workspace" element={<CampusWorkspacePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
          <AuthModal />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
