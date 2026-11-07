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

// In-memory access token storage (Confidentiality: immune to persistent XSS)
let inMemoryAccessToken = null;
let refreshPromise = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function clearAccessToken() {
  inMemoryAccessToken = null;
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

export default {
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
};
