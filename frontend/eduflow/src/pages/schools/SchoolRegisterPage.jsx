import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Phone, Mail, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  submitSchoolRequest,
  verifySchoolRequest,
  fetchMySchoolRequests
} from '../../services/api'
import { Alert } from '../../components/common/Alert'

export function SchoolRegisterPage() {
  const { currentUser, isAuthenticated, openAuthModal } = useAuth()
  const navigate = useNavigate()

  const [schoolName, setSchoolName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [devVerifyToken, setDevVerifyToken] = useState(null)

  const [verifyToken, setVerifyToken] = useState('')
  const [verifyStatus, setVerifyStatus] = useState(null)

  const [myRequests, setMyRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  const loadRequests = async () => {
    if (!isAuthenticated) return
    setLoadingRequests(true)
    const res = await fetchMySchoolRequests()
    if (res.ok && res.data?.success) {
      setMyRequests(res.data.data)
    }
    setLoadingRequests(false)
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadRequests()
    }
  }, [isAuthenticated])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const res = await submitSchoolRequest({
      school_name: schoolName,
      contact_phone: phone
    })
    setLoading(false)

    if (res.ok && res.data?.success) {
      setMessage('School registration submitted! Please verify your email using the token below.')
      if (res.data.data.dev_verification_token) {
        setDevVerifyToken(res.data.data.dev_verification_token)
        setVerifyToken(res.data.data.dev_verification_token)
      }
      setSchoolName('')
      setPhone('')
      loadRequests()
    } else {
      setError(res.data?.error?.message || 'Submission failed.')
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setVerifyStatus(null)
    setLoading(true)

    const res = await verifySchoolRequest(verifyToken)
    setLoading(false)

    if (res.ok && res.data?.success) {
      setVerifyStatus({
        ok: true,
        msg: 'Email verified! Your application is now in the Platform Review Queue.'
      })
      setVerifyToken('')
      loadRequests()
    } else {
      setVerifyStatus({
        ok: false,
        msg: res.data?.error?.message || 'Verification failed.'
      })
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#0F172A]">Authentication Required</h2>
          <p className="text-xs text-slate-600">
            You must be signed in with your proprietor account to submit a school registration request and track your workspace.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => openAuthModal('login')}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
            >
              Sign In
            </button>
            <button
              onClick={() => openAuthModal('signup')}
              className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-bold"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">School Workspace Registration</h1>
        <p className="text-xs text-slate-500 mt-1">
          Apply to establish a dedicated, isolated Eduflow cloud campus for your school.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Application Form & Verification */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-[#0F172A] pb-2 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#3B82F6]" />
              <span>New School Application</span>
            </h3>

            {message && <Alert type="success" message={message} />}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Official School Name</label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Morning Star International School"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Official Contact Phone</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="024 123 4567"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-bold">Applicant Identity:</span>
                <p className="font-mono mt-0.5">{currentUser?.email}</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-xs flex items-center justify-center space-x-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Submit Application</span>}
              </button>
            </form>
          </div>

          {/* Email Verification Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-[#0F172A] pb-2 border-b border-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#3B82F6]" />
              <span>Verify Application Contact</span>
            </h3>

            {devVerifyToken && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                <span className="font-bold">Dev Verification Token:</span>
                <p className="font-mono mt-1 break-all">{devVerifyToken}</p>
              </div>
            )}

            {verifyStatus && (
              <Alert
                type={verifyStatus.ok ? 'success' : 'error'}
                message={verifyStatus.msg}
                onClose={() => setVerifyStatus(null)}
              />
            )}

            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Token</label>
                <input
                  type="text"
                  required
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  placeholder="Paste verification token"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs shadow-xs"
              >
                Verify Contact Email
              </button>
            </form>
          </div>
        </div>

        {/* Right: Submitted Requests Live Status */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-extrabold text-sm text-[#0F172A]">Your School Applications</h3>
            <button
              onClick={loadRequests}
              className="text-xs text-[#3B82F6] hover:underline flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingRequests ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="space-y-3">
            {myRequests.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                You haven't submitted any school registration requests yet.
              </p>
            ) : (
              myRequests.map((req) => (
                <div key={req.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{req.school_name}</h4>
                      <p className="text-[11px] text-slate-500">{req.contact_phone}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : req.status === 'UNDER_REVIEW'
                          ? 'bg-blue-100 text-blue-800'
                          : req.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {req.school && (
                    <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Workspace Ready ({req.school.workspace_status})</span>
                      </span>
                      <button
                        onClick={() => navigate('/workspace')}
                        className="text-xs font-bold text-[#3B82F6] hover:underline flex items-center gap-1"
                      >
                        <span>Enter Workspace</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

