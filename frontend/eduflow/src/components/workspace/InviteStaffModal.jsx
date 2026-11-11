import React, { useState } from 'react'
import { X, Mail, RefreshCw, ShieldCheck } from 'lucide-react'

export function InviteStaffModal({ isOpen, onClose, onInvite, loading }) {
  const [email, setEmail] = useState('')
  const [validationError, setValidationError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError('')
    const cleanEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(cleanEmail)) {
      setValidationError('Please enter a valid staff email address (e.g. teacher@school.edu.gh).')
      return
    }
    // All staff automatically inherit SUBJECT_TEACHER; roles can be customized in the Staff Roster tab
    onInvite(cleanEmail, 'SUBJECT_TEACHER')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-extrabold text-base text-[#0F172A]">Invite Campus Staff Member</h3>
            <p className="text-xs text-slate-500 mt-0.5">Send a secure cryptographic onboarding invitation.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {validationError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            {validationError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Member Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (validationError) setValidationError('')
              }}
              placeholder="staff@school.edu.gh"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-[#3B82F6]" />
              <span>Universal Staff Role Inheritance</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              All invited personnel automatically inherit the foundational <strong>Subject Teacher</strong> role. Additional operational roles (such as <strong>Class Teacher</strong> or <strong>Accountant</strong>) can be designated directly from the <strong>Staff & Governance</strong> tab.
            </p>
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
              className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
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
