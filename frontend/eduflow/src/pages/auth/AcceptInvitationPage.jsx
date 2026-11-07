import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { X, RefreshCw, CheckCircle2 } from 'lucide-react'
import { acceptInvitation } from '../../services/api'
import { Alert } from '../../components/common/Alert'
import { useAuth } from '../../context/AuthContext'

export function AcceptInvitationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loadUserData } = useAuth()

  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => {
    const urlToken = searchParams.get('token')
    if (urlToken) setToken(urlToken)
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    const res = await acceptInvitation({
      token,
      password,
      confirm_password: confirmPassword
    })
    setLoading(false)

    if (res.ok && res.data?.success) {
      setSuccessMsg('Account activated successfully! Redirecting you to your campus workspace...')
      setTimeout(async () => {
        await loadUserData()
        navigate('/workspace')
      }, 1500)
    } else {
      setError(res.data?.error?.message || 'Invitation acceptance failed.')
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">Accept Staff Invitation</h2>
            <p className="text-xs text-slate-500 mt-1">Activate your staff account and set your password.</p>
          </div>
          <Link to="/" className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </Link>
        </div>

        {successMsg && <div className="mb-4"><Alert type="success" message={successMsg} /></div>}
        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invitation Token</label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste invitation token from email"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Establish Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm flex items-center justify-center space-x-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Activate Account & Enter Campus</span>}
          </button>
        </form>
      </div>
    </div>
  )
}

