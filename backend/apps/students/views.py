import csv
import io
from django.db import models
from django.db.models import Q
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.exceptions import ValidationError, PermissionDenied
from rest_framework.exceptions import NotFound
from django.http import HttpResponse

from tenants.models import School, SchoolMembership, RoleAssignment, Role
from school_config.models import AcademicYear, ClassGroup, ClassTeacherAssignment, SubjectTeacherAssignment
from school_config.permissions import (
    get_active_school_membership,
    IsSchoolMemberOrPlatformOperator,
    IsSchoolAdminOrProprietor
)
from .models import (
    Student,
    StudentContact,
    StudentEnrollment,
    DuplicateReview,
    StudentMergeRecord,
    StudentImportBatch
)
from .serializers import (
    StudentListSerializer,
    StudentDetailSerializer,
    StudentRegistrationSerializer,
    StudentMergeSerializer,
    DuplicateReviewDecisionSerializer,
    DuplicateReviewSerializer,
    StudentEnrollmentWithdrawSerializer,
    StudentEnrollmentSerializer
)
from .services import (
    StudentService,
    DuplicateDetectionService,
    DuplicateStudentWarning,
    StudentReportingService,
    StudentImportService
)


def get_school_or_404(school_id):
    school = School.objects.filter(id=school_id).first()
    if not school:
        raise NotFound("School tenant not found.")
    return school


class StudentListCreateView(APIView):
    """
    GET: List & search students with pagination, class filters, and role-based scope.
    POST: Register a student with mandatory primary guardian, immediate enrollment, and duplicate check.
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        membership = get_active_school_membership(request, school_id)
        active_role = request.headers.get('X-Active-Role')

        # Base queryset strictly isolated to school tenant
        qs = Student.objects.filter(school=school).exclude(status='MERGED').prefetch_related(
            'enrollments__class_group__class_level',
            'enrollments__academic_year',
            'contacts'
        )

        # Role-based scoping
        if active_role == Role.CLASS_TEACHER and membership:
            assigned_groups = ClassTeacherAssignment.objects.filter(
                teacher_membership=membership,
                status='ACTIVE'
            ).values_list('class_group_id', flat=True)
            qs = qs.filter(enrollments__class_group_id__in=assigned_groups, enrollments__status='ACTIVE')

        elif active_role == Role.SUBJECT_TEACHER and membership:
            assigned_groups = SubjectTeacherAssignment.objects.filter(
                teacher_membership=membership,
                status='ACTIVE'
            ).values_list('class_group_id', flat=True)
            qs = qs.filter(enrollments__class_group_id__in=assigned_groups, enrollments__status='ACTIVE')

        # Query Filters
        q = request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(
                models.Q(first_name__icontains=q) |
                models.Q(last_name__icontains=q) |
                models.Q(admission_number__icontains=q) |
                models.Q(index_number__icontains=q)
            )

        class_group_id = request.query_params.get('class_group_id')
        if class_group_id:
            qs = qs.filter(enrollments__class_group_id=class_group_id, enrollments__status='ACTIVE')

        class_level_id = request.query_params.get('class_level_id')
        if class_level_id:
            qs = qs.filter(enrollments__class_group__class_level_id=class_level_id, enrollments__status='ACTIVE')

        academic_year_id = request.query_params.get('academic_year_id')
        if academic_year_id:
            qs = qs.filter(enrollments__academic_year_id=academic_year_id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        qs = qs.distinct()

        # Simple pagination
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        total_count = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        students = qs[start:end]
        serializer = StudentListSerializer(students, many=True)
        return Response({
            'success': True,
            'data': {
                'total': total_count,
                'page': page,
                'page_size': page_size,
                'results': serializer.data
            },
            'error': None
        })

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = StudentRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        vd = serializer.validated_data
        primary_contact_data = vd['primary_contact']
        class_group = None
        academic_year = None

        if vd.get('class_group_id'):
            class_group = ClassGroup.objects.filter(school=school, id=vd['class_group_id']).first()
            if not class_group:
                return Response({
                    'success': False,
                    'data': None,
                    'error': {'code': 'NOT_FOUND', 'message': 'Class group not found in this school.'}
                }, status=status.HTTP_404_NOT_FOUND)

        if vd.get('academic_year_id'):
            academic_year = AcademicYear.objects.filter(school=school, id=vd['academic_year_id']).first()
        elif class_group:
            academic_year = AcademicYear.objects.filter(school=school, status='ACTIVE').first()

        try:
            student = StudentService.register_student(
                school=school,
                student_data=vd,
                primary_contact_data=primary_contact_data,
                class_group=class_group,
                academic_year=academic_year,
                actor=request.user,
                force_create=vd.get('force_create', False)
            )
            detail_serializer = StudentDetailSerializer(student)
            return Response({
                'success': True,
                'data': detail_serializer.data,
                'error': None
            }, status=status.HTTP_201_CREATED)

        except DuplicateStudentWarning as dw:
            return Response({
                'success': False,
                'data': {
                    'duplicate_matches': dw.duplicates,
                    'requires_confirmation': True
                },
                'error': {
                    'code': 'POSSIBLE_DUPLICATE_FOUND',
                    'message': str(dw)
                }
            }, status=status.HTTP_409_CONFLICT)

        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class StudentDetailView(APIView):
    """
    GET: Retrieve full student profile, emergency contacts, and complete enrollment history.
    PATCH: Update permitted student details.
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id, student_id):
        school = get_school_or_404(school_id)
        student = Student.objects.filter(school=school, id=student_id).prefetch_related(
            'contacts',
            'enrollments__class_group__class_level',
            'enrollments__academic_year'
        ).first()

        if not student:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': 'Student record not found.'}
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = StudentDetailSerializer(student)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def patch(self, request, school_id, student_id):
        school = get_school_or_404(school_id)
        try:
            student = StudentService.update_student(
                school=school,
                student_id=student_id,
                data=request.data,
                actor=request.user
            )
            serializer = StudentDetailSerializer(student)
            return Response({'success': True, 'data': serializer.data, 'error': None})
        except NotFound as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': str(e)}
            }, status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class StudentMergeView(APIView):
    """
    POST: Explicit Administrator-confirmed consolidation of two duplicate records.
    Preserves surviving student admission number and reassigns relationships safely.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = StudentMergeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        vd = serializer.validated_data
        try:
            survivor = StudentService.merge_students(
                school=school,
                surviving_student_id=vd['surviving_student_id'],
                merged_student_id=vd['merged_student_id'],
                actor=request.user,
                notes=vd.get('notes')
            )
            return Response({
                'success': True,
                'data': StudentDetailSerializer(survivor).data,
                'error': None
            })
        except (ValidationError, PermissionDenied) as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'MERGE_ERROR', 'message': str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)
        except NotFound as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': str(e)}
            }, status=status.HTTP_404_NOT_FOUND)


class DuplicateReviewListView(APIView):
    """
    GET: List pending duplicate review cases for school administrator review.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        reviews = DuplicateReview.objects.filter(school=school, status='PENDING').select_related(
            'student_a', 'student_b'
        ).order_by('-match_score', '-created_at')
        serializer = DuplicateReviewSerializer(reviews, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})


class DuplicateReviewResolveView(APIView):
    """
    POST: Administrator explicitly records 'RESOLVED_KEPT_BOTH' or 'DISMISSED'.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, review_id):
        school = get_school_or_404(school_id)
        serializer = DuplicateReviewDecisionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        review = DuplicateReview.objects.filter(school=school, id=review_id).first()
        if not review:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': 'Duplicate review not found.'}
            }, status=status.HTTP_404_NOT_FOUND)

        review.status = serializer.validated_data['decision']
        review.decision_notes = serializer.validated_data.get('notes', '')
        review.reviewed_by = request.user
        review.reviewed_at = timezone.now()
        review.save()

        return Response({
            'success': True,
            'data': DuplicateReviewSerializer(review).data,
            'error': None
        })


class StudentEnrollmentWithdrawView(APIView):
    """
    POST: Withdraw student enrollment through controlled operation with reason.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, enrollment_id):
        school = get_school_or_404(school_id)
        serializer = StudentEnrollmentWithdrawSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            enrollment = StudentService.withdraw_enrollment(
                school=school,
                enrollment_id=enrollment_id,
                reason=serializer.validated_data['reason'],
                end_date=serializer.validated_data.get('end_date'),
                actor=request.user
            )
            return Response({
                'success': True,
                'data': StudentEnrollmentSerializer(enrollment).data,
                'error': None
            })
        except NotFound as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': str(e)}
            }, status=status.HTTP_404_NOT_FOUND)


class StudentReportSummaryView(APIView):
    """
    GET: Class-group student counts and parent ClassLevel aggregated totals.
    Calculated strictly from active enrollments in the selected academic year.
    """
    permission_classes = [IsSchoolMemberOrPlatformOperator]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        academic_year_id = request.query_params.get('academic_year_id')
        summary = StudentReportingService.get_class_summary(school, academic_year_id=academic_year_id)
        return Response({'success': True, 'data': summary, 'error': None})


class StudentImportTemplateView(APIView):
    """
    GET: Download standard CSV template with required headers.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def get(self, request, school_id):
        csv_text = StudentImportService.generate_csv_template()
        response = HttpResponse(csv_text, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="scholora_students_template.csv"'
        return response


class StudentImportPreviewView(APIView):
    """
    POST: Upload CSV/Excel, validate column headers and row contents, detect duplicates, stage preview.
    """
    permission_classes = [IsSchoolAdminOrProprietor]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        file_obj = request.FILES.get('file')
        csv_text = request.data.get('csv_text')
        file_name = getattr(file_obj, 'name', 'manual_import.csv')

        if file_obj:
            try:
                content = file_obj.read().decode('utf-8-sig')
            except Exception as e:
                return Response({
                    'success': False,
                    'data': None,
                    'error': {'code': 'FILE_READ_ERROR', 'message': f"Failed to read file: {str(e)}"}
                }, status=status.HTTP_400_BAD_REQUEST)
        elif csv_text:
            content = csv_text
        else:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'MISSING_FILE', 'message': "Please provide a file or csv_text."}
            }, status=status.HTTP_400_BAD_REQUEST)

        academic_year_id = request.data.get('academic_year_id')
        try:
            batch = StudentImportService.preview_import_csv(
                school=school,
                file_content=content,
                file_name=file_name,
                academic_year_id=academic_year_id,
                actor=request.user
            )
            return Response({
                'success': True,
                'data': {
                    'batch_id': str(batch.id),
                    'file_name': batch.file_name,
                    'status': batch.status,
                    'total_rows': batch.total_rows,
                    'valid_rows': batch.valid_rows,
                    'invalid_rows': batch.invalid_rows,
                    'duplicate_rows': batch.duplicate_rows,
                    'preview_data': batch.preview_data
                },
                'error': None
            })
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class StudentImportConfirmView(APIView):
    """
    POST: Atomically commit staged import batch, generate admission numbers, enroll students.
    """
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, batch_id):
        school = get_school_or_404(school_id)
        try:
            result = StudentImportService.execute_import_batch(
                school=school,
                batch_id=batch_id,
                actor=request.user
            )
            return Response({'success': True, 'data': result, 'error': None})
        except (NotFound, ValidationError) as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'IMPORT_ERROR', 'message': str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)
