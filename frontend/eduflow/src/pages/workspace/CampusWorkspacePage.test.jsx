import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { CampusWorkspacePage } from './CampusWorkspacePage'
import * as api from '../../services/api'

describe('CampusWorkspacePage Feature 2 Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    api.setAccessToken('mock-access-token')
    vi.spyOn(api, 'fetchCurrentUser').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          id: 'user-123',
          email: 'proprietor@accramodern.edu.gh',
          first_name: 'Kwame',
          last_name: 'Mensah',
          memberships: {
            school_id: 'school-999',
            school_name: 'Accra Modern Academy',
            school_slug: 'accra-modern',
            status: 'ACTIVE',
            assigned_roles: ['PROPRIETOR', 'ADMINISTRATOR']
          }
        }
      }
    })

    vi.spyOn(api, 'fetchSchoolWorkspace').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          school: {
            id: 'school-999',
            name: 'Accra Modern Academy',
            slug: 'accra-modern',
            workspace_status: 'ACTIVE'
          },
          members: [
            {
              id: 'mem-1',
              user_id: 'user-123',
              email: 'proprietor@accramodern.edu.gh',
              first_name: 'Kwame',
              last_name: 'Mensah',
              roles: ['PROPRIETOR']
            }
          ]
        }
      }
    })

    vi.spyOn(api, 'fetchSchoolProfile').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          display_name: 'Accra Modern Academy',
          motto: 'Excellence in Education',
          school_type: 'BASIC_COMPLETE',
          gps_address: 'GA-183-9024',
          region: 'Greater Accra',
          district: 'Ayawaso West',
          contact_email: 'info@accramodern.edu.gh'
        }
      }
    })

    vi.spyOn(api, 'fetchAcademicYears').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [
          {
            id: 'year-1',
            name: '2026/2027',
            start_date: '2026-09-01',
            end_date: '2027-07-31',
            status: 'ACTIVE',
            terms: [
              { id: 'term-1', term_number: 1, name: 'First Term', start_date: '2026-09-08', end_date: '2026-12-17', status: 'ACTIVE' }
            ]
          }
        ]
      }
    })

    vi.spyOn(api, 'fetchClassLevels').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [
          { id: 'lvl-1', name: 'Basic 1', stage: 'LOWER_PRIMARY', order_index: 3, groups: [{ id: 'grp-1', display_name: 'Basic 1' }] }
        ]
      }
    })

    vi.spyOn(api, 'fetchClassGroups').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [{ id: 'grp-1', display_name: 'Basic 1' }]
      }
    })

    vi.spyOn(api, 'fetchSubjects').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [
          { id: 'subj-1', name: 'Mathematics', code: 'MATH', category: 'CORE' }
        ]
      }
    })

    vi.spyOn(api, 'fetchClassSubjects').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: []
      }
    })

    vi.spyOn(api, 'fetchSchoolStaff').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [
          {
            id: 'mem-1',
            user_id: 'user-123',
            email: 'proprietor@accramodern.edu.gh',
            full_name: 'Kwame Mensah',
            status: 'ACTIVE',
            roles: ['PROPRIETOR']
          }
        ]
      }
    })

    vi.spyOn(api, 'fetchClassTeacherAssignments').mockResolvedValue({
      ok: true,
      data: { success: true, data: [] }
    })
    vi.spyOn(api, 'fetchSubjectTeacherAssignments').mockResolvedValue({
      ok: true,
      data: { success: true, data: [] }
    })
  })

  it('renders workspace navigation tabs for Feature 2', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CampusWorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /School Profile/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Academic Calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Classes & Streams/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subject Catalogue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Staff & Governance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Teaching Assignments/i })).toBeInTheDocument()
  })

  it('switches between tabs and displays relevant section data', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CampusWorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    )

    // Default tab is School Profile
    await waitFor(() => {
      expect(screen.getByText(/Institutional Profile/i)).toBeInTheDocument()
    })

    // Switch to Academic Calendar
    fireEvent.click(screen.getByRole('button', { name: /Academic Calendar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Academic Calendar & Term Schedules/i)).toBeInTheDocument()
    })

    // Switch to Staff Governance
    fireEvent.click(screen.getByRole('button', { name: /Staff & Governance/i }))
    await waitFor(() => {
      expect(screen.getByText(/Staff Governance & Employment Security/i)).toBeInTheDocument()
    })
  })
})
