"""
Multi-Tenant Permission Classes for School Configuration and Staff Management.
Enforces tenant isolation, active role verification, and sovereign role hierarchies.
"""

from rest_framework.permissions import BasePermission
from tenants.models import SchoolMembership, RoleAssignment, Role


def get_active_school_membership(request, school_id):
    if not (request.user and request.user.is_authenticated):
        return None
    
    cached = getattr(request, 'active_membership', None)
    if cached and str(cached.school_id) == str(school_id):
        return cached

    membership = SchoolMembership.objects.filter(
        user=request.user,
        school_id=school_id,
        status='ACTIVE'
    ).select_related('school').first()

    request.active_membership = membership
    if membership:
        request.school = membership.school
    return membership


class IsSchoolMemberOrPlatformOperator(BasePermission):
    """
    Grants access if the user is a platform operator or an active member of the specified school.
    """
    message = "You do not have active membership in this school."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_platform_operator:
            return True

        school_id = view.kwargs.get('school_id')
        if not school_id:
            return False

        membership = get_active_school_membership(request, school_id)
        return bool(membership)


class IsSchoolAdminOrProprietor(BasePermission):
    """
    Grants mutation access only to users with active PROPRIETOR or ADMINISTRATOR role in the school.
    Honors X-Active-Role header if present, or validates active role assignment.
    """
    message = "Proprietor or Administrator role is required to manage school configuration."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        school_id = view.kwargs.get('school_id')
        if not school_id:
            return False

        membership = get_active_school_membership(request, school_id)
        if not membership:
            self.message = "You do not have an active membership in this school."
            return False

        header_role = request.headers.get('X-Active-Role')
        if header_role:
            has_role = RoleAssignment.objects.filter(
                membership=membership,
                role__name=header_role,
                is_active=True
            ).exists()
            if not has_role or header_role not in [Role.PROPRIETOR, Role.ADMINISTRATOR]:
                self.message = f"Role '{header_role}' is not authorized to manage school configuration."
                return False
            request.active_role = header_role
            return True

        # Fallback if header not sent: check if user has active PROPRIETOR or ADMINISTRATOR role
        has_admin_or_prop = RoleAssignment.objects.filter(
            membership=membership,
            role__name__in=[Role.PROPRIETOR, Role.ADMINISTRATOR],
            is_active=True
        ).exists()

        if not has_admin_or_prop:
            self.message = "Proprietor or Administrator role is required."
            return False

        return True


class IsSchoolProprietorOnly(BasePermission):
    """
    Strict sovereign permission: only the active PROPRIETOR may execute this operation.
    """
    message = "Only the School Proprietor has sovereign authority for this operation."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        school_id = view.kwargs.get('school_id')
        if not school_id:
            return False

        membership = get_active_school_membership(request, school_id)
        if not membership:
            return False

        return RoleAssignment.objects.filter(
            membership=membership,
            role__name=Role.PROPRIETOR,
            is_active=True
        ).exists()

