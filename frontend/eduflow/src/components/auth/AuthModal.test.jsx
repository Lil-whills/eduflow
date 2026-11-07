import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import { AuthModal } from './AuthModal'
import * as api from '../../services/api'

function TestWrapper() {
  const { openAuthModal } = useAuth()
  return (
    <div>
      <button onClick={() => openAuthModal('login')}>Open Modal</button>
      <AuthModal />
    </div>
  )
}

describe('AuthModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('allows switching between Sign In and New Account tabs', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestWrapper />
        </AuthProvider>
      </BrowserRouter>
    )

    fireEvent.click(screen.getByText('Open Modal'))

    expect(screen.getByText('Sign In to Eduflow')).toBeInTheDocument()

    // Switch to New Account
    fireEvent.click(screen.getByRole('button', { name: /^New Account$/i }))
    expect(screen.getByText('Create Proprietor Account')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Kwame')).toBeInTheDocument()

    // Switch back to Sign In
    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }))
    expect(screen.getByText('Sign In to Eduflow')).toBeInTheDocument()
  })
})

