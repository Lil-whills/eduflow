import React from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

export function AuthModal() {
  const { authModalOpen, closeAuthModal, authModalTab, setAuthModalTab } = useAuth()
  const navigate = useNavigate()

  if (!authModalOpen) return null

  const handleForgotPassword = () => {
    closeAuthModal()
    navigate('/forgot-password')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header / Tabs */}
        <div className="p-6 pb-0">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-[#0F172A]">
                {authModalTab === 'login' ? 'Sign In to Eduflow' : 'Create Proprietor Account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {authModalTab === 'login'
                  ? 'Enter your credentials to access your school workspace.'
                  : 'Create your account to register and manage your schools.'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeAuthModal}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Selector */}
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAuthModalTab('login')}
              className={`flex-1 py-2 rounded-md transition-all ${
                authModalTab === 'login'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthModalTab('signup')}
              className={`flex-1 py-2 rounded-md transition-all ${
                authModalTab === 'signup'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              New Account
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 pt-4">
          {authModalTab === 'login' ? (
            <LoginForm
              onSuccess={closeAuthModal}
              onForgotPassword={handleForgotPassword}
            />
          ) : (
            <RegisterForm onSuccess={closeAuthModal} />
          )}
        </div>
      </div>
    </div>
  )
}

