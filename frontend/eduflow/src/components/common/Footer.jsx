import React from 'react'
import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-[#0F172A] text-slate-400 border-t border-slate-800 py-6 px-4 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <p>© 2026 Eduflow Ghana. Built for KG, Primary, and Junior High Schools.</p>
        <div className="flex items-center space-x-4">
          <Link
            to="/admin"
            className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Platform Operator Portal</span>
          </Link>
          <span>•</span>
          <a
            href="/api/v1/docs/swagger/"
            target="_blank"
            rel="noreferrer"
            className="text-slate-500 hover:text-white transition-colors"
          >
            OpenAPI Docs
          </a>
        </div>
      </div>
    </footer>
  )
}

