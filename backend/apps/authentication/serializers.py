from rest_framework import serializers
from django.contrib.auth import get_user_model
from tenants.models import SchoolMembership, RoleAssignment

User = get_user_model()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()


class PlatformOperatorLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()


class RegisterSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, min_length=2)
    last_name = serializers.CharField(max_length=150, min_length=2)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    def validate_first_name(self, value):
        return value.strip()

    def validate_last_name(self, value):
        return value.strip()

    def validate_email(self, value):
        email = value.strip().lower()
        existing_user = User.objects.filter(email=email).first()
        if existing_user and existing_user.is_active:
            raise serializers.ValidationError("An active account with this email address already exists. Please sign in.")
        return email

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'is_platform_operator', 'date_joined', 'memberships']

    def get_memberships(self, user):
        membership = SchoolMembership.objects.filter(user=user, status='ACTIVE').select_related('school').first()
        if not membership:
            return None

        roles = RoleAssignment.objects.filter(
            membership=membership,
            is_active=True
        ).select_related('role').values_list('role__name', flat=True)

        return {
            'school_id': str(membership.school.id),
            'school_name': membership.school.name,
            'workspace_status': membership.school.workspace_status,
            'membership_status': membership.status,
            'assigned_roles': list(roles),
        }


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=16, trim_whitespace=True)
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_new_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_new_password']:
            raise serializers.ValidationError({"confirm_new_password": "New passwords do not match."})
        return attrs
