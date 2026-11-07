"""
Custom Permission Classes for Eduflow Multi-Tenant Architecture.
Enforces:
1. Platform Operator isolation (cannot access tenant data; tenant users cannot access platform review queue).
2. Active Role Context enforcement via X-Active-Role header.
3. Strict Role-Based Access Control (RBAC).
"""

from rest_framework.permissions import BasePermission
from tenants.models import SchoolMembership, RoleAssignment


class IsPlatformOperator(BasePermission):
    """
    Grants access only to authenticated users with platform operator privileges.
    """
    message = "Platform operator privileges are required to access this endpoint."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_platform_operator
        )


class RequireActiveRole(BasePermission):
    """
    Verifies that the caller has explicitly set the X-Active-Role header
    and that the requested role is actively assigned to the user within their active school tenant.
    """
    message = "An active, verified school role context is required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        school_id = view.kwargs.get('school_id')
        active_membership = getattr(request, 'active_membership', None)

        if not active_membership or (school_id and str(active_membership.school_id) != str(school_id)):
            if school_id:
                active_membership = SchoolMembership.objects.filter(
                    user=request.user,
                    school_id=school_id,
                    status='ACTIVE'
                ).select_related('school').first()
            else:
                active_membership = SchoolMembership.objects.filter(
                    user=request.user,
                    status='ACTIVE'
                ).select_related('school').first()

            request.active_membership = active_membership
            request.school = active_membership.school if active_membership else None

        if not active_membership:
            self.message = "User does not belong to an active school membership."
            return False

        header_role = request.headers.get('X-Active-Role')
        if not header_role:
            self.message = "X-Active-Role header is required to establish role context."
            return False

        # Verify that this role is explicitly assigned and active for this membership
        is_assigned = RoleAssignment.objects.filter(
            membership=active_membership,
            role__name=header_role,
            is_active=True
        ).exists()

        if not is_assigned:
            self.message = f"Role '{header_role}' is not assigned to your account in this school."
            return False

        # Attach validated active role to request for downstream view usage
        request.active_role = header_role

        # Check required roles if specified on view
        required_roles = getattr(view, 'required_roles', None)
        if required_roles and header_role not in required_roles:
            self.message = f"Role '{header_role}' does not have permission to perform this action."
            return False

        return True
