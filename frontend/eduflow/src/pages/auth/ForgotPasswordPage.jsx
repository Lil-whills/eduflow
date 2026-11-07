import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react'
import { requestPasswordReset, confirmPasswordReset } from '../../services/api'
import { Alert } from '../../components/common/Alert'
import { useAuth } from '../../context/AuthContext'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { openAuthModal } = useAuth()
  const [step, setStep] = useState(1) // 1: request, 2: confirm
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [devToken, setDevToken] = useState(null)

  const handleRequest = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const res = await requestPasswordReset(email)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setMessage(res.data.data.message)
      if (res.data.data.dev_reset_token) {
        setDevToken(res.data.data.dev_reset_token)
        setToken(res.data.data.dev_reset_token)
      }
      setStep(2)
    } else {
      setError(res.data?.error?.message || 'Request failed.')
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const res = await confirmPasswordReset(token, newPassword, confirmNewPassword)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setMessage('Password reset successfully! Please sign in with your new password.')
      setTimeout(() => {
        openAuthModal('login')
        navigate('/')
      }, 2000)
    } else {
      setError(res.data?.error?.message || 'Password reset confirmation failed.')
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">Account Recovery</h2>
            <p className="text-xs text-slate-500 mt-1">
              {step === 1
                ? 'Enter your registered email to receive a password reset token.'
                : 'Set your new secure password.'}
            </p>
          </div>
          <Link to="/" className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </Link>
        </div>

        {message && <div className="mb-4"><Alert type="success" message={message} /></div>}
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

        {devToken && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
            <span className="font-bold">Dev Recovery Token:</span>
            <p className="font-mono mt-1 break-all">{devToken}</p>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="proprietor@school.edu.gh"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm flex items-center justify-center space-x-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Send Recovery Token</span>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reset Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from email"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm flex items-center justify-center space-x-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              <span>Reset Password</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

