"""
API Views for Tenants, Onboarding, and Workspace Management.
Adheres strictly to CIA triad principles and standardized JSON envelopes.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.utils import timezone

from audit.models import SecurityAuditEvent
from core.crypto import encrypt_payload
from authentication.views import set_refresh_cookie
from .models import SchoolAccessRequest, School, SchoolMembership, Role, RoleAssignment, OutboxEmail
from .serializers import (
    SchoolAccessRequestCreateSerializer,
    SchoolAccessRequestSerializer,
    EmailVerificationSerializer,
    ResendVerificationSerializer,
    RejectRequestSerializer,
    AcceptInvitationSerializer,
    AssignAdminSerializer,
    RoleAssignmentSerializer,
    InviteStaffSerializer,
    SchoolSummarySerializer
)
from .services import (
    SchoolRegistrationService,
    ProvisioningService,
    InvitationService,
    SchoolRoleService
)
from .permissions import IsPlatformOperator, RequireActiveRole


# ----------------------------------------------------------------------
# Slice 2: School Registration and Email Verification
# ----------------------------------------------------------------------

class SchoolAccessRequestCreateView(APIView):
    # Allows both authenticated users and unauthenticated guests
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SchoolAccessRequestCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid school request payload.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        requester_user = request.user if (request.user and request.user.is_authenticated) else None

        school_name = data['school_name']
        contact_phone = data['contact_phone']

        if requester_user:
            requester_name = data.get('requester_name') or (requester_user.get_full_name() or requester_user.email)
            contact_email = requester_user.email
        else:
            requester_name = data.get('requester_name')
            contact_email = data.get('contact_email')
            if not contact_email or not requester_name:
                return Response({
                    'success': False,
                    'error': {
                        'code': 'VALIDATION_ERROR',
                        'message': 'Requester name and contact email are required when unauthenticated.',
                        'details': None
                    }
                }, status=status.HTTP_400_BAD_REQUEST)

        access_req, raw_token = SchoolRegistrationService.create_access_request(
            school_name=school_name,
            requester_name=requester_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            requester_user=requester_user,
            request=request
        )

        response_data = {
            'id': str(access_req.id),
            'school_name': access_req.school_name,
            'contact_email': access_req.contact_email,
            'status': access_req.status,
            'message': 'School access request submitted. Please check your email to verify your address.'
        }
        if settings.DEBUG:
            response_data['dev_verification_token'] = raw_token

        return Response({
            'success': True,
            'data': response_data
        }, status=status.HTTP_201_CREATED)


class SchoolAccessRequestVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Token is required.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['token']
        try:
            access_req = SchoolRegistrationService.verify_email(token, request=request)
            return Response({
                'success': True,
                'data': {
                    'id': str(access_req.id),
                    'school_name': access_req.school_name,
                    'status': access_req.status,
                    'message': 'Email address verified successfully. Your request has entered the platform review queue.'
                }
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'VERIFICATION_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class SchoolAccessRequestResendView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Valid email is required.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['contact_email']
        SchoolRegistrationService.resend_verification_email(email, request=request)

        # Anti-enumeration message
        return Response({
            'success': True,
            'data': {
                'message': 'If an unverified registration request exists for this email address, a new verification link has been sent.'
            }
        }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------
# Slice 3: Platform Review Queue (Platform Operators Only)
# ----------------------------------------------------------------------

class PlatformRequestListView(APIView):
    permission_classes = [IsPlatformOperator]

    def get(self, request):
        status_filter = request.query_params.get('status')
        queryset = SchoolAccessRequest.objects.exclude(status='EMAIL_UNVERIFIED')

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            queryset = queryset.filter(status__in=['PENDING', 'UNDER_REVIEW'])

        queryset = queryset.order_by('-created_at')
        serializer = SchoolAccessRequestSerializer(queryset, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        }, status=status.HTTP_200_OK)


class PlatformRequestReviewView(APIView):
    permission_classes = [IsPlatformOperator]

    def post(self, request, pk):
        access_req = SchoolAccessRequest.objects.filter(id=pk).first()
        if not access_req:
            return Response({
                'success': False,
                'error': {'code': 'NOT_FOUND', 'message': 'Request not found.', 'details': None}
            }, status=status.HTTP_404_NOT_FOUND)

        if access_req.status != 'PENDING':
            return Response({
                'success': False,
                'error': {'code': 'INVALID_STATUS', 'message': f"Request cannot be reviewed in status: {access_req.status}", 'details': None}
            }, status=status.HTTP_400_BAD_REQUEST)

        access_req.status = 'UNDER_REVIEW'
        access_req.save(update_fields=['status'])

        SecurityAuditEvent.log(
            action='REQUEST_UNDER_REVIEW',
            actor=request.user,
            target_type='SchoolAccessRequest',
            target_id=access_req.id,
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'school_name': access_req.school_name}
        )

        return Response({
            'success': True,
            'data': SchoolAccessRequestSerializer(access_req).data
        }, status=status.HTTP_200_OK)


class PlatformRequestRejectView(APIView):
    permission_classes = [IsPlatformOperator]

    def post(self, request, pk):
        access_req = SchoolAccessRequest.objects.filter(id=pk).first()
        if not access_req:
            return Response({
                'success': False,
                'error': {'code': 'NOT_FOUND', 'message': 'Request not found.', 'details': None}
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = RejectRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'A valid rejection reason is mandatory.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        reason = serializer.validated_data['rejection_reason']
        access_req.status = 'REJECTED'
        access_req.rejection_reason = reason
        access_req.save(update_fields=['status', 'rejection_reason'])

        # Stage encrypted rejection notification
        payload = {
            'school_name': access_req.school_name,
            'requester_name': access_req.requester_name,
            'rejection_reason': reason
        }
        OutboxEmail.objects.create(
            recipient=access_req.contact_email,
            email_type='REQUEST_REJECTED',
            encrypted_payload=encrypt_payload(payload),
            status='PENDING'
        )

        SecurityAuditEvent.log(
            action='REQUEST_REJECTED',
            actor=request.user,
            target_type='SchoolAccessRequest',
            target_id=access_req.id,
            ip_address=request.META.get('REMOTE_ADDR'),
            metadata={'rejection_reason': reason}
        )

        return Response({
            'success': True,
            'data': SchoolAccessRequestSerializer(access_req).data
        }, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------
# Slice 4: Provisioning & Proprietor Invitation Acceptance
# ----------------------------------------------------------------------

class PlatformRequestApproveView(APIView):
    permission_classes = [IsPlatformOperator]

    def post(self, request, pk):
        try:
            school, raw_token = ProvisioningService.approve_and_provision(
                access_request_id=pk,
                operator_user=request.user,
                request=request
            )
            response_data = {
                'school_id': str(school.id),
                'school_name': school.name,
                'slug': school.slug,
                'workspace_status': school.workspace_status,
                'message': f"Workspace for '{school.name}' provisioned. Proprietor invitation enqueued."
            }
            if settings.DEBUG:
                response_data['dev_invitation_token'] = raw_token

            return Response({
                'success': True,
                'data': response_data
            }, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'PROVISIONING_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class AcceptInvitationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid invitation acceptance data.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        token = serializer.validated_data['token']
        password = serializer.validated_data['password']

        try:
            user, school, tokens = InvitationService.accept_invitation(
                raw_token=token,
                password=password,
                request=request
            )

            res = Response({
                'success': True,
                'data': {
                    'access': tokens['access'],
                    'session_id': tokens['session_id'],
                    'user': {
                        'id': str(user.id),
                        'email': user.email,
                        'is_active': user.is_active,
                        'is_platform_operator': user.is_platform_operator,
                    },
                    'school': {
                        'id': str(school.id),
                        'name': school.name,
                        'workspace_status': school.workspace_status
                    }
                }
            }, status=status.HTTP_200_OK)

            # Set HttpOnly refresh cookie
            set_refresh_cookie(res, tokens['refresh'])
            return res
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVITATION_ACCEPTANCE_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


# ----------------------------------------------------------------------
# Slice 5 & 6: School Onboarding and Role Management
# ----------------------------------------------------------------------

class SchoolOnboardingAssignAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, school_id):
        serializer = AssignAdminSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid administrator assignment data.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['admin_email']
        name = serializer.validated_data.get('admin_name', '')

        try:
            school, admin_user = SchoolRoleService.assign_initial_admin(
                school_id=school_id,
                proprietor_user=request.user,
                admin_email=email,
                admin_name=name,
                request=request
            )
            return Response({
                'success': True,
                'data': {
                    'school_id': str(school.id),
                    'school_name': school.name,
                    'workspace_status': school.workspace_status,
                    'admin_user': {
                        'id': str(admin_user.id),
                        'email': admin_user.email
                    },
                    'message': 'Administrator successfully assigned. School workspace is now ACTIVE.'
                }
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'ONBOARDING_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class SchoolMemberRoleAssignView(APIView):
    permission_classes = [RequireActiveRole]
    required_roles = [Role.PROPRIETOR, Role.ADMINISTRATOR]

    def post(self, request, school_id, user_id):
        serializer = RoleAssignmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid role assignment payload.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        role_name = serializer.validated_data['role_name']
        try:
            assignment = SchoolRoleService.assign_role(
                school_id=school_id,
                target_user_id=user_id,
                role_name=role_name,
                actor_user=request.user,
                request=request
            )
            return Response({
                'success': True,
                'data': {
                    'role_assignment_id': str(assignment.id),
                    'role': assignment.role.name,
                    'is_active': assignment.is_active,
                    'message': f"Role '{role_name}' assigned successfully."
                }
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'ROLE_ASSIGNMENT_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class SchoolMemberRoleRemoveView(APIView):
    permission_classes = [RequireActiveRole]
    required_roles = [Role.PROPRIETOR, Role.ADMINISTRATOR]

    def delete(self, request, school_id, user_id, role_name):
        try:
            SchoolRoleService.remove_role(
                school_id=school_id,
                target_user_id=user_id,
                role_name=role_name,
                actor_user=request.user,
                request=request
            )
            return Response({
                'success': True,
                'data': {
                    'message': f"Role '{role_name}' removed successfully."
                }
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'ROLE_REMOVAL_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)


class SchoolWorkspaceDetailView(APIView):
    """
    Returns verified workspace metadata and member roster for the active school context.
    """
    permission_classes = [RequireActiveRole]

    def get(self, request, school_id):
        # Multi-tenant isolation check: request.school must match school_id
        if not request.school or str(request.school.id) != str(school_id):
            return Response({
                'success': False,
                'error': {
                    'code': 'FORBIDDEN_TENANT_ACCESS',
                    'message': 'You do not belong to or have access to this school workspace.',
                    'details': None
                }
            }, status=status.HTTP_403_FORBIDDEN)

        school = request.school
        memberships = SchoolMembership.objects.filter(
            school=school,
            status='ACTIVE'
        ).select_related('user').prefetch_related('role_assignments__role')

        member_list = []
        for m in memberships:
            member_list.append({
                'user_id': str(m.user.id),
                'email': m.user.email,
                'is_active': m.user.is_active,
                'roles': [ra.role.name for ra in m.role_assignments.filter(is_active=True)]
            })

        return Response({
            'success': True,
            'data': {
                'id': str(school.id),
                'name': school.name,
                'slug': school.slug,
                'workspace_status': school.workspace_status,
                'active_role': request.active_role,
                'members': member_list
            }
        }, status=status.HTTP_200_OK)


class MySchoolRequestsView(APIView):
    """
    Returns all school registration requests submitted by the authenticated user,
    including the provisioned workspace details when approved.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        requests = SchoolAccessRequest.objects.filter(
            Q(requester_user=request.user) | Q(contact_email=request.user.email)
        ).select_related('provisioning_record__school').order_by('-created_at')

        data = []
        for req in requests:
            school_info = None
            if hasattr(req, 'provisioning_record') and req.provisioning_record.school:
                s = req.provisioning_record.school
                school_info = {
                    'id': str(s.id),
                    'name': s.name,
                    'slug': s.slug,
                    'workspace_status': s.workspace_status
                }
            data.append({
                'id': str(req.id),
                'school_name': req.school_name,
                'status': req.status,
                'contact_phone': req.contact_phone,
                'rejection_reason': req.rejection_reason,
                'created_at': req.created_at,
                'school': school_info
            })

        return Response({
            'success': True,
            'data': data
        }, status=status.HTTP_200_OK)


class PlatformStatsView(APIView):
    """
    Returns platform-wide metrics for Platform Operators.
    """
    permission_classes = [IsPlatformOperator]

    def get(self, request):
        from authentication.models import User
        total_schools = School.objects.count()
        active_schools = School.objects.filter(workspace_status='ACTIVE').count()
        onboarding_schools = School.objects.filter(workspace_status__in=['ONBOARDING', 'PENDING_ACTIVATION']).count()
        suspended_schools = School.objects.filter(workspace_status='SUSPENDED').count()
        pending_requests = SchoolAccessRequest.objects.filter(status='PENDING').count()
        under_review_requests = SchoolAccessRequest.objects.filter(status='UNDER_REVIEW').count()
        total_users = User.objects.count()

        return Response({
            'success': True,
            'data': {
                'total_schools': total_schools,
                'active_schools': active_schools,
                'onboarding_schools': onboarding_schools,
                'suspended_schools': suspended_schools,
                'pending_requests': pending_requests,
                'under_review_requests': under_review_requests,
                'total_users': total_users
            }
        }, status=status.HTTP_200_OK)


class PlatformSchoolsListView(APIView):
    """
    Lists all schools across the platform for Platform Operators.
    """
    permission_classes = [IsPlatformOperator]

    def get(self, request):
        status_filter = request.query_params.get('status')
        queryset = School.objects.all().prefetch_related('memberships').order_by('-created_at')
        if status_filter:
            queryset = queryset.filter(workspace_status=status_filter)

        serializer = SchoolSummarySerializer(queryset, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        }, status=status.HTTP_200_OK)


class PlatformSchoolSuspendView(APIView):
    """
    Suspends a school tenant workspace.
    """
    permission_classes = [IsPlatformOperator]

    def post(self, request, school_id):
        school = School.objects.filter(id=school_id).first()
        if not school:
            return Response({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'School not found.'}}, status=status.HTTP_404_NOT_FOUND)

        school.workspace_status = 'SUSPENDED'
        school.save(update_fields=['workspace_status'])

        SecurityAuditEvent.log(
            action='SCHOOL_WORKSPACE_SUSPENDED',
            actor=request.user,
            school=school,
            target_type='School',
            target_id=school.id,
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response({'success': True, 'data': {'school_id': str(school.id), 'workspace_status': 'SUSPENDED'}}, status=status.HTTP_200_OK)


class PlatformSchoolReactivateView(APIView):
    """
    Reactivates a suspended school tenant workspace.
    """
    permission_classes = [IsPlatformOperator]

    def post(self, request, school_id):
        school = School.objects.filter(id=school_id).first()
        if not school:
            return Response({'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'School not found.'}}, status=status.HTTP_404_NOT_FOUND)

        school.workspace_status = 'ACTIVE'
        school.save(update_fields=['workspace_status'])

        SecurityAuditEvent.log(
            action='SCHOOL_WORKSPACE_REACTIVATED',
            actor=request.user,
            school=school,
            target_type='School',
            target_id=school.id,
            ip_address=request.META.get('REMOTE_ADDR')
        )
        return Response({'success': True, 'data': {'school_id': str(school.id), 'workspace_status': 'ACTIVE'}}, status=status.HTTP_200_OK)


class SchoolInviteStaffView(APIView):
    """
    Enables Proprietors or Administrators to invite staff members to their school.
    """
    permission_classes = [RequireActiveRole]
    required_roles = [Role.PROPRIETOR, Role.ADMINISTRATOR]

    def post(self, request, school_id):
        serializer = InviteStaffSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid staff invitation payload.',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        role_name = serializer.validated_data['role_name']

        try:
            target_user, raw_token = SchoolRoleService.invite_staff_member(
                school_id=school_id,
                email=email,
                role_name=role_name,
                actor_user=request.user,
                request=request
            )
            response_data = {
                'invited_email': target_user.email,
                'role': role_name,
                'message': f"Invitation sent to {target_user.email} as {role_name}."
            }
            if settings.DEBUG:
                response_data['dev_invitation_token'] = raw_token

            return Response({
                'success': True,
                'data': response_data
            }, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({
                'success': False,
                'error': {
                    'code': 'INVITATION_FAILED',
                    'message': str(exc),
                    'details': None
                }
            }, status=status.HTTP_400_BAD_REQUEST)

