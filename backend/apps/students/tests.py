import json
from datetime import date
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status

from authentication.models import User
from authentication.services import AuthTokenService
from tenants.models import School, SchoolMembership, Role, RoleAssignment
from school_config.models import AcademicYear, ClassLevel, ClassGroup
from school_config.services import SchoolConfigBootstrapService
from students.models import (
    Student,
    StudentContact,
    StudentEnrollment,
    DuplicateReview,
    StudentMergeRecord,
    StudentImportBatch
)
from students.services import (
    StudentService,
    AdmissionNumberService,
    DuplicateDetectionService,
    DuplicateStudentWarning,
    StudentReportingService,
    StudentImportService
)


class StudentManagementTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # Roles
        self.prop_role, _ = Role.objects.get_or_create(name=Role.PROPRIETOR)
        self.admin_role, _ = Role.objects.get_or_create(name=Role.ADMINISTRATOR)
        self.class_teacher_role, _ = Role.objects.get_or_create(name=Role.CLASS_TEACHER)
        self.subj_teacher_role, _ = Role.objects.get_or_create(name=Role.SUBJECT_TEACHER)

        # School A
        self.school_a = School.objects.create(name='Accra Modern Academy', slug='accra-modern', workspace_status='ACTIVE')
        SchoolConfigBootstrapService.bootstrap_school_structure(self.school_a)

        # School B (for tenant isolation test)
        self.school_b = School.objects.create(name='Kumasi High Academy', slug='kumasi-high', workspace_status='ACTIVE')
        SchoolConfigBootstrapService.bootstrap_school_structure(self.school_b)

        # Admin user for School A
        self.admin_user = User.objects.create_user(
            email='admin@accramodern.edu.gh',
            password='AdminPassword123!',
            first_name='Abena',
            last_name='Osei'
        )
        self.admin_member = SchoolMembership.objects.create(school=self.school_a, user=self.admin_user, status='ACTIVE')
        RoleAssignment.objects.create(membership=self.admin_member, role=self.admin_role, is_active=True)

        # Obtain token for admin
        tokens = AuthTokenService.create_session_and_tokens(self.admin_user)
        self.admin_token = tokens['access']

        # Get bootstrapped active year and class groups for School A
        self.academic_year_a = AcademicYear.objects.filter(school=self.school_a).first()
        self.academic_year_a.status = 'ACTIVE'
        self.academic_year_a.save()

        self.class_4_level = ClassLevel.objects.filter(school=self.school_a, name='Basic 4').first()
        self.class_4a, _ = ClassGroup.objects.get_or_create(school=self.school_a, class_level=self.class_4_level, stream_name='A')
        self.class_4b, _ = ClassGroup.objects.get_or_create(school=self.school_a, class_level=self.class_4_level, stream_name='B')

    def test_student_registration_generates_unique_admission_number(self):
        """
        Test 1: Registering a student automatically generates a predictable, unique admission number
        formatted as {PREFIX}/{YEAR}/{SEQ:04d}.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        payload = {
            'first_name': 'Kofi',
            'last_name': 'Mensah',
            'gender': 'MALE',
            'date_of_birth': '2015-04-10',
            'primary_contact': {
                'name': 'Grace Mensah',
                'relationship': 'MOTHER',
                'phone_primary': '+233241112233',
                'email': 'grace.mensah@example.com'
            },
            'class_group_id': str(self.class_4a.id),
            'academic_year_id': str(self.academic_year_a.id)
        }

        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/students/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.data['data']

        self.assertIn('admission_number', data)
        self.assertTrue(data['admission_number'].startswith('ACC/'))
        self.assertEqual(data['first_name'], 'Kofi')
        self.assertEqual(data['status'], 'ACTIVE')

        # Check DB
        student = Student.objects.get(id=data['id'])
        self.assertEqual(student.contacts.count(), 1)
        self.assertEqual(student.enrollments.count(), 1)
        self.assertEqual(student.enrollments.first().status, 'ACTIVE')

    def test_mandatory_primary_contact_enforced(self):
        """
        Test 2: Student registration fails if primary contact is omitted.
        """
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        payload = {
            'first_name': 'Ama',
            'last_name': 'Boateng',
            'primary_contact': {}  # Empty contact
        }

        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/students/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_immediate_enrollment_activation(self):
        """
        Test 3: Spec confirms student and enrollment are active immediately without extra approval step.
        """
        student = StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Yaw', 'last_name': 'Appiah'},
            primary_contact_data={'name': 'Kwame Appiah', 'relationship': 'FATHER', 'phone_primary': '+233201234567'},
            class_group=self.class_4a,
            academic_year=self.academic_year_a,
            actor=self.admin_user
        )

        self.assertEqual(student.status, 'ACTIVE')
        enrollment = student.enrollments.first()
        self.assertIsNotNone(enrollment)
        self.assertEqual(enrollment.status, 'ACTIVE')
        self.assertEqual(enrollment.class_group, self.class_4a)

    def test_duplicate_detection_warns_on_matching_index_or_guardian_phone(self):
        """
        Test 4: Registering a student with duplicate signals (index number or matching name + phone)
        returns a 409 Conflict with duplicate matches.
        """
        # Register original student
        StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Esi', 'last_name': 'Badu', 'index_number': 'IDX-1001'},
            primary_contact_data={'name': 'Kojo Badu', 'relationship': 'FATHER', 'phone_primary': '+233240001122'},
            class_group=self.class_4a,
            academic_year=self.academic_year_a,
            actor=self.admin_user
        )

        # Attempt to register duplicate with same index number
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        payload = {
            'first_name': 'Esi',
            'last_name': 'Badu',
            'index_number': 'IDX-1001',
            'primary_contact': {
                'name': 'Kojo Badu',
                'relationship': 'FATHER',
                'phone_primary': '+233240001122'
            }
        }
        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/students/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('duplicate_matches', res.data['data'])
        self.assertTrue(len(res.data['data']['duplicate_matches']) > 0)

    def test_keep_both_duplicates_assigns_distinct_admission_numbers(self):
        """
        Test 5: When administrator explicitly forces creation ('keep both'), separate student
        is created with its own distinct admission number and recorded in DuplicateReview.
        """
        s1 = StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Kwaku', 'last_name': 'Duah', 'index_number': 'IDX-500'},
            primary_contact_data={'name': 'Akosua Duah', 'relationship': 'MOTHER', 'phone_primary': '+233245556677'},
            actor=self.admin_user
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        payload = {
            'first_name': 'Kwaku',
            'last_name': 'Duah',
            'index_number': 'IDX-500',
            'primary_contact': {
                'name': 'Akosua Duah',
                'relationship': 'MOTHER',
                'phone_primary': '+233245556677'
            },
            'force_create': True
        }
        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/students/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        s2_data = res.data['data']

        self.assertNotEqual(s1.admission_number, s2_data['admission_number'])
        self.assertTrue(DuplicateReview.objects.filter(school=self.school_a, status='RESOLVED_KEPT_BOTH').exists())

    def test_safe_student_merge_operation(self):
        """
        Test 6: Merge consolidates two student profiles:
        - Preserves surviving student admission number
        - Safely transfers enrollments and contacts
        - Marks merged student status='MERGED'
        - Audited in StudentMergeRecord
        """
        s1 = StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Adwoa', 'last_name': 'Mansah'},
            primary_contact_data={'name': 'Peter Mansah', 'relationship': 'FATHER', 'phone_primary': '+233249998877'},
            class_group=self.class_4a,
            academic_year=self.academic_year_a,
            actor=self.admin_user
        )

        s2 = StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Adwoa', 'last_name': 'Mansah'},
            primary_contact_data={'name': 'Mary Mansah', 'relationship': 'MOTHER', 'phone_primary': '+233249998877'},
            actor=self.admin_user,
            force_create=True
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        merge_payload = {
            'surviving_student_id': str(s1.id),
            'merged_student_id': str(s2.id),
            'notes': 'Duplicate entry resolved after parent verification.'
        }
        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/students/merge/', merge_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify DB state
        s1.refresh_from_db()
        s2.refresh_from_db()

        self.assertEqual(s1.status, 'ACTIVE')
        self.assertEqual(s2.status, 'MERGED')
        self.assertEqual(s2.merged_into, s1)
        self.assertEqual(s1.contacts.count(), 2)  # Peter + Mary

        # Check merge audit ledger
        self.assertTrue(StudentMergeRecord.objects.filter(school=self.school_a, surviving_student=s1).exists())

    def test_enrollment_withdrawal_preserves_history(self):
        """
        Test 7: Withdrawing an enrollment changes status to WITHDRAWN and records reason,
        preserving historical enrollment record.
        """
        student = StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Kojo', 'last_name': 'Frimpong'},
            primary_contact_data={'name': 'Nana Frimpong', 'relationship': 'FATHER', 'phone_primary': '+233241122334'},
            class_group=self.class_4a,
            academic_year=self.academic_year_a,
            actor=self.admin_user
        )
        enrollment = student.enrollments.first()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        payload = {
            'reason': 'Family relocating to Kumasi.',
            'end_date': str(date.today())
        }
        res = self.client.post(f'/api/v1/schools/{self.school_a.id}/enrollments/{enrollment.id}/withdraw/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        enrollment.refresh_from_db()
        student.refresh_from_db()
        self.assertEqual(enrollment.status, 'WITHDRAWN')
        self.assertEqual(enrollment.withdrawal_reason, 'Family relocating to Kumasi.')
        self.assertEqual(student.status, 'WITHDRAWN')

    def test_class_group_and_parent_class_aggregate_totals(self):
        """
        Test 8: Class 4A (2 students) + Class 4B (1 student) = Class 4 total (3 students).
        """
        for i in range(2):
            StudentService.register_student(
                school=self.school_a,
                student_data={'first_name': f'Student4A_{i}', 'last_name': 'Test'},
                primary_contact_data={'name': 'Parent', 'relationship': 'GUARDIAN', 'phone_primary': f'+23324000000{i}'},
                class_group=self.class_4a,
                academic_year=self.academic_year_a,
                actor=self.admin_user
            )

        StudentService.register_student(
            school=self.school_a,
            student_data={'first_name': 'Student4B_1', 'last_name': 'Test'},
            primary_contact_data={'name': 'Parent', 'relationship': 'GUARDIAN', 'phone_primary': '+233240000099'},
            class_group=self.class_4b,
            academic_year=self.academic_year_a,
            actor=self.admin_user
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        res = self.client.get(f'/api/v1/schools/{self.school_a.id}/students/reports/class-summary/?academic_year_id={self.academic_year_a.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data['data']

        lvl_4 = next(l for l in data['class_levels'] if l['id'] == str(self.class_4_level.id))
        self.assertEqual(lvl_4['total_active_students'], 3)
        stream_a = next(s for s in lvl_4['streams'] if s['id'] == str(self.class_4a.id))
        stream_b = next(s for s in lvl_4['streams'] if s['id'] == str(self.class_4b.id))
        self.assertEqual(stream_a['active_students'], 2)
        self.assertEqual(stream_b['active_students'], 1)

    def test_tenant_isolation_enforced(self):
        """
        Test 9: Attempting to access or enroll students across school boundaries is rejected.
        """
        s_b = StudentService.register_student(
            school=self.school_b,
            student_data={'first_name': 'SchoolB_Student', 'last_name': 'Kumasi'},
            primary_contact_data={'name': 'Parent B', 'relationship': 'GUARDIAN', 'phone_primary': '+233209999999'},
            actor=self.admin_user
        )

        # Admin of School A tries to fetch School B student via School A endpoint
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        res = self.client.get(f'/api/v1/schools/{self.school_a.id}/students/{s_b.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_csv_bulk_import_preview_and_confirm(self):
        """
        Test 10: CSV import wizard stages preview, detects valid rows, and atomically executes.
        """
        csv_content = (
            "first_name,last_name,class_group,primary_contact_name,primary_contact_relationship,primary_contact_phone\n"
            "Kojo,Antwi,Basic 4A,Maame Antwi,Mother,+233247778899\n"
            "Akua,Donkor,Basic 4B,Papa Donkor,Father,+233241112244\n"
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}', HTTP_X_ACTIVE_ROLE='ADMINISTRATOR')
        preview_res = self.client.post(
            f'/api/v1/schools/{self.school_a.id}/students/import-preview/',
            {'csv_text': csv_content, 'academic_year_id': str(self.academic_year_a.id)},
            format='json'
        )
        self.assertEqual(preview_res.status_code, status.HTTP_200_OK)
        batch_id = preview_res.data['data']['batch_id']
        self.assertEqual(preview_res.data['data']['valid_rows'], 2)

        confirm_res = self.client.post(
            f'/api/v1/schools/{self.school_a.id}/students/import-batches/{batch_id}/confirm/',
            format='json'
        )
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_res.data['data']['created_students_count'], 2)
        self.assertTrue(Student.objects.filter(school=self.school_a, first_name='Kojo', last_name='Antwi').exists())
