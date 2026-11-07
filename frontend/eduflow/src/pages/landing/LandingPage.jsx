import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Lock,
  Laptop,
  GraduationCap,
  BarChart3,
  Users
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export function LandingPage() {
  const { openAuthModal } = useAuth()
  const navigate = useNavigate()

  return (
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
              type="button"
              onClick={() => openAuthModal('signup')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#3B82F6] hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Register Your School</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
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
            type="button"
            onClick={() => openAuthModal('signup')}
            className="px-6 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-blue-600 text-white text-xs font-bold shadow-sm cursor-pointer"
          >
            Sign Up Now
          </button>
          <button
            type="button"
            onClick={() => navigate('/accept-invite')}
            className="px-6 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            Got an Invitation Token?
          </button>
        </div>
      </section>
    </div>
  )
}

