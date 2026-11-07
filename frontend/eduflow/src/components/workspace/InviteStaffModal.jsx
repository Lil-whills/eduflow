import React, { useState } from 'react'
import { X, Mail, RefreshCw } from 'lucide-react'

export function InviteStaffModal({ isOpen, onClose, onInvite, loading }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('CLASS_TEACHER')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) return
    onInvite(email.trim().toLowerCase(), role)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-extrabold text-base text-[#0F172A]">Invite Campus Staff Member</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send a secure cryptographic activation invite.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Member Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.edu.gh"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Operational Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            >
              <option value="CLASS_TEACHER">Class Teacher</option>
              <option value="SUBJECT_TEACHER">Subject Teacher</option>
              <option value="HEADMASTER">Headmaster / Headmistress</option>
              <option value="ACCOUNTANT">Accountant / Bursar</option>
              <option value="ADMINISTRATOR">School Administrator</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              <span>Send Invitation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

