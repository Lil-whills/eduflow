import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Alert } from '../common/Alert'

export function RegisterForm({ onSuccess }) {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await register(firstName, lastName, email, password, confirmPassword)
    setLoading(false)

    if (result.ok) {
      if (onSuccess) onSuccess(result.user)
      navigate('/school-register')
    } else {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Kwame"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Mensah"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kwame.mensah@gmail.com"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 characters"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
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
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center space-x-2 mt-4"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Create Account</span>}
      </button>
    </form>
  )
}

