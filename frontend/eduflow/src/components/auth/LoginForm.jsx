import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Alert } from '../common/Alert'

export function LoginForm({ onSuccess, onForgotPassword }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await login(email, password)
    setLoading(false)

    if (result.ok) {
      if (onSuccess) onSuccess(result.user)
      if (result.user.is_platform_operator) {
        navigate('/admin/dashboard')
      } else if (result.user.memberships?.school_id) {
        navigate('/workspace')
      } else {
        navigate('/school-register')
      }
    } else {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="proprietor@school.edu.gh"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] text-sm"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-semibold text-slate-700">Password</label>
          {onForgotPassword ? (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-[#3B82F6] hover:underline"
            >
              Forgot password?
            </button>
          ) : (
            <Link to="/forgot-password" className="text-xs text-[#3B82F6] hover:underline">
              Forgot password?
            </Link>
          )}
        </div>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center space-x-2"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Sign In</span>}
      </button>
    </form>
  )
}

