import React, { useState, useEffect } from 'react'
import { BookOpen, Plus, Tag, Check, CheckCircle, ShieldAlert } from 'lucide-react'
import {
  fetchSubjects,
  createSubject,
  fetchClassLevels,
  fetchClassSubjects,
  createClassSubject,
  deleteClassSubject
} from '../../services/api'
import { Alert } from '../common/Alert'

export function SubjectCatalogueSection({ schoolId, activeRole, canEdit }) {
  const [subjects, setSubjects] = useState([])
  const [classLevels, setClassLevels] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Filter
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('')

  // Modals
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false)
  const [mapSubjectOpen, setMapSubjectOpen] = useState(false)

  const [subjectForm, setSubjectForm] = useState({
    name: '',
    code: '',
    category: 'CORE',
    description: ''
  })

  const [mappingForm, setMappingForm] = useState({
    class_level_id: '',
    subject_id: '',
    is_compulsory: true
  })

  const loadData = async () => {
    if (!schoolId) return
    setLoading(true)
    const [subjRes, lvlRes] = await Promise.all([
      fetchSubjects(schoolId, activeRole),
      fetchClassLevels(schoolId, activeRole)
    ])

    if (subjRes.ok && subjRes.data?.success) {
      setSubjects(subjRes.data.data || [])
    }
    if (lvlRes.ok && lvlRes.data?.success) {
      const lvls = lvlRes.data.data || []
      setClassLevels(lvls)
      if (lvls.length > 0 && !mappingForm.class_level_id) {
        setMappingForm(prev => ({ ...prev, class_level_id: lvls[0].id }))
      }
    }

    await loadClassSubjects(selectedLevelFilter)
    setLoading(false)
  }

  const loadClassSubjects = async (levelId) => {
    const filters = levelId ? { class_level_id: levelId } : {}
    const res = await fetchClassSubjects(schoolId, filters, activeRole)
    if (res.ok && res.data?.success) {
      setClassSubjects(res.data.data || [])
    }
  }

  useEffect(() => {
    loadData()
  }, [schoolId, activeRole])

  const handleFilterChange = async (levelId) => {
    setSelectedLevelFilter(levelId)
    await loadClassSubjects(levelId)
  }

  const handleCreateSubject = async (e) => {
    e.preventDefault()
    const res = await createSubject(schoolId, subjectForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Subject '${subjectForm.name}' added to catalogue.` })
      setCreateSubjectOpen(false)
      setSubjectForm({ name: '', code: '', category: 'CORE', description: '' })
      loadData()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to create subject.'
      })
    }
  }

  const handleMapSubject = async (e) => {
    e.preventDefault()
    const res = await createClassSubject(schoolId, mappingForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Subject mapped to class level successfully.' })
      setMapSubjectOpen(false)
      loadClassSubjects(selectedLevelFilter)
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to map subject.'
      })
    }
  }

  const handleRemoveMapping = async (mappingId) => {
    const res = await deleteClassSubject(schoolId, mappingId, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Subject unmapped from class.' })
      loadClassSubjects(selectedLevelFilter)
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to remove mapping.'
      })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#3B82F6]" />
            Subject Catalogue & Curricular Mappings
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage institutional subjects and define which subjects are available/compulsory per grade level.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMapSubjectOpen(true)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>Map to Class</span>
            </button>
            <button
              onClick={() => setCreateSubjectOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subject</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {loading && subjects.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading subjects...</div>
      ) : (
        <div className="p-6 space-y-8">
          {/* Section 1: Subject Catalogue */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Standard GES Subjects ({subjects.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map((subj) => (
                <div
                  key={subj.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all shadow-2xs space-y-1.5"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold text-[#0F172A]">{subj.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        subj.category === 'CORE'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {subj.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                    <span>Code: {subj.code || 'N/A'}</span>
                  </div>
                  {subj.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">{subj.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Class-Subject Mappings */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Grade-Level Subject Allocations
                </h3>
                <p className="text-xs text-slate-500">
                  Defines subject availability when assigning Subject Teachers and registering term courses.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Filter by Grade:</span>
                <select
                  value={selectedLevelFilter}
                  onChange={(e) => handleFilterChange(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                >
                  <option value="">All Class Levels</option>
                  {classLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="p-3">Class Level</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Compulsory</th>
                    {canEdit && <th className="p-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 5 : 4} className="p-6 text-center text-slate-400 italic">
                        No subjects mapped for the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    classSubjects.map((mapping) => (
                      <tr key={mapping.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800">{mapping.class_level_name}</td>
                        <td className="p-3 text-slate-900 font-medium">
                          {mapping.subject_name}
                          {mapping.subject_code && (
                            <span className="ml-1 text-[10px] text-slate-400 font-mono">
                              ({mapping.subject_code})
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              mapping.subject_category === 'CORE'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-purple-50 text-purple-700'
                            }`}
                          >
                            {mapping.subject_category}
                          </span>
                        </td>
                        <td className="p-3">
                          {mapping.is_compulsory ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Compulsory
                            </span>
                          ) : (
                            <span className="text-slate-500 font-medium">Elective</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleRemoveMapping(mapping.id)}
                              className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                            >
                              Unmap
                            </button>
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

      {/* Add Subject Modal */}
      {createSubjectOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Add Subject to Catalogue</h3>
            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  placeholder="e.g. French Language, Ghanaian Language"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Code</label>
                  <input
                    type="text"
                    value={subjectForm.code}
                    onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. FREN"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={subjectForm.category}
                    onChange={(e) => setSubjectForm({ ...subjectForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    <option value="CORE">Core</option>
                    <option value="ELECTIVE">Elective</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateSubjectOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Subject Modal */}
      {mapSubjectOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Map Subject to Class Level</h3>
            <form onSubmit={handleMapSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Level</label>
                <select
                  value={mappingForm.class_level_id}
                  onChange={(e) => setMappingForm({ ...mappingForm, class_level_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  {classLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name} ({lvl.stage})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <select
                  value={mappingForm.subject_id}
                  onChange={(e) => setMappingForm({ ...mappingForm, subject_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  <option value="">Select subject...</option>
                  {subjects.map((subj) => (
                    <option key={subj.id} value={subj.id}>
                      {subj.name} ({subj.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="compulsory_chk"
                  checked={mappingForm.is_compulsory}
                  onChange={(e) => setMappingForm({ ...mappingForm, is_compulsory: e.target.checked })}
                  className="rounded text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <label htmlFor="compulsory_chk" className="text-xs font-bold text-slate-700">
                  Compulsory Subject for this class level
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMapSubjectOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Create Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

