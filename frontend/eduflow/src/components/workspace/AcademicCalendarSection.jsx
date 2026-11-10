import React, { useState, useEffect } from 'react'
import { Calendar, Plus, Check, Play, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import {
  fetchAcademicYears,
  createAcademicYear,
  activateAcademicYear,
  completeAcademicYear,
  createAcademicTerm
} from '../../services/api'
import { Alert } from '../common/Alert'

export function AcademicCalendarSection({ schoolId, activeRole, canEdit }) {
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Modals state
  const [createYearOpen, setCreateYearOpen] = useState(false)
  const [createTermOpen, setCreateTermOpen] = useState(false)
  const [selectedYearId, setSelectedYearId] = useState(null)

  const [yearForm, setYearForm] = useState({
    name: '',
    start_date: '',
    end_date: ''
  })

  const [termForm, setTermForm] = useState({
    term_number: 1,
    name: 'Term 1',
    start_date: '',
    end_date: ''
  })

  const loadYears = async () => {
    if (!schoolId) return
    setLoading(true)
    const res = await fetchAcademicYears(schoolId, activeRole)
    if (res.ok && res.data?.success) {
      setYears(res.data.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadYears()
  }, [schoolId, activeRole])

  const handleCreateYear = async (e) => {
    e.preventDefault()
    const res = await createAcademicYear(schoolId, yearForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Academic year ${yearForm.name} created.` })
      setCreateYearOpen(false)
      setYearForm({ name: '', start_date: '', end_date: '' })
      loadYears()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to create academic year.'
      })
    }
  }

  const handleActivateYear = async (yearId) => {
    const res = await activateAcademicYear(schoolId, yearId, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Academic year activated successfully.' })
      loadYears()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to activate academic year.'
      })
    }
  }

  const handleCompleteYear = async (yearId) => {
    const res = await completeAcademicYear(schoolId, yearId, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Academic year marked as completed.' })
      loadYears()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to complete academic year.'
      })
    }
  }

  const handleCreateTerm = async (e) => {
    e.preventDefault()
    if (!selectedYearId) return
    const res = await createAcademicTerm(schoolId, selectedYearId, termForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `${termForm.name} added to calendar.` })
      setCreateTermOpen(false)
      loadYears()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to create term. Verify term dates do not overlap.'
      })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#3B82F6]" />
            Academic Calendar & Term Schedules
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage academic years and terms. System strictly enforces a single active academic year.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => setCreateYearOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Academic Year</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {loading && years.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading academic calendar...</div>
      ) : (
        <div className="p-6 space-y-6">
          {years.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">No academic years configured yet.</div>
          ) : (
            years.map((year) => {
              const isActive = year.status === 'ACTIVE'
              const isCompleted = year.status === 'COMPLETED'

              return (
                <div
                  key={year.id}
                  className={`p-5 rounded-xl border transition-all ${
                    isActive
                      ? 'border-emerald-200 bg-emerald-50/20 shadow-xs'
                      : 'border-slate-200 bg-slate-50/40'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#0F172A]">{year.name}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : isCompleted
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {year.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {year.start_date} to {year.end_date}
                        </p>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {!isActive && !isCompleted && (
                          <button
                            onClick={() => handleActivateYear(year.id)}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs"
                          >
                            <Play className="w-3 h-3" />
                            <span>Activate Year</span>
                          </button>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleCompleteYear(year.id)}
                            className="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Complete Year</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedYearId(year.id)
                            setCreateTermOpen(true)
                          }}
                          className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-white text-slate-600 font-bold text-xs flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Term</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Terms list */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {year.terms && year.terms.length > 0 ? (
                      year.terms.map((term) => (
                        <div
                          key={term.id}
                          className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#0F172A]">{term.name}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                term.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {term.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {term.start_date} → {term.end_date}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-3 text-xs text-slate-400 italic">
                        No terms defined for this academic year yet.
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* New Academic Year Modal */}
      {createYearOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Create Academic Year</h3>
            <form onSubmit={handleCreateYear} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Year Name</label>
                <input
                  type="text"
                  value={yearForm.name}
                  onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                  placeholder="e.g. 2026/2027"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={yearForm.start_date}
                    onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={yearForm.end_date}
                    onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateYearOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Academic Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Term Modal */}
      {createTermOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Add Academic Term</h3>
            <form onSubmit={handleCreateTerm} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Term Number & Name</label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={termForm.term_number}
                    onChange={(e) =>
                      setTermForm({
                        ...termForm,
                        term_number: parseInt(e.target.value),
                        name: `Term ${e.target.value}`
                      })
                    }
                    className="px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    <option value={1}>Term 1</option>
                    <option value={2}>Term 2</option>
                    <option value={3}>Term 3</option>
                  </select>
                  <input
                    type="text"
                    value={termForm.name}
                    onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
                    className="col-span-2 px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={termForm.start_date}
                    onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={termForm.end_date}
                    onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateTermOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Term
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

