import uuid
from datetime import date, timedelta
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from django.db.models import Q

from authentication.models import AuthSession
from audit.models import SecurityAuditEvent
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


class SchoolConfigBootstrapService:
    """
    Bootstraps a newly approved school with standard Ghanaian basic school curriculum
    structure (KG, Primary, JHS) and pre-configures standard classes, subjects, and calendar.
    """

    @classmethod
    @transaction.atomic
    def bootstrap_school_structure(cls, school: School, level_type: str = 'BASIC_COMPLETE', profile_data: dict = None):
        profile_data = profile_data or {}

        # 1. School Profile
        profile, _ = SchoolProfile.objects.get_or_create(
            school=school,
            defaults={
                'display_name': profile_data.get('display_name', school.name),
                'school_type': level_type,
                'contact_email': profile_data.get('contact_email', ''),
                'contact_phone': profile_data.get('contact_phone', ''),
                'region': profile_data.get('region', ''),
                'district': profile_data.get('district', ''),
                'address': profile_data.get('address', ''),
                'motto': profile_data.get('motto', 'Excellence in Education'),
            }
        )

        # 2. Pre-seed Class Levels according to school level
        stages_definition = []
        if level_type in ['BASIC_COMPLETE', 'KINDERGARTEN']:
            stages_definition.extend([
                ('Kindergarten 1', 'CRECHE_NURSERY', 1),
                ('Kindergarten 2', 'KINDERGARTEN', 2),
            ])
        if level_type in ['BASIC_COMPLETE', 'PRIMARY_ONLY']:
            stages_definition.extend([
                ('Basic 1', 'LOWER_PRIMARY', 3),
                ('Basic 2', 'LOWER_PRIMARY', 4),
                ('Basic 3', 'LOWER_PRIMARY', 5),
                ('Basic 4', 'UPPER_PRIMARY', 6),
                ('Basic 5', 'UPPER_PRIMARY', 7),
                ('Basic 6', 'UPPER_PRIMARY', 8),
            ])
        if level_type in ['BASIC_COMPLETE', 'JHS_ONLY']:
            stages_definition.extend([
                ('JHS 1 (Basic 7)', 'JHS', 9),
                ('JHS 2 (Basic 8)', 'JHS', 10),
                ('JHS 3 (Basic 9)', 'JHS', 11),
            ])

        created_levels = {}
        for name, stage, order in stages_definition:
            level, _ = ClassLevel.objects.get_or_create(
                school=school,
                name=name,
                defaults={'stage': stage, 'order_index': order, 'status': 'ACTIVE'}
            )
            created_levels[name] = level
            # Create default single stream for each level
            ClassGroup.objects.get_or_create(
                school=school,
                class_level=level,
                stream_name='',
                defaults={'status': 'ACTIVE'}
            )

        # 3. Pre-seed Ghanaian Core & Elective Subjects
        standard_subjects = [
            ('English Language', 'ENG', 'CORE', 'Official instruction language and grammar'),
            ('Mathematics', 'MATH', 'CORE', 'Numeracy, arithmetic, and problem solving'),
            ('Integrated Science', 'SCI', 'CORE', 'Natural science, experiments, and environment'),
            ('Computing / ICT', 'COMP', 'CORE', 'Digital literacy and information technology'),
            ('Social Studies', 'SOC', 'CORE', 'Citizenship, culture, geography, and history'),
            ('Religious & Moral Education', 'RME', 'CORE', 'Moral values, ethics, and religious heritage'),
            ('Ghanaian Language & Culture', 'GHA', 'CORE', 'Indigenous language (Twi/Fante/Ga/Ewe)'),
            ('Creative Arts & Design', 'CAD', 'CORE', 'Visual arts, music, and craft design'),
            ('French Language', 'FREN', 'ELECTIVE', 'Foreign language communication'),
        ]

        created_subjects = {}
        for s_name, s_code, s_cat, s_desc in standard_subjects:
            subj, _ = Subject.objects.get_or_create(
                school=school,
                name=s_name,
                defaults={'code': s_code, 'category': s_cat, 'description': s_desc, 'status': 'ACTIVE'}
            )
            created_subjects[s_name] = subj

        # 4. Map subjects to Class Levels (ClassSubject)
        for level in created_levels.values():
            for subj in created_subjects.values():
                # Primary does not take French by default in basic template unless JHS
                if subj.name == 'French Language' and level.stage != 'JHS':
                    continue
                # Lower primary focuses on foundational core
                if level.stage in ['CRECHE_NURSERY', 'KINDERGARTEN'] and subj.name in ['Social Studies', 'French Language']:
                    continue

                ClassSubject.objects.get_or_create(
                    school=school,
                    class_level=level,
                    class_group=None,
                    subject=subj,
                    defaults={'is_compulsory': (subj.category == 'CORE')}
                )

        # 5. Pre-seed Initial Academic Year (Draft 2026/2027) with 3 terms
        current_year = date.today().year
        academic_year_name = f"{current_year}/{current_year + 1}"
        year_start = date(current_year, 9, 1)
        year_end = date(current_year + 1, 7, 31)

        academic_year, _ = AcademicYear.objects.get_or_create(
            school=school,
            name=academic_year_name,
            defaults={
                'start_date': year_start,
                'end_date': year_end,
                'status': 'DRAFT'
            }
        )

        terms_data = [
            (1, 'First Term', date(current_year, 9, 8), date(current_year, 12, 17)),
            (2, 'Second Term', date(current_year + 1, 1, 12), date(current_year + 1, 4, 16)),
            (3, 'Third Term', date(current_year + 1, 5, 4), date(current_year + 1, 7, 24)),
        ]

        for t_num, t_name, t_start, t_end in terms_data:
            AcademicTerm.objects.get_or_create(
                academic_year=academic_year,
                term_number=t_num,
                defaults={
                    'name': t_name,
                    'start_date': t_start,
                    'end_date': t_end,
                    'status': 'DRAFT'
                }
            )

        return {
            'profile': profile,
            'class_levels': len(created_levels),
            'subjects': len(created_subjects),
            'academic_year': academic_year
        }


class AcademicCalendarService:
    """
    Manages Academic Years, Terms, and state transitions with date validation and one-active-year rules.
    """

    @classmethod
    def create_academic_year(cls, school: School, name: str, start_date: date, end_date: date) -> AcademicYear:
        if end_date <= start_date:
            raise ValidationError({'end_date': 'Academic year end date must be after start date.'})

        if AcademicYear.objects.filter(school=school, name=name).exists():
            raise ValidationError({'name': f'Academic year {name} already exists for this school.'})

        return AcademicYear.objects.create(
            school=school,
            name=name,
            start_date=start_date,
            end_date=end_date,
            status='DRAFT'
        )

    @classmethod
    def create_term(cls, academic_year: AcademicYear, term_number: int, name: str, start_date: date, end_date: date) -> AcademicTerm:
        if end_date <= start_date:
            raise ValidationError({'end_date': 'Term end date must be after start date.'})

        if start_date < academic_year.start_date or end_date > academic_year.end_date:
            raise ValidationError({'dates': f'Term dates must be strictly within academic year boundaries ({academic_year.start_date} to {academic_year.end_date}).'})

        # Non-overlapping terms validation
        overlapping = AcademicTerm.objects.filter(
            academic_year=academic_year
        ).filter(
            Q(start_date__lte=end_date, end_date__gte=start_date)
        )
        if overlapping.exists():
            raise ValidationError({'overlap': 'Term dates overlap with an existing term in this academic year.'})

        return AcademicTerm.objects.create(
            academic_year=academic_year,
            term_number=term_number,
            name=name,
            start_date=start_date,
            end_date=end_date,
            status='DRAFT'
        )

    @classmethod
    @transaction.atomic
    def activate_academic_year(cls, school: School, academic_year_id: uuid.UUID, actor=None) -> AcademicYear:
        year = AcademicYear.objects.select_for_update().get(id=academic_year_id, school=school)

        if year.terms.count() == 0:
            raise ValidationError({'terms': 'Academic year must have at least one term before activation.'})

        # Archive/Complete any currently ACTIVE year for this school (One active year rule)
        AcademicYear.objects.filter(school=school, status='ACTIVE').update(status='COMPLETED')

        year.status = 'ACTIVE'
        year.save()

        # Activate the first term if none active
        first_term = year.terms.order_by('term_number').first()
        if first_term and not year.terms.filter(status='ACTIVE').exists():
            first_term.status = 'ACTIVE'
            first_term.save()

        SecurityAuditEvent.log(
            action='ACADEMIC_YEAR_ACTIVATED',
            actor=actor,
            metadata={'school_id': str(school.id), 'academic_year': year.name}
        )
        return year

    @classmethod
    @transaction.atomic
    def complete_academic_year(cls, school: School, academic_year_id: uuid.UUID, actor=None) -> AcademicYear:
        year = AcademicYear.objects.select_for_update().get(id=academic_year_id, school=school)
        year.status = 'COMPLETED'
        year.save()
        year.terms.filter(status='ACTIVE').update(status='COMPLETED')

        SecurityAuditEvent.log(
            action='ACADEMIC_YEAR_COMPLETED',
            actor=actor,
            metadata={'school_id': str(school.id), 'academic_year': year.name}
        )
        return year


class StaffGovernanceService:
    """
    Handles staff dismissal, immediate session and token termination,
    and sovereign proprietor administrator reassignment.
    """

    @classmethod
    @transaction.atomic
    def dismiss_staff_member(cls, school: School, membership_id: uuid.UUID, actor, reason: str = '') -> SchoolMembership:
        membership = SchoolMembership.objects.select_for_update().get(id=membership_id, school=school)

        # 1. Guardrail: Cannot dismiss a Proprietor
        if RoleAssignment.objects.filter(membership=membership, role__name=Role.PROPRIETOR, is_active=True).exists():
            raise PermissionDenied("The school proprietor holds sovereign ownership and cannot be dismissed.")

        # 2. Guardrail: Last Administrator protection
        if RoleAssignment.objects.filter(membership=membership, role__name=Role.ADMINISTRATOR, is_active=True).exists():
            other_active_admins = RoleAssignment.objects.filter(
                membership__school=school,
                role__name=Role.ADMINISTRATOR,
                is_active=True
            ).exclude(membership=membership)

            # Check if actor is Proprietor
            actor_is_proprietor = RoleAssignment.objects.filter(
                membership__school=school,
                membership__user=actor,
                role__name=Role.PROPRIETOR,
                is_active=True
            ).exists()

            if not other_active_admins.exists() and not actor_is_proprietor:
                raise ValidationError("Cannot dismiss the sole remaining active Administrator unless the Proprietor initiates reassignment.")

        # 3. Update Membership status to REVOKED
        membership.status = 'REVOKED'
        membership.save()

        # 4. Deactivate all active Role Assignments
        RoleAssignment.objects.filter(membership=membership).update(is_active=False)

        # 5. End any active teaching assignments
        ClassTeacherAssignment.objects.filter(teacher_membership=membership, status='ACTIVE').update(
            status='ENDED', ended_at=timezone.now()
        )
        SubjectTeacherAssignment.objects.filter(teacher_membership=membership, status='ACTIVE').update(
            status='ENDED', ended_at=timezone.now()
        )

        # 6. INSTANT SESSION TERMINATION: Revoke all active AuthSessions for this user
        AuthSession.objects.filter(user=membership.user, status='ACTIVE').update(
            status='REVOKED',
            revocation_reason='STAFF_DISMISSED'
        )

        # Increment user's token_version to invalidate any unexpired JWT access tokens immediately
        membership.user.token_version += 1
        membership.user.save(update_fields=['token_version'])

        # 7. Audit Event
        SecurityAuditEvent.log(
            action='STAFF_DISMISSED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'dismissed_user_email': membership.user.email,
                'dismissed_membership_id': str(membership.id),
                'reason': reason or 'Employment terminated.'
            }
        )

        return membership

    @classmethod
    @transaction.atomic
    def reassign_administrator(cls, school: School, new_admin_email: str, actor):
        """
        Sovereign Proprietor operation: appoints or invites a new Administrator,
        revoking the Administrator role and invalidating sessions from any previous Administrator.
        All academic years, terms, classes, streams, and subjects remain 100% intact.
        """
        actor_is_prop = RoleAssignment.objects.filter(
            membership__school=school,
            membership__user=actor,
            role__name=Role.PROPRIETOR,
            is_active=True
        ).exists()

        if not actor_is_prop:
            raise PermissionDenied("Only the School Proprietor has sovereign authority to reassign the Administrator.")

        admin_role, _ = Role.objects.get_or_create(name=Role.ADMINISTRATOR)
        clean_email = new_admin_email.strip().lower()

        # Demote previous Administrator role assignments
        RoleAssignment.objects.filter(
            membership__school=school,
            role=admin_role,
            is_active=True
        ).update(is_active=False)

        # Invalidate active login sessions of previous administrators
        from authentication.models import User
        prev_admins = User.objects.filter(
            memberships__school=school,
            memberships__role_assignments__role=admin_role
        ).exclude(email=clean_email).distinct()
        for prev_admin in prev_admins:
            prev_admin.token_version += 1
            prev_admin.save(update_fields=['token_version'])

        # Find or create membership for new admin
        membership = SchoolMembership.objects.filter(school=school, user__email=clean_email).first()
        raw_token = None
        if not membership:
            user = User.objects.filter(email=clean_email).first()
            if not user:
                user = User.objects.create_user(email=clean_email, password=None, is_active=False)

            membership = SchoolMembership.objects.create(school=school, user=user, status='ACTIVE')

        # Activate Administrator role for this membership
        ra, _ = RoleAssignment.objects.get_or_create(membership=membership, role=admin_role)
        ra.is_active = True
        ra.save()

        # If user is not active, generate invitation token & outbox email so they can activate via email link or registration
        if not membership.user.is_active:
            import secrets, hashlib
            from datetime import timedelta
            from django.utils import timezone
            from tenants.models import InvitationToken, OutboxEmail
            from tenants.services import encrypt_payload

            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            expires_at = timezone.now() + timedelta(days=7)

            InvitationToken.objects.filter(school=school, email=clean_email, is_accepted=False).update(is_superseded=True)
            InvitationToken.objects.create(
                school=school,
                email=clean_email,
                token_hash=token_hash,
                is_accepted=False,
                expires_at=expires_at
            )
            payload = {
                'token': raw_token,
                'school_name': school.name,
                'recipient_email': clean_email,
                'role': Role.ADMINISTRATOR,
                'invitation_url': f"/accept-invitation?token={raw_token}",
                'expires_at': expires_at.isoformat()
            }
            OutboxEmail.objects.create(
                recipient=clean_email,
                email_type='ADMIN_INVITATION',
                encrypted_payload=encrypt_payload(payload),
                status='PENDING'
            )

        # If school was in ONBOARDING status, transition to ACTIVE
        if school.workspace_status == 'ONBOARDING':
            school.workspace_status = 'ACTIVE'
            school.save(update_fields=['workspace_status'])

        SecurityAuditEvent.log(
            action='ADMINISTRATOR_REASSIGNED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'new_admin_email': clean_email,
                'membership_id': str(membership.id)
            }
        )

        return membership, raw_token


class TeachingAssignmentService:
    """
    Manages primary class teacher and subject teacher assignments with conflict checks.
    """

    @classmethod
    @transaction.atomic
    def assign_class_teacher(cls, school: School, academic_year: AcademicYear, class_group: ClassGroup, teacher_membership: SchoolMembership, is_primary: bool = True, actor=None) -> ClassTeacherAssignment:
        if teacher_membership.school_id != school.id or teacher_membership.status != 'ACTIVE':
            raise ValidationError("Teacher must be an active member of this school.")

        # Ensure teacher holds CLASS_TEACHER role
        class_teacher_role, _ = Role.objects.get_or_create(name=Role.CLASS_TEACHER)
        RoleAssignment.objects.get_or_create(
            membership=teacher_membership,
            role=class_teacher_role,
            defaults={'is_active': True}
        )

        if class_group.school_id != school.id or academic_year.school_id != school.id:
            raise ValidationError("Class group and academic year must belong to this school.")

        # Exactly 1 active primary class teacher per class group per academic year
        if is_primary:
            ClassTeacherAssignment.objects.filter(
                school=school,
                academic_year=academic_year,
                class_group=class_group,
                is_primary=True,
                status='ACTIVE'
            ).update(status='ENDED', ended_at=timezone.now())

        assignment = ClassTeacherAssignment.objects.create(
            school=school,
            academic_year=academic_year,
            class_group=class_group,
            teacher_membership=teacher_membership,
            is_primary=is_primary,
            status='ACTIVE'
        )

        SecurityAuditEvent.log(
            action='CLASS_TEACHER_ASSIGNED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'class_group': class_group.display_name,
                'teacher_email': teacher_membership.user.email,
                'is_primary': is_primary
            }
        )
        return assignment

    @classmethod
    @transaction.atomic
    def assign_subject_teacher(cls, school: School, academic_year: AcademicYear, class_group: ClassGroup, subject: Subject, teacher_membership: SchoolMembership, actor=None) -> SubjectTeacherAssignment:
        if teacher_membership.school_id != school.id or teacher_membership.status != 'ACTIVE':
            raise ValidationError("Teacher must be an active member of this school.")

        # Ensure teacher holds SUBJECT_TEACHER role
        subj_teacher_role, _ = Role.objects.get_or_create(name=Role.SUBJECT_TEACHER)
        RoleAssignment.objects.get_or_create(
            membership=teacher_membership,
            role=subj_teacher_role,
            defaults={'is_active': True}
        )

        if class_group.school_id != school.id or subject.school_id != school.id or academic_year.school_id != school.id:
            raise ValidationError("Class, subject, and academic year must belong to this school.")

        # Verify subject is available to this class level or group
        is_mapped = ClassSubject.objects.filter(
            school=school,
            subject=subject
        ).filter(
            Q(class_group=class_group) | Q(class_level=class_group.class_level, class_group__isnull=True)
        ).exists()

        if not is_mapped:
            raise ValidationError(f"Subject '{subject.name}' is not configured as available to {class_group.display_name}.")

        # Prevent duplicate active assignment
        if SubjectTeacherAssignment.objects.filter(
            school=school,
            academic_year=academic_year,
            class_group=class_group,
            subject=subject,
            teacher_membership=teacher_membership,
            status='ACTIVE'
        ).exists():
            raise ValidationError("This teacher is already assigned to this subject and class.")

        assignment = SubjectTeacherAssignment.objects.create(
            school=school,
            academic_year=academic_year,
            class_group=class_group,
            subject=subject,
            teacher_membership=teacher_membership,
            status='ACTIVE'
        )

        SecurityAuditEvent.log(
            action='SUBJECT_TEACHER_ASSIGNED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'class_group': class_group.display_name,
                'subject': subject.name,
                'teacher_email': teacher_membership.user.email
            }
        )
        return assignment

