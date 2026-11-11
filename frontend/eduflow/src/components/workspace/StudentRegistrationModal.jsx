import React, { useState } from 'react'
import { X, UserPlus, AlertTriangle, CheckCircle2, GitMerge, ShieldAlert } from 'lucide-react'
import { registerStudent, mergeStudents, formatApiError } from '../../services/api'
import { Alert } from '../common/Alert'

export function StudentRegistrationModal({
  isOpen,
  onClose,
  schoolId,
  activeRole,
  years = [],
  groups = [],
  onSuccess
}) {
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [duplicateWarning, setDuplicateWarning] = useState(null)

  const activeYear = years.find(y => y.status === 'ACTIVE') || years[0]

  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    preferred_name: '',
    index_number: '',
    gender: 'MALE',
    date_of_birth: '',
    academic_year_id: activeYear ? activeYear.id : '',
    class_group_id: groups.length > 0 ? groups[0].id : '',
    primary_contact: {
      name: '',
      relationship: 'MOTHER',
      phone_primary: '',
      phone_secondary: '',
      email: '',
      notes: ''
    }
  })

  if (!isOpen) return null

  const handleSubmit = async (e, forceCreate = false) => {
    if (e) e.preventDefault()
    setLoading(true)
    setNotice(null)

    const payload = {
      ...form,
      force_create: forceCreate,
      class_group_id: form.class_group_id || null,
      academic_year_id: form.academic_year_id || null,
    }

    const res = await registerStudent(schoolId, payload, activeRole)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Student '${res.data.data.full_name}' registered successfully with admission #${res.data.data.admission_number}!` })
      setDuplicateWarning(null)
      setTimeout(() => {
        onSuccess && onSuccess(res.data.data)
        onClose()
      }, 1200)
    } else if (res.status === 409 && res.data?.data?.duplicate_matches) {
      setDuplicateWarning(res.data.data.duplicate_matches)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to register student.')
      })
    }
  }

  const handleMergeWithExisting = async (existingStudentId) => {
    setLoading(true)
    // Register temporary record first with force_create, then merge
    const createRes = await registerStudent(schoolId, { ...form, force_create: true }, activeRole)
    if (createRes.ok && createRes.data?.success) {
      const newStudentId = createRes.data.data.id
      const mergeRes = await mergeStudents(schoolId, {
        surviving_student_id: existingStudentId,
        merged_student_id: newStudentId,
        notes: 'Consolidated immediately upon registration after duplicate detection.'
      }, activeRole)

      setLoading(false)
      if (mergeRes.ok && mergeRes.data?.success) {
        setNotice({ type: 'success', message: 'Records successfully merged into surviving student profile!' })
        setTimeout(() => {
          onSuccess && onSuccess(mergeRes.data.data)
          onClose()
        }, 1200)
      } else {
        setNotice({ type: 'error', message: formatApiError(mergeRes, 'Failed to merge records.') })
      }
    } else {
      setLoading(false)
      setNotice({ type: 'error', message: formatApiError(createRes, 'Failed to process merge step.') })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3B82F6] flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Register New Student</h2>
              <p className="text-[11px] text-slate-500">
                System will generate a unique institutional admission number automatically.
              </p>
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

        {/* Duplicate Review Warning Box */}
        {duplicateWarning && duplicateWarning.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-800">
                  Possible Duplicate Student Detected
                </h4>
                <p className="text-xs text-amber-700 mt-0.5">
                  Scholora identified {duplicateWarning.length} existing record(s) matching your input signals.
                  Per security specification, you must explicitly choose to merge or retain both records:
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {duplicateWarning.map((cand) => (
                <div
                  key={cand.student_id}
                  className="p-3 bg-white/90 border border-amber-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{cand.full_name}</span>
                    <span className="ml-2 font-mono text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      {cand.admission_number}
                    </span>
                    {cand.index_number && (
                      <span className="ml-2 font-mono text-[11px] text-slate-500">
                        Idx: {cand.index_number}
                      </span>
                    )}
                    <div className="text-[11px] text-amber-800 mt-0.5 font-medium">
                      Signal: {cand.match_reason} (Score: {cand.match_score}%)
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMergeWithExisting(cand.student_id)}
                      disabled={loading}
                      className="px-2.5 py-1 text-[11px] font-bold rounded bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shadow-2xs"
                    >
                      <GitMerge className="w-3 h-3" />
                      <span>Merge Into This Record</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-amber-200">
              <span className="text-[11px] text-amber-700 font-medium">
                Not the same student? You may explicitly register them as a distinct identity:
              </span>
              <button
                type="button"
                onClick={() => handleSubmit(null, true)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
              >
                Keep Both & Continue Registration
              </button>
            </div>
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
          {/* Section 1: Student Demographics */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              1. Student Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="e.g. Kwame"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Middle Name</label>
                <input
                  type="text"
                  value={form.middle_name}
                  onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                  placeholder="e.g. Kofi"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="e.g. Mensah"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">School Index No. (Optional)</label>
                <input
                  type="text"
                  value={form.index_number}
                  onChange={(e) => setForm({ ...form, index_number: e.target.value })}
                  placeholder="e.g. IDX-2026-001"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Mandatory Primary Contact */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
              <span>2. Mandatory Primary Guardian / Emergency Contact</span>
              <span className="text-[10px] text-rose-500 font-bold lowercase">Required by policy</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Guardian Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.primary_contact.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primary_contact: { ...form.primary_contact, name: e.target.value }
                    })
                  }
                  placeholder="e.g. Grace Mensah"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Relationship *</label>
                <select
                  value={form.primary_contact.relationship}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primary_contact: { ...form.primary_contact, relationship: e.target.value }
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                >
                  <option value="MOTHER">Mother</option>
                  <option value="FATHER">Father</option>
                  <option value="GUARDIAN">Legal Guardian</option>
                  <option value="SIBLING">Sibling</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Primary Phone *</label>
                <input
                  type="tel"
                  required
                  value={form.primary_contact.phone_primary}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primary_contact: { ...form.primary_contact, phone_primary: e.target.value }
                    })
                  }
                  placeholder="e.g. +233241234567"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  value={form.primary_contact.email}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primary_contact: { ...form.primary_contact, email: e.target.value }
                    })
                  }
                  placeholder="guardian@example.com"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Secondary Phone (Optional)</label>
                <input
                  type="tel"
                  value={form.primary_contact.phone_secondary}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      primary_contact: { ...form.primary_contact, phone_secondary: e.target.value }
                    })
                  }
                  placeholder="e.g. +233200000000"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Class Placement */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              3. Immediate Class Placement & Enrollment
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Academic Year</label>
                <select
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.status === 'ACTIVE' ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Class Stream Group</label>
                <select
                  value={form.class_group_id}
                  onChange={(e) => setForm({ ...form, class_group_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
                >
                  <option value="">Do not place yet (Unassigned)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-[#3B82F6] hover:bg-blue-600 text-white rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{loading ? 'Processing...' : 'Register & Enroll Student'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

