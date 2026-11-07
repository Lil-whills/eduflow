import React, { useState, useEffect } from 'react'
import {
  register,
  login,
  logout,
  fetchCurrentUser,
  getAccessToken,
  requestPasswordReset,
  confirmPasswordReset,
  platformLogin,
  fetchPlatformStats,
  fetchPlatformSchools,
  suspendSchool,
  reactivateSchool,
  submitSchoolRequest,
  verifySchoolRequest,
  fetchMySchoolRequests,
  fetchPlatformRequests,
  reviewPlatformRequest,
  rejectPlatformRequest,
  approvePlatformRequest,
  assignInitialAdmin,
  fetchSchoolWorkspace,
  assignMemberRole,
  removeMemberRole,
  inviteStaffMember,
  acceptInvitation
} from './services/api'
import {
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Mail,
  Phone,
  LogIn,
  LogOut,
  KeyRound,
  Compass,
  School as SchoolIcon,
  ChevronRight,
  ArrowRight,
  UserPlus,
  Check,
  X,
  Shield,
  Sparkles,
  BarChart3,
  GraduationCap,
  Clock,
  RefreshCw,
  PlusCircle,
  Laptop,
  CheckCheck
} from 'lucide-react'

export const getViewFromPath = (pathname) => {
  const path = (pathname || (typeof window !== 'undefined' ? window.location.pathname : '/'))
    .toLowerCase()
    .replace(/\/$/, '') || '/'
  if (path === '/admin' || path === '/admin/login') return 'platform-login'
  if (path === '/admin/dashboard') return 'platform-dashboard'
  if (path === '/accept-invite') return 'accept-invite'
  if (path === '/forgot-password') return 'forgot-password'
  if (path === '/school-register') return 'school-register'
  if (path === '/workspace') return 'workspace'
  if (path === '/login' || path === '/auth' || path === '/signup') return 'auth'
  return 'landing'
}

export function App() {
  // Navigation View: 'landing' | 'auth' | 'forgot-password' | 'school-register' | 'workspace' | 'platform-login' | 'platform-dashboard' | 'accept-invite'
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window !== 'undefined') {
      return getViewFromPath(window.location.pathname)
    }
    return 'landing'
  })

  const navigateTo = (path, viewOverride = null) => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    const targetView = viewOverride || getViewFromPath(path)
    setCurrentView(targetView)
  }

  // Auth State
  const [currentUser, setCurrentUser] = useState(null)
  const [activeRole, setActiveRole] = useState(null)

  // Public Auth Form (Sign In & Sign Up)
  const [authTab, setAuthTab] = useState('login') // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authError, setAuthError] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Forgot Password / Password Reset State
  const [resetEmail, setResetEmail] = useState('')
  const [resetStep, setResetStep] = useState(1) // 1: request, 2: confirm
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetMessage, setResetMessage] = useState(null)
  const [resetError, setResetError] = useState(null)
  const [devResetToken, setDevResetToken] = useState(null)

  // School Registration State (for authenticated users)
  const [regSchoolName, setRegSchoolName] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regAdminEmail, setRegAdminEmail] = useState('')
  const [regError, setRegError] = useState(null)
  const [regMessage, setRegMessage] = useState(null)
  const [mySchoolRequests, setMySchoolRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Email Verification State
  const [verifyToken, setVerifyToken] = useState('')
  const [verifyStatus, setVerifyStatus] = useState(null)
  const [devVerifyToken, setDevVerifyToken] = useState(null)

  // Platform Operator Portal State
  const [platformEmail, setPlatformEmail] = useState('')
  const [platformPassword, setPlatformPassword] = useState('')
  const [platformError, setPlatformError] = useState(null)
  const [platformStats, setPlatformStats] = useState(null)
  const [platformRequests, setPlatformRequests] = useState([])
  const [platformSchools, setPlatformSchools] = useState([])
  const [platformLoading, setPlatformLoading] = useState(false)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Proprietor / School Workspace State
  const [workspaceData, setWorkspaceData] = useState(null)
  const [workspaceNotice, setWorkspaceNotice] = useState(null)
  const [initialAdminEmail, setInitialAdminEmail] = useState('')
  const [inviteStaffEmail, setInviteStaffEmail] = useState('')
  const [inviteStaffRole, setInviteStaffRole] = useState('CLASS_TEACHER')
  const [inviteNotice, setInviteNotice] = useState(null)
  const [devInvitationToken, setDevInvitationToken] = useState(null)

  // Invitation Acceptance State
  const [inviteAcceptToken, setInviteAcceptToken] = useState('')
  const [inviteAcceptPassword, setInviteAcceptPassword] = useState('')
  const [inviteAcceptConfirm, setInviteAcceptConfirm] = useState('')
  const [inviteAcceptNotice, setInviteAcceptNotice] = useState(null)

  const loadUserData = async () => {
    if (getAccessToken()) {
      const res = await fetchCurrentUser()
      if (res.ok && res.data?.success) {
        const user = res.data.data
        setCurrentUser(user)
        const roles = user?.memberships?.assigned_roles || []
        if (roles.length > 0 && !activeRole) {
          setActiveRole(roles[0])
        }
        return user
      } else {
        setCurrentUser(null)
      }
    } else {
      setCurrentUser(null)
    }
    return null
  }

  const loadMyRequests = async () => {
    setLoadingRequests(true)
    const res = await fetchMySchoolRequests()
    if (res.ok && res.data?.success) {
      setMySchoolRequests(res.data.data)
    }
    setLoadingRequests(false)
  }

  const loadWorkspace = async (schoolId, role) => {
    if (!schoolId) return
    const res = await fetchSchoolWorkspace(schoolId, role || activeRole)
    if (res.ok && res.data?.success) {
      setWorkspaceData(res.data.data)
    }
  }

  const loadPlatformData = async () => {
    setPlatformLoading(true)
    const [statsRes, reqsRes, schoolsRes] = await Promise.all([
      fetchPlatformStats(),
      fetchPlatformRequests(),
      fetchPlatformSchools()
    ])
    if (statsRes.ok && statsRes.data?.success) setPlatformStats(statsRes.data.data)
    if (reqsRes.ok && reqsRes.data?.success) setPlatformRequests(reqsRes.data.data)
    if (schoolsRes.ok && schoolsRes.data?.success) setPlatformSchools(schoolsRes.data.data)
    setPlatformLoading(false)
  }

  useEffect(() => {
    const handlePopState = () => {
      const view = getViewFromPath(window.location.pathname)
      setCurrentView(view)
    }
    window.addEventListener('popstate', handlePopState)

    // Parse URL query token if present (for invitations)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const tokenParam = urlParams.get('token')
      if (tokenParam) {
        setInviteAcceptToken(tokenParam)
        if (window.location.pathname.includes('invite')) {
          navigateTo('/accept-invite', 'accept-invite')
        }
      }
    }

    loadUserData().then((user) => {
      const path = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase()
      if (user?.is_platform_operator) {
        loadPlatformData()
        if (path === '/admin' || path === '/admin/login' || path === '/admin/dashboard') {
          navigateTo('/admin/dashboard', 'platform-dashboard')
        }
      } else if (user?.memberships?.school_id) {
        loadWorkspace(user.memberships.school_id, activeRole)
      } else if (user && path === '/school-register') {
        loadMyRequests()
      }
    })

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (currentUser?.memberships?.school_id && currentView === 'workspace') {
      loadWorkspace(currentUser.memberships.school_id, activeRole)
    }
    if (currentView === 'school-register' && currentUser) {
      loadMyRequests()
    }
    if (currentView === 'platform-dashboard' && currentUser?.is_platform_operator) {
      loadPlatformData()
    }
  }, [currentView, currentUser, activeRole])

  // Public Login Handler
  const handlePublicLogin = async (e) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    const res = await login(authEmail, authPassword)
    setAuthLoading(false)

    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      setAuthEmail('')
      setAuthPassword('')
      const roles = user?.memberships?.assigned_roles || []
      if (roles.length > 0) setActiveRole(roles[0])

      if (user.is_platform_operator) {
        navigateTo('/admin/dashboard', 'platform-dashboard')
        loadPlatformData()
      } else if (user.memberships?.school_id) {
        navigateTo('/workspace', 'workspace')
      } else {
        navigateTo('/school-register', 'school-register')
        loadMyRequests()
      }
    } else {
      setAuthError(res.data?.error?.message || 'Login failed. Invalid credentials.')
    }
  }

  // Public Register Handler
  const handlePublicRegister = async (e) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    const res = await register(firstName, lastName, authEmail, authPassword, confirmPassword)
    setAuthLoading(false)

    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      setFirstName('')
      setLastName('')
      setAuthEmail('')
      setAuthPassword('')
      setConfirmPassword('')
      navigateTo('/school-register', 'school-register')
      loadMyRequests()
    } else {
      setAuthError(res.data?.error?.message || 'Registration failed. Check details.')
    }
  }

  // Dedicated Platform Operator Login Handler (Route: /admin)
  const handlePlatformLogin = async (e) => {
    e.preventDefault()
    setPlatformError(null)
    setAuthLoading(true)

    const res = await platformLogin(platformEmail, platformPassword)
    setAuthLoading(false)

    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      setPlatformEmail('')
      setPlatformPassword('')
      navigateTo('/admin/dashboard', 'platform-dashboard')
      loadPlatformData()
    } else {
      setPlatformError(res.data?.error?.message || 'Platform authentication failed. Authorized personnel only.')
    }
  }

  const handleLogout = async () => {
    const isOpRoute = (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) || currentUser?.is_platform_operator
    await logout()
    setCurrentUser(null)
    setActiveRole(null)
    setWorkspaceData(null)
    if (isOpRoute) {
      navigateTo('/admin', 'platform-login')
    } else {
      navigateTo('/', 'landing')
    }
  }

  // Forgot Password Handlers
  const handleRequestPasswordReset = async (e) => {
    e.preventDefault()
    setResetError(null)
    setResetMessage(null)
    const res = await requestPasswordReset(resetEmail)
    if (res.ok && res.data?.success) {
      setResetMessage(res.data.data.message)
      if (res.data.data.dev_reset_token) {
        setDevResetToken(res.data.data.dev_reset_token)
        setResetToken(res.data.data.dev_reset_token)
      }
      setResetStep(2)
    } else {
      setResetError(res.data?.error?.message || 'Request failed.')
    }
  }

  const handleConfirmPasswordReset = async (e) => {
    e.preventDefault()
    setResetError(null)
    setResetMessage(null)
    const res = await confirmPasswordReset(resetToken, newPassword, confirmNewPassword)
    if (res.ok && res.data?.success) {
      setResetMessage('Password reset successfully! Please sign in with your new password.')
      setTimeout(() => {
        navigateTo('/login', 'auth')
        setAuthTab('login')
        setResetStep(1)
        setResetMessage(null)
      }, 2000)
    } else {
      setResetError(res.data?.error?.message || 'Password reset confirmation failed.')
    }
  }

  // Authenticated School Request Submit
  const handleSchoolRequestSubmit = async (e) => {
    e.preventDefault()
    setRegError(null)
    setRegMessage(null)

    const res = await submitSchoolRequest({
      school_name: regSchoolName,
      contact_phone: regPhone,
    })

    if (res.ok && res.data?.success) {
      setRegMessage('School registration submitted! Please verify the contact link.')
      if (res.data.data.dev_verification_token) {
        setDevVerifyToken(res.data.data.dev_verification_token)
        setVerifyToken(res.data.data.dev_verification_token)
      }
      setRegSchoolName('')
      setRegPhone('')
      loadMyRequests()
    } else {
      setRegError(res.data?.error?.message || 'Submission failed.')
    }
  }

  // Verify Email Token
  const handleVerifyToken = async (e) => {
    e.preventDefault()
    setVerifyStatus(null)
    const res = await verifySchoolRequest(verifyToken)
    if (res.ok && res.data?.success) {
      setVerifyStatus({ ok: true, msg: 'Email verified! Application is now in the Platform Review Queue.' })
      setVerifyToken('')
      loadMyRequests()
    } else {
      setVerifyStatus({ ok: false, msg: res.data?.error?.message || 'Verification failed.' })
    }
  }

  // Platform Operator Approval / Rejection
  const handleApprove = async (id) => {
    const res = await approvePlatformRequest(id)
    if (res.ok && res.data?.success) {
      if (res.data.data.dev_invitation_token) {
        setDevInvitationToken(res.data.data.dev_invitation_token)
      }
      loadPlatformData()
    }
  }

  const handleReject = async (id) => {
    if (!rejectionReason) return
    const res = await rejectPlatformRequest(id, rejectionReason)
    if (res.ok && res.data?.success) {
      setRejectingId(null)
      setRejectionReason('')
      loadPlatformData()
    }
  }

  // Assign Initial Administrator (Proprietor Onboarding Wizard)
  const handleAssignInitialAdmin = async (e) => {
    e.preventDefault()
    if (!currentUser?.memberships?.school_id) return
    const res = await assignInitialAdmin(currentUser.memberships.school_id, {
      admin_email: initialAdminEmail
    })
    if (res.ok && res.data?.success) {
      setWorkspaceNotice('First Administrator assigned! School status is now ACTIVE.')
      setInitialAdminEmail('')
      await loadUserData()
      loadWorkspace(currentUser.memberships.school_id, activeRole)
    } else {
      setWorkspaceNotice(`Failed: ${res.data?.error?.message}`)
    }
  }

  // Invite Staff Member (Admin / Proprietor)
  const handleInviteStaff = async (e) => {
    e.preventDefault()
    if (!currentUser?.memberships?.school_id) return
    setInviteNotice(null)
    const res = await inviteStaffMember(
      currentUser.memberships.school_id,
      inviteStaffEmail,
      inviteStaffRole,
      activeRole
    )
    if (res.ok && res.data?.success) {
      setInviteNotice(`Invitation sent to ${inviteStaffEmail} as ${inviteStaffRole}!`)
      if (res.data.data.dev_invitation_token) {
        setDevInvitationToken(res.data.data.dev_invitation_token)
      }
      setInviteStaffEmail('')
      loadWorkspace(currentUser.memberships.school_id, activeRole)
    } else {
      setInviteNotice(`Failed: ${res.data?.error?.message}`)
    }
  }

  // Accept Staff / Proprietor Invitation
  const handleAcceptInvitationSubmit = async (e) => {
    e.preventDefault()
    setInviteAcceptNotice(null)
    const res = await acceptInvitation({
      token: inviteAcceptToken,
      password: inviteAcceptPassword,
      confirm_password: inviteAcceptConfirm
    })
    if (res.ok && res.data?.success) {
      setInviteAcceptNotice({ ok: true, msg: 'Account activated successfully! Logging you into Eduflow...' })
      setCurrentUser(res.data.data.user)
      setTimeout(async () => {
        await loadUserData()
        navigateTo('/workspace', 'workspace')
      }, 1500)
    } else {
      setInviteAcceptNotice({ ok: false, msg: res.data?.error?.message || 'Invitation acceptance failed.' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-100 selection:text-blue-900">
      {/* Universal Top Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#0F172A] text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <button
            onClick={() => navigateTo('/', 'landing')}
            className="flex items-center space-x-3 text-left focus:outline-none group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#3B82F6] flex items-center justify-center font-extrabold text-lg text-white shadow-sm transition-transform group-hover:scale-105">
              E
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
                Eduflow <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Ghana</span>
              </span>
              <p className="text-[10px] text-slate-400">Basic School Management SaaS</p>
            </div>
          </button>

          {/* Center Navigation Links (Public) */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-300">
            <button onClick={() => navigateTo('/', 'landing')} className="hover:text-white transition-colors">
              Overview
            </button>
            <a href="#features" onClick={() => navigateTo('/', 'landing')} className="hover:text-white transition-colors">
              Platform Modules
            </a>
            <a href="#curriculum" onClick={() => navigateTo('/', 'landing')} className="hover:text-white transition-colors">
              GES Curriculum
            </a>
            {currentUser && !currentUser.is_platform_operator && (
              <>
                <button
                  onClick={() => navigateTo('/school-register', 'school-register')}
                  className={`hover:text-white transition-colors ${currentView === 'school-register' ? 'text-[#3B82F6] font-bold' : ''}`}
                >
                  My Schools
                </button>
                {currentUser.memberships?.school_id && (
                  <button
                    onClick={() => navigateTo('/workspace', 'workspace')}
                    className={`hover:text-white transition-colors ${currentView === 'workspace' ? 'text-[#3B82F6] font-bold' : ''}`}
                  >
                    Campus Workspace
                  </button>
                )}
              </>
            )}
            {currentUser?.is_platform_operator && (
              <button
                onClick={() => navigateTo('/admin/dashboard', 'platform-dashboard')}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                <Compass className="w-4 h-4" />
                <span>Operator Console (/admin)</span>
              </button>
            )}
          </nav>

          {/* Right Action / Auth Buttons */}
          <div className="flex items-center space-x-3">
            {currentUser ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-semibold text-slate-200">{currentUser.email}</p>
                  <p className="text-[10px] text-blue-400">{activeRole || (currentUser.is_platform_operator ? 'Platform Operator' : 'Proprietor')}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    navigateTo('/login', 'auth')
                    setAuthTab('login')
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    navigateTo('/signup', 'auth')
                    setAuthTab('signup')
                  }}
                  className="px-4 py-2 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition-all flex items-center space-x-1"
                >
                  <span>Register School</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* VIEW 1: Modern SaaS Public Landing Page */}
      {currentView === 'landing' && (
        <div className="flex-1 flex flex-col">
          {/* Hero Section */}
          <section className="relative overflow-hidden bg-gradient-to-b from-[#0F172A] to-slate-900 text-white py-20 lg:py-28 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
            <div className="max-w-5xl mx-auto text-center space-y-6">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Next-Gen School Management for Ghana</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                The Operating System for Modern <br />
                <span className="text-[#3B82F6]">Basic Schools in Ghana</span>
              </h1>

              <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
                Engineered specifically for Kindergarten, Primary, and Junior High Schools. Unify admissions, GES-aligned grading, real-time fee tracking, and automated parent notifications in one secure platform.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => {
                    navigateTo('/signup', 'auth')
                    setAuthTab('signup')
                  }}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center space-x-2"
                >
                  <span>Register Your School</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    navigateTo('/login', 'auth')
                    setAuthTab('login')
                  }}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-all"
                >
                  Sign In to Campus
                </button>
              </div>

              {/* Trust Badges */}
              <div className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-xs text-slate-400">
                <div className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  <ShieldCheck className="w-4 h-4 text-[#3B82F6]" />
                  <span>GES Aligned Assessment</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span>Multi-Tenant Workspaces</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  <Lock className="w-4 h-4 text-indigo-400" />
                  <span>Strict RBAC Authorization</span>
                </div>
                <div className="flex items-center justify-center space-x-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  <span>Mobile & Web Ready</span>
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-bold text-[#3B82F6] uppercase tracking-wider">Engineered for Excellence</span>
              <h2 className="text-3xl font-extrabold text-[#0F172A] mt-2">Everything Your School Needs to Run Smoothly</h2>
              <p className="text-sm text-slate-600 mt-3">
                No complex setups or confusing workflows. Built from the ground up for Ghanaian proprietors, headteachers, and educators.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#3B82F6] flex items-center justify-center mb-6">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A]">GES Grading & Continuous Assessment</h3>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  Generate standardized terminal reports aligned with NaCCA/GES requirements. Automatic calculations for Class Score (50%) and Exam Score (50%) with grade remarks.
                </p>
              </div>

              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A]">Tuition & Fee Collection</h3>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  Track fee deficits, issue electronic receipts, and support mobile money reconciliation. Keep your school finances clean, transparent, and auditable.
                </p>
              </div>

              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F172A]">Campus RBAC & Staff Onboarding</h3>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  Proprietors invite Administrators; Administrators invite Teachers and Accountants. Strict role enforcement guarantees confidential records stay private.
                </p>
              </div>
            </div>
          </section>

          {/* Quick Action Footer Banner */}
          <section className="bg-slate-100 border-t border-slate-200 py-12 px-4 text-center">
            <h3 className="text-xl font-bold text-[#0F172A]">Are You a School Proprietor or Administrator?</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-xl mx-auto">
              Create an account today to submit your school registration request. Our platform operations team reviews and provisions your isolated campus workspace promptly.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  navigateTo('/signup', 'auth')
                  setAuthTab('signup')
                }}
                className="px-6 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-bold shadow-sm"
              >
                Sign Up Now
              </button>
              <button
                onClick={() => navigateTo('/accept-invite', 'accept-invite')}
                className="px-6 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Got an Invitation Token?
              </button>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: Public Authentication (Login / Register / Forgot Password) */}
      {currentView === 'auth' && (
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-100">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Header / Tabs */}
            <div className="p-6 pb-0">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-[#0F172A]">
                    {authTab === 'login' ? 'Sign In to Eduflow' : 'Create Proprietor Account'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {authTab === 'login'
                      ? 'Enter your credentials to access your school workspace.'
                      : 'Create your account to register and manage your schools.'}
                  </p>
                </div>
                <button
                  onClick={() => navigateTo('/', 'landing')}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                <button
                  onClick={() => { setAuthTab('login'); setAuthError(null); }}
                  className={`flex-1 py-2 rounded-md transition-all ${
                    authTab === 'login' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthTab('signup'); setAuthError(null); }}
                  className={`flex-1 py-2 rounded-md transition-all ${
                    authTab === 'signup' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  New Account
                </button>
              </div>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{authError}</span>
              </div>
            )}

            {/* Form */}
            <div className="p-6 pt-4">
              {authTab === 'login' ? (
                <form onSubmit={handlePublicLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="proprietor@school.edu.gh"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] text-sm"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => navigateTo('/forgot-password', 'forgot-password')}
                        className="text-xs text-[#3B82F6] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center space-x-2"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Sign In</span>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePublicRegister} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Kwame"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Mensah"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="kwame.mensah@gmail.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center space-x-2 mt-4"
                  >
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Create Account</span>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: Public Password Reset / Account Recovery */}
      {currentView === 'forgot-password' && (
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-100">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-[#0F172A]">Account Recovery</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {resetStep === 1 ? 'Enter your registered email to receive a password reset token.' : 'Set your new secure password.'}
                </p>
              </div>
              <button onClick={() => navigateTo('/login', 'auth')} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetMessage && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{resetMessage}</span>
              </div>
            )}
            {resetError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}
            {devResetToken && (
              <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                <span className="font-bold">Dev Recovery Token:</span>
                <p className="font-mono mt-1 break-all">{devResetToken}</p>
              </div>
            )}

            {resetStep === 1 ? (
              <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="proprietor@school.edu.gh"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm"
                >
                  Send Recovery Link
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Recovery Token</label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste single-use token"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-sm shadow-sm"
                >
                  Update Credentials & Sign In
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: School Registration Form (Authenticated User) */}
      {currentView === 'school-register' && (
        <div className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xl font-extrabold text-[#0F172A]">Register a Basic School Campus</h2>
            <p className="text-xs text-slate-500 mt-1">
              Signed in as <span className="font-semibold text-slate-800">{currentUser?.email}</span>. Every proprietor request is reviewed and provisioned into an isolated workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-sm text-[#0F172A] pb-3 border-b border-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#3B82F6]" />
                <span>School Details</span>
              </h3>

              {regMessage && (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                  {regMessage}
                </div>
              )}
              {regError && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                  {regError}
                </div>
              )}

              <form onSubmit={handleSchoolRequestSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">School Name</label>
                  <input
                    type="text"
                    required
                    value={regSchoolName}
                    onChange={(e) => setRegSchoolName(e.target.value)}
                    placeholder="e.g. Achimota Basic Academy"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ghanaian Phone Number</label>
                  <input
                    type="text"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="0241234567 or +233241234567"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm transition-all"
                >
                  Submit Registration Request
                </button>
              </form>

              {/* Single-use email verification box */}
              {devVerifyToken && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 mb-2">Simulated Email Verification Link</h4>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                    <span className="font-semibold text-blue-900">Single-use token:</span>
                    <p className="font-mono text-slate-700 mt-1 break-all">{devVerifyToken}</p>
                  </div>
                  <form onSubmit={handleVerifyToken} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      required
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                      placeholder="Paste token here"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold"
                    >
                      Verify Token
                    </button>
                  </form>
                  {verifyStatus && (
                    <p className={`mt-2 text-xs font-medium ${verifyStatus.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {verifyStatus.msg}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* My Requests Tracker */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-[#0F172A] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#3B82F6]" />
                  <span>My School Applications</span>
                </h3>
                <button
                  onClick={loadMyRequests}
                  className="p-1 rounded text-slate-400 hover:text-slate-600"
                  title="Refresh status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {mySchoolRequests.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No school requests submitted yet.</p>
                ) : (
                  mySchoolRequests.map((req) => (
                    <div key={req.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{req.school_name}</h4>
                          <span className="text-[11px] text-slate-500 font-mono">{req.contact_phone}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          req.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-800' :
                          req.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          req.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700'
                        }`}>
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
                            onClick={async () => {
                              await loadUserData()
                              loadWorkspace(req.school.id)
                              navigateTo('/workspace', 'workspace')
                            }}
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
      )}

      {/* VIEW 5: Dedicated Platform Operator Portal */}
      {currentView === 'platform-login' && (
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-[#0B1120]">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-2xl text-white">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-extrabold text-white">Platform Administrator Portal</h2>
              <p className="text-xs text-slate-400 mt-1">Authorized Eduflow operations personnel only.</p>
              <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-amber-400 border border-amber-500/20">
                Route: /admin
              </div>
            </div>

            {platformError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{platformError}</span>
              </div>
            )}

            <form onSubmit={handlePlatformLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Administrative Email</label>
                <input
                  type="email"
                  required
                  value={platformEmail}
                  onChange={(e) => setPlatformEmail(e.target.value)}
                  placeholder="operator@eduflow.org"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Secure Passkey</label>
                <input
                  type="password"
                  required
                  value={platformPassword}
                  onChange={(e) => setPlatformPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
              >
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Authenticate Operator</span>}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => navigateTo('/', 'landing')}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1"
              >
                <span>← Back to Eduflow Public Website</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 6: Platform Operator Dashboard */}
      {currentView === 'platform-dashboard' && (
        <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
          {/* Dashboard Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span>Eduflow Platform Administration • /admin</span>
              </div>
              <h1 className="text-2xl font-black text-[#0F172A] mt-1">Platform Operations Dashboard</h1>
              <p className="text-xs text-slate-500">Supervise school workspaces, review pending registrations, and enforce platform governance.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateTo('/', 'landing')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm"
              >
                View Public Site
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit Admin</span>
              </button>
            </div>
          </div>

          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Schools</span>
              <p className="text-2xl font-black text-[#0F172A] mt-2">{platformStats?.total_schools || 0}</p>
              <span className="text-[11px] text-emerald-600 font-medium">Workspaces Managed</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Review</span>
              <p className="text-2xl font-black text-amber-600 mt-2">{platformStats?.pending_requests || 0}</p>
              <span className="text-[11px] text-slate-500 font-medium">Awaiting Inspection</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Campuses</span>
              <p className="text-2xl font-black text-[#3B82F6] mt-2">{platformStats?.active_schools || 0}</p>
              <span className="text-[11px] text-slate-500 font-medium">Live Operational</span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Registered Users</span>
              <p className="text-2xl font-black text-slate-900 mt-2">{platformStats?.total_users || 0}</p>
              <span className="text-[11px] text-slate-500 font-medium">Platform Identities</span>
            </div>
          </div>

          {/* New School Requests Queue */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-base text-[#0F172A]">Platform Review Queue</h3>
                <p className="text-xs text-slate-500">Inspect verified prospective school applications.</p>
              </div>
              <button
                onClick={loadPlatformData}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${platformLoading ? 'animate-spin' : ''}`} />
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
                  {platformRequests.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-400">
                        No requests waiting in the queue.
                      </td>
                    </tr>
                  ) : (
                    platformRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">{req.school_name}</td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>{req.requester_name}</div>
                          <div className="text-[10px] text-slate-400">{req.contact_email}</div>
                        </td>
                        <td className="py-3 px-4 font-mono">{req.contact_phone}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${
                            req.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                            req.status === 'UNDER_REVIEW' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {req.status === 'PENDING' && (
                            <button
                              onClick={async () => {
                                await reviewPlatformRequest(req.id)
                                loadPlatformData()
                              }}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                            >
                              Review
                            </button>
                          )}
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="px-2.5 py-1 rounded bg-[#3B82F6] hover:bg-blue-600 text-white font-bold"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(req.id)}
                            className="px-2.5 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rejection Prompt */}
            {rejectingId && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 space-y-3">
                <span className="text-xs font-bold text-red-900 uppercase">Mandatory Rejection Reason</span>
                <input
                  type="text"
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State reason (e.g. Unverified GES registration)..."
                  className="w-full p-2 text-xs rounded border border-red-300"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRejectingId(null)} className="px-3 py-1 text-xs text-slate-600 bg-white border rounded">
                    Cancel
                  </button>
                  <button onClick={() => handleReject(rejectingId)} className="px-3 py-1 text-xs text-white bg-red-600 rounded font-bold">
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* All Schools Management Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-extrabold text-base text-[#0F172A] pb-3 border-b border-slate-100">
              Total Provisioned Campuses
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 uppercase text-slate-500 font-bold bg-slate-50/50">
                    <th className="py-3 px-4">School Name</th>
                    <th className="py-3 px-4">Slug</th>
                    <th className="py-3 px-4">Active Members</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Administrative Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {platformSchools.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-400">No schools provisioned yet.</td>
                    </tr>
                  ) : (
                    platformSchools.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{s.slug}</td>
                        <td className="py-3 px-4 font-medium">{s.members_count} members</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${
                            s.workspace_status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                            s.workspace_status === 'SUSPENDED' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {s.workspace_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {s.workspace_status === 'SUSPENDED' ? (
                            <button
                              onClick={async () => {
                                await reactivateSchool(s.id)
                                loadPlatformData()
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                await suspendSchool(s.id)
                                loadPlatformData()
                              }}
                              className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold"
                            >
                              Suspend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 7: Proprietor / Administrator Campus Workspace */}
      {currentView === 'workspace' && (
        <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
          {workspaceNotice && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium flex items-center justify-between">
              <span>{workspaceNotice}</span>
              <button onClick={() => setWorkspaceNotice(null)} className="text-blue-500 hover:text-blue-700 font-bold">×</button>
            </div>
          )}

          {/* Workspace Hero Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Campus Workspace
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  workspaceData?.workspace_status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {workspaceData?.workspace_status || 'ONBOARDING'}
                </span>
              </div>
              <h2 className="text-2xl font-black text-[#0F172A] mt-1">{workspaceData?.name || 'School Workspace'}</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Slug: {workspaceData?.slug}</p>
            </div>

            {/* Role Context Pill */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Active Context (X-Active-Role)</span>
                <span className="text-sm font-extrabold text-[#3B82F6]">{activeRole || 'Authenticated'}</span>
              </div>
              {currentUser?.memberships?.assigned_roles?.length > 1 && (
                <div className="flex gap-1">
                  {currentUser.memberships.assigned_roles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setActiveRole(r)}
                      className={`text-xs px-2.5 py-1 rounded font-bold ${
                        activeRole === r ? 'bg-[#3B82F6] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Onboarding Wizard (If school is not ACTIVE) */}
          {workspaceData?.workspace_status !== 'ACTIVE' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-amber-900">First-Time School Onboarding Wizard</h3>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                As Proprietor, assign or invite the first <strong>Administrator</strong> to transition your campus workspace to <strong>ACTIVE</strong> and unlock operational modules.
              </p>

              <form onSubmit={handleAssignInitialAdmin} className="flex flex-col sm:flex-row gap-3 pt-2">
                <input
                  type="email"
                  required
                  value={initialAdminEmail}
                  onChange={(e) => setInitialAdminEmail(e.target.value)}
                  placeholder="admin@school.edu.gh (or your email to assign yourself)"
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-amber-300 bg-white text-sm"
                />
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold shadow-sm"
                >
                  Assign First Administrator
                </button>
              </form>
            </div>
          )}

          {/* Member Roster & Staff Management */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Invite Staff Member Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 h-fit">
              <h3 className="font-bold text-sm text-[#0F172A] pb-3 border-b border-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#3B82F6]" />
                <span>Invite Staff Member</span>
              </h3>

              {inviteNotice && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                  {inviteNotice}
                </div>
              )}

              {devInvitationToken && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                  <span className="font-bold">Staff Invitation Token:</span>
                  <p className="font-mono mt-1 break-all">{devInvitationToken}</p>
                </div>
              )}

              <form onSubmit={handleInviteStaff} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Member Email</label>
                  <input
                    type="email"
                    required
                    value={inviteStaffEmail}
                    onChange={(e) => setInviteStaffEmail(e.target.value)}
                    placeholder="teacher@school.edu.gh"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Role</label>
                  <select
                    value={inviteStaffRole}
                    onChange={(e) => setInviteStaffRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                  >
                    <option value="CLASS_TEACHER">Class Teacher</option>
                    <option value="SUBJECT_TEACHER">Subject Teacher</option>
                    <option value="HEADMASTER">Headmaster</option>
                    <option value="ACCOUNTANT">Accountant</option>
                    <option value="ADMINISTRATOR">Administrator</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-xs shadow-sm transition-all"
                >
                  Dispatch Staff Invitation
                </button>
              </form>
            </div>

            {/* Right: Active Member Roster */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-[#0F172A] pb-3 border-b border-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3B82F6]" />
                <span>Campus Staff & Faculty Roster</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase text-slate-500 font-bold bg-slate-50/50">
                      <th className="py-3 px-4">Member Email</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Assigned Roles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspaceData?.members?.map((m) => (
                      <tr key={m.user_id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.email}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${
                            m.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {m.is_active ? 'Active' : 'Invited'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {m.roles.map((r) => (
                              <span key={r} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200/50">
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 8: Accept Invitation Form */}
      {currentView === 'accept-invite' && (
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-100">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-extrabold text-[#0F172A]">Accept Staff Invitation</h2>
                <p className="text-xs text-slate-500 mt-1">Activate your staff account and set your password.</p>
              </div>
              <button onClick={() => navigateTo('/', 'landing')} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteAcceptNotice && (
              <div className={`mb-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
                inviteAcceptNotice.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {inviteAcceptNotice.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                <span>{inviteAcceptNotice.msg}</span>
              </div>
            )}

            <form onSubmit={handleAcceptInvitationSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Invitation Token</label>
                <input
                  type="text"
                  required
                  value={inviteAcceptToken}
                  onChange={(e) => setInviteAcceptToken(e.target.value)}
                  placeholder="Paste invitation token from email"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Establish Password</label>
                <input
                  type="password"
                  required
                  value={inviteAcceptPassword}
                  onChange={(e) => setInviteAcceptPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={inviteAcceptConfirm}
                  onChange={(e) => setInviteAcceptConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white font-bold text-sm shadow-sm"
              >
                Activate Account & Enter Campus
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Universal Footer */}
      <footer className="bg-[#0F172A] text-slate-400 border-t border-slate-800 py-6 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 Eduflow Ghana. Built for KG, Primary, and Junior High Schools.</p>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateTo('/admin', 'platform-login')}
              className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Platform Operator Portal</span>
            </button>
            <span>•</span>
            <a href="/api/v1/docs/swagger/" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white transition-colors">
              OpenAPI Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
