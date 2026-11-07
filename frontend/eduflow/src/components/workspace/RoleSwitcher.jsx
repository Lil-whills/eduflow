import React from 'react'
import { ShieldCheck } from 'lucide-react'

export function RoleSwitcher({ assignedRoles, activeRole, onSelectRole }) {
  if (!assignedRoles || assignedRoles.length === 0) return null

  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-1 text-slate-500 text-xs font-semibold">
        <ShieldCheck className="w-3.5 h-3.5 text-[#3B82F6]" />
        <span>Active Operational Context:</span>
      </div>
      <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200">
        {assignedRoles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onSelectRole(role)}
            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
              activeRole === role
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  )
}

