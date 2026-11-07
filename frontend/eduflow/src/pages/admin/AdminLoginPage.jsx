import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Alert } from '../../components/common/Alert'

export function AdminLoginPage() {
  const { platformLogin } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await platformLogin(email, password)
    setLoading(false)

    if (result.ok) {
      navigate('/admin/dashboard')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-[#0B1120]">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-2xl text-white">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-white">Platform Administrator Portal</h2>
          <p className="text-xs text-slate-400 mt-1">Authorized Eduflow operations personnel only.</p>
          <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-amber-400 border border-amber-500/20">
            Route: /admin
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <Alert type="error" message={error} onClose={() => setError(null)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Administrative Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@eduflow.org"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Secure Passkey</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Authenticate Operator</span>}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <Link
            to="/"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1"
          >
            <span>← Back to Eduflow Public Website</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

