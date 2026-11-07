import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { AdminLoginPage } from './AdminLoginPage'
import * as api from '../../services/api'

describe('AdminLoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders dedicated platform operator login form with route badge', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <AdminLoginPage />
        </AuthProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/Platform Administrator Portal/i)).toBeInTheDocument()
    expect(screen.getByText(/Route: \/admin/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('operator@eduflow.org')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Authenticate Operator/i })).toBeInTheDocument()
    expect(screen.getByText(/← Back to Eduflow Public Website/i)).toBeInTheDocument()
  })

  it('displays error message on invalid administrative credentials', async () => {
    vi.spyOn(api, 'platformLogin').mockResolvedValue({
      ok: false,
      data: {
        error: { message: 'Invalid administrative credentials.' }
      }
    })

    render(
      <BrowserRouter>
        <AuthProvider>
          <AdminLoginPage />
        </AuthProvider>
      </BrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText('operator@eduflow.org'), {
      target: { value: 'wrong@eduflow.org' }
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'WrongPass' }
    })

    fireEvent.click(screen.getByRole('button', { name: /Authenticate Operator/i }))

    expect(await screen.findByText(/Invalid administrative credentials/i)).toBeInTheDocument()
  })
})

