import React from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

export function Alert({ type = 'error', message, onClose }) {
  if (!message) return null

  const isSuccess = type === 'success'
  const isWarning = type === 'warning'
  const isInfo = type === 'info'

  const styles = isSuccess
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : isWarning
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : isInfo
    ? 'bg-blue-50 border-blue-200 text-blue-800'
    : 'bg-red-50 border-red-200 text-red-700'

  const Icon = isSuccess
    ? CheckCircle2
    : isWarning
    ? AlertTriangle
    : isInfo
    ? Info
    : AlertTriangle

  const iconColor = isSuccess
    ? 'text-emerald-500'
    : isWarning
    ? 'text-amber-500'
    : isInfo
    ? 'text-blue-500'
    : 'text-red-500'

  return (
    <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${styles}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

