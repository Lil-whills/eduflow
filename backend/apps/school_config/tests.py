import json
import uuid
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status

from authentication.models import User, AuthSession
from authentication.services import AuthTokenService
from tenants.models import School, SchoolMembership, Role, RoleAssignment, SchoolAccessRequest
from tenants.services import ProvisioningService
from school_config.models import (
    SchoolProfile,
    AcademicYear,
    AcademicTerm,
    ClassLevel,
    ClassGroup,
    Subject,
    ClassSubject,
    ClassTeacherAssignment,
    SubjectTeacherAssignment
)
from school_config.services import (
    SchoolConfigBootstrapService,
    AcademicCalendarService,
    StaffGovernanceService,
    TeachingAssignmentService
)


class SchoolConfigTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # Roles
        self.prop_role, _ = Role.objects.get_or_create(name=Role.PROPRIETOR)
        self.admin_role, _ = Role.objects.get_or_create(name=Role.ADMINISTRATOR)
        self.class_teacher_role, _ = Role.objects.get_or_create(name=Role.CLASS_TEACHER)
        self.subj_teacher_role, _ = Role.objects.get_or_create(name=Role.SUBJECT_TEACHER)

        # Platform Operator
        self.platform_operator = User.objects.create_superuser(
            email='operator@eduflow.org',
            password='OperatorPassword123!',
            is_platform_operator=True
        )

        # School 1 (Main test school)
        self.school = School.objects.create(name='Accra Modern Academy', slug='accra-modern', workspace_status='ACTIVE')
        
        # Proprietor User
        self.proprietor_user = User.objects.create_user(
            email='proprietor@accramodern.edu.gh',
            password='ProprietorPass123!',
            first_name='Kwame',
            last_name='Mensah'
        )
        self.prop_membership = SchoolMembership.objects.create(
            school=self.school,
            user=self.proprietor_user,
            status='ACTIVE'
        )
        RoleAssignment.objects.create(membership=self.prop_membership, role=self.prop_role, is_active=True)

        # Administrator User
        self.admin_user = User.objects.create_user(
            email='admin@accramodern.edu.gh',
            password='AdminPassword123!',
            first_name='Abena',
            last_name='Osei'
        )
        self.admin_membership = SchoolMembership.objects.create(
            school=self.school,
            user=self.admin_user,
            status='ACTIVE'
        )
        RoleAssignment.objects.create(membership=self.admin_membership, role=self.admin_role, is_active=True)

        # Teacher User
        self.teacher_user = User.objects.create_user(
            email='teacher@accramodern.edu.gh',
            password='TeacherPass123!',
            first_name='Kofi',
            last_name='Annang'
        )
        self.teacher_membership = SchoolMembership.objects.create(
            school=self.school,
            user=self.teacher_user,
            status='ACTIVE'
        )
        RoleAssignment.objects.create(membership=self.teacher_membership, role=self.class_teacher_role, is_active=True)
        RoleAssignment.objects.create(membership=self.teacher_membership, role=self.subj_teacher_role, is_active=True)

        # School 2 (Tenant Isolation testing)
        self.other_school = School.objects.create(name='Kumasi High Academy', slug='kumasi-high', workspace_status='ACTIVE')
        self.other_user = User.objects.create_user(
            email='other@kumasihigh.edu.gh',
            password='OtherPassword123!'
        )
        self.other_membership = SchoolMembership.objects.create(
            school=self.other_school,
            user=self.other_user,
            status='ACTIVE'
        )
        RoleAssignment.objects.create(membership=self.other_membership, role=self.admin_role, is_active=True)

    def _auth_headers(self, user, active_role=None):
        tokens = AuthTokenService.create_session_and_tokens(user)
        headers = {'HTTP_AUTHORIZATION': f"Bearer {tokens['access']}"}
        if active_role:
            headers['HTTP_X_ACTIVE_ROLE'] = active_role
        return headers

    # ------------------------------------------------------------------
    # Test 1: Workspace Approval Auto-Bootstrap
    # ------------------------------------------------------------------
    def test_school_approval_auto_bootstraps_complete_ges_workspace(self):
        """
        When platform operator approves a school registration request,
        it must provision the school and auto-bootstrap standard GES curriculum:
        SchoolProfile, ClassLevels (KG1-JHS3), unstreamed groups, core subjects, mappings, and draft academic year.
        """
        req = SchoolAccessRequest.objects.create(
            school_name='Cape Coast International School',
            requester_name='Ama Atta',
            contact_email='ama@capecoastintl.edu.gh',
            contact_phone='+233240001122',
            status='PENDING'
        )

        ProvisioningService.approve_and_provision(req.id, self.platform_operator)

        provisioned_school = School.objects.get(name='Cape Coast International School')
        profile = SchoolProfile.objects.filter(school=provisioned_school).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.school_type, 'BASIC_COMPLETE')
        self.assertEqual(profile.contact_email, 'ama@capecoastintl.edu.gh')

        # Check Class Levels pre-seeded (KG 1, KG 2, Basic 1-6, JHS 1-3 = 11 levels)
        levels = ClassLevel.objects.filter(school=provisioned_school)
        self.assertEqual(levels.count(), 11)

        # Check default unstreamed ClassGroups created
        groups = ClassGroup.objects.filter(school=provisioned_school)
        self.assertEqual(groups.count(), 11)

        # Check subjects created (9 core/elective subjects)
        subjects = Subject.objects.filter(school=provisioned_school)
        self.assertGreaterEqual(subjects.count(), 9)

        # Check draft academic year created with 3 terms
        academic_year = AcademicYear.objects.filter(school=provisioned_school).first()
        self.assertIsNotNone(academic_year)
        self.assertEqual(academic_year.status, 'DRAFT')
        self.assertEqual(academic_year.terms.count(), 3)

    # ------------------------------------------------------------------
    # Test 2: Academic Calendar & One-Active-Year Rule
    # ------------------------------------------------------------------
    def test_academic_calendar_date_containment_and_one_active_year(self):
        # 1. Bootstrap School 1
        SchoolConfigBootstrapService.bootstrap_school_structure(self.school)

        # 2. Add an academic year via API
        headers = self._auth_headers(self.admin_user, Role.ADMINISTRATOR)
        resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/academic-years/',
            {
                'name': '2027/2028 Academic Year',
                'start_date': '2027-09-01',
                'end_date': '2028-07-31'
            },
            format='json',
            **headers
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        new_year_id = resp.data['data']['id']

        # 3. Add term strictly inside year dates
        term_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/academic-years/{new_year_id}/terms/',
            {
                'term_number': 1,
                'name': 'Term 1',
                'start_date': '2027-09-06',
                'end_date': '2027-12-18'
            },
            format='json',
            **headers
        )
        self.assertEqual(term_resp.status_code, status.HTTP_201_CREATED)

        # 4. Out-of-bounds term rejected
        bad_term_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/academic-years/{new_year_id}/terms/',
            {
                'term_number': 2,
                'name': 'Invalid Out-of-bounds Term',
                'start_date': '2028-08-01',
                'end_date': '2028-09-30'
            },
            format='json',
            **headers
        )
        self.assertEqual(bad_term_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Overlapping term rejected
        overlap_term_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/academic-years/{new_year_id}/terms/',
            {
                'term_number': 2,
                'name': 'Overlapping Term',
                'start_date': '2027-11-01',
                'end_date': '2028-01-31'
            },
            format='json',
            **headers
        )
        self.assertEqual(overlap_term_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 6. Activate new academic year -> confirms one-active-year rule
        activate_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/academic-years/{new_year_id}/activate/',
            {},
            format='json',
            **headers
        )
        self.assertEqual(activate_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(activate_resp.data['data']['status'], 'ACTIVE')

        # Only one year is active
        active_years = AcademicYear.objects.filter(school=self.school, status='ACTIVE')
        self.assertEqual(active_years.count(), 1)
        self.assertEqual(str(active_years.first().id), new_year_id)

    # ------------------------------------------------------------------
    # Test 3: Stream & Class Level Management
    # ------------------------------------------------------------------
    def test_class_level_and_stream_creation(self):
        headers = self._auth_headers(self.admin_user, Role.ADMINISTRATOR)
        
        # Create Class Level
        level_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/class-levels/',
            {'name': 'Basic 7 (JHS 1)', 'stage': 'JHS', 'order_index': 7},
            format='json',
            **headers
        )
        self.assertEqual(level_resp.status_code, status.HTTP_201_CREATED)
        level_id = level_resp.data['data']['id']

        # Create Stream 'A'
        stream_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/class-groups/',
            {'class_level_id': level_id, 'stream_name': 'A'},
            format='json',
            **headers
        )
        self.assertEqual(stream_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(stream_resp.data['data']['display_name'], 'Basic 7 (JHS 1) A')

        # Duplicate stream rejected
        dup_resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/class-groups/',
            {'class_level_id': level_id, 'stream_name': 'A'},
            format='json',
            **headers
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # Test 4: Teaching Assignments & Primary Conflict Check
    # ------------------------------------------------------------------
    def test_primary_class_teacher_conflict_resolution(self):
        SchoolConfigBootstrapService.bootstrap_school_structure(self.school)
        year = AcademicYear.objects.filter(school=self.school).first()
        group = ClassGroup.objects.filter(school=self.school).first()

        # Create another teacher
        teacher2 = User.objects.create_user(email='teacher2@accramodern.edu.gh', password='Pass123!')
        mem2 = SchoolMembership.objects.create(school=self.school, user=teacher2, status='ACTIVE')
        RoleAssignment.objects.create(membership=mem2, role=self.class_teacher_role, is_active=True)

        headers = self._auth_headers(self.admin_user, Role.ADMINISTRATOR)

        # Assign Teacher 1 as Primary Class Teacher
        resp1 = self.client.post(
            f'/api/v1/schools/{self.school.id}/teaching-assignments/class-teachers/',
            {
                'academic_year_id': str(year.id),
                'class_group_id': str(group.id),
                'teacher_membership_id': str(self.teacher_membership.id),
                'is_primary': True
            },
            format='json',
            **headers
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        assign1_id = resp1.data['data']['id']

        # Assign Teacher 2 as Primary Class Teacher to the same class group
        resp2 = self.client.post(
            f'/api/v1/schools/{self.school.id}/teaching-assignments/class-teachers/',
            {
                'academic_year_id': str(year.id),
                'class_group_id': str(group.id),
                'teacher_membership_id': str(mem2.id),
                'is_primary': True
            },
            format='json',
            **headers
        )
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)

        # Verify Teacher 1's assignment was automatically ENDED
        old_assignment = ClassTeacherAssignment.objects.get(id=assign1_id)
        self.assertEqual(old_assignment.status, 'ENDED')
        self.assertIsNotNone(old_assignment.ended_at)

        # Verify exactly one active primary class teacher exists for this group
        active_primary = ClassTeacherAssignment.objects.filter(
            class_group=group,
            academic_year=year,
            is_primary=True,
            status='ACTIVE'
        )
        self.assertEqual(active_primary.count(), 1)
        self.assertEqual(active_primary.first().teacher_membership, mem2)

    # ------------------------------------------------------------------
    # Test 5: Staff Dismissal and Instant Remote Access Invalidation
    # ------------------------------------------------------------------
    def test_staff_dismissal_instantly_terminates_sessions_and_tokens(self):
        # Create an active AuthSession for teacher
        tokens = AuthTokenService.create_session_and_tokens(self.teacher_user)
        session = AuthSession.objects.get(id=tokens['session_id'])
        initial_token_version = self.teacher_user.token_version

        headers = self._auth_headers(self.admin_user, Role.ADMINISTRATOR)

        # Dismiss teacher
        resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/staff/{self.teacher_membership.id}/dismiss/',
            {'reason': 'Gross misconduct and breach of policy.'},
            format='json',
            **headers
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # 1. Membership status is REVOKED
        self.teacher_membership.refresh_from_db()
        self.assertEqual(self.teacher_membership.status, 'REVOKED')

        # 2. Roles are deactivated
        active_roles = RoleAssignment.objects.filter(membership=self.teacher_membership, is_active=True)
        self.assertEqual(active_roles.count(), 0)

        # 3. AuthSession is REVOKED
        session.refresh_from_db()
        self.assertEqual(session.status, 'REVOKED')
        self.assertEqual(session.revocation_reason, 'STAFF_DISMISSED')

        # 4. User token_version incremented (invalidating JWT access token immediately)
        self.teacher_user.refresh_from_db()
        self.assertEqual(self.teacher_user.token_version, initial_token_version + 1)

    # ------------------------------------------------------------------
    # Test 6: Last Administrator & Proprietor Dismissal Guardrails
    # ------------------------------------------------------------------
    def test_last_administrator_and_proprietor_dismissal_protection(self):
        headers = self._auth_headers(self.admin_user, Role.ADMINISTRATOR)

        # Administrator cannot dismiss themselves if they are the sole administrator
        resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/staff/{self.admin_membership.id}/dismiss/',
            {'reason': 'Self dismiss'},
            format='json',
            **headers
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Administrator cannot dismiss the Proprietor
        resp_prop = self.client.post(
            f'/api/v1/schools/{self.school.id}/staff/{self.prop_membership.id}/dismiss/',
            {'reason': 'Attempt to dismiss proprietor'},
            format='json',
            **headers
        )
        self.assertEqual(resp_prop.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Test 7: Sovereign Proprietor Administrator Reassignment
    # ------------------------------------------------------------------
    def test_proprietor_sovereign_admin_reassignment(self):
        prop_headers = self._auth_headers(self.proprietor_user, Role.PROPRIETOR)

        # Proprietor reassigns administrator to a new email
        resp = self.client.post(
            f'/api/v1/schools/{self.school.id}/governance/reassign-admin/',
            {'new_admin_email': 'newheadmaster@accramodern.edu.gh'},
            format='json',
            **prop_headers
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Previous administrator role deactivated
        old_admin_assignment = RoleAssignment.objects.filter(
            membership=self.admin_membership,
            role=self.admin_role
        ).first()
        self.assertFalse(old_admin_assignment.is_active)

        # New administrator created with ACTIVE administrator role
        new_membership = SchoolMembership.objects.get(
            school=self.school,
            user__email='newheadmaster@accramodern.edu.gh'
        )
        self.assertTrue(
            RoleAssignment.objects.filter(membership=new_membership, role=self.admin_role, is_active=True).exists()
        )

        # Non-proprietor (e.g. teacher) cannot reassign admin
        teacher_headers = self._auth_headers(self.teacher_user, Role.CLASS_TEACHER)
        resp_teacher = self.client.post(
            f'/api/v1/schools/{self.school.id}/governance/reassign-admin/',
            {'new_admin_email': 'illegal@accramodern.edu.gh'},
            format='json',
            **teacher_headers
        )
        self.assertEqual(resp_teacher.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Test 8: Multi-Tenant Isolation
    # ------------------------------------------------------------------
    def test_multi_tenant_cross_school_isolation(self):
        # Admin from Kumasi High cannot manage or view Accra Modern Academy's staff or configuration
        other_headers = self._auth_headers(self.other_user, Role.ADMINISTRATOR)

        resp = self.client.get(
            f'/api/v1/schools/{self.school.id}/staff/',
            **other_headers
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        resp_create = self.client.post(
            f'/api/v1/schools/{self.school.id}/class-levels/',
            {'name': 'Cross Tenant Class', 'stage': 'JHS'},
            format='json',
            **other_headers
        )
        self.assertEqual(resp_create.status_code, status.HTTP_403_FORBIDDEN)

