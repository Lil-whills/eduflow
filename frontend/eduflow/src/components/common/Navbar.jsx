import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, ArrowRight, Compass } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export function Navbar() {
  const { currentUser, activeRole, logout, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    const isOp = currentUser?.is_platform_operator || location.pathname.startsWith('/admin')
    await logout()
    if (isOp) {
      navigate('/admin')
    } else {
      navigate('/')
    }
  }

  const isActive = (path) => location.pathname === path

  return (
    <header className="sticky top-0 z-50 bg-[#0F172A] text-white border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <Link to="/" className="flex items-center space-x-3 text-left focus:outline-none group">
          <div className="w-9 h-9 rounded-xl bg-[#3B82F6] flex items-center justify-center font-extrabold text-lg text-white shadow-sm transition-transform group-hover:scale-105">
            E
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
              Eduflow <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Ghana</span>
            </span>
            <p className="text-[10px] text-slate-400">Basic School Management SaaS</p>
          </div>
        </Link>

        {/* Center Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-300">
          <Link
            to="/"
            className={`hover:text-white transition-colors ${isActive('/') ? 'text-[#3B82F6] font-bold' : ''}`}
          >
            Overview
          </Link>
          <a href="/#features" className="hover:text-white transition-colors">
            Platform Modules
          </a>
          <a href="/#curriculum" className="hover:text-white transition-colors">
            GES Curriculum
          </a>

          {currentUser && !currentUser.is_platform_operator && (
            <>
              <Link
                to="/school-register"
                className={`hover:text-white transition-colors ${isActive('/school-register') ? 'text-[#3B82F6] font-bold' : ''}`}
              >
                My Schools
              </Link>
              {currentUser.memberships?.school_id && (
                <Link
                  to="/workspace"
                  className={`hover:text-white transition-colors ${isActive('/workspace') ? 'text-[#3B82F6] font-bold' : ''}`}
                >
                  Campus Workspace
                </Link>
              )}
            </>
          )}

          {currentUser?.is_platform_operator && (
            <Link
              to="/admin/dashboard"
              className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
            >
              <Compass className="w-4 h-4" />
              <span>Operator Console (/admin)</span>
            </Link>
          )}
        </nav>

        {/* Right Action / Auth Controls */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-semibold text-slate-200">{currentUser.email}</p>
                <p className="text-[10px] text-blue-400">
                  {activeRole || (currentUser.is_platform_operator ? 'Platform Operator' : 'Proprietor')}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => openAuthModal('login')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal('signup')}
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
  )
}

