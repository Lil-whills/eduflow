import re
from rest_framework import serializers
from .models import (
    School,
    SchoolAccessRequest,
    EmailVerificationToken,
    ProvisioningRecord,
    InvitationToken,
    SchoolMembership,
    Role,
    RoleAssignment
)

GHANA_PHONE_REGEX = re.compile(r'^(?:\+233|233|0)[235][0-9]{8}$')


class SchoolAccessRequestCreateSerializer(serializers.Serializer):
    school_name = serializers.CharField(max_length=255, min_length=2)
    requester_name = serializers.CharField(max_length=255, min_length=2, required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=50)

    def validate_school_name(self, value):
        return value.strip()

    def validate_requester_name(self, value):
        return value.strip() if value else ''

    def validate_contact_email(self, value):
        return value.strip().lower() if value else ''

    def validate_contact_phone(self, value):
        cleaned = re.sub(r'[\s\-\(\)]', '', value)
        if not GHANA_PHONE_REGEX.match(cleaned):
            raise serializers.ValidationError(
                "Invalid Ghanaian phone number. Must be a valid 10-digit number (e.g. 024XXXXXXX) "
                "or international format (+23324XXXXXXX)."
            )
        return cleaned


class SchoolAccessRequestSerializer(serializers.ModelSerializer):
    school_id = serializers.SerializerMethodField()

    class Meta:
        model = SchoolAccessRequest
        fields = [
            'id',
            'school_name',
            'requester_name',
            'contact_email',
            'contact_phone',
            'status',
            'rejection_reason',
            'school_id',
            'created_at'
        ]
        read_only_fields = fields

    def get_school_id(self, obj):
        if hasattr(obj, 'provisioning_record') and obj.provisioning_record.school:
            return str(obj.provisioning_record.school.id)
        return None


class EmailVerificationSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=16, trim_whitespace=True)


class ResendVerificationSerializer(serializers.Serializer):
    contact_email = serializers.EmailField()

    def validate_contact_email(self, value):
        return value.strip().lower()


class RejectRequestSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(min_length=5, max_length=1000)

    def validate_rejection_reason(self, value):
        reason = value.strip()
        if not reason:
            raise serializers.ValidationError("Rejection reason cannot be empty.")
        return reason


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=16, trim_whitespace=True)
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class AssignAdminSerializer(serializers.Serializer):
    admin_email = serializers.EmailField()
    admin_name = serializers.CharField(max_length=255, required=False, default='')

    def validate_admin_email(self, value):
        return value.strip().lower()


class RoleAssignmentSerializer(serializers.Serializer):
    role_name = serializers.ChoiceField(choices=[
        Role.ADMINISTRATOR,
        Role.HEADMASTER,
        Role.ACCOUNTANT,
        Role.CLASS_TEACHER,
        Role.SUBJECT_TEACHER
    ])


class InviteStaffSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role_name = serializers.ChoiceField(choices=[
        Role.ADMINISTRATOR,
        Role.HEADMASTER,
        Role.ACCOUNTANT,
        Role.CLASS_TEACHER,
        Role.SUBJECT_TEACHER
    ], required=False, default=Role.SUBJECT_TEACHER)

    def validate_email(self, value):
        return value.strip().lower()


class SchoolSummarySerializer(serializers.ModelSerializer):
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = ['id', 'name', 'slug', 'workspace_status', 'created_at', 'members_count']

    def get_members_count(self, school):
        return school.memberships.filter(status='ACTIVE').count()
