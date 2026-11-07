import uuid
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.test import TestCase
from django.core.exceptions import PermissionDenied
from django.core.cache import cache
from django.db import connection
from rest_framework.test import APIClient
from rest_framework import status

from authentication.models import User, AuthSession
from core.crypto import decrypt_payload
from audit.models import SecurityAuditEvent
from tenants.models import (
    School,
    SchoolAccessRequest,
    EmailVerificationToken,
    ProvisioningRecord,
    InvitationToken,
    SchoolMembership,
    Role,
    RoleAssignment,
    OutboxEmail
)
from tenants.services import (
    SchoolRegistrationService,
    ProvisioningService,
    InvitationService,
    SchoolRoleService
)


class TenantSliceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.operator_user = User.objects.create_user(
            email='operator@eduflow.org',
            password='Password123!',
            is_platform_operator=True
        )
        self.regular_user = User.objects.create_user(
            email='regular@gmail.com',
            password='Password123!',
            is_platform_operator=False
        )

        # Seed roles if not present
        self.proprietor_role, _ = Role.objects.get_or_create(name=Role.PROPRIETOR)
        self.admin_role, _ = Role.objects.get_or_create(name=Role.ADMINISTRATOR)
        self.headmaster_role, _ = Role.objects.get_or_create(name=Role.HEADMASTER)
        self.teacher_role, _ = Role.objects.get_or_create(name=Role.CLASS_TEACHER)

    # ------------------------------------------------------------------
    # Slice 2: School Registration and Email Verification
    # ------------------------------------------------------------------

    def test_school_request_creation_and_email_verification(self):
        # 1. Submit request with valid Ghanaian phone number
        payload = {
            'school_name': 'Achimota Basic Academy',
            'requester_name': 'Kwame Mensah',
            'contact_email': 'KWAME@Achimota.EDU.GH',
            'contact_phone': '+233 24 123 4567'
        }
        res = self.client.post('/api/v1/schools/requests/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['success'])
        req_id = res.data['data']['id']

        # Verify DB state
        req = SchoolAccessRequest.objects.get(id=req_id)
        self.assertEqual(req.status, 'EMAIL_UNVERIFIED')
        self.assertEqual(req.contact_email, 'kwame@achimota.edu.gh')  # Lowercase normalized
        self.assertEqual(req.contact_phone, '+233241234567')

        # Verify token created
        token_entry = EmailVerificationToken.objects.filter(request=req).first()
        self.assertIsNotNone(token_entry)
        self.assertFalse(token_entry.is_used)

        # Verify OutboxEmail created with AES-256-GCM encrypted payload
        outbox = OutboxEmail.objects.filter(recipient=req.contact_email).first()
        self.assertIsNotNone(outbox)
        self.assertEqual(outbox.status, 'PENDING')
        decrypted = decrypt_payload(outbox.encrypted_payload)
        raw_token = decrypted['token']
        self.assertIsNotNone(raw_token)

        # 2. Verify email with raw token
        verify_res = self.client.post('/api/v1/schools/requests/verify/', {'token': raw_token}, format='json')
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_res.data['success'])

        req.refresh_from_db()
        self.assertEqual(req.status, 'PENDING')

        token_entry.refresh_from_db()
        self.assertTrue(token_entry.is_used)

        # 3. Replay attack: Reusing same token must fail
        replay_res = self.client.post('/api/v1/schools/requests/verify/', {'token': raw_token}, format='json')
        self.assertEqual(replay_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(replay_res.data['success'])

    def test_invalid_phone_number_rejected(self):
        payload = {
            'school_name': 'Invalid Phone School',
            'requester_name': 'John Doe',
            'contact_email': 'john@example.com',
            'contact_phone': '1234567'  # Not valid Ghana format
        }
        res = self.client.post('/api/v1/schools/requests/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])

    def test_resend_verification_email(self):
        req, raw_token1 = SchoolRegistrationService.create_access_request(
            school_name='St. Peters Primary',
            requester_name='Peter Osei',
            contact_email='peter@stpeters.edu.gh',
            contact_phone='0501234567'
        )
        self.assertEqual(req.status, 'EMAIL_UNVERIFIED')

        # Resend
        res = self.client.post('/api/v1/schools/requests/resend-verification/', {
            'contact_email': 'peter@stpeters.edu.gh'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Old token must be invalidated
        old_token = EmailVerificationToken.objects.get(
            token_hash=hashlib.sha256(raw_token1.encode()).hexdigest()
        )
        self.assertTrue(old_token.is_used)

        # Fresh token exists and is unused
        new_token = EmailVerificationToken.objects.filter(request=req, is_used=False).first()
        self.assertIsNotNone(new_token)

        # Anti-enumeration test for non-existent email
        res_fake = self.client.post('/api/v1/schools/requests/resend-verification/', {
            'contact_email': 'nonexistent@nowhere.com'
        }, format='json')
        self.assertEqual(res_fake.status_code, status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Slice 3: Platform Review Queue
    # ------------------------------------------------------------------

    def test_platform_review_queue_permissions_and_review_flow(self):
        # Create unverified and verified requests
        req_unverified, _ = SchoolRegistrationService.create_access_request(
            'Unverified School', 'Alice', 'alice@test.com', '0241112233'
        )
        req_verified, raw_token = SchoolRegistrationService.create_access_request(
            'Verified School', 'Bob', 'bob@test.com', '0242223344'
        )
        SchoolRegistrationService.verify_email(raw_token)

        # 1. Regular user cannot access review queue
        self.client.force_authenticate(user=self.regular_user)
        res = self.client.get('/api/v1/platform/requests/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Platform Operator can list review queue
        self.client.force_authenticate(user=self.operator_user)
        res = self.client.get('/api/v1/platform/requests/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [item['id'] for item in res.data['data']]
        self.assertIn(str(req_verified.id), ids)
        self.assertNotIn(str(req_unverified.id), ids)  # Unverified excluded!

        # 3. Transition to UNDER_REVIEW
        review_res = self.client.post(f'/api/v1/platform/requests/{req_verified.id}/review/')
        self.assertEqual(review_res.status_code, status.HTTP_200_OK)
        req_verified.refresh_from_db()
        self.assertEqual(req_verified.status, 'UNDER_REVIEW')

        # 4. Reject request without reason -> rejected with 400
        reject_fail = self.client.post(f'/api/v1/platform/requests/{req_verified.id}/reject/', {}, format='json')
        self.assertEqual(reject_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Reject request with reason
        reject_res = self.client.post(f'/api/v1/platform/requests/{req_verified.id}/reject/', {
            'rejection_reason': 'Unable to verify school registration with GES accreditation registry.'
        }, format='json')
        self.assertEqual(reject_res.status_code, status.HTTP_200_OK)
        req_verified.refresh_from_db()
        self.assertEqual(req_verified.status, 'REJECTED')
        self.assertIn('GES accreditation', req_verified.rejection_reason)

    # ------------------------------------------------------------------
    # Slice 4: Provisioning & Proprietor Invitation
    # ------------------------------------------------------------------

    def test_approve_provisioning_and_invitation_acceptance(self):
        req, raw_token = SchoolRegistrationService.create_access_request(
            'Ridgefield International School', 'Kofi Annan', 'kofi@ridgefield.edu.gh', '0245556677'
        )
        SchoolRegistrationService.verify_email(raw_token)

        self.client.force_authenticate(user=self.operator_user)

        # 1. Approve request -> triggers provisioning engine
        approve_res = self.client.post(f'/api/v1/platform/requests/{req.id}/approve/')
        self.assertEqual(approve_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(approve_res.data['success'])

        school_id = approve_res.data['data']['school_id']
        school = School.objects.get(id=school_id)
        self.assertEqual(school.workspace_status, 'PENDING_ACTIVATION')

        # ProvisioningRecord verified
        prov_record = ProvisioningRecord.objects.get(access_request=req)
        self.assertEqual(prov_record.status, 'PROVISIONED')
        self.assertEqual(prov_record.school, school)

        # Proprietor User created (inactive)
        proprietor_user = User.objects.get(email='kofi@ridgefield.edu.gh')
        self.assertFalse(proprietor_user.is_active)

        # Membership and RoleAssignment verified
        membership = SchoolMembership.objects.get(school=school, user=proprietor_user)
        self.assertEqual(membership.status, 'ACTIVE')
        self.assertTrue(RoleAssignment.objects.filter(membership=membership, role__name=Role.PROPRIETOR, is_active=True).exists())

        # InvitationToken created and Outbox encrypted email staged
        invitation_outbox = OutboxEmail.objects.filter(recipient=proprietor_user.email, email_type='PROPRIETOR_INVITATION').first()
        self.assertIsNotNone(invitation_outbox)
        decrypted = decrypt_payload(invitation_outbox.encrypted_payload)
        invitation_token = decrypted['token']

        # 2. Accept invitation
        self.client.force_authenticate(user=None)
        accept_payload = {
            'token': invitation_token,
            'password': 'SecurePassword2026!',
            'confirm_password': 'SecurePassword2026!'
        }
        accept_res = self.client.post('/api/v1/auth/invitations/accept/', accept_payload, format='json')
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)
        self.assertTrue(accept_res.data['success'])
        self.assertIn('access', accept_res.data['data'])

        # User is now active!
        proprietor_user.refresh_from_db()
        self.assertTrue(proprietor_user.is_active)
        self.assertTrue(proprietor_user.check_password('SecurePassword2026!'))

        # School transitioned to ONBOARDING!
        school.refresh_from_db()
        self.assertEqual(school.workspace_status, 'ONBOARDING')

        # Invitation token is used
        inv_token_db = InvitationToken.objects.get(token_hash=hashlib.sha256(invitation_token.encode()).hexdigest())
        self.assertTrue(inv_token_db.is_accepted)

    # ------------------------------------------------------------------
    # Slice 5: School Onboarding and Role Management
    # ------------------------------------------------------------------

    def test_school_onboarding_and_last_admin_protection(self):
        # Set up a provisioned school in ONBOARDING status
        school = School.objects.create(name='Presby Model School', slug='presby-model', workspace_status='ONBOARDING')
        proprietor = User.objects.create_user(email='proprietor@presby.edu.gh', password='Password123!', is_active=True)
        prop_membership = SchoolMembership.objects.create(school=school, user=proprietor, status='ACTIVE')
        RoleAssignment.objects.create(membership=prop_membership, role=self.proprietor_role, is_active=True)

        self.client.force_authenticate(user=proprietor)

        # 1. Proprietor assigns self as first Administrator to complete onboarding
        onboard_res = self.client.post(
            f'/api/v1/schools/{school.id}/onboarding/assign-admin/',
            {'admin_email': proprietor.email},
            format='json'
        )
        self.assertEqual(onboard_res.status_code, status.HTTP_200_OK)
        school.refresh_from_db()
        self.assertEqual(school.workspace_status, 'ACTIVE')
        self.assertTrue(RoleAssignment.objects.filter(membership=prop_membership, role=self.admin_role, is_active=True).exists())

        # 2. Add second user as member
        teacher_user = User.objects.create_user(email='teacher@presby.edu.gh', password='Password123!', is_active=True)
        teacher_membership = SchoolMembership.objects.create(school=school, user=teacher_user, status='ACTIVE')

        # Proprietor assigns CLASS_TEACHER to second user with active role context header
        assign_res = self.client.post(
            f'/api/v1/schools/{school.id}/members/{teacher_user.id}/roles/',
            {'role_name': Role.CLASS_TEACHER},
            format='json',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(assign_res.status_code, status.HTTP_200_OK)
        self.assertTrue(RoleAssignment.objects.filter(membership=teacher_membership, role=self.teacher_role, is_active=True).exists())

        # 3. Self-role modification prohibition: Proprietor trying to assign role to self via member endpoint
        self_mod_res = self.client.post(
            f'/api/v1/schools/{school.id}/members/{proprietor.id}/roles/',
            {'role_name': Role.HEADMASTER},
            format='json',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(self_mod_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Self-role modification', self_mod_res.data['error']['message'])

        # 4. Last Administrator Protection: Cannot remove only active Administrator in school!
        # First assign admin to teacher as well
        admin_assign = self.client.post(
            f'/api/v1/schools/{school.id}/members/{teacher_user.id}/roles/',
            {'role_name': Role.ADMINISTRATOR},
            format='json',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(admin_assign.status_code, status.HTTP_200_OK)

        # Now there are 2 admins (proprietor and teacher). Removing teacher's admin role should succeed:
        remove_first = self.client.delete(
            f'/api/v1/schools/{school.id}/members/{teacher_user.id}/roles/{Role.ADMINISTRATOR}/',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(remove_first.status_code, status.HTTP_200_OK)

        # Try to remove Administrator role when only 1 remains (attempting on teacher who no longer has it fails with not found)
        # If we assign to another user and try to remove the only remaining admin:
        other_user = User.objects.create_user(email='other@presby.edu.gh', password='Password123!', is_active=True)
        other_membership = SchoolMembership.objects.create(school=school, user=other_user, status='ACTIVE')
        other_admin_ra = RoleAssignment.objects.create(membership=other_membership, role=self.admin_role, is_active=True)

        # Deactivate proprietor's admin role so only other_admin_ra remains
        RoleAssignment.objects.filter(membership=prop_membership, role=self.admin_role).update(is_active=False)

        # Now other_user is the ONLY active administrator! Attempting to remove other_user's admin role must fail:
        last_admin_res = self.client.delete(
            f'/api/v1/schools/{school.id}/members/{other_user.id}/roles/{Role.ADMINISTRATOR}/',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(last_admin_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('last active Administrator', last_admin_res.data['error']['message'])

    # ------------------------------------------------------------------
    # Slice 6: Active-Role Context & Tenant Isolation (IDOR Defense)
    # ------------------------------------------------------------------

    def test_active_role_context_and_cross_tenant_isolation(self):
        # Create School A and School B
        school_a = School.objects.create(name='School Alpha', slug='school-alpha', workspace_status='ACTIVE')
        school_b = School.objects.create(name='School Beta', slug='school-beta', workspace_status='ACTIVE')

        user_a = User.objects.create_user(email='user_a@alpha.edu.gh', password='Password123!', is_active=True)
        membership_a = SchoolMembership.objects.create(school=school_a, user=user_a, status='ACTIVE')
        RoleAssignment.objects.create(membership=membership_a, role=self.proprietor_role, is_active=True)

        self.client.force_authenticate(user=user_a)

        # 1. Calling workspace detail without X-Active-Role header -> 403
        no_header_res = self.client.get(f'/api/v1/schools/{school_a.id}/')
        self.assertEqual(no_header_res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Calling with an unassigned role -> 403
        invalid_role_res = self.client.get(
            f'/api/v1/schools/{school_a.id}/',
            HTTP_X_ACTIVE_ROLE=Role.HEADMASTER
        )
        self.assertEqual(invalid_role_res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Calling with valid assigned role -> 200
        valid_role_res = self.client.get(
            f'/api/v1/schools/{school_a.id}/',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(valid_role_res.status_code, status.HTTP_200_OK)
        self.assertEqual(valid_role_res.data['data']['name'], 'School Alpha')

        # 4. Cross-Tenant IDOR test: User A attempts to access School B's workspace
        idor_res = self.client.get(
            f'/api/v1/schools/{school_b.id}/',
            HTTP_X_ACTIVE_ROLE=Role.PROPRIETOR
        )
        self.assertEqual(idor_res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Slice 7: Audit Log Immutability & Database Trigger Protection
    # ------------------------------------------------------------------

    def test_audit_log_immutability(self):
        event = SecurityAuditEvent.log(
            action='INTEGRATION_TEST_EVENT',
            actor=self.regular_user,
            target_type='Test',
            metadata={'test': True}
        )
        self.assertIsNotNone(event.id)

        # ORM layer update protection
        event.action = 'TAMPERED_ACTION'
        with self.assertRaises(PermissionDenied):
            event.save()

        # ORM layer delete protection
        with self.assertRaises(PermissionDenied):
            event.delete()

        # Direct PostgreSQL trigger protection (bypassing Django ORM)
        with connection.cursor() as cursor:
            with self.assertRaises(Exception):
                cursor.execute(
                    "UPDATE audit_securityauditevent SET action = 'SQL_TAMPERED' WHERE id = %s",
                    [str(event.id)]
                )
            with self.assertRaises(Exception):
                cursor.execute(
                    "DELETE FROM audit_securityauditevent WHERE id = %s",
                    [str(event.id)]
                )

    # ------------------------------------------------------------------
    # User Registration, Platform Operator Auth, & Staff Invitations
    # ------------------------------------------------------------------

    def test_user_registration_and_authenticated_school_request(self):
        # 1. Register new public user / prospective proprietor
        reg_payload = {
            'first_name': 'Ama',
            'last_name': 'Kusi',
            'email': 'ama.kusi@gmail.com',
            'password': 'SecurePassword123!',
            'confirm_password': 'SecurePassword123!'
        }
        reg_res = self.client.post('/api/v1/auth/register/', reg_payload, format='json')
        self.assertEqual(reg_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(reg_res.data['success'])
        access_token = reg_res.data['data']['access']
        user_id = reg_res.data['data']['user']['id']

        # 2. Authenticated user submits school request
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        school_payload = {
            'school_name': 'Morning Star Preparatory',
            'contact_phone': '0249876543'
        }
        sub_res = self.client.post('/api/v1/schools/requests/', school_payload, format='json')
        self.assertEqual(sub_res.status_code, status.HTTP_201_CREATED)
        req_id = sub_res.data['data']['id']

        # Check DB association to user
        req = SchoolAccessRequest.objects.get(id=req_id)
        self.assertEqual(str(req.requester_user_id), user_id)
        self.assertEqual(req.contact_email, 'ama.kusi@gmail.com')

        # 3. User checks my-requests
        my_res = self.client.get('/api/v1/schools/my-requests/')
        self.assertEqual(my_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(my_res.data['data']), 1)
        self.assertEqual(my_res.data['data'][0]['school_name'], 'Morning Star Preparatory')

    def test_platform_operator_dedicated_auth_and_management(self):
        cache.clear()
        # 1. Non-operator tries to log in via platform and admin routes -> 403 Forbidden
        self.client.credentials()
        non_op_res = self.client.post('/api/v1/platform/auth/login/', {
            'email': self.regular_user.email,
            'password': 'Password123!'
        }, format='json')
        self.assertEqual(non_op_res.status_code, status.HTTP_403_FORBIDDEN)

        admin_non_op_res = self.client.post('/api/v1/admin/login/', {
            'email': self.regular_user.email,
            'password': 'Password123!'
        }, format='json')
        self.assertEqual(admin_non_op_res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Platform operator logs in via dedicated /admin/login/ route -> 200 OK
        cache.clear()
        admin_op_res = self.client.post('/api/v1/admin/login/', {
            'email': self.operator_user.email,
            'password': 'Password123!'
        }, format='json')
        self.assertEqual(admin_op_res.status_code, status.HTTP_200_OK)

        # 3. Platform operator also logs in via /platform/auth/login/ -> 200 OK
        cache.clear()
        op_res = self.client.post('/api/v1/platform/auth/login/', {
            'email': self.operator_user.email,
            'password': 'Password123!'
        }, format='json')
        self.assertEqual(op_res.status_code, status.HTTP_200_OK)
        op_access = op_res.data['data']['access']

        # 3. Platform stats
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {op_access}")
        stats_res = self.client.get('/api/v1/platform/stats/')
        self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
        self.assertIn('total_schools', stats_res.data['data'])
        self.assertIn('pending_requests', stats_res.data['data'])

        # 4. Suspend and Reactivate school
        school = School.objects.create(name='Test Suspend School', slug='test-suspend', workspace_status='ACTIVE')
        suspend_res = self.client.post(f'/api/v1/platform/schools/{school.id}/suspend/')
        self.assertEqual(suspend_res.status_code, status.HTTP_200_OK)
        school.refresh_from_db()
        self.assertEqual(school.workspace_status, 'SUSPENDED')

        reactivate_res = self.client.post(f'/api/v1/platform/schools/{school.id}/reactivate/')
        self.assertEqual(reactivate_res.status_code, status.HTTP_200_OK)
        school.refresh_from_db()
        self.assertEqual(school.workspace_status, 'ACTIVE')

    def test_staff_invitation_by_administrator(self):
        school = School.objects.create(name='St. Theresa Academy', slug='st-theresa', workspace_status='ACTIVE')
        admin_user = User.objects.create_user(email='admin@sttheresa.edu.gh', password='Password123!')
        m = SchoolMembership.objects.create(school=school, user=admin_user, status='ACTIVE')
        RoleAssignment.objects.create(membership=m, role=self.admin_role, is_active=True)

        self.client.force_authenticate(user=admin_user)

        invite_res = self.client.post(
            f'/api/v1/schools/{school.id}/invitations/',
            {'email': 'newteacher@sttheresa.edu.gh', 'role_name': Role.CLASS_TEACHER},
            format='json',
            HTTP_X_ACTIVE_ROLE=Role.ADMINISTRATOR
        )
        self.assertEqual(invite_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(invite_res.data['success'])

        # Staff user created as inactive
        new_teacher = User.objects.get(email='newteacher@sttheresa.edu.gh')
        self.assertFalse(new_teacher.is_active)
        teacher_membership = SchoolMembership.objects.get(school=school, user=new_teacher)
        self.assertTrue(RoleAssignment.objects.filter(membership=teacher_membership, role=self.teacher_role, is_active=True).exists())

