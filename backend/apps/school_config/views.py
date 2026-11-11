import uuid
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError, PermissionDenied
from django.shortcuts import get_object_or_404
from django.utils import timezone

from django.db import transaction
from tenants.models import School, SchoolMembership, Role, RoleAssignment
from school_config.models import (
    SchoolProfile,
    AcademicYear,
    AcademicTerm,
    ClassLevel,
    ClassGroup,
    Subject,
    ClassSubject,
    StaffProfile,
    ClassTeacherAssignment,
    SubjectTeacherAssignment
)
from school_config.serializers import (
    SchoolProfileSerializer,
    AcademicYearSerializer,
    AcademicTermSerializer,
    ClassLevelSerializer,
    ClassGroupSerializer,
    SubjectSerializer,
    ClassSubjectSerializer,
    SchoolStaffMemberSerializer,
    ClassTeacherAssignmentSerializer,
    SubjectTeacherAssignmentSerializer,
    StaffDismissalSerializer,
    AdminReassignSerializer,
    AcademicYearCreateSerializer,
    AcademicTermCreateSerializer,
    ClassTeacherAssignRequestSerializer,
    SubjectTeacherAssignRequestSerializer
)
from school_config.services import (
    SchoolConfigBootstrapService,
    AcademicCalendarService,
    StaffGovernanceService,
    TeachingAssignmentService
)
from school_config.permissions import (
    IsSchoolMemberOrPlatformOperator,
    IsSchoolAdminOrProprietor,
    IsSchoolProprietorOnly
)


def get_school_or_404(school_id):
    return get_object_or_404(School, id=school_id)


# ----------------------------------------------------------------------
# 1. School Profile
# ----------------------------------------------------------------------

class SchoolProfileView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        profile, created = SchoolProfile.objects.get_or_create(
            school=school,
            defaults={
                'display_name': school.name,
                'school_type': 'BASIC_COMPLETE',
                'motto': 'Excellence in Education'
            }
        )
        serializer = SchoolProfileSerializer(profile)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def patch(self, request, school_id):
        school = get_school_or_404(school_id)
        profile, _ = SchoolProfile.objects.get_or_create(
            school=school,
            defaults={'display_name': school.name}
        )
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid profile data.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response({'success': True, 'data': serializer.data, 'error': None})


# ----------------------------------------------------------------------
# 2. Academic Calendar (Years & Terms)
# ----------------------------------------------------------------------

class AcademicYearListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        years = AcademicYear.objects.filter(school=school).prefetch_related('terms')
        serializer = AcademicYearSerializer(years, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = AcademicYearCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid academic year payload.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            year = AcademicCalendarService.create_academic_year(
                school=school,
                name=serializer.validated_data['name'],
                start_date=serializer.validated_data['start_date'],
                end_date=serializer.validated_data['end_date']
            )
            return Response({
                'success': True,
                'data': AcademicYearSerializer(year).data,
                'error': None
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e), 'details': e.message_dict if hasattr(e, 'message_dict') else str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


class AcademicYearActivateView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        try:
            year = AcademicCalendarService.activate_academic_year(
                school=school,
                academic_year_id=year_id,
                actor=request.user
            )
            return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})
        except AcademicYear.DoesNotExist:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': 'Academic year not found.'}
            }, status=status.HTTP_404_NOT_FOUND)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e), 'details': e.message_dict if hasattr(e, 'message_dict') else str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


class AcademicYearCompleteView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        try:
            year = AcademicCalendarService.complete_academic_year(
                school=school,
                academic_year_id=year_id,
                actor=request.user
            )
            return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})
        except AcademicYear.DoesNotExist:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': 'Academic year not found.'}
            }, status=status.HTTP_404_NOT_FOUND)


class AcademicTermCreateView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        serializer = AcademicTermCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid term payload.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            term = AcademicCalendarService.create_term(
                academic_year=year,
                term_number=serializer.validated_data['term_number'],
                name=serializer.validated_data['name'],
                start_date=serializer.validated_data['start_date'],
                end_date=serializer.validated_data['end_date']
            )
            return Response({
                'success': True,
                'data': AcademicTermSerializer(term).data,
                'error': None
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e), 'details': e.message_dict if hasattr(e, 'message_dict') else str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


# ----------------------------------------------------------------------
# 3. Classes and Streams
# ----------------------------------------------------------------------

class ClassLevelListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        levels = ClassLevel.objects.filter(school=school).prefetch_related('groups')
        serializer = ClassLevelSerializer(levels, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        name = request.data.get('name', '').strip()
        stage = request.data.get('stage', 'LOWER_PRIMARY')
        order_index = request.data.get('order_index', 10)

        if not name:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Class level name is required.'}
            }, status=status.HTTP_400_BAD_REQUEST)

        if ClassLevel.objects.filter(school=school, name=name).exists():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'DUPLICATE_ERROR', 'message': f"Class level '{name}' already exists."}
            }, status=status.HTTP_400_BAD_REQUEST)

        level = ClassLevel.objects.create(
            school=school,
            name=name,
            stage=stage,
            order_index=order_index,
            status='ACTIVE'
        )
        # Automatically create base unstreamed class group
        ClassGroup.objects.create(
            school=school,
            class_level=level,
            stream_name='',
            status='ACTIVE'
        )

        return Response({
            'success': True,
            'data': ClassLevelSerializer(level).data,
            'error': None
        }, status=status.HTTP_201_CREATED)


class ClassGroupListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        groups = ClassGroup.objects.filter(school=school).select_related('class_level')
        serializer = ClassGroupSerializer(groups, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        class_level_id = request.data.get('class_level_id')
        stream_name = request.data.get('stream_name', '').strip()

        if not class_level_id:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'class_level_id is required.'}
            }, status=status.HTTP_400_BAD_REQUEST)

        level = get_object_or_404(ClassLevel, id=class_level_id, school=school)

        if ClassGroup.objects.filter(school=school, class_level=level, stream_name=stream_name).exists():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'DUPLICATE_ERROR', 'message': f"Class group '{level.name} {stream_name}' already exists."}
            }, status=status.HTTP_400_BAD_REQUEST)

        group = ClassGroup.objects.create(
            school=school,
            class_level=level,
            stream_name=stream_name,
            status='ACTIVE'
        )

        return Response({
            'success': True,
            'data': ClassGroupSerializer(group).data,
            'error': None
        }, status=status.HTTP_201_CREATED)


# ----------------------------------------------------------------------
# 4. Subjects and Class-Subject Mapping
# ----------------------------------------------------------------------

class SubjectListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        subjects = Subject.objects.filter(school=school)
        serializer = SubjectSerializer(subjects, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        name = request.data.get('name', '').strip()
        code = request.data.get('code', '').strip()
        category = request.data.get('category', 'CORE')
        description = request.data.get('description', '').strip()

        if not name:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Subject name is required.'}
            }, status=status.HTTP_400_BAD_REQUEST)

        if Subject.objects.filter(school=school, name=name).exists():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'DUPLICATE_ERROR', 'message': f"Subject '{name}' already exists."}
            }, status=status.HTTP_400_BAD_REQUEST)

        subject = Subject.objects.create(
            school=school,
            name=name,
            code=code,
            category=category,
            description=description,
            status='ACTIVE'
        )

        return Response({
            'success': True,
            'data': SubjectSerializer(subject).data,
            'error': None
        }, status=status.HTTP_201_CREATED)


class ClassSubjectListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        qs = ClassSubject.objects.filter(school=school).select_related('class_level', 'class_group', 'subject')
        
        level_id = request.query_params.get('class_level_id')
        if level_id:
            qs = qs.filter(class_level_id=level_id)
            
        group_id = request.query_params.get('class_group_id')
        if group_id:
            qs = qs.filter(class_group_id=group_id)

        serializer = ClassSubjectSerializer(qs, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        class_level_id = request.data.get('class_level_id')
        class_group_id = request.data.get('class_group_id')
        subject_id = request.data.get('subject_id')
        is_compulsory = request.data.get('is_compulsory', True)

        if not class_level_id or not subject_id:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'class_level_id and subject_id are required.'}
            }, status=status.HTTP_400_BAD_REQUEST)

        level = get_object_or_404(ClassLevel, id=class_level_id, school=school)
        subject = get_object_or_404(Subject, id=subject_id, school=school)
        group = None
        if class_group_id:
            group = get_object_or_404(ClassGroup, id=class_group_id, school=school)

        mapping, created = ClassSubject.objects.get_or_create(
            school=school,
            class_level=level,
            class_group=group,
            subject=subject,
            defaults={'is_compulsory': is_compulsory}
        )

        return Response({
            'success': True,
            'data': ClassSubjectSerializer(mapping).data,
            'error': None
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ClassSubjectDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def delete(self, request, school_id, mapping_id):
        school = get_school_or_404(school_id)
        mapping = get_object_or_404(ClassSubject, id=mapping_id, school=school)
        mapping.delete()
        return Response({'success': True, 'data': {'message': 'Mapping removed.'}, 'error': None})


# ----------------------------------------------------------------------
# 5. Staff Governance, Dismissal, and Admin Reassignment
# ----------------------------------------------------------------------

class SchoolStaffListView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        memberships = SchoolMembership.objects.filter(
            school=school
        ).select_related('user').prefetch_related('role_assignments__role', 'staff_profile')
        serializer = SchoolStaffMemberSerializer(memberships, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})


class StaffDismissView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, membership_id):
        school = get_school_or_404(school_id)
        serializer = StaffDismissalSerializer(data=request.data)
        serializer.is_valid()
        reason = serializer.validated_data.get('reason', '')

        try:
            membership = StaffGovernanceService.dismiss_staff_member(
                school=school,
                membership_id=membership_id,
                actor=request.user,
                reason=reason
            )
            return Response({
                'success': True,
                'data': {
                    'membership_id': str(membership.id),
                    'status': membership.status,
                    'message': f"Staff member {membership.user.email} has been dismissed. All active sessions terminated immediately."
                },
                'error': None
            })
        except SchoolMembership.DoesNotExist:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'NOT_FOUND', 'message': 'Staff membership not found.'}
            }, status=status.HTTP_404_NOT_FOUND)
        except (PermissionDenied, ValidationError) as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'PERMISSION_DENIED', 'message': str(e)}
            }, status=status.HTTP_403_FORBIDDEN)


class ProprietorAdminReassignView(APIView):
    permission_classes = [IsSchoolProprietorOnly]

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = AdminReassignSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid administrator email.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_admin_email = serializer.validated_data['new_admin_email']
            membership, raw_token = StaffGovernanceService.reassign_administrator(
                school=school,
                new_admin_email=new_admin_email,
                actor=request.user
            )
            response_data = {
                'membership_id': str(membership.id),
                'email': membership.user.email,
                'message': f"Administrator role successfully assigned to {membership.user.email}."
            }
            if raw_token:
                response_data['dev_invitation_token'] = raw_token
                response_data['invitation_url'] = f"/accept-invitation?token={raw_token}"

            return Response({
                'success': True,
                'data': response_data,
                'error': None
            })
        except (PermissionDenied, ValidationError) as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'FORBIDDEN', 'message': str(e)}
            }, status=status.HTTP_403_FORBIDDEN)


# ----------------------------------------------------------------------
# 6. Teaching Assignments
# ----------------------------------------------------------------------

class ClassTeacherAssignmentView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        qs = ClassTeacherAssignment.objects.filter(school=school).select_related(
            'academic_year', 'class_group__class_level', 'teacher_membership__user'
        )
        year_id = request.query_params.get('academic_year_id')
        if year_id:
            qs = qs.filter(academic_year_id=year_id)

        group_id = request.query_params.get('class_group_id')
        if group_id:
            qs = qs.filter(class_group_id=group_id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        serializer = ClassTeacherAssignmentSerializer(qs, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = ClassTeacherAssignRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid assignment payload.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        year = get_object_or_404(AcademicYear, id=data['academic_year_id'], school=school)
        group = get_object_or_404(ClassGroup, id=data['class_group_id'], school=school)
        teacher_mem = get_object_or_404(SchoolMembership, id=data['teacher_membership_id'], school=school)

        try:
            assignment = TeachingAssignmentService.assign_class_teacher(
                school=school,
                academic_year=year,
                class_group=group,
                teacher_membership=teacher_mem,
                is_primary=data['is_primary'],
                actor=request.user
            )
            return Response({
                'success': True,
                'data': ClassTeacherAssignmentSerializer(assignment).data,
                'error': None
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e), 'details': e.message_dict if hasattr(e, 'message_dict') else str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


class ClassTeacherAssignmentEndView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, assignment_id):
        school = get_school_or_404(school_id)
        assignment = get_object_or_404(ClassTeacherAssignment, id=assignment_id, school=school)
        assignment.status = 'ENDED'
        assignment.ended_at = timezone.now()
        assignment.save(update_fields=['status', 'ended_at'])
        return Response({'success': True, 'data': ClassTeacherAssignmentSerializer(assignment).data, 'error': None})


class SubjectTeacherAssignmentView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsSchoolMemberOrPlatformOperator()]
        return [IsSchoolAdminOrProprietor()]

    def get(self, request, school_id):
        school = get_school_or_404(school_id)
        qs = SubjectTeacherAssignment.objects.filter(school=school).select_related(
            'academic_year', 'class_group__class_level', 'subject', 'teacher_membership__user'
        )
        year_id = request.query_params.get('academic_year_id')
        if year_id:
            qs = qs.filter(academic_year_id=year_id)

        group_id = request.query_params.get('class_group_id')
        if group_id:
            qs = qs.filter(class_group_id=group_id)

        subject_id = request.query_params.get('subject_id')
        if subject_id:
            qs = qs.filter(subject_id=subject_id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        serializer = SubjectTeacherAssignmentSerializer(qs, many=True)
        return Response({'success': True, 'data': serializer.data, 'error': None})

    def post(self, request, school_id):
        school = get_school_or_404(school_id)
        serializer = SubjectTeacherAssignRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Invalid assignment payload.', 'details': serializer.errors}
            }, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        year = get_object_or_404(AcademicYear, id=data['academic_year_id'], school=school)
        group = get_object_or_404(ClassGroup, id=data['class_group_id'], school=school)
        subject = get_object_or_404(Subject, id=data['subject_id'], school=school)
        teacher_mem = get_object_or_404(SchoolMembership, id=data['teacher_membership_id'], school=school)

        try:
            assignment = TeachingAssignmentService.assign_subject_teacher(
                school=school,
                academic_year=year,
                class_group=group,
                subject=subject,
                teacher_membership=teacher_mem,
                actor=request.user
            )
            return Response({
                'success': True,
                'data': SubjectTeacherAssignmentSerializer(assignment).data,
                'error': None
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': str(e), 'details': e.message_dict if hasattr(e, 'message_dict') else str(e)}
            }, status=status.HTTP_400_BAD_REQUEST)


class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


class SubjectTeacherAssignmentEndView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, assignment_id):
        school = get_school_or_404(school_id)
        assignment = get_object_or_404(SubjectTeacherAssignment, id=assignment_id, school=school)
        assignment.status = 'ENDED'
        assignment.ended_at = timezone.now()
        assignment.save(update_fields=['status', 'ended_at'])
        return Response({'success': True, 'data': SubjectTeacherAssignmentSerializer(assignment).data, 'error': None})



class AcademicYearDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if name:
            year.name = name.strip()
        if start_date:
            year.start_date = start_date
        if end_date:
            year.end_date = end_date
        year.save()
        return Response({'success': True, 'data': AcademicYearSerializer(year).data, 'error': None})

    def delete(self, request, school_id, year_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        year_name = year.name
        year.delete()
        return Response({
            'success': True,
            'data': {'message': f"Academic year '{year_name}' deleted successfully."},
            'error': None
        })


class AcademicTermDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)

        name = request.data.get('name')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        status_val = request.data.get('status')
        term_number = request.data.get('term_number')

        if name:
            term.name = name.strip()
        if start_date:
            term.start_date = start_date
        if end_date:
            term.end_date = end_date
        if term_number is not None:
            term.term_number = int(term_number)
        if status_val in ['DRAFT', 'ACTIVE', 'COMPLETED']:
            term.status = status_val

        term.save()
        return Response({'success': True, 'data': AcademicTermSerializer(term).data, 'error': None})

    def delete(self, request, school_id, year_id, term_id):
        school = get_school_or_404(school_id)
        year = get_object_or_404(AcademicYear, id=year_id, school=school)
        term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year)
        term_name = term.name
        term.delete()
        return Response({
            'success': True,
            'data': {'message': f"Term '{term_name}' deleted successfully."},
            'error': None
        })


class ClassLevelDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, level_id):
        school = get_school_or_404(school_id)
        level = get_object_or_404(ClassLevel, id=level_id, school=school)

        name = request.data.get('name')
        stage = request.data.get('stage')
        order_index = request.data.get('order_index')

        if name:
            level.name = name.strip()
        if stage:
            level.stage = stage
        if order_index is not None:
            level.order_index = int(order_index)
        level.save()
        return Response({'success': True, 'data': ClassLevelSerializer(level).data, 'error': None})

    def delete(self, request, school_id, level_id):
        school = get_school_or_404(school_id)
        level = get_object_or_404(ClassLevel, id=level_id, school=school)
        level_name = level.name
        level.delete()
        return Response({
            'success': True,
            'data': {'message': f"Class level '{level_name}' and its streams deleted successfully."},
            'error': None
        })


class ClassGroupDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, group_id):
        school = get_school_or_404(school_id)
        group = get_object_or_404(ClassGroup, id=group_id, school=school)

        if 'stream_name' in request.data:
            group.stream_name = request.data.get('stream_name', '').strip()
        if 'capacity' in request.data:
            cap = request.data.get('capacity')
            group.capacity = int(cap) if cap else None
        if 'status' in request.data:
            group.status = request.data.get('status')

        group.save()
        return Response({'success': True, 'data': ClassGroupSerializer(group).data, 'error': None})

    def delete(self, request, school_id, group_id):
        school = get_school_or_404(school_id)
        group = get_object_or_404(ClassGroup, id=group_id, school=school)
        group_name = group.display_name
        group.delete()
        return Response({
            'success': True,
            'data': {'message': f"Class stream '{group_name}' removed successfully."},
            'error': None
        })


class SubjectDetailView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def patch(self, request, school_id, subject_id):
        school = get_school_or_404(school_id)
        subject = get_object_or_404(Subject, id=subject_id, school=school)

        name = request.data.get('name')
        code = request.data.get('code')
        category = request.data.get('category')
        description = request.data.get('description')

        if name:
            subject.name = name.strip()
        if code is not None:
            subject.code = code.strip()
        if category:
            subject.category = category
        if description is not None:
            subject.description = description.strip()

        subject.save()
        return Response({'success': True, 'data': SubjectSerializer(subject).data, 'error': None})

    def delete(self, request, school_id, subject_id):
        school = get_school_or_404(school_id)
        subject = get_object_or_404(Subject, id=subject_id, school=school)
        subject_name = subject.name
        subject.delete()
        return Response({
            'success': True,
            'data': {'message': f"Subject '{subject_name}' deleted successfully."},
            'error': None
        })


class SchoolMemberRolesUpdateView(APIView):
    permission_classes = [IsSchoolAdminOrProprietor]

    def post(self, request, school_id, membership_id):
        school = get_school_or_404(school_id)
        membership = get_object_or_404(SchoolMembership, id=membership_id, school=school)
        roles = request.data.get('roles', [])

        if not isinstance(roles, list):
            return Response({
                'success': False,
                'data': None,
                'error': {'code': 'VALIDATION_ERROR', 'message': 'Roles must be a list of role names.'}
            }, status=status.HTTP_400_BAD_REQUEST)

        # Base role: SUBJECT_TEACHER is always granted to staff members
        if Role.SUBJECT_TEACHER not in roles:
            roles.append(Role.SUBJECT_TEACHER)

        with transaction.atomic():
            for role_name in [Role.SUBJECT_TEACHER, Role.CLASS_TEACHER, Role.ACCOUNTANT]:
                role_obj, _ = Role.objects.get_or_create(name=role_name)
                ra, _ = RoleAssignment.objects.get_or_create(membership=membership, role=role_obj)
                ra.is_active = (role_name in roles)
                ra.save()

        active_roles = list(
            RoleAssignment.objects.filter(membership=membership, is_active=True).values_list('role__name', flat=True)
        )
        return Response({
            'success': True,
            'data': {
                'membership_id': str(membership.id),
                'email': membership.user.email,
                'assigned_roles': active_roles,
                'message': f"Roles updated for {membership.user.email}."
            },
            'error': None
        })
