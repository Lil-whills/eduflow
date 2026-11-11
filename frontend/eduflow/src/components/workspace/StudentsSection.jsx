import React, { useState, useEffect } from 'react'
import {
  Users,
  Search,
  Filter,
  Plus,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  GitMerge,
  Eye,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Layers,
  Phone,
  Calendar
} from 'lucide-react'
import {
  fetchStudents,
  fetchAcademicYears,
  fetchClassLevels,
  fetchClassGroups,
  fetchClassSummaryReport,
  fetchDuplicateReviews,
  resolveDuplicateReview,
  mergeStudents,
  formatApiError
} from '../../services/api'
import { Alert } from '../common/Alert'
import { StudentRegistrationModal } from './StudentRegistrationModal'
import { StudentProfileModal } from './StudentProfileModal'
import { StudentImportModal } from './StudentImportModal'

export function StudentsSection({ schoolId, activeRole, canEdit }) {
  const [subTab, setSubTab] = useState('DIRECTORY') // 'DIRECTORY' | 'CLASS_SUMMARY' | 'DUPLICATES'
  const [students, setStudents] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLevelId, setSelectedLevelId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [statusFilter, setStatusFilter] = useState('ACTIVE')

  // Catalogs
  const [years, setYears] = useState([])
  const [levels, setLevels] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedYearId, setSelectedYearId] = useState('')

  // Modals
  const [registerOpen, setRegisterOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [profileModalStudentId, setProfileModalStudentId] = useState(null)

  // Class Summary state
  const [classSummary, setClassSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Duplicate reviews state
  const [duplicateReviews, setDuplicateReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const loadPrerequisites = async () => {
    if (!schoolId) return
    const [yRes, lvlRes, grpRes] = await Promise.all([
      fetchAcademicYears(schoolId, activeRole),
      fetchClassLevels(schoolId, activeRole),
      fetchClassGroups(schoolId, activeRole)
    ])

    if (yRes.ok && yRes.data?.success) {
      const yList = yRes.data.data || []
      setYears(yList)
      const activeYear = yList.find(y => y.status === 'ACTIVE') || yList[0]
      if (activeYear) {
        setSelectedYearId(activeYear.id)
      }
    }
    if (lvlRes.ok && lvlRes.data?.success) {
      setLevels(lvlRes.data.data || [])
    }
    if (grpRes.ok && grpRes.data?.success) {
      setGroups(grpRes.data.data || [])
    }
  }

  const loadStudents = async () => {
    if (!schoolId) return
    setLoading(true)
    const params = {
      page,
      page_size: pageSize,
      q: searchQuery,
      class_level_id: selectedLevelId || '',
      class_group_id: selectedGroupId || '',
      status: statusFilter || ''
    }

    const res = await fetchStudents(schoolId, params, activeRole)
    setLoading(false)
    if (res.ok && res.data?.success) {
      setStudents(res.data.data.results || [])
      setTotalCount(res.data.data.total || 0)
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to load students.') })
    }
  }

  const loadClassSummary = async (yearId) => {
    if (!schoolId) return
    setSummaryLoading(true)
    const res = await fetchClassSummaryReport(schoolId, yearId || selectedYearId, activeRole)
    setSummaryLoading(false)
    if (res.ok && res.data?.success) {
      setClassSummary(res.data.data)
    }
  }

  const loadDuplicateReviews = async () => {
    if (!schoolId) return
    setReviewsLoading(true)
    const res = await fetchDuplicateReviews(schoolId, activeRole)
    setReviewsLoading(false)
    if (res.ok && res.data?.success) {
      setDuplicateReviews(res.data.data || [])
    }
  }

  useEffect(() => {
    loadPrerequisites()
  }, [schoolId, activeRole])

  useEffect(() => {
    if (subTab === 'DIRECTORY') {
      loadStudents()
    } else if (subTab === 'CLASS_SUMMARY') {
      loadClassSummary(selectedYearId)
    } else if (subTab === 'DUPLICATES') {
      loadDuplicateReviews()
    }
  }, [schoolId, activeRole, subTab, page, selectedLevelId, selectedGroupId, statusFilter, selectedYearId])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    loadStudents()
  }

  const handleResolveDuplicate = async (reviewId, decision) => {
    const res = await resolveDuplicateReview(schoolId, reviewId, { decision }, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Duplicate review recorded as ${decision}.` })
      loadDuplicateReviews()
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to resolve duplicate.') })
    }
  }

  const handleMergeInReview = async (review) => {
    if (!window.confirm(`Merge ${review.student_b_name} (${review.student_b_adm}) into ${review.student_a_name} (${review.student_a_adm})?`)) {
      return
    }
    const res = await mergeStudents(schoolId, {
      surviving_student_id: review.student_a,
      merged_student_id: review.student_b,
      notes: 'Merged from duplicate triage portal.'
    }, activeRole)

    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Students successfully consolidated.' })
      loadDuplicateReviews()
      loadStudents()
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to merge students.') })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#3B82F6]" />
            Student Management & Enrollment
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional learner profiles, automatic admission numbering, guardian contacts, and stream aggregates.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span>Bulk Import (CSV)</span>
            </button>
            <button
              onClick={() => setRegisterOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Student</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-3 gap-6">
        <button
          onClick={() => setSubTab('DIRECTORY')}
          className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            subTab === 'DIRECTORY'
              ? 'border-[#3B82F6] text-[#3B82F6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Student Directory ({totalCount})</span>
        </button>

        <button
          onClick={() => setSubTab('CLASS_SUMMARY')}
          className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            subTab === 'CLASS_SUMMARY'
              ? 'border-[#3B82F6] text-[#3B82F6]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Class Group & Parent Totals</span>
        </button>

        {canEdit && (
          <button
            onClick={() => setSubTab('DUPLICATES')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
              subTab === 'DUPLICATES'
                ? 'border-[#3B82F6] text-[#3B82F6]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GitMerge className="w-4 h-4" />
            <span>Duplicate Triage {duplicateReviews.length > 0 && `(${duplicateReviews.length})`}</span>
          </button>
        )}
      </div>

      {/* SUBTAB 1: DIRECTORY */}
      {subTab === 'DIRECTORY' && (
        <div className="p-6 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, admission #, index..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedLevelId}
                onChange={(e) => {
                  setSelectedLevelId(e.target.value)
                  setPage(1)
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
              >
                <option value="">All Class Levels</option>
                {levels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value)
                  setPage(1)
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
              >
                <option value="">All Streams</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="WITHDRAWN">Withdrawn</option>
                <option value="TRANSFERRED">Transferred</option>
                <option value="GRADUATED">Graduated</option>
              </select>
            </div>
          </div>

          {/* Student Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">Admission No.</th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Current Class</th>
                  <th className="p-3">Primary Guardian</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      Loading students...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      No students found matching your filters. Click 'Register Student' or 'Bulk Import' to onboard learners.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-blue-700">
                        {s.admission_number}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{s.full_name}</div>
                        {s.index_number && (
                          <div className="text-[10px] text-slate-400 font-mono">Index: {s.index_number}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {s.current_enrollment ? (
                          <div>
                            <span className="font-semibold text-slate-800">
                              {s.current_enrollment.class_group_name}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              ({s.current_enrollment.academic_year_name})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Not enrolled</span>
                        )}
                      </td>
                      <td className="p-3">
                        {s.primary_contact ? (
                          <div>
                            <span className="font-medium text-slate-800">{s.primary_contact.name}</span>
                            <span className="text-[10px] text-slate-500 block font-mono">
                              {s.primary_contact.phone_primary} ({s.primary_contact.relationship})
                            </span>
                          </div>
                        ) : (
                          <span className="text-rose-500 italic text-[10px]">Missing primary contact</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'WITHDRAWN'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => setProfileModalStudentId(s.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-[#3B82F6] hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Profile</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
            <span>
              Showing {students.length} of {totalCount} students
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-bold">Page {page}</span>
              <button
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: CLASS SUMMARY & GES AGGREGATION */}
      {subTab === 'CLASS_SUMMARY' && (
        <div className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Ghana Education Service (GES) Class Totals</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Displays both individual streamed class-group rosters and parent class level aggregated learner counts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Academic Year:</label>
              <select
                value={selectedYearId}
                onChange={(e) => {
                  setSelectedYearId(e.target.value)
                  loadClassSummary(e.target.value)
                }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.status === 'ACTIVE' ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Overall metric banner */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                  Total Active Enrolled Students ({classSummary?.academic_year?.name || 'Year'})
                </span>
                <h4 className="text-xl font-black text-blue-950">
                  {classSummary?.total_active_students || 0} Learners
                </h4>
              </div>
            </div>
          </div>

          {summaryLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">Computing aggregated counts...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classSummary?.class_levels?.map((lvl) => (
                <div
                  key={lvl.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-slate-100 pb-2.5">
                    <div>
                      <h4 className="text-sm font-bold text-[#0F172A]">{lvl.name}</h4>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {lvl.stage.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-blue-600">{lvl.total_active_students}</span>
                      <span className="text-[10px] text-slate-400 block font-medium">Class Total</span>
                    </div>
                  </div>

                  {/* Streams breakdown */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Stream Rosters:</span>
                    <div className="space-y-1">
                      {lvl.streams && lvl.streams.length > 0 ? (
                        lvl.streams.map((grp) => (
                          <div
                            key={grp.id}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs font-medium text-slate-700"
                          >
                            <span>{grp.display_name}</span>
                            <span className="font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                              {grp.active_students} students
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No stream groups</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: DUPLICATE TRIAGE */}
      {subTab === 'DUPLICATES' && (
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <h3 className="font-bold text-amber-950 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Duplicate Review & Consolidation Queue</span>
            </h3>
            <p>
              Per Scholora security specifications, records are never merged automatically. Review flagged signals and explicitly decide whether to consolidate into the surviving record or confirm they are distinct identities.
            </p>
          </div>

          {reviewsLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">Loading duplicate reviews...</div>
          ) : duplicateReviews.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs italic bg-slate-50/50 rounded-xl border border-slate-100">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
              <span>All student records are verified. No unresolved duplicate warnings pending.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {duplicateReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        Match Score: {rev.match_score}%
                      </span>
                      <span className="text-xs font-bold text-slate-800">Signal: {rev.match_reason}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Flagged on {new Date(rev.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Existing Record (A)</span>
                      <p className="font-bold text-slate-900">{rev.student_a_name}</p>
                      <p className="font-mono text-blue-700 text-[11px]">{rev.student_a_adm}</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Candidate Record (B)</span>
                      <p className="font-bold text-slate-900">{rev.student_b_name}</p>
                      <p className="font-mono text-blue-700 text-[11px]">{rev.student_b_adm}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveDuplicate(rev.id, 'RESOLVED_KEPT_BOTH')}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      Confirm Keep Both Distinct
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMergeInReview(rev)}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-1.5"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>Merge (Consolidate into A)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <StudentRegistrationModal
        isOpen={registerOpen}
        onClose={() => setRegisterOpen(false)}
        schoolId={schoolId}
        activeRole={activeRole}
        years={years}
        groups={groups}
        onSuccess={() => {
          loadStudents()
          loadClassSummary(selectedYearId)
        }}
      />

      <StudentImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        schoolId={schoolId}
        activeRole={activeRole}
        years={years}
        onSuccess={() => {
          loadStudents()
          loadClassSummary(selectedYearId)
        }}
      />

      <StudentProfileModal
        isOpen={Boolean(profileModalStudentId)}
        onClose={() => setProfileModalStudentId(null)}
        schoolId={schoolId}
        studentId={profileModalStudentId}
        activeRole={activeRole}
        canEdit={canEdit}
        onUpdated={() => {
          loadStudents()
          loadClassSummary(selectedYearId)
        }}
      />
    </div>
  )
}

