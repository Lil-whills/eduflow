import React, { useState, useEffect } from 'react'
import { X, User, Phone, Mail, Calendar, ShieldCheck, History, LogOut } from 'lucide-react'
import { fetchStudentDetail, withdrawStudentEnrollment, formatApiError } from '../../services/api'
import { Alert } from '../common/Alert'

export function StudentProfileModal({
  isOpen,
  onClose,
  schoolId,
  studentId,
  activeRole,
  canEdit,
  onUpdated
}) {
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  const loadData = async () => {
    if (!studentId || !schoolId) return
    setLoading(true)
    const res = await fetchStudentDetail(schoolId, studentId, activeRole)
    setLoading(false)
    if (res.ok && res.data?.success) {
      setStudent(res.data.data)
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to load student profile.') })
    }
  }

  useEffect(() => {
    if (isOpen && studentId) {
      loadData()
    }
  }, [isOpen, studentId, schoolId, activeRole])

  if (!isOpen) return null

  const handleWithdraw = async (e) => {
    e.preventDefault()
    if (!selectedEnrollmentId || !withdrawReason.trim()) return
    setWithdrawLoading(true)
    const res = await withdrawStudentEnrollment(
      schoolId,
      selectedEnrollmentId,
      { reason: withdrawReason.trim() },
      activeRole
    )
    setWithdrawLoading(false)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Student enrollment withdrawn successfully.' })
      setWithdrawModalOpen(false)
      setWithdrawReason('')
      loadData()
      onUpdated && onUpdated()
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to withdraw enrollment.') })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center font-bold text-lg">
              {student ? student.first_name[0] : 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#0F172A]">
                  {student?.full_name || 'Student Profile'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    student?.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {student?.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 font-mono">
                <span>Admission No: <strong className="text-blue-700">{student?.admission_number}</strong></span>
                {student?.index_number && <span>Index: <strong>{student.index_number}</strong></span>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && (
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        )}

        {loading && !student ? (
          <div className="py-12 text-center text-slate-400 text-xs">Loading profile records...</div>
        ) : (
          <div className="space-y-6">
            {/* Demographics Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Gender</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student?.gender || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Date of Birth</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student?.date_of_birth || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Admission Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student?.admission_date || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Preferred Name</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student?.preferred_name || 'N/A'}</p>
              </div>
            </div>

            {/* Guardians & Emergency Contacts */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Guardian & Emergency Contacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {student?.contacts?.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{c.name}</span>
                      {c.is_primary && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-1">
                      <p className="font-medium text-slate-500">Relationship: <span className="text-slate-800 font-bold">{c.relationship}</span></p>
                      <p className="flex items-center gap-1.5 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{c.phone_primary}</span>
                        {c.phone_secondary && <span className="text-slate-400">/ {c.phone_secondary}</span>}
                      </p>
                      {c.email && (
                        <p className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{c.email}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Class Placement & Enrollments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span>Enrollment History & Placement</span>
                </h3>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">Academic Year</th>
                      <th className="p-3">Class Group</th>
                      <th className="p-3">Start Date</th>
                      <th className="p-3">Status</th>
                      {canEdit && <th className="p-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {student?.enrollments?.length === 0 ? (
                      <tr>
                        <td colSpan={canEdit ? 5 : 4} className="p-4 text-center text-slate-400 italic">
                          No placement records.
                        </td>
                      </tr>
                    ) : (
                      student?.enrollments?.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">{e.academic_year_name}</td>
                          <td className="p-3 font-bold text-blue-700">{e.class_group_name}</td>
                          <td className="p-3 font-mono text-slate-600 text-[11px]">{e.start_date}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                e.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : e.status === 'WITHDRAWN'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {e.status}
                            </span>
                            {e.withdrawal_reason && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">{e.withdrawal_reason}</p>
                            )}
                          </td>
                          {canEdit && (
                            <td className="p-3 text-right">
                              {e.status === 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedEnrollmentId(e.id)
                                    setWithdrawModalOpen(true)
                                  }}
                                  className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                                >
                                  Withdraw
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw Reason Modal */}
        {withdrawModalOpen && (
          <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5 text-rose-600">
                <LogOut className="w-4 h-4" />
                <span>Withdraw Student Enrollment</span>
              </h4>
              <p className="text-xs text-slate-500">
                Per data-integrity rules, withdrawal preserves historical academic placements. Please record the official reason.
              </p>
              <form onSubmit={handleWithdraw} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Withdrawal *</label>
                  <textarea
                    required
                    rows="3"
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                    placeholder="e.g. Relocating to another district, transferred school..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setWithdrawModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={withdrawLoading}
                    className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs"
                  >
                    {withdrawLoading ? 'Processing...' : 'Confirm Withdrawal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xs"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  )
}

