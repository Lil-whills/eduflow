import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchPlatformStats,
  fetchPlatformRequests,
  fetchPlatformSchools,
  approvePlatformRequest,
  rejectPlatformRequest,
  suspendSchool,
  reactivateSchool
} from '../../services/api'
import { PlatformStatsGrid } from '../../components/admin/PlatformStatsGrid'
import { ReviewQueueTable } from '../../components/admin/ReviewQueueTable'
import { CampusInventoryTable } from '../../components/admin/CampusInventoryTable'
import { Alert } from '../../components/common/Alert'

export function AdminDashboardPage() {
  const { currentUser, isPlatformOperator, logout, authLoading } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState(null)
  const [requests, setRequests] = useState([])
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [devInvitationToken, setDevInvitationToken] = useState(null)

  const loadData = async () => {
    setLoading(true)
    const [statsRes, reqsRes, schoolsRes] = await Promise.all([
      fetchPlatformStats(),
      fetchPlatformRequests(),
      fetchPlatformSchools()
    ])
    if (statsRes.ok && statsRes.data?.success) setStats(statsRes.data.data)
    if (reqsRes.ok && reqsRes.data?.success) setRequests(reqsRes.data.data)
    if (schoolsRes.ok && schoolsRes.data?.success) setSchools(schoolsRes.data.data)
    setLoading(false)
  }

  useEffect(() => {
    if (!authLoading) {
      if (!isPlatformOperator) {
        navigate('/admin')
      } else {
        loadData()
      }
    }
  }, [authLoading, isPlatformOperator])

  const handleApprove = async (id) => {
    const res = await approvePlatformRequest(id)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Workspace approved and provisioned successfully!' })
      if (res.data.data.dev_invitation_token) {
        setDevInvitationToken(res.data.data.dev_invitation_token)
      }
      loadData()
    } else {
      setNotice({ type: 'error', message: res.data?.error?.message || 'Approval failed.' })
    }
  }

  const handleReject = async (id, reason) => {
    const res = await rejectPlatformRequest(id, reason)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Application rejected.' })
      loadData()
    } else {
      setNotice({ type: 'error', message: res.data?.error?.message || 'Rejection failed.' })
    }
  }

  const handleSuspend = async (id) => {
    const res = await suspendSchool(id)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'warning', message: 'Workspace suspended.' })
      loadData()
    } else {
      setNotice({ type: 'error', message: res.data?.error?.message || 'Suspension failed.' })
    }
  }

  const handleReactivate = async (id) => {
    const res = await reactivateSchool(id)
    if (res.ok && res.data?.success) {
      setNotice({ type: 'success', message: 'Workspace reactivated.' })
      loadData()
    } else {
      setNotice({ type: 'error', message: res.data?.error?.message || 'Reactivation failed.' })
    }
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/admin')
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Eduflow Platform Administration • /admin</span>
          </div>
          <h1 className="text-2xl font-black text-[#0F172A] mt-1">Platform Operations Dashboard</h1>
          <p className="text-xs text-slate-500">
            Supervise school workspaces, review pending registrations, and enforce platform governance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs"
          >
            View Public Site
          </Link>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Admin</span>
          </button>
        </div>
      </div>

      {notice && (
        <Alert
          type={notice.type}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}

      {/* Top Metric Cards */}
      <PlatformStatsGrid stats={stats} />

      {/* Review Queue */}
      <ReviewQueueTable
        requests={requests}
        onApprove={handleApprove}
        onReject={handleReject}
        loading={loading}
        onRefresh={loadData}
        devInvitationToken={devInvitationToken}
      />

      {/* Campus Inventory */}
      <CampusInventoryTable
        schools={schools}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />
    </div>
  )
}

