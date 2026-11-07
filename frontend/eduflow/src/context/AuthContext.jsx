import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  login as apiLogin,
  register as apiRegister,
  platformLogin as apiPlatformLogin,
  logout as apiLogout,
  fetchCurrentUser,
  getAccessToken
} from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [activeRole, setActiveRole] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Global Auth Modal State for seamless login/signup anywhere
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState('login') // 'login' | 'signup'

  const openAuthModal = (tab = 'login') => {
    setAuthModalTab(tab)
    setAuthModalOpen(true)
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
  }

  const loadUserData = async () => {
    if (getAccessToken()) {
      try {
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
      } catch {
        setCurrentUser(null)
      }
    } else {
      setCurrentUser(null)
    }
    return null
  }

  useEffect(() => {
    setAuthLoading(true)
    loadUserData().finally(() => {
      setAuthLoading(false)
    })
  }, [])

  const login = async (email, password) => {
    const res = await apiLogin(email, password)
    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      const roles = user?.memberships?.assigned_roles || []
      if (roles.length > 0) setActiveRole(roles[0])
      closeAuthModal()
      return { ok: true, user }
    }
    return { ok: false, error: res.data?.error?.message || 'Login failed.' }
  }

  const register = async (firstName, lastName, email, password, confirmPassword) => {
    const res = await apiRegister(firstName, lastName, email, password, confirmPassword)
    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      closeAuthModal()
      return { ok: true, user }
    }
    return { ok: false, error: res.data?.error?.message || 'Registration failed.' }
  }

  const platformLogin = async (email, password) => {
    const res = await apiPlatformLogin(email, password)
    if (res.ok && res.data?.success) {
      const user = res.data.data.user
      setCurrentUser(user)
      return { ok: true, user }
    }
    return {
      ok: false,
      error: res.data?.error?.message || 'Platform authentication failed. Authorized personnel only.'
    }
  }

  const logout = async () => {
    await apiLogout()
    setCurrentUser(null)
    setActiveRole(null)
  }

  const value = {
    currentUser,
    activeRole,
    setActiveRole,
    authLoading,
    authModalOpen,
    authModalTab,
    setAuthModalTab,
    openAuthModal,
    closeAuthModal,
    login,
    register,
    platformLogin,
    logout,
    loadUserData,
    isAuthenticated: Boolean(currentUser),
    isPlatformOperator: Boolean(currentUser?.is_platform_operator)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

