import React, { useState, useEffect } from 'react'
import { Layers, Plus, BookOpen, CheckCircle, Tag } from 'lucide-react'
import {
  fetchClassLevels,
  createClassLevel,
  createClassGroup
} from '../../services/api'
import { Alert } from '../common/Alert'

export function ClassesStreamsSection({ schoolId, activeRole, canEdit }) {
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  // Modals
  const [createLevelOpen, setCreateLevelOpen] = useState(false)
  const [createStreamOpen, setCreateStreamOpen] = useState(false)
  const [selectedLevelId, setSelectedLevelId] = useState('')

  const [levelForm, setLevelForm] = useState({
    name: '',
    stage: 'LOWER_PRIMARY',
    order_index: 10
  })

  const [streamForm, setStreamForm] = useState({
    stream_name: ''
  })

  const loadLevels = async () => {
    if (!schoolId) return
    setLoading(true)
    const res = await fetchClassLevels(schoolId, activeRole)
    if (res.ok && res.data?.success) {
      setLevels(res.data.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLevels()
  }, [schoolId, activeRole])

  const handleCreateLevel = async (e) => {
    e.preventDefault()
    const res = await createClassLevel(schoolId, levelForm, activeRole)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Class level '${levelForm.name}' created.` })
      setCreateLevelOpen(false)
      setLevelForm({ name: '', stage: 'LOWER_PRIMARY', order_index: 10 })
      loadLevels()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to create class level.'
      })
    }
  }

  const handleCreateStream = async (e) => {
    e.preventDefault()
    if (!selectedLevelId) return
    const res = await createClassGroup(
      schoolId,
      {
        class_level_id: selectedLevelId,
        stream_name: streamForm.stream_name.toUpperCase().trim()
      },
      activeRole
    )
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: `Stream group created.` })
      setCreateStreamOpen(false)
      setStreamForm({ stream_name: '' })
      loadLevels()
    } else {
      setNotice({
        type: 'error',
        message: res.data?.error?.message || 'Failed to create stream.'
      })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-black text-[#0F172A] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#3B82F6]" />
            Classes & Academic Streams
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ghana Education Service (GES) stage levels, cohorts, and streamed class groups (e.g. Basic 4A, 4B).
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (levels.length > 0) setSelectedLevelId(levels[0].id)
                setCreateStreamOpen(true)
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>Add Stream</span>
            </button>
            <button
              onClick={() => setCreateLevelOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Class Level</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="p-4 border-b border-slate-100">
          <Alert type={notice.type} message={notice.message} onClose={() => setNotice(null)} />
        </div>
      )}

      {loading && levels.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading classes & streams...</div>
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {levels.map((level) => (
              <div
                key={level.id}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">{level.name}</h3>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {level.stage.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#3B82F6]">
                    Order #{level.order_index}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500">Configured Streams:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {level.groups && level.groups.length > 0 ? (
                      level.groups.map((group) => (
                        <span
                          key={group.id}
                          className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-medium text-xs flex items-center gap-1"
                        >
                          <Tag className="w-3 h-3 text-slate-400" />
                          {group.display_name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No streams created</span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => {
                        setSelectedLevelId(level.id)
                        setCreateStreamOpen(true)
                      }}
                      className="text-[11px] font-bold text-[#3B82F6] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Stream to {level.name}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Stream Modal */}
      {createStreamOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Add Stream Group</h3>
            <form onSubmit={handleCreateStream} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Class Level</label>
                <select
                  value={selectedLevelId}
                  onChange={(e) => setSelectedLevelId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                  required
                >
                  {levels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name} ({lvl.stage})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Stream Identifier (e.g. A, B, Green, Gold)
                </label>
                <input
                  type="text"
                  value={streamForm.stream_name}
                  onChange={(e) => setStreamForm({ stream_name: e.target.value })}
                  placeholder="e.g. A, B, C or Blue"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave blank for unstreamed classes or enter letter/name for streams.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateStreamOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Create Stream
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Class Level Modal */}
      {createLevelOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Add Custom Class Level</h3>
            <form onSubmit={handleCreateLevel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Class Level Name</label>
                <input
                  type="text"
                  value={levelForm.name}
                  onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })}
                  placeholder="e.g. Nursery 1, Creche"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Curriculum Stage</label>
                <select
                  value={levelForm.stage}
                  onChange={(e) => setLevelForm({ ...levelForm, stage: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white"
                >
                  <option value="CRECHE_NURSERY">Crèche / Nursery</option>
                  <option value="KINDERGARTEN">Kindergarten</option>
                  <option value="LOWER_PRIMARY">Lower Primary</option>
                  <option value="UPPER_PRIMARY">Upper Primary</option>
                  <option value="JHS">Junior High School</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Display Order Index</label>
                <input
                  type="number"
                  value={levelForm.order_index}
                  onChange={(e) => setLevelForm({ ...levelForm, order_index: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateLevelOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs"
                >
                  Save Class Level
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

