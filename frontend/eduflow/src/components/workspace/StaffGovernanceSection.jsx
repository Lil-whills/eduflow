import React, { useState, useEffect } from 'react'
import { Users, UserX, ShieldCheck, AlertTriangle, Crown, RefreshCw, Mail, Calendar, UserCheck, CheckSquare, Square } from 'lucide-react'
import {
  fetchSchoolStaff,
  dismissStaffMember,
  reassignAdministrator,
  updateMemberRoles,
  formatApiError
} from '../../services/api'
import { Alert } from '../common/Alert'

export function StaffGovernanceSection({ schoolId, activeRole, canEdit, isProprietor }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Modals
  const [dismissModalOpen, setDismissModalOpen] = useState(false)
  const [manageRolesModalOpen, setManageRolesModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [selectedRoles, setSelectedRoles] = useState(['SUBJECT_TEACHER'])
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
        message: formatApiError(res, 'Failed to dismiss staff member.')
      })
    }
  }

  const handleReassignAdmin = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    const res = await reassignAdministrator(schoolId, newAdminEmail, activeRole)
    setActionLoading(false)

    if (res.ok && res.data?.success) {
      const inviteUrl = res.data?.data?.invitation_url
      setNotice({
        type: 'success',
        message: inviteUrl
          ? `Administrator successfully reassigned to ${newAdminEmail}! Prior administrator sessions have been terminated. The new administrator can activate via the email link or simply click "Create Account" with this email to establish their password.`
          : (res.data.data.message || 'Administrator role reassigned successfully.')
      })
      setReassignModalOpen(false)
      setNewAdminEmail('')
      loadStaff()
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to reassign administrator.')
      })
    }
  }

  const openManageRolesModal = (member) => {
    setSelectedMember(member)
    const currentRoles = member.roles || []
    // Ensure SUBJECT_TEACHER is always included
    const rolesSet = new Set(currentRoles)
    rolesSet.add('SUBJECT_TEACHER')
    setSelectedRoles(Array.from(rolesSet))
    setManageRolesModalOpen(true)
  }

  const toggleRoleSelection = (roleName) => {
    // SUBJECT_TEACHER is foundational and cannot be unchecked
    if (roleName === 'SUBJECT_TEACHER') return

    if (selectedRoles.includes(roleName)) {
      setSelectedRoles(selectedRoles.filter(r => r !== roleName))
    } else {
      setSelectedRoles([...selectedRoles, roleName])
    }
  }

  const handleSaveRoles = async (e) => {
    e.preventDefault()
    if (!selectedMember) return
    setActionLoading(true)
    const res = await updateMemberRoles(schoolId, selectedMember.id, selectedRoles, activeRole)
    setActionLoading(false)

    if (res.ok && res.data?.success) {
      setNotice({
        type: 'success',
        message: `Roles updated for ${selectedMember.full_name || selectedMember.email}.`
      })
      setManageRolesModalOpen(false)
      setSelectedMember(null)
      loadStaff()
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to update member roles.')
      })
    }
  }

  const currentAdmin = staff.find(m => m.status === 'ACTIVE' && m.roles?.includes('ADMINISTRATOR'))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#3B82F6]" />
            Staff Governance & Employment Security
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Faculty roster, centralized multi-role assignment (Class Teacher, Accountant), and remote dismissal session termination.
          </p>
        </div>

        {isProprietor && (
          <button
            onClick={() => setReassignModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentAdmin ? 'Reassign Administrator' : 'Appoint Administrator'}</span>
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
        <div className="p-4 bg-amber-50/60 border-b border-amber-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-start gap-3">
            <Crown className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-bold">Proprietor Sovereign Governance & Data Continuity:</span>
              {currentAdmin ? (
                <p className="mt-0.5 text-amber-800">
                  Current Operational Administrator: <strong>{currentAdmin.full_name}</strong> ({currentAdmin.email}). If you reassign or replace this administrator, their active session is severed immediately, but all classes, terms, subjects, and records they configured remain 100% intact for the new administrator.
                </p>
              ) : (
                <p className="mt-0.5 text-amber-800">
                  No active School Administrator currently assigned. Click <strong>"Appoint Administrator"</strong> to grant administrative permissions to your headmaster or administrator.
                </p>
              )}
            </div>
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
                  <th className="p-3">Active Roles</th>
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
                                    : r === 'ACCOUNTANT'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                    : r === 'CLASS_TEACHER'
                                    ? 'bg-indigo-100 text-indigo-900'
                                    : 'bg-blue-50 text-blue-800'
                                }`}
                              >
                                {r.replace(/_/g, ' ')}
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
                          <div className="flex items-center justify-end gap-1.5">
                            {!isMemberProprietor && !isRevoked && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openManageRolesModal(member)}
                                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-300 inline-flex items-center gap-1 transition-colors"
                                >
                                  <UserCheck className="w-3 h-3 text-[#3B82F6]" />
                                  <span>Manage Roles</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMember(member)
                                    setDismissModalOpen(true)
                                  }}
                                  className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200 inline-flex items-center gap-1 transition-colors"
                                >
                                  <UserX className="w-3 h-3" />
                                  <span>Dismiss</span>
                                </button>
                              </>
                            )}
                            {isMemberProprietor && (
                              <span className="text-[10px] font-bold text-amber-600 italic">Sovereign Owner</span>
                            )}
                            {isRevoked && (
                              <span className="text-[10px] text-slate-400 font-semibold">Access Revoked</span>
                            )}
                          </div>
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

      {/* Centralized Manage Roles Modal */}
      {manageRolesModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-[#3B82F6] flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Centralized Role Assignment</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure operational roles for <span className="font-bold text-slate-800">{selectedMember.full_name}</span> ({selectedMember.email})
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
              <strong>Ghanaian Basic School Role Architecture:</strong>
              <p className="mt-1 text-blue-800">
                All staff members automatically retain foundational <strong>Subject Teacher</strong> status. Check additional operational duties below:
              </p>
            </div>

            <form onSubmit={handleSaveRoles} className="space-y-3">
              {/* Subject Teacher: Always active & inherited */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-slate-900">Subject Teacher</span>
                  <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">Universal / Inherited</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Foundational teaching syllabus delivery across classes and subjects.
                  </p>
                </div>
              </div>

              {/* Class Teacher Checkbox */}
              <div
                onClick={() => toggleRoleSelection('CLASS_TEACHER')}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedRoles.includes('CLASS_TEACHER')
                    ? 'border-indigo-300 bg-indigo-50/40'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {selectedRoles.includes('CLASS_TEACHER') ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-xs font-bold text-slate-900">Class Teacher</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Primary or assistant form teacher assigned to lead a specific class stream group and student cohorts.
                  </p>
                </div>
              </div>

              {/* Accountant Checkbox */}
              <div
                onClick={() => toggleRoleSelection('ACCOUNTANT')}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedRoles.includes('ACCOUNTANT')
                    ? 'border-emerald-300 bg-emerald-50/40'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {selectedRoles.includes('ACCOUNTANT') ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-xs font-bold text-slate-900">Accountant / Bursar</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Student fee billing, tuition collections, payment receipts, and school financial ledgers.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setManageRolesModalOpen(false)
                    setSelectedMember(null)
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Saving Roles...' : 'Save Role Assignments'}
                </button>
              </div>
            </form>
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
              </ul>
            </div>

            <form onSubmit={handleDismiss} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Dismissal</label>
                <textarea
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  placeholder="e.g. Resignation, contract expiration, or administrative termination..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                  rows={3}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDismissModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Revoking Access...' : 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Administrator Modal */}
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

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1">
              <span className="font-bold">Data Permanence & Seamless Handover:</span>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                <li>All classes, streams, subjects, and terms remain 100% active and untouched.</li>
                <li>Teaching assignments and staff rosters remain intact.</li>
                <li>The previous administrator's remote sessions and tokens are terminated immediately.</li>
                <li>The new administrator logs in and seamlessly continues where the predecessor left off.</li>
              </ul>
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
                  The previous Administrator's active administrator role and login sessions will be terminated immediately.
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
