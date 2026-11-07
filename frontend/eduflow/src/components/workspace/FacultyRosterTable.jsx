import React from 'react'
import { Users } from 'lucide-react'

export function FacultyRosterTable({ members }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <h3 className="font-bold text-sm text-[#0F172A] pb-3 border-b border-slate-100 flex items-center gap-2">
        <Users className="w-4 h-4 text-[#3B82F6]" />
        <span>Campus Staff & Faculty Roster</span>
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 uppercase text-slate-500 font-bold bg-slate-50/50">
              <th className="py-3 px-4">Member Email</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Assigned Roles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!members || members.length === 0 ? (
              <tr>
                <td colSpan="3" className="py-8 text-center text-slate-400">
                  No staff members registered in this campus yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.user_id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-bold text-slate-900">{m.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        m.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {m.is_active ? 'Active' : 'Invited'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {m.roles.map((r) => (
                        <span
                          key={r}
                          className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200/50"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
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

