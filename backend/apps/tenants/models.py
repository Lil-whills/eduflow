import uuid
from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class School(TimestampedModel):
    """
    Represents an isolated school tenant.
    All student, staff, finance, and academic data belong to a school tenant.
    """
    WORKSPACE_STATUS_CHOICES = [
        ('PENDING_ACTIVATION', 'Pending Activation'),
        ('ONBOARDING', 'Onboarding'),
        ('ACTIVE', 'Active'),
        ('SUSPENDED', 'Suspended'),
        ('CLOSED', 'Closed'),
    ]

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    workspace_status = models.CharField(
        max_length=25,
        choices=WORKSPACE_STATUS_CHOICES,
        default='PENDING_ACTIVATION',
        db_index=True
    )

    def __str__(self):
        return f"{self.name} ({self.workspace_status})"


class SchoolAccessRequest(TimestampedModel):
    """
    Prospective school registration request submitted by a school representative.
    Must pass email verification before entering the Platform Operator review queue.
    """
    STATUS_CHOICES = [
        ('EMAIL_UNVERIFIED', 'Email Unverified'),
        ('PENDING', 'Pending Review'),
        ('UNDER_REVIEW', 'Under Review'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    school_name = models.CharField(max_length=255)
    requester_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='school_requests'
    )
    requester_name = models.CharField(max_length=255)
    contact_email = models.EmailField(db_index=True)
    contact_phone = models.CharField(max_length=50)
    status = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        default='EMAIL_UNVERIFIED',
        db_index=True
    )
    rejection_reason = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"{self.school_name} - {self.contact_email} [{self.status}]"


class EmailVerificationToken(TimestampedModel):
    """
    Single-use, cryptographically unpredictable token for verifying requester email.
    """
    request = models.ForeignKey(
        SchoolAccessRequest,
        on_delete=models.CASCADE,
        related_name='verification_tokens'
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField(db_index=True)

    def __str__(self):
        return f"VerifyToken for {self.request.contact_email} (Used: {self.is_used})"


class ProvisioningRecord(TimestampedModel):
    """
    Tracks workspace provisioning state idempotently with worker lease support.
    """
    STATUS_CHOICES = [
        ('NOT_STARTED', 'Not Started'),
        ('IN_PROGRESS', 'In Progress'),
        ('PROVISIONED', 'Provisioned'),
        ('FAILED', 'Failed'),
    ]

    access_request = models.OneToOneField(
        SchoolAccessRequest,
        on_delete=models.PROTECT,
        related_name='provisioning_record'
    )
    school = models.OneToOneField(
        School,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='provisioning_record'
    )
    status = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        default='NOT_STARTED',
        db_index=True
    )
    worker_id = models.UUIDField(null=True, blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Provisioning for {self.access_request.school_name} [{self.status}]"


class InvitationToken(TimestampedModel):
    """
    Single-use cryptographically hashed token for onboarding the Proprietor or staff member.
    """
    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='invitation_tokens'
    )
    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    is_accepted = models.BooleanField(default=False)
    is_superseded = models.BooleanField(default=False)
    expires_at = models.DateTimeField(db_index=True)

    def __str__(self):
        return f"Invitation for {self.email} to {self.school.name}"


class SchoolMembership(TimestampedModel):
    """
    Associates an individual User identity with one School tenant.
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('SUSPENDED', 'Suspended'),
        ('REVOKED', 'Revoked'),
    ]

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'user'],
                name='unique_school_user_membership'
            )
        ]

    def __str__(self):
        return f"{self.user.email} @ {self.school.name} ({self.status})"


class Role(TimestampedModel):
    """
    Defined operational roles within the school.
    Initial: PROPRIETOR, ADMINISTRATOR, HEADMASTER, ACCOUNTANT, CLASS_TEACHER, SUBJECT_TEACHER.
    """
    PROPRIETOR = 'PROPRIETOR'
    ADMINISTRATOR = 'ADMINISTRATOR'
    HEADMASTER = 'HEADMASTER'
    ACCOUNTANT = 'ACCOUNTANT'
    CLASS_TEACHER = 'CLASS_TEACHER'
    SUBJECT_TEACHER = 'SUBJECT_TEACHER'

    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.name


class RoleAssignment(TimestampedModel):
    """
    Explicitly connects a SchoolMembership to a Role.
    """
    membership = models.ForeignKey(
        SchoolMembership,
        on_delete=models.CASCADE,
        related_name='role_assignments'
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name='assignments'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['membership', 'role'],
                name='unique_membership_role'
            )
        ]

    def __str__(self):
        return f"{self.membership.user.email} as {self.role.name} ({'Active' if self.is_active else 'Inactive'})"


class OutboxEmail(TimestampedModel):
    """
    Transactional outbox for durable email dispatch.
    Sensitive payloads are encrypted with AES-256-GCM and zeroed upon delivery.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('DELIVERED', 'Delivered'),
        ('FAILED', 'Failed'),
    ]

    recipient = models.EmailField()
    email_type = models.CharField(max_length=50)
    encrypted_payload = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING',
        db_index=True
    )
    retry_count = models.PositiveIntegerField(default=0)
    scheduled_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    error_log = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"OutboxEmail to {self.recipient} [{self.status}]"

