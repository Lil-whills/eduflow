import React, { useState, useEffect } from 'react'
import { GraduationCap, BookOpen, Plus, UserCheck, XCircle, AlertCircle } from 'lucide-react'
import {
  fetchAcademicYears,
  fetchClassGroups,
  fetchSubjects,
  fetchSchoolStaff,
  fetchClassTeacherAssignments,
  assignClassTeacher,
  endClassTeacherAssignment,
  fetchSubjectTeacherAssignments,
  assignSubjectTeacher,
  endSubjectTeacherAssignment,
  formatApiError
} from '../../services/api'
import { Alert } from '../common/Alert'

export function TeachingAssignmentsSection({ schoolId, activeRole, canEdit }) {
  const [subTab, setSubTab] = useState('CLASS_TEACHERS') // 'CLASS_TEACHERS' | 'SUBJECT_TEACHERS'
  const [classAssignments, setClassAssignments] = useState([])
  const [subjectAssignments, setSubjectAssignments] = useState([])
  const [years, setYears] = useState([])
  const [groups, setGroups] = useState([])
  const [subjects, setSubjects] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Filters
  const [selectedYearId, setSelectedYearId] = useState('')

  // Modals
  const [assignClassTeacherOpen, setAssignClassTeacherOpen] = useState(false)
  const [assignSubjectTeacherOpen, setAssignSubjectTeacherOpen] = useState(false)

  const [classTeacherForm, setClassTeacherForm] = useState({
    academic_year_id: '',
    class_group_id: '',
    teacher_membership_id: '',
    is_primary: true
  })

  const [subjectTeacherForm, setSubjectTeacherForm] = useState({
    academic_year_id: '',
    class_group_id: '',
    subject_id: '',
    teacher_membership_id: ''
  })

  const loadPrerequisites = async () => {
    if (!schoolId) return
    setLoading(true)
    const [yRes, gRes, sRes, staffRes] = await Promise.all([
      fetchAcademicYears(schoolId, activeRole),
      fetchClassGroups(schoolId, activeRole),
      fetchSubjects(schoolId, activeRole),
      fetchSchoolStaff(schoolId, activeRole)
    ])

    if (yRes.ok && yRes.data?.success) {
      const yList = yRes.data.data || []
      setYears(yList)
      const activeYear = yList.find(y => y.status === 'ACTIVE') || yList[0]
      if (activeYear) {
        setSelectedYearId(activeYear.id)
        setClassTeacherForm(prev => ({ ...prev, academic_year_id: activeYear.id }))
        setSubjectTeacherForm(prev => ({ ...prev, academic_year_id: activeYear.id }))
      }
    }
    if (gRes.ok && gRes.data?.success) {
      const gList = gRes.data.data || []
      setGroups(gList)
      if (gList.length > 0) {
        setClassTeacherForm(prev => ({ ...prev, class_group_id: gList[0].id }))
        setSubjectTeacherForm(prev => ({ ...prev, class_group_id: gList[0].id }))
      }
    }
    if (sRes.ok && sRes.data?.success) {
      const sList = sRes.data.data || []
      setSubjects(sList)
      if (sList.length > 0) {
        setSubjectTeacherForm(prev => ({ ...prev, subject_id: sList[0].id }))
      }
    }
    if (staffRes.ok && staffRes.data?.success) {
      setStaff(staffRes.data.data || [])
    }

    setLoading(false)
  }

  const loadAssignments = async (yearId) => {
    const filters = yearId ? { academic_year_id: yearId } : {}
    const [cRes, sRes] = await Promise.all([
      fetchClassTeacherAssignments(schoolId, filters, activeRole),
      fetchSubjectTeacherAssignments(schoolId, filters, activeRole)
    ])

    if (cRes.ok && cRes.data?.success) {
      setClassAssignments(cRes.data.data || [])
    }
    if (sRes.ok && sRes.data?.success) {
      setSubjectAssignments(sRes.data.data || [])
    }
  }

  useEffect(() => {
    loadPrerequisites()
  }, [schoolId, activeRole])

  useEffect(() => {
    if (selectedYearId) {
      loadAssignments(selectedYearId)
    }
  }, [selectedYearId, schoolId, activeRole])

  const handleAssignClassTeacher = async (e) => {
    e.preventDefault()
    const res = await assignClassTeacher(schoolId, classTeacherForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Class teacher assigned successfully.' })
      setAssignClassTeacherOpen(false)
      loadAssignments(selectedYearId)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to assign class teacher. Verify teacher role.')
      })
    }
  }

  const handleAssignSubjectTeacher = async (e) => {
    e.preventDefault()
    const res = await assignSubjectTeacher(schoolId, subjectTeacherForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Subject teacher assigned successfully.' })
      setAssignSubjectTeacherOpen(false)
      loadAssignments(selectedYearId)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to assign subject teacher. Verify subject availability.')
      })
    }
  }

  const handleEndClassTeacher = async (assignmentId) => {
    const res = await endClassTeacherAssignment(schoolId, assignmentId, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Assignment ended.' })
      loadAssignments(selectedYearId)
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to end assignment.'
      })
    }
  }

  const handleEndSubjectTeacher = async (assignmentId) => {
    const res = await endSubjectTeacherAssignment(schoolId, assignmentId, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Assignment ended.' })
      loadAssignments(selectedYearId)
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to end assignment.'
      })
    }
  }

  // All active school staff members are eligible for teaching assignments
  const eligibleClassTeachers = staff.filter(m => m.status === 'ACTIVE')
  const eligibleSubjectTeachers = staff.filter(m => m.status === 'ACTIVE')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#3B82F6]" />
            Teaching Assignments & Rostering
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Assign primary class teachers and subject specialist teachers per class group and academic year.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} {y.status === 'ACTIVE' ? '(Active)' : ''}
              </option>
            ))}
          </select>

          {canEdit && (
            <button
              onClick={() => {
                if (subTab === 'CLASS_TEACHERS') setAssignClassTeacherOpen(true)
                else setAssignSubjectTeacherOpen(true)
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{subTab === 'CLASS_TEACHERS' ? 'Assign Class Teacher' : 'Assign Subject Teacher'}</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {/* Sub-tabs header */}
      <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-3 gap-6">
        <button
          onClick={() => setSubTab('CLASS_TEACHERS')}
          className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            subTab === 'CLASS_TEACHERS'
              ? 'border-[#3B82F6] text-[#3B82F6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Class Teachers ({classAssignments.filter(a => a.status === 'ACTIVE').length} Active)</span>
        </button>
        <button
          onClick={() => setSubTab('SUBJECT_TEACHERS')}
          className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            subTab === 'SUBJECT_TEACHERS'
              ? 'border-[#3B82F6] text-[#3B82F6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Subject Teachers ({subjectAssignments.filter(a => a.status === 'ACTIVE').length} Active)</span>
        </button>
      </div>

      <div className="p-6">
        {subTab === 'CLASS_TEACHERS' ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">Class Group</th>
                  <th className="p-3">Class Teacher</th>
                  <th className="p-3">Role Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Assigned Date</th>
                  {canEdit && <th className="p-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="p-6 text-center text-slate-400 italic">
                      No class teachers assigned for this academic year.
                    </td>
                  </tr>
                ) : (
                  classAssignments.map((a) => (
                    <tr
                      key={a.id}
                      className={a.status === 'ENDED' ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/50'}
                    >
                      <td className="p-3 font-bold text-slate-800">{a.class_group_name}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{a.teacher_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{a.teacher_email}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                          {a.is_primary ? 'Primary Class Teacher' : 'Assistant'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : 'N/A'}
                      </td>
                      {canEdit && (
                        <td className="p-3 text-right">
                          {a.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleEndClassTeacher(a.id)}
                              className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                            >
                              End Assignment
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
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">Class Group</th>
                  <th className="p-3">Subject</th>
                  <th className="p-3">Teacher</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Assigned Date</th>
                  {canEdit && <th className="p-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="p-6 text-center text-slate-400 italic">
                      No subject teachers assigned for this academic year.
                    </td>
                  </tr>
                ) : (
                  subjectAssignments.map((a) => (
                    <tr
                      key={a.id}
                      className={a.status === 'ENDED' ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/50'}
                    >
                      <td className="p-3 font-bold text-slate-800">{a.class_group_name}</td>
                      <td className="p-3 font-semibold text-slate-900">{a.subject_name}</td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{a.teacher_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{a.teacher_email}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : 'N/A'}
                      </td>
                      {canEdit && (
                        <td className="p-3 text-right">
                          {a.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleEndSubjectTeacher(a.id)}
                              className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                            >
                              End Assignment
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
        )}
      </div>

      {/* Assign Class Teacher Modal */}
      {assignClassTeacherOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Assign Class Teacher</h3>
            <form onSubmit={handleAssignClassTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Group</label>
                <select
                  value={classTeacherForm.class_group_id}
                  onChange={(e) => setClassTeacherForm({ ...classTeacherForm, class_group_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Teacher</label>
                <select
                  value={classTeacherForm.teacher_membership_id}
                  onChange={(e) => setClassTeacherForm({ ...classTeacherForm, teacher_membership_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  <option value="">Select teacher...</option>
                  {eligibleClassTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.email} ({t.email})
                    </option>
                  ))}
                </select>
                {eligibleClassTeachers.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No active staff members found in the school roster. Invite staff first.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="primary_chk"
                  checked={classTeacherForm.is_primary}
                  onChange={(e) => setClassTeacherForm({ ...classTeacherForm, is_primary: e.target.checked })}
                  className="rounded text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <label htmlFor="primary_chk" className="text-xs font-bold text-slate-700">
                  Primary Class Teacher (replaces any previous primary teacher)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignClassTeacherOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={eligibleClassTeachers.length === 0}
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  Assign Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Subject Teacher Modal */}
      {assignSubjectTeacherOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Assign Subject Teacher</h3>
            <form onSubmit={handleAssignSubjectTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Group</label>
                <select
                  value={subjectTeacherForm.class_group_id}
                  onChange={(e) => setSubjectTeacherForm({ ...subjectTeacherForm, class_group_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <select
                  value={subjectTeacherForm.subject_id}
                  onChange={(e) => setSubjectTeacherForm({ ...subjectTeacherForm, subject_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject Teacher</label>
                <select
                  value={subjectTeacherForm.teacher_membership_id}
                  onChange={(e) => setSubjectTeacherForm({ ...subjectTeacherForm, teacher_membership_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  <option value="">Select teacher...</option>
                  {eligibleSubjectTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.email} ({t.email})
                    </option>
                  ))}
                </select>
                {eligibleSubjectTeachers.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No active staff members found in the school roster. Invite staff first.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignSubjectTeacherOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={eligibleSubjectTeachers.length === 0}
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  Assign Subject Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

