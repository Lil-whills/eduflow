from rest_framework import serializers
from tenants.models import SchoolMembership, RoleAssignment, Role
from authentication.models import User
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


class SchoolProfileSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source='school.name', read_only=True)
    school_slug = serializers.CharField(source='school.slug', read_only=True)

    class Meta:
        model = SchoolProfile
        fields = [
            'id',
            'school',
            'school_name',
            'school_slug',
            'display_name',
            'motto',
            'logo_url',
            'school_type',
            'address',
            'gps_address',
            'region',
            'district',
            'contact_email',
            'contact_phone',
            'website',
            'registration_number',
            'default_class_capacity',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'school', 'school_name', 'school_slug', 'created_at', 'updated_at']


class AcademicTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicTerm
        fields = [
            'id',
            'academic_year',
            'term_number',
            'name',
            'start_date',
            'end_date',
            'status',
            'created_at'
        ]
        read_only_fields = ['id', 'academic_year', 'created_at']


class AcademicYearSerializer(serializers.ModelSerializer):
    terms = AcademicTermSerializer(many=True, read_only=True)

    class Meta:
        model = AcademicYear
        fields = [
            'id',
            'school',
            'name',
            'start_date',
            'end_date',
            'status',
            'terms',
            'created_at'
        ]
        read_only_fields = ['id', 'school', 'status', 'terms', 'created_at']


class ClassGroupSerializer(serializers.ModelSerializer):
    class_level_name = serializers.CharField(source='class_level.name', read_only=True)
    stage = serializers.CharField(source='class_level.stage', read_only=True)
    display_name = serializers.CharField(read_only=True)
    capacity = serializers.SerializerMethodField()

    def get_capacity(self, obj):
        if obj.capacity is not None:
            return obj.capacity
        if hasattr(obj.school, 'profile') and obj.school.profile.default_class_capacity:
            return obj.school.profile.default_class_capacity
        return 35

    class Meta:
        model = ClassGroup
        fields = [
            'id',
            'school',
            'class_level',
            'class_level_name',
            'stage',
            'stream_name',
            'display_name',
            'capacity',
            'status',
            'created_at'
        ]
        read_only_fields = ['id', 'school', 'display_name', 'created_at']


class ClassLevelSerializer(serializers.ModelSerializer):
    groups = ClassGroupSerializer(many=True, read_only=True)

    class Meta:
        model = ClassLevel
        fields = [
            'id',
            'school',
            'name',
            'stage',
            'order_index',
            'status',
            'groups',
            'created_at'
        ]
        read_only_fields = ['id', 'school', 'groups', 'created_at']


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = [
            'id',
            'school',
            'name',
            'code',
            'category',
            'description',
            'status',
            'created_at'
        ]
        read_only_fields = ['id', 'school', 'created_at']


class ClassSubjectSerializer(serializers.ModelSerializer):
    class_level_name = serializers.CharField(source='class_level.name', read_only=True)
    class_group_name = serializers.CharField(source='class_group.display_name', read_only=True, default='')
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_category = serializers.CharField(source='subject.category', read_only=True)

    class Meta:
        model = ClassSubject
        fields = [
            'id',
            'school',
            'class_level',
            'class_level_name',
            'class_group',
            'class_group_name',
            'subject',
            'subject_name',
            'subject_code',
            'subject_category',
            'is_compulsory',
            'created_at'
        ]
        read_only_fields = ['id', 'school', 'created_at']


class StaffProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            'id',
            'staff_id_number',
            'qualification',
            'date_employed',
            'emergency_contact_name',
            'emergency_contact_phone',
        ]
        read_only_fields = ['id']


class SchoolStaffMemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    full_name = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    staff_profile = StaffProfileSerializer(read_only=True)

    class Meta:
        model = SchoolMembership
        fields = [
            'id',
            'user_id',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'status',
            'roles',
            'staff_profile',
            'created_at'
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name if name else obj.user.email

    def get_roles(self, obj):
        return list(
            RoleAssignment.objects.filter(membership=obj, is_active=True).values_list('role__name', flat=True)
        )


class ClassTeacherAssignmentSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    class_group_name = serializers.CharField(source='class_group.display_name', read_only=True)
    teacher_email = serializers.EmailField(source='teacher_membership.user.email', read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = ClassTeacherAssignment
        fields = [
            'id',
            'school',
            'academic_year',
            'academic_year_name',
            'class_group',
            'class_group_name',
            'teacher_membership',
            'teacher_email',
            'teacher_name',
            'is_primary',
            'status',
            'assigned_at',
            'ended_at'
        ]
        read_only_fields = ['id', 'school', 'status', 'assigned_at', 'ended_at']

    def get_teacher_name(self, obj):
        u = obj.teacher_membership.user
        full = f"{u.first_name} {u.last_name}".strip()
        return full if full else u.email


class SubjectTeacherAssignmentSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)
    class_group_name = serializers.CharField(source='class_group.display_name', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    teacher_email = serializers.EmailField(source='teacher_membership.user.email', read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = SubjectTeacherAssignment
        fields = [
            'id',
            'school',
            'academic_year',
            'academic_year_name',
            'class_group',
            'class_group_name',
            'subject',
            'subject_name',
            'teacher_membership',
            'teacher_email',
            'teacher_name',
            'status',
            'assigned_at',
            'ended_at'
        ]
        read_only_fields = ['id', 'school', 'status', 'assigned_at', 'ended_at']

    def get_teacher_name(self, obj):
        u = obj.teacher_membership.user
        full = f"{u.first_name} {u.last_name}".strip()
        return full if full else u.email


# Input/Action Request Serializers
class StaffDismissalSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class AdminReassignSerializer(serializers.Serializer):
    new_admin_email = serializers.EmailField(required=True)


class AcademicYearCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=50)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class AcademicTermCreateSerializer(serializers.Serializer):
    term_number = serializers.IntegerField(min_value=1, max_value=6)
    name = serializers.CharField(max_length=50)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class ClassTeacherAssignRequestSerializer(serializers.Serializer):
    academic_year_id = serializers.UUIDField()
    class_group_id = serializers.UUIDField()
    teacher_membership_id = serializers.UUIDField()
    is_primary = serializers.BooleanField(default=True)


class SubjectTeacherAssignRequestSerializer(serializers.Serializer):
    academic_year_id = serializers.UUIDField()
    class_group_id = serializers.UUIDField()
    subject_id = serializers.UUIDField()
    teacher_membership_id = serializers.UUIDField()

