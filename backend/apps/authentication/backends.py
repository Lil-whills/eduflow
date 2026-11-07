"""
Custom JWT Authentication Backend for Eduflow SaaS.
Enforces multi-layer validation:
1. Cryptographic signature and expiry.
2. User active status.
3. Global credential counter (ver claim vs user.token_version).
4. Active session state in AuthSession (with Redis/cache lookup and fail-secure DB fallback).
5. School membership status and School workspace status.
"""

from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from rest_framework.exceptions import PermissionDenied
from authentication.models import AuthSession
from tenants.models import SchoolMembership


class EduflowJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None

        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        # 1. User active status validation
        if not user.is_active:
            raise AuthenticationFailed("User account is inactive.", code='user_inactive')

        # 2. Global credential counter validation (token_version)
        token_ver = validated_token.get('ver')
        if token_ver is not None and token_ver != user.token_version:
            raise AuthenticationFailed("Credentials have changed. Please log in again.", code='token_outdated')

        # 3. Active session validation (sid claim)
        session_id = validated_token.get('sid')
        if session_id:
            cache_key = f"session:{session_id}:status"
            session_status = cache.get(cache_key)

            if session_status is None:
                try:
                    session = AuthSession.objects.get(id=session_id)
                    session_status = session.status
                    cache.set(cache_key, session_status, timeout=60)
                except AuthSession.DoesNotExist:
                    session_status = 'REVOKED'

            if session_status != 'ACTIVE':
                raise AuthenticationFailed("Session has been revoked or expired.", code='session_revoked')

        # 4. School Membership and Workspace Status Verification
        membership = SchoolMembership.objects.filter(
            user=user,
            status='ACTIVE'
        ).select_related('school').first()

        request.active_membership = membership
        request.school = membership.school if membership else None

        if membership and membership.school:
            workspace_status = membership.school.workspace_status
            if workspace_status in ('SUSPENDED', 'CLOSED'):
                raise PermissionDenied(
                    "School workspace is currently suspended or closed.",
                    code='workspace_suspended'
                )

        return (user, validated_token)

