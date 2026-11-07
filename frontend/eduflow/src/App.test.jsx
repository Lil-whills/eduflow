import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { App } from './App'
import * as api from './services/api'

describe('Eduflow App UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders Eduflow SaaS landing page with Ghanaian basic school branding', () => {
    vi.spyOn(api, 'getAccessToken').mockReturnValue(null)

    render(<App />)

    expect(screen.getAllByText(/Eduflow/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/The Operating System for Modern/i)).toBeInTheDocument()
    expect(screen.getByText(/Basic Schools in Ghana/i)).toBeInTheDocument()
    expect(screen.getByText(/GES Aligned Assessment/i)).toBeInTheDocument()
    expect(screen.getByText(/Platform Operator Portal/i)).toBeInTheDocument()
  })

  it('allows opening public authentication modal with Sign In and New Account tabs', () => {
    vi.spyOn(api, 'getAccessToken').mockReturnValue(null)

    render(<App />)

    // Click Sign In
    const signInBtn = screen.getByRole('button', { name: /^Sign In$/i })
    fireEvent.click(signInBtn)

    expect(screen.getByText(/Sign In to Eduflow/i)).toBeInTheDocument()
    expect(screen.getByText(/Forgot password\?/i)).toBeInTheDocument()

    // Switch to New Account
    const newAccountBtn = screen.getByRole('button', { name: /New Account/i })
    fireEvent.click(newAccountBtn)

    expect(screen.getByText(/Create Proprietor Account/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Kwame')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mensah')).toBeInTheDocument()
  })

  it('allows navigating to Platform Operator Portal via separate /admin route', () => {
    vi.spyOn(api, 'getAccessToken').mockReturnValue(null)

    render(<App />)

    const operatorPortalBtn = screen.getByRole('button', { name: /Platform Operator Portal/i })
    fireEvent.click(operatorPortalBtn)

    expect(screen.getByText(/Platform Administrator Portal/i)).toBeInTheDocument()
    expect(screen.getByText(/Authenticate Operator/i)).toBeInTheDocument()
    expect(screen.getByText(/Route: \/admin/i)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin')

    // Click Back to Public Website
    const backBtn = screen.getByRole('button', { name: /Back to Eduflow Public Website/i })
    fireEvent.click(backBtn)
    expect(window.location.pathname).toBe('/')
    expect(screen.getByText(/The Operating System for Modern/i)).toBeInTheDocument()
  })

  it('renders Platform Operator Portal directly when visiting /admin URL', () => {
    vi.spyOn(api, 'getAccessToken').mockReturnValue(null)
    window.history.pushState(null, '', '/admin')

    render(<App />)

    expect(screen.getByText(/Platform Administrator Portal/i)).toBeInTheDocument()
    expect(screen.getByText(/Route: \/admin/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('operator@eduflow.org')).toBeInTheDocument()
    expect(screen.queryByText(/The Operating System for Modern/i)).not.toBeInTheDocument()
  })
})
