import React, { useState } from 'react'
import { X, UploadCloud, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Download } from 'lucide-react'
import { previewStudentImport, confirmStudentImport, getStudentImportTemplateUrl, formatApiError } from '../../services/api'
import { Alert } from '../common/Alert'

export function StudentImportModal({
  isOpen,
  onClose,
  schoolId,
  activeRole,
  years = [],
  onSuccess
}) {
  const [step, setStep] = useState(1) // 1: Upload, 2: Preview, 3: Completed
  const [file, setFile] = useState(null)
  const [csvText, setCsvText] = useState('')
  const [selectedYearId, setSelectedYearId] = useState(
    years.find(y => y.status === 'ACTIVE')?.id || (years[0]?.id || '')
  )
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [batchData, setBatchData] = useState(null)
  const [result, setResult] = useState(null)

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) {
      setFile(f)
      const reader = new FileReader()
      reader.onload = (event) => {
        setCsvText(event.target.result)
      }
      reader.readAsText(f)
    }
  }

  const handlePreview = async (e) => {
    e.preventDefault()
    if (!csvText.trim()) {
      setNotice({ type: 'error', message: 'Please select a CSV file or paste CSV content.' })
      return
    }

    setLoading(true)
    setNotice(null)
    const payload = {
      csv_text: csvText,
      academic_year_id: selectedYearId || null
    }

    const res = await previewStudentImport(schoolId, payload, activeRole)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setBatchData(res.data.data)
      setStep(2)
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to parse and validate CSV file.') })
    }
  }

  const handleConfirm = async () => {
    if (!batchData?.batch_id) return
    setLoading(true)
    setNotice(null)

    const res = await confirmStudentImport(schoolId, batchData.batch_id, activeRole)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setResult(res.data.data)
      setStep(3)
      onSuccess && onSuccess()
    } else {
      setNotice({ type: 'error', message: formatApiError(res, 'Failed to complete batch import.') })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3B82F6] flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Bulk Student Import Wizard</h2>
              <p className="text-[11px] text-slate-500">
                Staged spreadsheet validation, duplicate triage, and atomic enrollment creation.
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

        {/* Step Progression Pill Bar */}
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className={`px-2.5 py-1 rounded-full ${step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            1. Upload File
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className={`px-2.5 py-1 rounded-full ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            2. Validation Preview
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className={`px-2.5 py-1 rounded-full ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            3. Import Completed
          </span>
        </div>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <form onSubmit={handlePreview} className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 bg-blue-50/60 rounded-xl border border-blue-100">
              <div className="text-xs text-blue-900">
                <span className="font-bold">Need the standard spreadsheet layout?</span>
                <p className="text-[11px] text-blue-700 mt-0.5">Includes required guardian and class stream headings.</p>
              </div>
              <a
                href={getStudentImportTemplateUrl(schoolId)}
                download="scholora_students_template.csv"
                className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-[#3B82F6] hover:bg-blue-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download CSV Template</span>
              </a>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Academic Year</label>
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-white font-medium"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.status === 'ACTIVE' ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-2 border-dashed border-slate-200 hover:border-[#3B82F6] rounded-xl p-6 text-center space-y-2 cursor-pointer transition-colors">
              <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-xs text-slate-600">
                <label className="font-bold text-[#3B82F6] hover:underline cursor-pointer">
                  <span>Click to choose file</span>
                  <input
                    type="file"
                    accept=".csv, text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <span className="text-slate-500"> or drag and drop your CSV here</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {file ? file.name : 'Supported format: .csv (UTF-8 encoded)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Or Paste CSV Content Directly
              </label>
              <textarea
                rows="4"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="first_name,last_name,class_group,primary_contact_name,primary_contact_relationship,primary_contact_phone&#10;Kwame,Mensah,Basic 4A,Grace Mensah,Mother,+233241234567"
                className="w-full p-2.5 text-xs font-mono border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !csvText.trim()}
                className="px-5 py-2 text-xs bg-[#3B82F6] hover:bg-blue-600 text-white font-bold rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>{loading ? 'Validating CSV...' : 'Validate & Preview'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Validation Preview */}
        {step === 2 && batchData && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Rows</span>
                <p className="text-lg font-black text-slate-800">{batchData.total_rows}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] font-bold uppercase text-emerald-700">Valid Rows</span>
                <p className="text-lg font-black text-emerald-800">{batchData.valid_rows}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-[10px] font-bold uppercase text-amber-700">Duplicates Flagged</span>
                <p className="text-lg font-black text-amber-800">{batchData.duplicate_rows}</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <span className="text-[10px] font-bold uppercase text-rose-700">Invalid Rows</span>
                <p className="text-lg font-black text-rose-800">{batchData.invalid_rows}</p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 sticky top-0">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Student Name</th>
                    <th className="p-2.5">Class Stream</th>
                    <th className="p-2.5">Primary Contact</th>
                    <th className="p-2.5">Validation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchData.preview_data?.map((row) => (
                    <tr key={row.row_index} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-mono text-[11px] text-slate-400">{row.row_index}</td>
                      <td className="p-2.5 font-bold text-slate-800">
                        {row.first_name} {row.last_name}
                      </td>
                      <td className="p-2.5 text-blue-700 font-bold">{row.class_group_name}</td>
                      <td className="p-2.5 text-[11px] text-slate-600">
                        {row.primary_contact_name} ({row.primary_contact_phone})
                      </td>
                      <td className="p-2.5">
                        {row.status === 'VALID' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Valid
                          </span>
                        )}
                        {row.status === 'WARNING_DUPLICATE' && (
                          <div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Duplicate Signal
                            </span>
                            <p className="text-[10px] text-amber-700 mt-0.5">{row.warnings?.join(', ')}</p>
                          </div>
                        )}
                        {row.status === 'INVALID' && (
                          <div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              Invalid
                            </span>
                            <p className="text-[10px] text-rose-600 mt-0.5">{row.errors?.join(', ')}</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
              >
                Back to File
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || (batchData.valid_rows + batchData.duplicate_rows) === 0}
                className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{loading ? 'Processing Import...' : `Confirm & Create ${batchData.valid_rows + batchData.duplicate_rows} Students`}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Completed Outcome */}
        {step === 3 && result && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Batch Import Successfully Completed</h3>
              <p className="text-xs text-slate-500 mt-1">
                Created and enrolled <strong>{result.created_students_count}</strong> students with unique admission numbers.
                {result.skipped_count > 0 && ` Skipped ${result.skipped_count} invalid rows.`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xs"
            >
              Done & Return to Directory
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

