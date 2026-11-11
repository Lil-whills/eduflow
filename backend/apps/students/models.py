import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from core.models import TimestampedModel
from tenants.models import School
from school_config.models import AcademicYear, ClassGroup, ClassLevel


class Student(TimestampedModel):
    """
    Authoritative student identity record belonging to a single school tenant.
    Identity remains stable across academic periods and class promotions.
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('WITHDRAWN', 'Withdrawn'),
        ('TRANSFERRED', 'Transferred'),
        ('GRADUATED', 'Graduated'),
        ('INACTIVE', 'Inactive'),
        ('MERGED', 'Merged'),
    ]

    GENDER_CHOICES = [
        ('MALE', 'Male'),
        ('FEMALE', 'Female'),
        ('OTHER', 'Other'),
    ]

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='students',
        db_index=True
    )
    admission_number = models.CharField(
        max_length=50,
        db_index=True,
        help_text="System-generated unique admission number per school"
    )
    index_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        help_text="School-assigned index number (duplicate signal; can be duplicated if kept both)"
    )
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100)
    preferred_name = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    admission_date = models.DateField(default=timezone.now)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )
    merged_into = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='merged_students',
        help_text="Reference to surviving student record if this record was merged away"
    )

    class Meta:
        ordering = ['last_name', 'first_name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'admission_number'],
                name='unique_school_admission_number'
            )
        ]

    def __str__(self):
        return f"{self.full_name} ({self.admission_number})"

    @property
    def full_name(self):
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"


class StudentContact(TimestampedModel):
    """
    Parent, legal guardian, or emergency contact for a student.
    At least one primary contact is mandatory before student registration is finalized.
    """
    RELATIONSHIP_CHOICES = [
        ('FATHER', 'Father'),
        ('MOTHER', 'Mother'),
        ('GUARDIAN', 'Legal Guardian'),
        ('SIBLING', 'Sibling'),
        ('OTHER', 'Other'),
    ]

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='contacts'
    )
    name = models.CharField(max_length=255)
    relationship = models.CharField(max_length=50, choices=RELATIONSHIP_CHOICES)
    phone_primary = models.CharField(max_length=50, db_index=True)
    phone_secondary = models.CharField(max_length=50, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    is_primary = models.BooleanField(default=False)
    is_emergency = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-is_primary', 'name']

    def __str__(self):
        return f"{self.name} ({self.relationship}) - {self.phone_primary} [Primary: {self.is_primary}]"


class StudentEnrollment(TimestampedModel):
    """
    Records a student's placement in a specific class stream for an academic year.
    Preserves historical progression; enrollments are never silently overwritten.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
        ('WITHDRAWN', 'Withdrawn'),
        ('TRANSFERRED', 'Transferred'),
        ('CANCELLED', 'Cancelled'),
    ]

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='enrollments'
    )
    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='student_enrollments'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.PROTECT,
        related_name='student_enrollments'
    )
    class_group = models.ForeignKey(
        ClassGroup,
        on_delete=models.PROTECT,
        related_name='student_enrollments'
    )
    start_date = models.DateField(default=timezone.now)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )
    withdrawal_reason = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-academic_year__start_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                condition=models.Q(status='ACTIVE'),
                name='unique_active_enrollment_per_academic_year'
            )
        ]

    def __str__(self):
        return f"{self.student.full_name} -> {self.class_group.display_name} ({self.academic_year.name}) [{self.status}]"


class DuplicateReview(TimestampedModel):
    """
    Tracks detected duplicate student records and records an Administrator's explicit decision.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending Review'),
        ('RESOLVED_MERGED', 'Merged'),
        ('RESOLVED_KEPT_BOTH', 'Kept Both'),
        ('DISMISSED', 'Dismissed'),
    ]

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='duplicate_reviews'
    )
    student_a = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='duplicate_reviews_a'
    )
    student_b = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='duplicate_reviews_b'
    )
    match_reason = models.CharField(max_length=255)
    match_score = models.PositiveIntegerField(default=100)
    status = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        default='PENDING',
        db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_duplicate_reviews'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    decision_notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Duplicate Review: {self.student_a.full_name} vs {self.student_b.full_name} [{self.status}]"


class StudentMergeRecord(TimestampedModel):
    """
    Immutable audit ledger entry for student record merge operations.
    """
    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='student_merge_records'
    )
    surviving_student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='merge_survivor_records'
    )
    merged_student_id = models.UUIDField()
    merged_student_admission_number = models.CharField(max_length=50)
    merged_student_name = models.CharField(max_length=255)
    reassigned_enrollments_count = models.PositiveIntegerField(default=0)
    reassigned_contacts_count = models.PositiveIntegerField(default=0)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='performed_student_merges'
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Merge Record: {self.merged_student_name} into {self.surviving_student.admission_number}"


class StudentImportBatch(TimestampedModel):
    """
    Staged CSV / Excel batch upload for preview, validation, duplicate triage, and atomic execution.
    """
    STATUS_CHOICES = [
        ('STAGED', 'Staged Preview'),
        ('PROCESSED', 'Processed Complete'),
        ('FAILED', 'Failed'),
    ]

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='student_import_batches'
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    file_name = models.CharField(max_length=255)
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='STAGED'
    )
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    created_students_count = models.PositiveIntegerField(default=0)
    preview_data = models.JSONField(default=list)
    error_summary = models.JSONField(default=list)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"ImportBatch {self.file_name} ({self.school.name}) [{self.status}]"

