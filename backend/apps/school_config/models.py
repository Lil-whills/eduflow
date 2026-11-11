import uuid
from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class SchoolProfile(TimestampedModel):
    """
    Stores institutional and profile information for a school tenant.
    """
    SCHOOL_TYPE_CHOICES = [
        ('CRECHE_NURSERY', 'Crèche / Nursery Only'),
        ('KINDERGARTEN', 'Kindergarten Only'),
        ('PRIMARY_ONLY', 'Primary School Only (Class 1-6)'),
        ('JHS_ONLY', 'Junior High School Only (JHS 1-3)'),
        ('BASIC_COMPLETE', 'Complete Basic School (KG to JHS 3)'),
    ]

    school = models.OneToOneField(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='profile'
    )
    display_name = models.CharField(max_length=255, blank=True)
    motto = models.CharField(max_length=255, blank=True)
    logo_url = models.CharField(max_length=1000, blank=True)
    school_type = models.CharField(
        max_length=50,
        choices=SCHOOL_TYPE_CHOICES,
        default='BASIC_COMPLETE'
    )
    address = models.CharField(max_length=500, blank=True)
    gps_address = models.CharField(max_length=50, blank=True)
    region = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(max_length=255, blank=True)
    registration_number = models.CharField(max_length=100, blank=True)
    default_class_capacity = models.PositiveIntegerField(default=35)

    def __str__(self):
        return f"Profile for {self.school.name}"


class AcademicYear(TimestampedModel):
    """
    Defines a school-specific academic year (e.g. 2026/2027).
    Guarantees only one ACTIVE academic year per school.
    """
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('UPCOMING', 'Upcoming'),
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='academic_years'
    )
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DRAFT',
        db_index=True
    )

    class Meta:
        ordering = ['-start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'],
                name='unique_school_academic_year'
            )
        ]

    def __str__(self):
        return f"{self.school.name} - {self.name} [{self.status}]"


class AcademicTerm(TimestampedModel):
    """
    Defines a term/semester within an academic year.
    Terms must fall strictly within the academic year's date range.
    """
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('ACTIVE', 'Active'),
        ('COMPLETED', 'Completed'),
    ]

    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='terms'
    )
    term_number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DRAFT',
        db_index=True
    )

    class Meta:
        ordering = ['term_number']
        constraints = [
            models.UniqueConstraint(
                fields=['academic_year', 'term_number'],
                name='unique_year_term_number'
            )
        ]

    def __str__(self):
        return f"{self.academic_year.name} - {self.name} ({self.status})"


class ClassLevel(TimestampedModel):
    """
    Grade or level in the school (e.g., 'KG 1', 'Basic 1', 'Basic 7 (JHS 1)').
    """
    STAGE_CHOICES = [
        ('CRECHE_NURSERY', 'Crèche / Nursery'),
        ('KINDERGARTEN', 'Kindergarten'),
        ('LOWER_PRIMARY', 'Lower Primary'),
        ('UPPER_PRIMARY', 'Upper Primary'),
        ('JHS', 'Junior High School'),
    ]

    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='class_levels'
    )
    name = models.CharField(max_length=100)
    stage = models.CharField(
        max_length=30,
        choices=STAGE_CHOICES,
        db_index=True
    )
    order_index = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )

    class Meta:
        ordering = ['order_index', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'],
                name='unique_school_class_level'
            )
        ]

    def __str__(self):
        return f"{self.school.name} - {self.name}"


class ClassGroup(TimestampedModel):
    """
    Operational class group or stream (e.g., 'Basic 4A', 'Basic 4B', or unstreamed 'Basic 4').
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='class_groups'
    )
    class_level = models.ForeignKey(
        ClassLevel,
        on_delete=models.CASCADE,
        related_name='groups'
    )
    stream_name = models.CharField(max_length=20, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )

    @property
    def display_name(self):
        if self.stream_name:
            return f"{self.class_level.name} {self.stream_name}"
        return self.class_level.name

    class Meta:
        ordering = ['class_level__order_index', 'stream_name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'class_level', 'stream_name'],
                name='unique_school_class_level_stream'
            )
        ]

    def __str__(self):
        return f"{self.display_name} ({self.school.name})"


class Subject(TimestampedModel):
    """
    Subject catalogue taught at the school (e.g. Mathematics, English Language, Computing).
    """
    CATEGORY_CHOICES = [
        ('CORE', 'Core Subject'),
        ('ELECTIVE', 'Elective Subject'),
    ]

    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='subjects'
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, blank=True)
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='CORE'
    )
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )

    class Meta:
        ordering = ['category', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'],
                name='unique_school_subject_name'
            )
        ]

    def __str__(self):
        return f"{self.name} [{self.code}] ({self.school.name})"


class ClassSubject(TimestampedModel):
    """
    Maps which subjects are taught at which class level or specific class group.
    """
    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='class_subjects'
    )
    class_level = models.ForeignKey(
        ClassLevel,
        on_delete=models.CASCADE,
        related_name='level_subjects'
    )
    class_group = models.ForeignKey(
        ClassGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='group_subjects'
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='class_mappings'
    )
    is_compulsory = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'class_level', 'class_group', 'subject'],
                name='unique_class_subject_mapping'
            )
        ]

    def __str__(self):
        target = self.class_group.display_name if self.class_group else self.class_level.name
        return f"{self.subject.name} -> {target}"


class StaffProfile(TimestampedModel):
    """
    School-specific staff information linked to a user's school membership.
    """
    membership = models.OneToOneField(
        'tenants.SchoolMembership',
        on_delete=models.CASCADE,
        related_name='staff_profile'
    )
    staff_id_number = models.CharField(max_length=50, blank=True)
    qualification = models.CharField(max_length=150, blank=True)
    date_employed = models.DateField(null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return f"StaffProfile for {self.membership.user.email}"


class ClassTeacherAssignment(TimestampedModel):
    """
    Connects a teacher to a class group for an academic year.
    Strictly enforces at most ONE active primary class teacher per class group per academic year.
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('ENDED', 'Ended'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments'
    )
    class_group = models.ForeignKey(
        ClassGroup,
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments'
    )
    teacher_membership = models.ForeignKey(
        'tenants.SchoolMembership',
        on_delete=models.CASCADE,
        related_name='class_teacher_assignments'
    )
    is_primary = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.teacher_membership.user.email} -> {self.class_group.display_name} ({self.academic_year.name})"


class SubjectTeacherAssignment(TimestampedModel):
    """
    Connects a subject teacher to a class group and subject for an academic year.
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('ENDED', 'Ended'),
    ]

    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.CASCADE,
        related_name='subject_teacher_assignments'
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='subject_teacher_assignments'
    )
    class_group = models.ForeignKey(
        ClassGroup,
        on_delete=models.CASCADE,
        related_name='subject_teacher_assignments'
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='subject_teacher_assignments'
    )
    teacher_membership = models.ForeignKey(
        'tenants.SchoolMembership',
        on_delete=models.CASCADE,
        related_name='subject_teacher_assignments'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='ACTIVE',
        db_index=True
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.teacher_membership.user.email} -> {self.subject.name} @ {self.class_group.display_name}"

