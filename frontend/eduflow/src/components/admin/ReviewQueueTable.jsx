import React, { useState } from 'react'
import { Check, X, RefreshCw } from 'lucide-react'

export function ReviewQueueTable({ requests, onApprove, onReject, loading, onRefresh, devInvitationToken }) {
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const handleConfirmReject = (id) => {
    if (!rejectionReason.trim()) return
    onReject(id, rejectionReason)
    setRejectingId(null)
    setRejectionReason('')
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <div>
          <h3 className="font-extrabold text-base text-[#0F172A]">Platform Review Queue</h3>
          <p className="text-xs text-slate-500">Inspect verified prospective school applications.</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {devInvitationToken && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
          <span className="font-bold">Proprietor Invitation Enqueued:</span>
          <p className="font-mono mt-1 break-all">{devInvitationToken}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 uppercase text-slate-500 font-bold bg-slate-50/50">
              <th className="py-3 px-4">School</th>
              <th className="py-3 px-4">Proprietor</th>
              <th className="py-3 px-4">Phone</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-8 text-center text-slate-400">
                  No requests waiting in the queue.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-bold text-slate-900">{req.school_name}</td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{req.requester_name}</div>
                    <div className="text-[10px] text-slate-400">{req.contact_email}</div>
                  </td>
                  <td className="py-3 px-4 font-mono">{req.contact_phone}</td>
                  <td className="py-3 px-4">
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
                  </td>
                  <td className="py-3 px-4 text-right">
                    {req.status === 'UNDER_REVIEW' || req.status === 'PENDING' ? (
                      <div className="flex items-center justify-end space-x-2">
                        {rejectingId === req.id ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder="Reason for rejection"
                              className="px-2 py-1 rounded border border-red-300 text-xs w-40"
                            />
                            <button
                              onClick={() => handleConfirmReject(req.id)}
                              className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                              title="Confirm Rejection"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(null)
                                setRejectionReason('')
                              }}
                              className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => onApprove(req.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-xs flex items-center space-x-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-[11px] border border-red-200 flex items-center space-x-1"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">Decided</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

