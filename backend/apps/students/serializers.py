from rest_framework import serializers
from .models import (
    Student,
    StudentContact,
    StudentEnrollment,
    DuplicateReview,
    StudentMergeRecord,
    StudentImportBatch
)
from school_config.models import AcademicYear, ClassGroup


class StudentContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentContact
        fields = [
            'id',
            'name',
            'relationship',
            'phone_primary',
            'phone_secondary',
            'email',
            'is_primary',
            'is_emergency',
            'notes',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    class_group_name = serializers.CharField(source='class_group.display_name', read_only=True)
    class_level_name = serializers.CharField(source='class_group.class_level.name', read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = [
            'id',
            'academic_year',
            'academic_year_name',
            'class_group',
            'class_group_name',
            'class_level_name',
            'start_date',
            'end_date',
            'status',
            'withdrawal_reason',
            'created_at'
        ]
        read_only_fields = ['id', 'academic_year_name', 'class_group_name', 'class_level_name', 'created_at']


class StudentListSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    current_enrollment = serializers.SerializerMethodField()
    primary_contact = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id',
            'admission_number',
            'index_number',
            'first_name',
            'middle_name',
            'last_name',
            'full_name',
            'preferred_name',
            'date_of_birth',
            'gender',
            'admission_date',
            'status',
            'current_enrollment',
            'primary_contact',
            'created_at'
        ]
        read_only_fields = fields

    def get_current_enrollment(self, obj):
        active_enrollment = obj.enrollments.filter(status='ACTIVE').first()
        if not active_enrollment:
            return None
        return {
            'id': str(active_enrollment.id),
            'academic_year_id': str(active_enrollment.academic_year_id),
            'academic_year_name': active_enrollment.academic_year.name,
            'class_group_id': str(active_enrollment.class_group_id),
            'class_group_name': active_enrollment.class_group.display_name,
            'class_level_id': str(active_enrollment.class_group.class_level_id),
            'class_level_name': active_enrollment.class_group.class_level.name,
            'status': active_enrollment.status
        }

    def get_primary_contact(self, obj):
        contact = obj.contacts.filter(is_primary=True).first()
        if not contact:
            return None
        return {
            'name': contact.name,
            'relationship': contact.relationship,
            'phone_primary': contact.phone_primary,
            'email': contact.email
        }


class StudentDetailSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    contacts = StudentContactSerializer(many=True, read_only=True)
    enrollments = StudentEnrollmentSerializer(many=True, read_only=True)

    class Meta:
        model = Student
        fields = [
            'id',
            'admission_number',
            'index_number',
            'first_name',
            'middle_name',
            'last_name',
            'full_name',
            'preferred_name',
            'date_of_birth',
            'gender',
            'admission_date',
            'status',
            'merged_into_id',
            'contacts',
            'enrollments',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'admission_number', 'merged_into_id', 'created_at', 'updated_at']


class PrimaryContactInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    relationship = serializers.ChoiceField(
        choices=StudentContact.RELATIONSHIP_CHOICES,
        default='GUARDIAN'
    )
    phone_primary = serializers.CharField(max_length=50)
    phone_secondary = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class StudentRegistrationSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100)
    middle_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    last_name = serializers.CharField(max_length=100)
    preferred_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    index_number = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    gender = serializers.ChoiceField(choices=Student.GENDER_CHOICES, required=False, allow_null=True, default=None)
    admission_date = serializers.DateField(required=False, default=None)

    # Mandatory primary guardian
    primary_contact = PrimaryContactInputSerializer(required=True)

    # Immediate class placement
    class_group_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    academic_year_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    force_create = serializers.BooleanField(required=False, default=False)


class StudentMergeSerializer(serializers.Serializer):
    surviving_student_id = serializers.UUIDField()
    merged_student_id = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class DuplicateReviewDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['RESOLVED_KEPT_BOTH', 'DISMISSED'])
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class StudentEnrollmentWithdrawSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)
    end_date = serializers.DateField(required=False, default=None)


class DuplicateReviewSerializer(serializers.ModelSerializer):
    student_a_name = serializers.CharField(source='student_a.full_name', read_only=True)
    student_a_adm = serializers.CharField(source='student_a.admission_number', read_only=True)
    student_b_name = serializers.CharField(source='student_b.full_name', read_only=True)
    student_b_adm = serializers.CharField(source='student_b.admission_number', read_only=True)

    class Meta:
        model = DuplicateReview
        fields = [
            'id',
            'student_a',
            'student_a_name',
            'student_a_adm',
            'student_b',
            'student_b_name',
            'student_b_adm',
            'match_reason',
            'match_score',
            'status',
            'decision_notes',
            'reviewed_at',
            'created_at'
        ]
        read_only_fields = fields

