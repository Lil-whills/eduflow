/**
 * API service client for Eduflow SaaS Platform.
 * Communicates with versioned Django REST Framework backend at /api/v1/.
 *
 * Implements:
 * 1. Hybrid token transport: In-memory access token + HttpOnly cookie refresh token.
 * 2. Single-flight refresh mutex via Web Locks API (with fallback queue).
 * 3. Durable retry header (X-Refresh-Idempotency-Key).
 * 4. Standardized success and error response handling.
 * 5. Multi-tenant workspace and active-role context header injection (X-Active-Role).
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Access token storage with persistent reload recovery
let inMemoryAccessToken = typeof window !== 'undefined' ? sessionStorage.getItem('eduflow_access_token') : null;
let refreshPromise = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('eduflow_access_token', token);
    } else {
      sessionStorage.removeItem('eduflow_access_token');
    }
  }
}

export function getAccessToken() {
  if (!inMemoryAccessToken && typeof window !== 'undefined') {
    inMemoryAccessToken = sessionStorage.getItem('eduflow_access_token');
  }
  return inMemoryAccessToken;
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('eduflow_access_token');
  }
}

/**
 * Universal Error Formatter for Eduflow SaaS API Responses.
 * Unpacks field-level validation errors, network failures, and domain messages
 * into human-readable, precise error guidance.
 */
export function formatApiError(res, defaultMsg = 'An error occurred. Please try again.') {
  if (!res) return defaultMsg;

  // 1. Network / Server connection failures
  if (
    res.status === 0 ||
    res.data?.error?.code === 'NETWORK_ERROR' ||
    res.data?.error?.message === 'Failed to fetch' ||
    res.data?.error?.message?.includes('NetworkError')
  ) {
    return 'Unable to communicate with the Eduflow backend server. Please check your network connection or make sure the Django server is running on http://127.0.0.1:8000.';
  }

  const errObj = res.data?.error;

  // 2. Unpack field-level validation details
  const details = errObj?.details;
  if (details && typeof details === 'object') {
    if (Array.isArray(details)) {
      return details.join('\n');
    }
    const lines = [];
    for (const [key, val] of Object.entries(details)) {
      const fieldTitle = key === 'non_field_errors' ? '' : `${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: `;
      const messageText = Array.isArray(val) ? val.join(', ') : String(val);
      lines.push(`• ${fieldTitle}${messageText}`);
    }
    if (lines.length > 0) {
      return lines.join('\n');
    }
  }

  // 3. Fallback to API error message
  if (errObj?.message) {
    return errObj.message;
  }

  // 4. Fallback to DRF standard detail
  if (res.data?.detail) {
    return res.data.detail;
  }

  if (typeof res.data === 'string' && res.data.trim()) {
    return res.data;
  }

  return defaultMsg;
}

/**
 * Executes a single-flight token refresh coordinated across browser tabs.
 */
export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const performRefresh = async () => {
    try {
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`;
      const response = await fetch(`${API_BASE_URL}/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Refresh-Idempotency-Key': idempotencyKey,
        },
        credentials: 'include', // Includes HttpOnly cookie
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setAccessToken(data.data.access);
        return { ok: true, access: data.data.access };
      } else {
        clearAccessToken();
        return { ok: false, error: data.error };
      }
    } catch (err) {
      return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
    } finally {
      refreshPromise = null;
    }
  };

  // Use Web Locks API if supported for cross-tab single-flight lock
  if (typeof navigator !== 'undefined' && navigator.locks) {
    refreshPromise = navigator.locks.request('eduflow_auth_refresh', performRefresh);
  } else {
    refreshPromise = performRefresh();
  }

  return refreshPromise;
}

/**
 * Authenticated API request wrapper with automatic 401 token refresh retry.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (inMemoryAccessToken) {
    headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: {
        success: false,
        error: { code: 'NETWORK_ERROR', message: err.message },
      },
    };
  }

  // Handle 401 Unauthorized via single-flight refresh
  if (response.status === 401 && !endpoint.includes('/auth/login/') && !endpoint.includes('/auth/refresh/')) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.ok) {
      headers['Authorization'] = `Bearer ${refreshResult.access}`;
      const retryResponse = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      const retryData = await retryResponse.json();
      return {
        ok: retryResponse.ok,
        status: retryResponse.status,
        data: retryData,
      };
    }
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// ----------------------------------------------------------------------
// Public Authentication Endpoints
// ----------------------------------------------------------------------

export async function register(firstName, lastName, email, password, confirmPassword) {
  const res = await apiFetch('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      confirm_password: confirmPassword,
    }),
  });

  if (res.ok && res.data?.success) {
    setAccessToken(res.data.data.access);
  }
  return res;
}

export async function login(email, password) {
  const res = await apiFetch('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.ok && res.data?.success) {
    setAccessToken(res.data.data.access);
  }
  return res;
}

export async function logout() {
  const res = await apiFetch('/auth/logout/', {
    method: 'POST',
  });
  clearAccessToken();
  return res;
}

export async function fetchCurrentUser() {
  return await apiFetch('/auth/me/', {
    method: 'GET',
  });
}

export async function acceptInvitation(payload) {
  const res = await apiFetch('/auth/invitations/accept/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.ok && res.data?.success) {
    setAccessToken(res.data.data.access);
  }
  return res;
}

export async function requestPasswordReset(email) {
  return await apiFetch('/auth/password-reset/request/', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token, password, confirmPassword) {
  return await apiFetch('/auth/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify({
      token,
      password,
      confirm_password: confirmPassword,
    }),
  });
}

// ----------------------------------------------------------------------
// Platform Operator Dedicated Authentication & Dashboard
// ----------------------------------------------------------------------

export async function platformLogin(email, password) {
  const res = await apiFetch('/admin/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (res.ok && res.data?.success) {
    setAccessToken(res.data.data.access);
  }
  return res;
}

export async function fetchPlatformStats() {
  return await apiFetch('/platform/stats/', {
    method: 'GET',
  });
}

export async function fetchPlatformSchools(statusFilter = '') {
  const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return await apiFetch(`/platform/schools/${q}`, {
    method: 'GET',
  });
}

export async function suspendSchool(schoolId) {
  return await apiFetch(`/platform/schools/${schoolId}/suspend/`, {
    method: 'POST',
  });
}

export async function reactivateSchool(schoolId) {
  return await apiFetch(`/platform/schools/${schoolId}/reactivate/`, {
    method: 'POST',
  });
}

// ----------------------------------------------------------------------
// System Health
// ----------------------------------------------------------------------

export async function fetchHealthStatus() {
  return await apiFetch('/health/', {
    method: 'GET',
  });
}

// ----------------------------------------------------------------------
// School Registration & Verification
// ----------------------------------------------------------------------

export async function submitSchoolRequest(payload) {
  return await apiFetch('/schools/requests/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifySchoolRequest(token) {
  return await apiFetch('/schools/requests/verify/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendSchoolVerification(contact_email) {
  return await apiFetch('/schools/requests/resend-verification/', {
    method: 'POST',
    body: JSON.stringify({ contact_email }),
  });
}

export async function fetchMySchoolRequests() {
  return await apiFetch('/schools/my-requests/', {
    method: 'GET',
  });
}

// ----------------------------------------------------------------------
// Platform Operator Review & Provisioning Queue
// ----------------------------------------------------------------------

export async function fetchPlatformRequests(statusFilter = '') {
  const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return await apiFetch(`/platform/requests/${q}`, {
    method: 'GET',
  });
}

export async function reviewPlatformRequest(requestId) {
  return await apiFetch(`/platform/requests/${requestId}/review/`, {
    method: 'POST',
  });
}

export async function rejectPlatformRequest(requestId, rejection_reason) {
  return await apiFetch(`/platform/requests/${requestId}/reject/`, {
    method: 'POST',
    body: JSON.stringify({ rejection_reason }),
  });
}

export async function approvePlatformRequest(requestId) {
  return await apiFetch(`/platform/requests/${requestId}/approve/`, {
    method: 'POST',
  });
}

// ----------------------------------------------------------------------
// School Onboarding, RBAC & Staff Invitations
// ----------------------------------------------------------------------

export async function assignInitialAdmin(schoolId, payload) {
  return await apiFetch(`/schools/${schoolId}/onboarding/assign-admin/`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchSchoolWorkspace(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function assignMemberRole(schoolId, userId, roleName, activeRole) {
  return await apiFetch(`/schools/${schoolId}/members/${userId}/roles/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify({ role_name: roleName }),
  });
}

export async function removeMemberRole(schoolId, userId, roleName, activeRole) {
  return await apiFetch(`/schools/${schoolId}/members/${userId}/roles/${roleName}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function inviteStaffMember(schoolId, email, roleName, activeRole) {
  return await apiFetch(`/schools/${schoolId}/invitations/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify({ email, role_name: roleName }),
  });
}

// ----------------------------------------------------------------------
// Feature 2: School Configuration & Staff Management API Methods
// ----------------------------------------------------------------------

export async function fetchSchoolProfile(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/profile/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function updateSchoolProfile(schoolId, profileData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/profile/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(profileData),
  });
}

export async function fetchAcademicYears(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createAcademicYear(schoolId, yearData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(yearData),
  });
}

export async function activateAcademicYear(schoolId, yearId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/activate/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function completeAcademicYear(schoolId, yearId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/complete/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createAcademicTerm(schoolId, yearId, termData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/terms/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(termData),
  });
}

export async function fetchClassLevels(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-levels/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createClassLevel(schoolId, levelData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-levels/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(levelData),
  });
}

export async function fetchClassGroups(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-groups/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createClassGroup(schoolId, groupData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-groups/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(groupData),
  });
}

export async function fetchSubjects(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/subjects/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createSubject(schoolId, subjectData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/subjects/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(subjectData),
  });
}

export async function fetchClassSubjects(schoolId, filters = {}, activeRole) {
  const query = new URLSearchParams(filters).toString();
  const endpoint = query ? `/schools/${schoolId}/class-subjects/?${query}` : `/schools/${schoolId}/class-subjects/`;
  return await apiFetch(endpoint, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function createClassSubject(schoolId, mappingData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-subjects/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(mappingData),
  });
}

export async function deleteClassSubject(schoolId, mappingId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-subjects/${mappingId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function fetchSchoolStaff(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/staff/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function dismissStaffMember(schoolId, membershipId, reason = '', activeRole) {
  return await apiFetch(`/schools/${schoolId}/staff/${membershipId}/dismiss/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify({ reason }),
  });
}

export async function reassignAdministrator(schoolId, newAdminEmail, activeRole) {
  return await apiFetch(`/schools/${schoolId}/governance/reassign-admin/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify({ new_admin_email: newAdminEmail }),
  });
}

export async function fetchClassTeacherAssignments(schoolId, filters = {}, activeRole) {
  const query = new URLSearchParams(filters).toString();
  const endpoint = query ? `/schools/${schoolId}/teaching-assignments/class-teachers/?${query}` : `/schools/${schoolId}/teaching-assignments/class-teachers/`;
  return await apiFetch(endpoint, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function assignClassTeacher(schoolId, assignmentData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/teaching-assignments/class-teachers/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(assignmentData),
  });
}

export async function endClassTeacherAssignment(schoolId, assignmentId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/teaching-assignments/class-teachers/${assignmentId}/end/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function fetchSubjectTeacherAssignments(schoolId, filters = {}, activeRole) {
  const query = new URLSearchParams(filters).toString();
  const endpoint = query ? `/schools/${schoolId}/teaching-assignments/subject-teachers/?${query}` : `/schools/${schoolId}/teaching-assignments/subject-teachers/`;
  return await apiFetch(endpoint, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function assignSubjectTeacher(schoolId, assignmentData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/teaching-assignments/subject-teachers/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(assignmentData),
  });
}

export async function endSubjectTeacherAssignment(schoolId, assignmentId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/teaching-assignments/subject-teachers/${assignmentId}/end/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

// ----------------------------------------------------------------------
// Academic Calendar & Terms Management (Editable & Deletable)
// ----------------------------------------------------------------------

export async function updateAcademicYear(schoolId, yearId, yearData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(yearData),
  });
}

export async function deleteAcademicYear(schoolId, yearId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function updateAcademicTerm(schoolId, yearId, termId, termData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/terms/${termId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(termData),
  });
}

export async function deleteAcademicTerm(schoolId, yearId, termId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/academic-years/${yearId}/terms/${termId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

// ----------------------------------------------------------------------
// Classes & Streams Management (Editable & Removable)
// ----------------------------------------------------------------------

export async function updateClassLevel(schoolId, levelId, levelData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-levels/${levelId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(levelData),
  });
}

export async function deleteClassLevel(schoolId, levelId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-levels/${levelId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function updateClassGroup(schoolId, groupId, groupData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-groups/${groupId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(groupData),
  });
}

export async function deleteClassGroup(schoolId, groupId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/class-groups/${groupId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

// ----------------------------------------------------------------------
// Subjects Management (Editable & Deletable)
// ----------------------------------------------------------------------

export async function updateSubject(schoolId, subjectId, subjectData, activeRole) {
  return await apiFetch(`/schools/${schoolId}/subjects/${subjectId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(subjectData),
  });
}

export async function deleteSubject(schoolId, subjectId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/subjects/${subjectId}/`, {
    method: 'DELETE',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

// ----------------------------------------------------------------------
// Centralized Staff Roles Management
// ----------------------------------------------------------------------

export async function updateMemberRoles(schoolId, membershipId, roles, activeRole) {
  return await apiFetch(`/schools/${schoolId}/staff/${membershipId}/roles/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify({ roles }),
  });
}

// ----------------------------------------------------------------------
// Feature 3: Student Management, Enrollment, and Bulk Data Import
// ----------------------------------------------------------------------

export async function fetchStudents(schoolId, params = {}, activeRole) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `/schools/${schoolId}/students/?${query}` : `/schools/${schoolId}/students/`;
  return await apiFetch(url, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function fetchStudentDetail(schoolId, studentId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/${studentId}/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function registerStudent(schoolId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function updateStudent(schoolId, studentId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/${studentId}/`, {
    method: 'PATCH',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function mergeStudents(schoolId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/merge/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function fetchDuplicateReviews(schoolId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/duplicate-reviews/`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export async function resolveDuplicateReview(schoolId, reviewId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/duplicate-reviews/${reviewId}/resolve/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function withdrawStudentEnrollment(schoolId, enrollmentId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/enrollments/${enrollmentId}/withdraw/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function fetchClassSummaryReport(schoolId, academicYearId, activeRole) {
  const q = academicYearId ? `?academic_year_id=${academicYearId}` : '';
  return await apiFetch(`/schools/${schoolId}/students/reports/class-summary/${q}`, {
    method: 'GET',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export function getStudentImportTemplateUrl(schoolId) {
  return `/api/v1/schools/${schoolId}/students/import-template/`;
}

export async function previewStudentImport(schoolId, payload, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/import-preview/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
    body: JSON.stringify(payload),
  });
}

export async function confirmStudentImport(schoolId, batchId, activeRole) {
  return await apiFetch(`/schools/${schoolId}/students/import-batches/${batchId}/confirm/`, {
    method: 'POST',
    headers: activeRole ? { 'X-Active-Role': activeRole } : {},
  });
}

export default {
  formatApiError,
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  refreshAccessToken,
  apiFetch,
  register,
  login,
  logout,
  fetchCurrentUser,
  acceptInvitation,
  requestPasswordReset,
  confirmPasswordReset,
  platformLogin,
  fetchPlatformStats,
  fetchPlatformSchools,
  suspendSchool,
  reactivateSchool,
  fetchHealthStatus,
  submitSchoolRequest,
  verifySchoolRequest,
  resendSchoolVerification,
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
  fetchSchoolProfile,
  updateSchoolProfile,
  fetchAcademicYears,
  createAcademicYear,
  activateAcademicYear,
  completeAcademicYear,
  createAcademicTerm,
  fetchClassLevels,
  createClassLevel,
  fetchClassGroups,
  createClassGroup,
  fetchSubjects,
  createSubject,
  fetchClassSubjects,
  createClassSubject,
  deleteClassSubject,
  fetchSchoolStaff,
  dismissStaffMember,
  reassignAdministrator,
  fetchClassTeacherAssignments,
  assignClassTeacher,
  endClassTeacherAssignment,
  fetchSubjectTeacherAssignments,
  assignSubjectTeacher,
  endSubjectTeacherAssignment,
  updateAcademicYear,
  deleteAcademicYear,
  updateAcademicTerm,
  deleteAcademicTerm,
  updateClassLevel,
  deleteClassLevel,
  updateClassGroup,
  deleteClassGroup,
  updateSubject,
  deleteSubject,
  updateMemberRoles,
  fetchStudents,
  fetchStudentDetail,
  registerStudent,
  updateStudent,
  mergeStudents,
  fetchDuplicateReviews,
  resolveDuplicateReview,
  withdrawStudentEnrollment,
  fetchClassSummaryReport,
  getStudentImportTemplateUrl,
  previewStudentImport,
  confirmStudentImport,
};
