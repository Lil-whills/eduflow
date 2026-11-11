import React, { useState } from 'react'
import { Sparkles, UserPlus, RefreshCw } from 'lucide-react'

export function InitialAdminWizard({ onAssignAdmin, loading }) {
  const [adminEmail, setAdminEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!adminEmail.trim()) return
    onAssignAdmin(adminEmail.trim().toLowerCase())
  }

  return (
    <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent p-6 rounded-2xl border border-blue-200">
      <div className="max-w-2xl space-y-3">
        <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
          <Sparkles className="w-3 h-3 text-[#3B82F6]" />
          <span>Proprietor Onboarding Wizard</span>
        </div>
        <h3 className="text-lg font-extrabold text-[#0F172A]">Assign Your First School Administrator</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          As Proprietor, you hold sovereign ownership. Ghanaian education governance and security protocols require appointing an active Administrator (you may assign yourself or your headteacher) to finalize campus activation.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 pt-2">
          <input
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@school.edu.gh"
            className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-sm flex items-center justify-center space-x-1.5"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>Assign First Administrator</span>
          </button>
        </form>
        <p className="text-[11px] text-slate-500 italic">
          If appointing a separate headmaster/admin, they can activate via the email link or by clicking &quot;Create Account&quot; with this email address.
        </p>
      </div>
    </div>
  )
}

