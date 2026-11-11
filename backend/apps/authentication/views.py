"""
Authentication Views for Eduflow SaaS.
Endpoints:
- POST /api/v1/auth/login/
- POST /api/v1/auth/refresh/
- POST /api/v1/auth/logout/
- GET  /api/v1/auth/me/
"""

from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import AuthenticationFailed, ValidationError

from authentication.serializers import (
    LoginSerializer,
    PlatformOperatorLoginSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    PasswordChangeSerializer
)
from authentication.services import AuthTokenService
from authentication.throttles import LoginRateThrottle
from audit.models import SecurityAuditEvent


def set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        httponly=settings.REFRESH_COOKIE_HTTPONLY,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE
    )


def clear_refresh_cookie(response):
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE
    )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email'].strip().lower()
        password = serializer.validated_data['password']

        user = authenticate(request, email=email, password=password)
        if not user or not user.is_active:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INVALID_CREDENTIALS",
                        "message": "Invalid email address or password.",
                        "details": None
                    }
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        token_data = AuthTokenService.create_session_and_tokens(user, request=request)

        SecurityAuditEvent.log(
            action='USER_LOGIN_SUCCESS',
            actor=user,
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'session_id': token_data['session_id']}
        )

        response = Response(
            {
                "success": True,
                "data": {
                    "access": token_data['access'],
                    "session_id": token_data['session_id'],
                    "user": UserProfileSerializer(user).data
                }
            },
            status=status.HTTP_200_OK
        )

        set_refresh_cookie(response, token_data['refresh'])
        return response


class RegisterView(APIView):
    """
    Public registration endpoint for prospective proprietors and users.
    Creates account and immediately establishes session tokens.
    """
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from authentication.models import User
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid registration data.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        email = data['email']
        existing_user = User.objects.filter(email=email).first()

        if existing_user and not existing_user.is_active:
            # Invited or pending user establishing credentials via public registration
            user = existing_user
            user.set_password(data['password'])
            user.first_name = data['first_name']
            user.last_name = data['last_name']
            user.is_active = True
            user.token_version += 1
            user.save()

            from tenants.models import InvitationToken, SchoolMembership
            InvitationToken.objects.filter(email=email, is_accepted=False).update(is_accepted=True)

            pending_memberships = SchoolMembership.objects.filter(
                user=user,
                school__workspace_status='PENDING_ACTIVATION',
                status='ACTIVE'
            ).select_related('school')
            for m in pending_memberships:
                m.school.workspace_status = 'ONBOARDING'
                m.school.save(update_fields=['workspace_status'])

            SecurityAuditEvent.log(
                action='INVITED_USER_REGISTERED_AND_ACTIVATED',
                actor=user,
                target_type='User',
                target_id=user.id,
                ip_address=request.META.get('REMOTE_ADDR'),
                metadata={'email': user.email, 'source': 'public_registration'}
            )
        else:
            user = User.objects.create_user(
                email=email,
                password=data['password'],
                first_name=data['first_name'],
                last_name=data['last_name'],
                is_active=True,
                is_platform_operator=False
            )

            SecurityAuditEvent.log(
                action='USER_REGISTERED',
                actor=user,
                target_type='User',
                target_id=user.id,
                ip_address=request.META.get('REMOTE_ADDR'),
                metadata={'email': user.email}
            )

        tokens = AuthTokenService.create_session_and_tokens(user, request=request)

        response = Response({
            'success': True,
            'data': {
                'access': tokens['access'],
                'session_id': tokens['session_id'],
                'user': UserProfileSerializer(user).data,
                'message': 'Account created successfully.'
            }
        }, status=status.HTTP_201_CREATED)

        set_refresh_cookie(response, tokens['refresh'])
        return response


class PlatformOperatorLoginView(APIView):
    """
    Dedicated authentication endpoint for Platform Operators (Eduflow System Administrators).
    Strictly verifies that user.is_platform_operator == True.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = PlatformOperatorLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Email and password are required.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        user = authenticate(request, username=email, password=password)
        if not user:
            SecurityAuditEvent.log(
                action='PLATFORM_LOGIN_FAILED',
                ip_address=request.META.get('REMOTE_ADDR'),
                metadata={'email': email, 'reason': 'Invalid credentials'}
            )
            return Response({
                'success': False,
                'error': {
                    'code': 'AUTHENTICATION_FAILED',
                    'message': 'Invalid administrative credentials.',
                    'details': None
                }
            }, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_platform_operator:
            SecurityAuditEvent.log(
                action='PLATFORM_ACCESS_DENIED',
                actor=user,
                ip_address=request.META.get('REMOTE_ADDR'),
                metadata={'email': email, 'reason': 'User is not a platform operator'}
            )
            return Response({
                'success': False,
                'error': {
                    'code': 'FORBIDDEN',
                    'message': 'Access denied. Platform operator administrative privileges required.',
                    'details': None
                }
            }, status=status.HTTP_403_FORBIDDEN)

        tokens = AuthTokenService.create_session_and_tokens(user, request=request)

        SecurityAuditEvent.log(
            action='PLATFORM_LOGIN_SUCCESS',
            actor=user,
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'email': user.email}
        )

        response = Response({
            'success': True,
            'data': {
                'access': tokens['access'],
                'session_id': tokens['session_id'],
                'user': UserProfileSerializer(user).data,
                'message': 'Platform operator authenticated successfully.'
            }
        }, status=status.HTTP_200_OK)

        set_refresh_cookie(response, tokens['refresh'])
        return response


class RefreshTokenView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME) or request.data.get('refresh')
        if not raw_refresh:
            raise ValidationError("Refresh token is required via cookie or payload.", code='missing_token')

        idempotency_key = request.headers.get('X-Refresh-Idempotency-Key')
        token_data = AuthTokenService.rotate_refresh_token(
            raw_refresh_token=raw_refresh,
            idempotency_key=idempotency_key,
            request=request
        )

        response = Response(
            {
                "success": True,
                "data": {
                    "access": token_data['access'],
                    "session_id": token_data['session_id']
                }
            },
            status=status.HTTP_200_OK
        )

        set_refresh_cookie(response, token_data['refresh'])
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        session_id = request.auth.get('sid') if request.auth else None
        if session_id:
            AuthTokenService.revoke_session(
                session_id=session_id,
                reason='USER_LOGOUT',
                actor=request.user
            )

        response = Response(
            {
                "success": True,
                "data": {
                    "message": "Successfully logged out."
                }
            },
            status=status.HTTP_200_OK
        )

        clear_refresh_cookie(response)
        return response


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = UserProfileSerializer(request.user)
        return Response(
            {
                "success": True,
                "data": serializer.data
            },
            status=status.HTTP_200_OK
        )


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Valid email address is required.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        _, raw_token = AuthTokenService.request_password_reset(email, request=request)

        response_data = {
            'message': 'If an active account exists for this email address, a password reset link has been sent.'
        }
        if settings.DEBUG and raw_token:
            response_data['dev_reset_token'] = raw_token

        return Response({
            'success': True,
            'data': response_data
        }, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid password reset payload.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['token']
        password = serializer.validated_data['password']

        try:
            user = AuthTokenService.confirm_password_reset(token, password, request=request)
            return Response({
                'success': True,
                'data': {
                    'message': 'Password has been successfully reset. Please sign in with your new credentials.'
                }
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'PASSWORD_RESET_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid password change payload.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        old_password = serializer.validated_data['old_password']
        new_password = serializer.validated_data['new_password']

        try:
            tokens = AuthTokenService.change_password(
                user=request.user,
                old_password=old_password,
                new_password=new_password,
                request=request
            )

            res = Response({
                'success': True,
                'data': {
                    'access': tokens['access'],
                    'session_id': tokens['session_id'],
                    'message': 'Password changed successfully. Existing sessions have been revoked.'
                }
            }, status=status.HTTP_200_OK)

            set_refresh_cookie(res, tokens['refresh'])
            return res
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'PASSWORD_CHANGE_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)

