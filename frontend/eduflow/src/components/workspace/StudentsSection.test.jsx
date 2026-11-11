import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StudentsSection } from './StudentsSection'
import * as api from '../../services/api'

describe('StudentsSection Feature 3 Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(api, 'fetchAcademicYears').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [{ id: 'year-1', name: '2026/2027', status: 'ACTIVE' }]
      }
    })

    vi.spyOn(api, 'fetchClassLevels').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [{ id: 'lvl-1', name: 'Basic 4', stage: 'UPPER_PRIMARY' }]
      }
    })

    vi.spyOn(api, 'fetchClassGroups').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: [
          { id: 'grp-1', display_name: 'Basic 4A' },
          { id: 'grp-2', display_name: 'Basic 4B' }
        ]
      }
    })

    vi.spyOn(api, 'fetchStudents').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          total: 2,
          page: 1,
          page_size: 25,
          results: [
            {
              id: 'stu-1',
              admission_number: 'ACC/2026/0001',
              full_name: 'Kofi Mensah',
              status: 'ACTIVE',
              current_enrollment: {
                class_group_name: 'Basic 4A',
                academic_year_name: '2026/2027'
              },
              primary_contact: {
                name: 'Grace Mensah',
                relationship: 'MOTHER',
                phone_primary: '+233241112233'
              }
            },
            {
              id: 'stu-2',
              admission_number: 'ACC/2026/0002',
              full_name: 'Ama Boateng',
              status: 'ACTIVE',
              current_enrollment: {
                class_group_name: 'Basic 4B',
                academic_year_name: '2026/2027'
              },
              primary_contact: {
                name: 'Kojo Boateng',
                relationship: 'FATHER',
                phone_primary: '+233242223344'
              }
            }
          ]
        }
      }
    })

    vi.spyOn(api, 'fetchClassSummaryReport').mockResolvedValue({
      ok: true,
      data: {
        success: true,
        data: {
          academic_year: { id: 'year-1', name: '2026/2027', status: 'ACTIVE' },
          total_active_students: 61,
          class_levels: [
            {
              id: 'lvl-1',
              name: 'Basic 4',
              stage: 'UPPER_PRIMARY',
              order_index: 6,
              total_active_students: 61,
              streams: [
                { id: 'grp-1', display_name: 'Basic 4A', stream_name: 'A', active_students: 32 },
                { id: 'grp-2', display_name: 'Basic 4B', stream_name: 'B', active_students: 29 }
              ]
            }
          ]
        }
      }
    })

    vi.spyOn(api, 'fetchDuplicateReviews').mockResolvedValue({
      ok: true,
      data: { success: true, data: [] }
    })
  })

  it('renders student directory with search, filter, and learner records', async () => {
    render(
      <StudentsSection
        schoolId="school-123"
        activeRole="ADMINISTRATOR"
        canEdit={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Student Management & Enrollment')).toBeInTheDocument()
    })

    expect(screen.getByText('ACC/2026/0001')).toBeInTheDocument()
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument()
    expect(screen.getByText('ACC/2026/0002')).toBeInTheDocument()
    expect(screen.getByText('Ama Boateng')).toBeInTheDocument()

    // Action buttons visible for Administrator
    expect(screen.getByRole('button', { name: /Register Student/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bulk Import \(CSV\)/i })).toBeInTheDocument()
  })

  it('switches to GES Class Group & Parent Totals view showing stream and aggregate counts', async () => {
    render(
      <StudentsSection
        schoolId="school-123"
        activeRole="ADMINISTRATOR"
        canEdit={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Student Directory (2)')).toBeInTheDocument()
    })

    // Click Class Group & Parent Totals tab
    fireEvent.click(screen.getByRole('button', { name: /Class Group & Parent Totals/i }))

    await waitFor(() => {
      expect(screen.getByText(/Ghana Education Service \(GES\) Class Totals/i)).toBeInTheDocument()
    })

    // Shows aggregate parent total
    expect(screen.getByText('61 Learners')).toBeInTheDocument()
    expect(screen.getByText('61')).toBeInTheDocument() // Class 4 total
    // Shows separate streamed groups
    expect(screen.getByText('32 students')).toBeInTheDocument() // Basic 4A
    expect(screen.getByText('29 students')).toBeInTheDocument() // Basic 4B
  })
})

