from django.urls import path
from authentication.views import (
    LoginView,
    RegisterView,
    RefreshTokenView,
    LogoutView,
    CurrentUserView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    PasswordChangeView
)
from tenants.views import AcceptInvitationView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', RefreshTokenView.as_view(), name='auth-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', CurrentUserView.as_view(), name='auth-me'),
    path('invitations/accept/', AcceptInvitationView.as_view(), name='auth-invitation-accept'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='auth-password-reset-request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    path('password-change/', PasswordChangeView.as_view(), name='auth-password-change'),
]
