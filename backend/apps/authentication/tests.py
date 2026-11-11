"""
Comprehensive Automated Tests for Feature 1 - Slice 1: Identity Foundation.
Covers:
- Custom User model (UUID, email normalization, case-insensitive uniqueness)
- AuthSession & RefreshTokenLedgerEntry lifecycle
- Token rotation, durable idempotency retry, and replay-theft revocation
- Multi-layer access-token validation (is_active, token_version, workspace_status)
- API endpoints: /login/, /refresh/, /logout/, /me/
- Audit record immutability
"""

import uuid
from datetime import timedelta
from django.utils import timezone
from django.test import TestCase
from django.urls import reverse
from django.db import IntegrityError
from django.core.exceptions import PermissionDenied
from rest_framework.test import APIClient
from rest_framework import status

from authentication.models import User, AuthSession, RefreshTokenLedgerEntry
from authentication.services import AuthTokenService
from tenants.models import School, SchoolMembership, Role, RoleAssignment
from audit.models import SecurityAuditEvent
from core.crypto import encrypt_payload, decrypt_payload


class CustomUserModelTests(TestCase):
    def test_user_creation_with_email_normalization(self):
        user = User.objects.create_user(
            email='  Teacher.Ama@School.Org  ',
            password='StrongPassword123!'
        )
        self.assertEqual(user.email, 'teacher.ama@school.org')
        self.assertTrue(isinstance(user.id, uuid.UUID))
        self.assertTrue(user.check_password('StrongPassword123!'))
        self.assertTrue(user.is_active)
        self.assertEqual(user.token_version, 1)

    def test_case_insensitive_email_uniqueness_constraint(self):
        User.objects.create_user(email='admin@school.org', password='password1')
        with self.assertRaises(IntegrityError):
            User.objects.create_user(email='ADMIN@school.org', password='password2')


class TokenLedgerAndReplayTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='headmaster@eduflow.org',
            password='Password123!'
        )
        self.school = School.objects.create(
            name='Achimota Basic School',
            slug='achimota-basic',
            workspace_status='ACTIVE'
        )
        self.membership = SchoolMembership.objects.create(
            school=self.school,
            user=self.user,
            status='ACTIVE'
        )

    def test_session_creation_and_token_issuance(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.assertIn('access', token_data)
        self.assertIn('refresh', token_data)
        self.assertIn('session_id', token_data)

        session = AuthSession.objects.get(id=token_data['session_id'])
        self.assertEqual(session.status, 'ACTIVE')
        self.assertEqual(session.ledger_entries.count(), 1)
        ledger_entry = session.ledger_entries.first()
        self.assertEqual(ledger_entry.status, 'ISSUED')

    def test_token_rotation_success(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        first_refresh = token_data['refresh']
        idemp_key = str(uuid.uuid4())

        rotated = AuthTokenService.rotate_refresh_token(
            raw_refresh_token=first_refresh,
            idempotency_key=idemp_key
        )

        self.assertNotEqual(first_refresh, rotated['refresh'])
        session = AuthSession.objects.get(id=token_data['session_id'])
        self.assertEqual(session.ledger_entries.count(), 2)

        # First entry must be marked ROTATED
        first_entry = session.ledger_entries.get(status='ROTATED')
        self.assertIsNotNone(first_entry.rotated_at)
        self.assertIsNotNone(first_entry.replaced_by)

    def test_durable_idempotency_retry(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        first_refresh = token_data['refresh']
        idemp_key = str(uuid.uuid4())

        first_rotation = AuthTokenService.rotate_refresh_token(
            raw_refresh_token=first_refresh,
            idempotency_key=idemp_key
        )

        # Simulate network drop: client retries with the SAME refresh token and SAME idempotency key
        retry_rotation = AuthTokenService.rotate_refresh_token(
            raw_refresh_token=first_refresh,
            idempotency_key=idemp_key
        )

        # Must recover identical tokens without error and without creating a 3rd token
        self.assertEqual(first_rotation['access'], retry_rotation['access'])
        self.assertEqual(first_rotation['refresh'], retry_rotation['refresh'])
        session = AuthSession.objects.get(id=token_data['session_id'])
        self.assertEqual(session.ledger_entries.count(), 2)

    def test_replay_attack_revokes_entire_token_family(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        r1 = token_data['refresh']

        # Legitimate rotation R1 -> R2
        r2_data = AuthTokenService.rotate_refresh_token(raw_refresh_token=r1, idempotency_key='key-1')
        r2 = r2_data['refresh']

        # Attacker plays old R1 with different/missing idempotency key
        with self.assertRaises(Exception) as ctx:
            AuthTokenService.rotate_refresh_token(raw_refresh_token=r1, idempotency_key='attacker-key')

        self.assertIn("Token reuse detected", str(ctx.exception))

        # Entire session family must now be REVOKED
        session = AuthSession.objects.get(id=token_data['session_id'])
        self.assertEqual(session.status, 'REVOKED')
        self.assertEqual(session.revocation_reason, 'REPLAY_ATTACK_DETECTED')

        # Using R2 now must also fail
        with self.assertRaises(Exception):
            AuthTokenService.rotate_refresh_token(raw_refresh_token=r2)


class AuthAPIExtendedTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = 'SafePass123!@#'
        self.user = User.objects.create_user(
            email='accountant@accra-academy.edu.gh',
            password=self.password
        )
        self.school = School.objects.create(
            name='Accra Academy',
            slug='accra-academy',
            workspace_status='ACTIVE'
        )
        self.membership = SchoolMembership.objects.create(
            school=self.school,
            user=self.user,
            status='ACTIVE'
        )
        self.role_accountant = Role.objects.get(name='ACCOUNTANT')
        RoleAssignment.objects.create(
            membership=self.membership,
            role=self.role_accountant,
            is_active=True
        )

    def test_login_success(self):
        url = reverse('auth-login')
        response = self.client.post(url, {
            'email': 'accountant@accra-academy.edu.gh',
            'password': self.password
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn('access', response.data['data'])
        self.assertIn('eduflow_refresh_token', response.cookies)
        self.assertTrue(response.cookies['eduflow_refresh_token']['httponly'])

    def test_login_failure_returns_generic_error(self):
        url = reverse('auth-login')
        response = self.client.post(url, {
            'email': 'nonexistent@eduflow.org',
            'password': 'badpassword'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(response.data['success'])
        self.assertEqual(response.data['error']['message'], 'Invalid email address or password.')

    def test_me_endpoint_returns_identity_and_roles(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")

        url = reverse('auth-me')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['data']
        self.assertEqual(data['email'], 'accountant@accra-academy.edu.gh')
        self.assertEqual(data['memberships']['school_name'], 'Accra Academy')
        self.assertIn('ACCOUNTANT', data['memberships']['assigned_roles'])

    def test_logout_revokes_session_and_clears_cookie(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")
        self.client.cookies['eduflow_refresh_token'] = token_data['refresh']

        url = reverse('auth-logout')
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session = AuthSession.objects.get(id=token_data['session_id'])
        self.assertEqual(session.status, 'REVOKED')

        # Calling protected endpoint now must be rejected
        url_me = reverse('auth-me')
        response_me = self.client.get(url_me)
        self.assertEqual(response_me.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_suspended_school_blocks_access(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")

        # Suspend the school workspace
        self.school.workspace_status = 'SUSPENDED'
        self.school.save()

        url_me = reverse('auth-me')
        response = self.client.get(url_me)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_suspended_membership_blocks_workspace_access(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")

        # Suspend membership
        self.membership.status = 'SUSPENDED'
        self.membership.save()

        # Workspace endpoint rejects suspended member
        res = self.client.get(f"/api/v1/schools/{self.school.id}/", HTTP_X_ACTIVE_ROLE='HEADMASTER')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_reset_and_account_recovery(self):
        # 1. Login and issue tokens
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")
        self.assertEqual(self.client.get(reverse('auth-me')).status_code, status.HTTP_200_OK)

        # 2. Request password reset
        self.client.credentials()  # Clear auth
        req_res = self.client.post(reverse('auth-password-reset-request'), {'email': self.user.email}, format='json')
        self.assertEqual(req_res.status_code, status.HTTP_200_OK)

        # Retrieve encrypted token from outbox
        from tenants.models import OutboxEmail
        outbox = OutboxEmail.objects.filter(recipient=self.user.email, email_type='PASSWORD_RESET').first()
        self.assertIsNotNone(outbox)
        decrypted = decrypt_payload(outbox.encrypted_payload)
        raw_token = decrypted['token']

        # 3. Confirm password reset
        confirm_res = self.client.post(reverse('auth-password-reset-confirm'), {
            'token': raw_token,
            'password': 'BrandNewPassword2026!',
            'confirm_password': 'BrandNewPassword2026!'
        }, format='json')
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        # 4. Old access token MUST be rejected now due to token_version increment & session revocation
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")
        old_token_res = self.client.get(reverse('auth-me'))
        self.assertEqual(old_token_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 5. User can log in with new password
        self.client.credentials()
        login_res = self.client.post(reverse('auth-login'), {
            'email': self.user.email,
            'password': 'BrandNewPassword2026!'
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_authenticated_password_change(self):
        token_data = AuthTokenService.create_session_and_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")

        # 1. Wrong old password fails
        fail_res = self.client.post(reverse('auth-password-change'), {
            'old_password': 'WrongPassword!',
            'new_password': 'NewPassword2026!',
            'confirm_new_password': 'NewPassword2026!'
        }, format='json')
        self.assertEqual(fail_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Correct old password succeeds and returns fresh tokens
        change_res = self.client.post(reverse('auth-password-change'), {
            'old_password': self.password,
            'new_password': 'NewPassword2026!',
            'confirm_new_password': 'NewPassword2026!'
        }, format='json')
        self.assertEqual(change_res.status_code, status.HTTP_200_OK)
        new_access = change_res.data['data']['access']

        # 3. Old access token is rejected
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_data['access']}")
        self.assertEqual(self.client.get(reverse('auth-me')).status_code, status.HTTP_401_UNAUTHORIZED)

        # 4. New access token succeeds
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        self.assertEqual(self.client.get(reverse('auth-me')).status_code, status.HTTP_200_OK)



class InvitedUserPublicRegistrationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.school = School.objects.create(
            name='Kwame Nkrumah Memorial School',
            slug='knms-accra',
            workspace_status='ACTIVE'
        )
        self.admin_role, _ = Role.objects.get_or_create(name=Role.ADMINISTRATOR)

    def test_invited_administrator_can_register_and_inherits_role(self):
        admin_email = 'newadmin@knms.edu.gh'
        # 1. Proprietor assigns this email (creates inactive user with membership & role)
        invited_user = User.objects.create_user(
            email=admin_email,
            password=None,
            is_active=False
        )
        membership = SchoolMembership.objects.create(
            school=self.school,
            user=invited_user,
            status='ACTIVE'
        )
        RoleAssignment.objects.create(
            membership=membership,
            role=self.admin_role,
            is_active=True
        )

        # 2. Invited admin registers via public registration endpoint
        reg_payload = {
            'first_name': 'Kofi',
            'last_name': 'Mensah',
            'email': admin_email,
            'password': 'AdminSecurePassword123!',
            'confirm_password': 'AdminSecurePassword123!'
        }
        res = self.client.post('/api/v1/auth/register/', reg_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['success'])

        # Verify tokens returned and session established
        self.assertIn('access', res.data['data'])
        self.assertIn('session_id', res.data['data'])

        # Verify user record updated in database
        invited_user.refresh_from_db()
        self.assertTrue(invited_user.is_active)
        self.assertEqual(invited_user.first_name, 'Kofi')
        self.assertEqual(invited_user.last_name, 'Mensah')
        self.assertTrue(invited_user.check_password('AdminSecurePassword123!'))

        # Verify user profile includes school and ADMINISTRATOR role
        user_data = res.data['data']['user']
        self.assertIsNotNone(user_data['memberships'])
        self.assertEqual(user_data['memberships']['school_name'], 'Kwame Nkrumah Memorial School')
        self.assertIn(Role.ADMINISTRATOR, user_data['memberships']['assigned_roles'])

        # 3. Attempting to register again fails with active account message
        dup_res = self.client.post('/api/v1/auth/register/', reg_payload, format='json')
        self.assertEqual(dup_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already exists', str(dup_res.data))

        # 4. Invited admin can log in with their newly set password
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': admin_email,
            'password': 'AdminSecurePassword123!'
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertTrue(login_res.data['success'])


class SecurityAuditImmutabilityTests(TestCase):
    def test_audit_records_cannot_be_modified_or_deleted(self):
        user = User.objects.create_user(email='audit_user@school.org', password='pwd')
        event = SecurityAuditEvent.log(
            action='TEST_AUDIT_ACTION',
            actor=user,
            metadata={'test': True}
        )

        # Attempt ORM update
        event.action = 'TAMPERED_ACTION'
        with self.assertRaises(PermissionDenied):
            event.save()

        # Attempt ORM delete
        with self.assertRaises(PermissionDenied):
            event.delete()

