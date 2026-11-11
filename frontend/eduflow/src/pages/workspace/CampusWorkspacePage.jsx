import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  School as SchoolIcon,
  Users,
  ShieldCheck,
  UserPlus,
  ArrowRight,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  BookOpen,
  GraduationCap
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  fetchSchoolWorkspace,
  assignInitialAdmin,
  inviteStaffMember,
  formatApiError
} from '../../services/api'
import { RoleSwitcher } from '../../components/workspace/RoleSwitcher'
import { InitialAdminWizard } from '../../components/workspace/InitialAdminWizard'
import { InviteStaffModal } from '../../components/workspace/InviteStaffModal'
import { Alert } from '../../components/common/Alert'
import { ProfileSection } from '../../components/workspace/ProfileSection'
import { AcademicCalendarSection } from '../../components/workspace/AcademicCalendarSection'
import { ClassesStreamsSection } from '../../components/workspace/ClassesStreamsSection'
import { SubjectCatalogueSection } from '../../components/workspace/SubjectCatalogueSection'
import { StaffGovernanceSection } from '../../components/workspace/StaffGovernanceSection'
import { TeachingAssignmentsSection } from '../../components/workspace/TeachingAssignmentsSection'
import { StudentsSection } from '../../components/workspace/StudentsSection'

export function CampusWorkspacePage() {
  const { currentUser, activeRole, setActiveRole, isAuthenticated, loadUserData } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'calendar' | 'classes' | 'subjects' | 'staff' | 'teaching'
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [devInvitationToken, setDevInvitationToken] = useState(null)

  const schoolId = currentUser?.memberships?.school_id

  const assignedRoles = currentUser?.memberships?.assigned_roles || []
  const isProprietor = activeRole === 'PROPRIETOR'
  const isAdmin = activeRole === 'ADMINISTRATOR'
  const isClassTeacher = activeRole === 'CLASS_TEACHER'
  const isSubjectTeacher = activeRole === 'SUBJECT_TEACHER'
  const isAccountant = activeRole === 'ACCOUNTANT'

  const canEditOperational = isAdmin || (isProprietor && assignedRoles.includes('ADMINISTRATOR'))
  const canEditProfile = isProprietor || isAdmin

  // Role-segregated navigation portals
  let navTabs = []
  if (isAdmin) {
    navTabs = [
      { id: 'students', label: 'Students & Enrollment', icon: Users },
      { id: 'calendar', label: 'Academic Calendar', icon: Calendar },
      { id: 'classes', label: 'Classes & Streams', icon: Layers },
      { id: 'subjects', label: 'Subject Catalogue', icon: BookOpen },
      { id: 'staff', label: 'Staff Roster & Roles', icon: Users },
      { id: 'teaching', label: 'Teaching Assignments', icon: GraduationCap },
      { id: 'profile', label: 'School Profile', icon: Building2 },
    ]
  } else if (isProprietor) {
    navTabs = [
      { id: 'profile', label: 'School Profile', icon: Building2 },
      { id: 'staff', label: 'Staff & Governance', icon: Users },
      { id: 'students', label: 'Students & Enrollment', icon: Users },
      { id: 'calendar', label: 'Academic Calendar', icon: Calendar },
      { id: 'classes', label: 'Classes & Streams', icon: Layers },
      { id: 'subjects', label: 'Subject Catalogue', icon: BookOpen },
      { id: 'teaching', label: 'Teaching Assignments', icon: GraduationCap },
    ]
  } else if (isClassTeacher) {
    navTabs = [
      { id: 'students', label: 'My Class Students & Roster', icon: Users },
      { id: 'teaching', label: 'My Teaching Assignments', icon: GraduationCap },
      { id: 'subjects', label: 'Subject Catalogue', icon: BookOpen },
    ]
  } else if (isSubjectTeacher) {
    navTabs = [
      { id: 'students', label: 'My Subject Students', icon: Users },
      { id: 'teaching', label: 'My Teaching Assignments', icon: GraduationCap },
      { id: 'subjects', label: 'Subject Catalogue', icon: BookOpen },
    ]
  } else if (isAccountant) {
    navTabs = [
      { id: 'students', label: 'Students & Billing Directory', icon: Users },
      { id: 'finance', label: 'Fees & Accounts', icon: Building2 },
    ]
  } else {
    navTabs = [
      { id: 'students', label: 'Students', icon: Users },
      { id: 'teaching', label: 'Teaching Assignments', icon: GraduationCap },
    ]
  }

  // Set appropriate home view when operational role context changes
  useEffect(() => {
    if (activeRole === 'PROPRIETOR') {
      setActiveTab('profile')
    } else if (activeRole === 'ADMINISTRATOR') {
      setActiveTab('students')
    } else if (activeRole === 'CLASS_TEACHER' || activeRole === 'SUBJECT_TEACHER' || activeRole === 'ACCOUNTANT') {
      setActiveTab('students')
    }
  }, [activeRole])

  const loadWorkspace = async (role) => {
    if (!schoolId) return
    setLoading(true)
    const res = await fetchSchoolWorkspace(schoolId, role || activeRole)
    if (res.ok && res.data?.success) {
      setWorkspace(res.data.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isAuthenticated && schoolId) {
      loadWorkspace(activeRole)
    }
  }, [isAuthenticated, schoolId, activeRole])

  const handleSelectRole = (role) => {
    setActiveRole(role)
    loadWorkspace(role)
  }

  const handleAssignAdmin = async (adminEmail) => {
    if (!schoolId) return
    setLoading(true)
    const res = await assignInitialAdmin(schoolId, { admin_email: adminEmail })
    setLoading(false)

    if (res.ok && res.data?.success) {
      const inviteUrl = res.data?.data?.invitation_url
      setNotice({
        type: 'success',
        message: inviteUrl
          ? `First Administrator assigned to ${adminEmail}! They can activate via the invitation link or simply click "Create Account" with this email address to establish their password and access the campus.`
          : 'First Administrator assigned! Campus status is now ACTIVE.'
      })
      if (res.data?.data?.dev_invitation_token) {
        setDevInvitationToken(res.data.data.dev_invitation_token)
      }
      await loadUserData()
      loadWorkspace(activeRole)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to assign administrator.')
      })
    }
  }

  const handleInviteStaff = async (email, role) => {
    if (!schoolId) return
    setInviteLoading(true)
    const res = await inviteStaffMember(schoolId, email, role, activeRole)
    setInviteLoading(false)

    if (res.ok && res.data?.success) {
      setNotice({
        type: 'success',
        message: `Invitation successfully sent to ${email}! Faculty member invited with foundational Subject Teacher role.`
      })
      if (res.data.data?.dev_invitation_token) {
        setDevInvitationToken(res.data.data.dev_invitation_token)
      }
      setInviteModalOpen(false)
      loadWorkspace(activeRole)
    } else {
      setNotice({
        type: 'error',
        message: formatApiError(res, 'Failed to invite staff member.')
      })
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
          <Building2 className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-xl font-bold text-[#0F172A]">Workspace Sign In Required</h2>
          <p className="text-xs text-slate-500">Please sign in to access your school campus workspace.</p>
          <Link
            to="/"
            className="inline-block px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs"
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    )
  }

  if (!schoolId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
          <SchoolIcon className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-[#0F172A]">No Active Campus Workspace</h2>
          <p className="text-xs text-slate-500">
            You do not currently belong to an active school workspace. Please apply to register your school first.
          </p>
          <Link
            to="/school-register"
            className="inline-block px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs"
          >
            Register School
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Workspace Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3B82F6]">
            <SchoolIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-[#0F172A]">{workspace?.school?.name || 'School Workspace'}</h1>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  workspace?.school?.workspace_status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {workspace?.school?.workspace_status || 'ONBOARDING'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Campus Tenant ID: <span className="font-mono text-slate-700">{schoolId}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <RoleSwitcher
            assignedRoles={assignedRoles}
            activeRole={activeRole}
            onSelectRole={handleSelectRole}
          />

          {canEditOperational && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Staff</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <Alert
          type={notice.type}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}

      {devInvitationToken && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
          <span className="font-bold">Staff Invitation Enqueued in Outbox:</span>
          <p className="font-mono mt-1 break-all">{devInvitationToken}</p>
        </div>
      )}

      {/* Onboarding Wizard (if status is ONBOARDING and user is Proprietor) */}
      {workspace?.school?.workspace_status === 'ONBOARDING' && activeRole === 'PROPRIETOR' && (
        <InitialAdminWizard onAssignAdmin={handleAssignAdmin} loading={loading} />
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-2">
        {navTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-[#3B82F6] text-[#3B82F6] bg-blue-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Active Tab Panel */}
      <div>
        {isProprietor && !isAdmin && activeTab !== 'profile' && activeTab !== 'staff' && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
            <span className="text-base">👑</span>
            <div>
              <span className="font-bold">Proprietor Executive Oversight:</span> Day-to-day operations (calendar terms, streams, and teaching assignments) are executed by the <strong>School Administrator</strong>. As Proprietor, you can review all academic records and appoint, replace, or reassign the Administrator at any time in <strong>Staff & Governance</strong>.
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <StudentsSection schoolId={schoolId} activeRole={activeRole} canEdit={isAdmin} />
        )}

        {activeTab === 'profile' && (
          <ProfileSection schoolId={schoolId} activeRole={activeRole} canEdit={canEditProfile} />
        )}

        {activeTab === 'calendar' && (
          <AcademicCalendarSection schoolId={schoolId} activeRole={activeRole} canEdit={canEditOperational} />
        )}

        {activeTab === 'classes' && (
          <ClassesStreamsSection schoolId={schoolId} activeRole={activeRole} canEdit={canEditOperational} />
        )}

        {activeTab === 'subjects' && (
          <SubjectCatalogueSection schoolId={schoolId} activeRole={activeRole} canEdit={canEditOperational} />
        )}

        {activeTab === 'staff' && (
          <StaffGovernanceSection
            schoolId={schoolId}
            activeRole={activeRole}
            canEdit={canEditOperational}
            isProprietor={isProprietor}
          />
        )}

        {activeTab === 'teaching' && (
          <TeachingAssignmentsSection schoolId={schoolId} activeRole={activeRole} canEdit={canEditOperational} />
        )}

        {activeTab === 'finance' && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#0F172A]">School Finance & Fee Accounts</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Student fee categories, tuition invoicing, and payment reconciliation will be managed in Feature 4. Active student records are linked and ready.
            </p>
          </div>
        )}
      </div>

      {/* Invite Staff Modal */}
      <InviteStaffModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInvite={handleInviteStaff}
        loading={inviteLoading}
      />
    </div>
  )
}
