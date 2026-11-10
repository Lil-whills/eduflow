import React, { useState, useEffect } from 'react'
import { Users, UserX, ShieldCheck, AlertTriangle, Crown, RefreshCw, Mail, Calendar } from 'lucide-react'
import {
  fetchSchoolStaff,
  dismissStaffMember,
  reassignAdministrator
} from '../../services/api'
import { Alert } from '../common/Alert'

export function StaffGovernanceSection({ schoolId, activeRole, canEdit, isProprietor }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Modals
  const [dismissModalOpen, setDismissModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [dismissReason, setDismissReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Reassign Admin modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')

  const loadStaff = async () => {
    if (!schoolId) return
    setLoading(true)
    const res = await fetchSchoolStaff(schoolId, activeRole)
    if (res.ok && res.data?.success) {
      setStaff(res.data.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadStaff()
  }, [schoolId, activeRole])

  const handleDismiss = async (e) => {
    e.preventDefault()
    if (!selectedMember) return
    setActionLoading(true)
    const res = await dismissStaffMember(schoolId, selectedMember.id, dismissReason, activeRole)
    setActionLoading(false)

    if (res.ok && res.data?.success) {
      setNotice({
        type: 'success',
        message: res.data.data.message || `Staff member dismissed. All sessions and remote tokens terminated.`
      })
      setDismissModalOpen(false)
      setSelectedMember(null)
      setDismissReason('')
      loadStaff()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to dismiss staff member.'
      })
    }
  }

  const handleReassignAdmin = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const res = await reassignAdministrator(schoolId, newAdminEmail, activeRole)
    setActionLoading(false)

    if (res.ok && res.data?.success) {
      setNotice({
        type: 'success',
        message: res.data.data.message || 'Administrator role reassigned successfully.'
      })
      setReassignModalOpen(false)
      setNewAdminEmail('')
      loadStaff()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to reassign administrator.'
      })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#3B82F6]" />
            Staff Governance & Employment Security
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Role assignments, dismissal guardrails, and cryptographic session termination for former employees.
          </p>
        </div>

        {isProprietor && (
          <button
            onClick={() => setReassignModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>Reassign Administrator</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {/* Sovereign Proprietor Info Box */}
      {isProprietor && (
        <div className="p-4 bg-amber-50/60 border-b border-amber-100 flex items-start gap-3">
          <Crown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <span className="font-bold">Proprietor Sovereign Authority:</span>
            <p className="mt-0.5 text-amber-800">
              As the School Proprietor, you hold permanent ownership authority over this workspace. Administrators
              and staff may be dismissed or replaced at any time. When an administrator is dismissed or reassigned,
              their session is severed immediately, preventing any home/remote access.
            </p>
          </div>
        </div>
      )}

      {loading && staff.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading faculty roster...</div>
      ) : (
        <div className="p-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Roles</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Joined Date</th>
                  {canEdit && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((member) => {
                  const isMemberProprietor = member.roles?.includes('PROPRIETOR')
                  const isRevoked = member.status === 'REVOKED'

                  return (
                    <tr
                      key={member.id}
                      className={isRevoked ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/50'}
                    >
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{member.full_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{member.email}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {member.roles && member.roles.length > 0 ? (
                            member.roles.map((r) => (
                              <span
                                key={r}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r === 'PROPRIETOR'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                    : r === 'ADMINISTRATOR'
                                    ? 'bg-purple-100 text-purple-900'
                                    : 'bg-blue-50 text-blue-800'
                                }`}
                              >
                                {r}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No active roles</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            member.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      {canEdit && (
                        <td className="p-3 text-right">
                          {!isMemberProprietor && !isRevoked && (
                            <button
                              onClick={() => {
                                setSelectedMember(member)
                                setDismissModalOpen(true)
                              }}
                              className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200 inline-flex items-center gap-1 transition-colors"
                            >
                              <UserX className="w-3 h-3" />
                              <span>Dismiss</span>
                            </button>
                          )}
                          {isMemberProprietor && (
                            <span className="text-[10px] font-bold text-amber-600 italic">Sovereign Owner</span>
                          )}
                          {isRevoked && (
                            <span className="text-[10px] text-slate-400 font-semibold">Access Revoked</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dismiss Staff Modal */}
      {dismissModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Dismiss Staff Member</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Terminating employment for <span className="font-bold text-slate-800">{selectedMember.full_name}</span> ({selectedMember.email})
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-900 text-xs space-y-1">
              <span className="font-bold">Security Enforcement:</span>
              <ul className="list-disc list-inside space-y-0.5 text-rose-800">
                <li>Membership transitioned to <strong>REVOKED</strong></li>
                <li>All active roles & teaching assignments ended immediately</li>
                <li><strong>All active sessions & refresh tokens revoked</strong></li>
                <li>Token version incremented — <strong>cannot access system from home</strong></li>
                <li>Historical audit logs and records remain immutable</li>
              </ul>
            </div>

            <form onSubmit={handleDismiss} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Dismissal</label>
                <textarea
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  placeholder="e.g. Contract expired, resigned, policy violation..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDismissModalOpen(false)
                    setSelectedMember(null)
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Terminating Access...' : 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sovereign Admin Reassignment Modal */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Reassign Administrator</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sovereign Proprietor Action: transfers primary administrator duties to a new email account.
                </p>
              </div>
            </div>

            <form onSubmit={handleReassignAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Administrator Email</label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin.new@school.edu.gh"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  The previous Administrator's active administrator role will be deactivated immediately.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs bg-[#0F172A] hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

