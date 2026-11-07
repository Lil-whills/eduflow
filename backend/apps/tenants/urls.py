from django.urls import path
from .views import (
    SchoolAccessRequestCreateView,
    SchoolAccessRequestVerifyView,
    SchoolAccessRequestResendView,
    MySchoolRequestsView,
    PlatformRequestListView,
    PlatformRequestReviewView,
    PlatformRequestRejectView,
    PlatformRequestApproveView,
    PlatformStatsView,
    PlatformSchoolsListView,
    PlatformSchoolSuspendView,
    PlatformSchoolReactivateView,
    SchoolOnboardingAssignAdminView,
    SchoolMemberRoleAssignView,
    SchoolMemberRoleRemoveView,
    SchoolWorkspaceDetailView,
    SchoolInviteStaffView
)

urlpatterns = [
    # Slice 2: School Requests and Email Verification
    path('schools/requests/', SchoolAccessRequestCreateView.as_view(), name='school_request_create'),
    path('schools/requests/verify/', SchoolAccessRequestVerifyView.as_view(), name='school_request_verify'),
    path('schools/requests/resend-verification/', SchoolAccessRequestResendView.as_view(), name='school_request_resend'),
    path('schools/my-requests/', MySchoolRequestsView.as_view(), name='my_school_requests'),

    # Slice 3 & 4: Platform Review, Stats & Provisioning (Platform Operators)
    path('platform/stats/', PlatformStatsView.as_view(), name='platform_stats'),
    path('platform/requests/', PlatformRequestListView.as_view(), name='platform_request_list'),
    path('platform/requests/<uuid:pk>/review/', PlatformRequestReviewView.as_view(), name='platform_request_review'),
    path('platform/requests/<uuid:pk>/reject/', PlatformRequestRejectView.as_view(), name='platform_request_reject'),
    path('platform/requests/<uuid:pk>/approve/', PlatformRequestApproveView.as_view(), name='platform_request_approve'),
    path('platform/schools/', PlatformSchoolsListView.as_view(), name='platform_schools'),
    path('platform/schools/<uuid:school_id>/suspend/', PlatformSchoolSuspendView.as_view(), name='platform_school_suspend'),
    path('platform/schools/<uuid:school_id>/reactivate/', PlatformSchoolReactivateView.as_view(), name='platform_school_reactivate'),

    # Slice 5 & 6: School Onboarding, RBAC, Staff Invitations & Workspaces
    path('schools/<uuid:school_id>/onboarding/assign-admin/', SchoolOnboardingAssignAdminView.as_view(), name='school_onboarding_assign_admin'),
    path('schools/<uuid:school_id>/members/<uuid:user_id>/roles/', SchoolMemberRoleAssignView.as_view(), name='school_member_role_assign'),
    path('schools/<uuid:school_id>/members/<uuid:user_id>/roles/<str:role_name>/', SchoolMemberRoleRemoveView.as_view(), name='school_member_role_remove'),
    path('schools/<uuid:school_id>/invitations/', SchoolInviteStaffView.as_view(), name='school_invite_staff'),
    path('schools/<uuid:school_id>/', SchoolWorkspaceDetailView.as_view(), name='school_workspace_detail'),
]
