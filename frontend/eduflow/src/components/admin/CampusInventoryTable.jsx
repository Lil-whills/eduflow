import React from 'react'

export function CampusInventoryTable({ schools, onSuspend, onReactivate }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div>
        <h3 className="font-extrabold text-base text-[#0F172A]">Registered Campus Workspaces</h3>
        <p className="text-xs text-slate-500">Global tenant registry and workspace health status.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 uppercase text-slate-500 font-bold bg-slate-50/50">
              <th className="py-3 px-4">School Name</th>
              <th className="py-3 px-4">Slug / Identifier</th>
              <th className="py-3 px-4">Workspace Status</th>
              <th className="py-3 px-4 text-right">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schools.length === 0 ? (
              <tr>
                <td colSpan="4" className="py-8 text-center text-slate-400">
                  No active schools registered yet.
                </td>
              </tr>
            ) : (
              schools.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{s.slug}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        s.workspace_status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.workspace_status === 'ONBOARDING'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {s.workspace_status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {s.workspace_status === 'ACTIVE' ? (
                      <button
                        onClick={() => onSuspend(s.id)}
                        className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-[11px] border border-amber-200"
                      >
                        Suspend
                      </button>
                    ) : s.workspace_status === 'SUSPENDED' ? (
                      <button
                        onClick={() => onReactivate(s.id)}
                        className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] border border-emerald-200"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Onboarding</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

