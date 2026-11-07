import React from 'react'

export function PlatformStatsGrid({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Schools</span>
        <p className="text-2xl font-black text-[#0F172A] mt-2">{stats?.total_schools || 0}</p>
        <span className="text-[11px] text-emerald-600 font-medium">Workspaces Managed</span>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Review</span>
        <p className="text-2xl font-black text-amber-600 mt-2">{stats?.pending_requests || 0}</p>
        <span className="text-[11px] text-slate-500 font-medium">Awaiting Inspection</span>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Campuses</span>
        <p className="text-2xl font-black text-[#3B82F6] mt-2">{stats?.active_schools || 0}</p>
        <span className="text-[11px] text-slate-500 font-medium">Live Operational</span>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Users</span>
        <p className="text-2xl font-black text-slate-900 mt-2">{stats?.total_users || 0}</p>
        <span className="text-[11px] text-slate-500 font-medium">Platform Identities</span>
      </div>
    </div>
  )
}

