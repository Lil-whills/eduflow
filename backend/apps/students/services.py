import csv
import io
import re
from datetime import datetime, date
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from rest_framework.exceptions import NotFound

from tenants.models import School
from school_config.models import AcademicYear, ClassGroup, ClassLevel
from audit.models import SecurityAuditEvent
from .models import (
    Student,
    StudentContact,
    StudentEnrollment,
    DuplicateReview,
    StudentMergeRecord,
    StudentImportBatch
)


class DuplicateStudentWarning(Exception):
    def __init__(self, message, duplicates, review_id=None):
        super().__init__(message)
        self.duplicates = duplicates
        self.review_id = review_id


class AdmissionNumberService:
    """
    Generates deterministic, sequential, tenant-isolated admission numbers.
    Format: {PREFIX}/{YEAR}/{SEQ:04d}
    Example: EDF/2026/0001
    Enforces row locking to prevent race-condition number clashes.
    """
    @classmethod
    def generate_next_number(cls, school: School, year: int = None) -> str:
        if not year:
            year = timezone.now().year

        # Prefix derived from school slug or name
        prefix = ''.join([c for c in (school.slug or school.name).upper() if c.isalnum()][:3])
        if len(prefix) < 3:
            prefix = "SCH"

        # Count total students ever created for this school tenant + 1
        with transaction.atomic():
            # Lock the school row to serialize sequence generation
            School.objects.select_for_update().filter(id=school.id).first()
            total_students = Student.objects.filter(school=school).count()
            sequence = total_students + 1

            while True:
                candidate = f"{prefix}/{year}/{sequence:04d}"
                if not Student.objects.filter(school=school, admission_number=candidate).exists():
                    return candidate
                sequence += 1


class DuplicateDetectionService:
    """
    Detects potential duplicate student records using index numbers,
    full names, guardian contact phone, and date of birth.
    Duplicate detection is a review aid and does NOT automatically merge records.
    """
    @classmethod
    def check_duplicates(cls, school: School, first_name: str, last_name: str,
                         index_number: str = None, phone_primary: str = None,
                         date_of_birth: date = None, exclude_student_id=None):
        norm_first = first_name.strip().lower()
        norm_last = last_name.strip().lower()
        norm_index = index_number.strip().lower() if index_number else None
        norm_phone = re.sub(r'\D', '', phone_primary) if phone_primary else None

        candidates = []
        seen_ids = set()

        base_qs = Student.objects.filter(school=school).exclude(status='MERGED')
        if exclude_student_id:
            base_qs = base_qs.exclude(id=exclude_student_id)

        # Signal 1: Identical index number (Strong signal - Score 95)
        if norm_index:
            for s in base_qs.filter(index_number__iexact=norm_index):
                if s.id not in seen_ids:
                    seen_ids.add(s.id)
                    candidates.append({
                        'student_id': str(s.id),
                        'admission_number': s.admission_number,
                        'full_name': s.full_name,
                        'index_number': s.index_number,
                        'date_of_birth': str(s.date_of_birth) if s.date_of_birth else None,
                        'status': s.status,
                        'match_reason': f"Identical school index number '{s.index_number}'",
                        'match_score': 95
                    })

        # Signal 2: Same first and last name + matching primary guardian phone (Score 90)
        name_qs = base_qs.filter(first_name__iexact=norm_first, last_name__iexact=norm_last)
        for s in name_qs:
            if s.id in seen_ids:
                continue
            contacts = s.contacts.filter(is_primary=True)
            matched_phone = False
            for c in contacts:
                c_phone = re.sub(r'\D', '', c.phone_primary or '')
                if norm_phone and c_phone and (norm_phone == c_phone or norm_phone.endswith(c_phone) or c_phone.endswith(norm_phone)):
                    matched_phone = True
                    break

            if matched_phone:
                seen_ids.add(s.id)
                candidates.append({
                    'student_id': str(s.id),
                    'admission_number': s.admission_number,
                    'full_name': s.full_name,
                    'index_number': s.index_number,
                    'date_of_birth': str(s.date_of_birth) if s.date_of_birth else None,
                    'status': s.status,
                    'match_reason': "Matching full name and primary guardian phone number",
                    'match_score': 90
                })

        # Signal 3: Same name and date of birth (Score 85)
        if date_of_birth:
            dob_matches = name_qs.filter(date_of_birth=date_of_birth)
            for s in dob_matches:
                if s.id in seen_ids:
                    continue
                seen_ids.add(s.id)
                candidates.append({
                    'student_id': str(s.id),
                    'admission_number': s.admission_number,
                    'full_name': s.full_name,
                    'index_number': s.index_number,
                    'date_of_birth': str(s.date_of_birth) if s.date_of_birth else None,
                    'status': s.status,
                    'match_reason': f"Matching full name and date of birth ({date_of_birth})",
                    'match_score': 85
                })

        # Sort descending by match score
        candidates.sort(key=lambda x: x['match_score'], reverse=True)
        return candidates


class StudentService:
    """
    Core management service for student records, guardian contacts, enrollments,
    duplicate review decisions, and auditable merges.
    """
    @classmethod
    @transaction.atomic
    def register_student(cls, school: School, student_data: dict, primary_contact_data: dict,
                         class_group: ClassGroup = None, academic_year: AcademicYear = None,
                         actor=None, force_create: bool = False) -> Student:
        """
        Registers a new student profile and mandatory primary contact.
        If class_group and academic_year are supplied, creates an immediate active enrollment.
        Validates duplicates unless force_create=True.
        """
        # Validate mandatory primary contact fields
        if not primary_contact_data or not isinstance(primary_contact_data, dict):
            raise ValidationError("A primary guardian or emergency contact is mandatory for student registration.")

        contact_name = (primary_contact_data.get('name') or '').strip()
        contact_rel = (primary_contact_data.get('relationship') or '').strip()
        contact_phone = (primary_contact_data.get('phone_primary') or '').strip()

        if not contact_name or not contact_phone:
            raise ValidationError("Primary contact name and primary phone number are mandatory.")

        if not contact_rel:
            primary_contact_data['relationship'] = 'GUARDIAN'

        first_name = (student_data.get('first_name') or '').strip()
        last_name = (student_data.get('last_name') or '').strip()
        if not first_name or not last_name:
            raise ValidationError("Student first name and last name are required.")

        index_number = (student_data.get('index_number') or '').strip() or None
        date_of_birth = student_data.get('date_of_birth')

        # Check for possible duplicates
        duplicate_matches = DuplicateDetectionService.check_duplicates(
            school=school,
            first_name=first_name,
            last_name=last_name,
            index_number=index_number,
            phone_primary=contact_phone,
            date_of_birth=date_of_birth
        )

        if duplicate_matches and not force_create:
            # Stage a pending review record for audit tracking
            top_match = duplicate_matches[0]
            existing_student = Student.objects.filter(id=top_match['student_id']).first()
            review = None
            if existing_student:
                # We raise warning with match details so the client can present review modal
                raise DuplicateStudentWarning(
                    message=f"Possible duplicate student found: '{top_match['full_name']}' ({top_match['admission_number']}).",
                    duplicates=duplicate_matches
                )

        # Generate unique admission number
        admission_number = AdmissionNumberService.generate_next_number(school)

        # Create student record
        student = Student.objects.create(
            school=school,
            admission_number=admission_number,
            index_number=index_number,
            first_name=first_name,
            middle_name=(student_data.get('middle_name') or '').strip() or None,
            last_name=last_name,
            preferred_name=(student_data.get('preferred_name') or '').strip() or None,
            date_of_birth=date_of_birth,
            gender=student_data.get('gender'),
            admission_date=student_data.get('admission_date') or timezone.now().date(),
            status='ACTIVE'
        )

        # Create mandatory primary contact
        StudentContact.objects.create(
            student=student,
            name=contact_name,
            relationship=primary_contact_data.get('relationship', 'GUARDIAN'),
            phone_primary=contact_phone,
            phone_secondary=(primary_contact_data.get('phone_secondary') or '').strip() or None,
            email=(primary_contact_data.get('email') or '').strip() or None,
            is_primary=True,
            is_emergency=True,
            notes=primary_contact_data.get('notes')
        )

        # If class placement is provided, activate enrollment immediately
        if class_group and academic_year:
            if class_group.school_id != school.id or academic_year.school_id != school.id:
                raise ValidationError("Class group and academic year must belong to the same school tenant.")

            StudentEnrollment.objects.create(
                student=student,
                school=school,
                academic_year=academic_year,
                class_group=class_group,
                start_date=timezone.now().date(),
                status='ACTIVE'
            )

        # If forced creation occurred with duplicates, record the KEEP_BOTH decision
        if duplicate_matches and force_create:
            for d in duplicate_matches:
                other_student = Student.objects.filter(id=d['student_id']).first()
                if other_student:
                    DuplicateReview.objects.create(
                        school=school,
                        student_a=other_student,
                        student_b=student,
                        match_reason=d['match_reason'],
                        match_score=d['match_score'],
                        status='RESOLVED_KEPT_BOTH',
                        reviewed_by=actor,
                        reviewed_at=timezone.now(),
                        decision_notes="Administrator confirmed to keep both records distinct."
                    )

        SecurityAuditEvent.log(
            action='STUDENT_REGISTERED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'student_id': str(student.id),
                'admission_number': student.admission_number,
                'full_name': student.full_name,
                'enrolled_class': class_group.display_name if class_group else None
            }
        )
        return student

    @classmethod
    @transaction.atomic
    def update_student(cls, school: School, student_id, data: dict, actor=None) -> Student:
        student = Student.objects.filter(school=school, id=student_id).first()
        if not student:
            raise NotFound("Student not found.")

        # Admission number is immutable
        if 'first_name' in data and data['first_name'].strip():
            student.first_name = data['first_name'].strip()
        if 'last_name' in data and data['last_name'].strip():
            student.last_name = data['last_name'].strip()
        if 'middle_name' in data:
            student.middle_name = (data['middle_name'] or '').strip() or None
        if 'preferred_name' in data:
            student.preferred_name = (data['preferred_name'] or '').strip() or None
        if 'index_number' in data:
            student.index_number = (data['index_number'] or '').strip() or None
        if 'date_of_birth' in data:
            student.date_of_birth = data['date_of_birth']
        if 'gender' in data:
            student.gender = data['gender']
        if 'status' in data and data['status'] in dict(Student.STATUS_CHOICES):
            student.status = data['status']

        student.save()
        SecurityAuditEvent.log(
            action='STUDENT_UPDATED',
            actor=actor,
            metadata={'school_id': str(school.id), 'student_id': str(student.id)}
        )
        return student

    @classmethod
    @transaction.atomic
    def merge_students(cls, school: School, surviving_student_id, merged_student_id,
                       actor=None, notes=None) -> Student:
        """
        Consolidates two student profiles into the surviving record.
        - Preserves surviving student's admission number.
        - Safely reassigns historical enrollments and contacts.
        - Marks merged student status='MERGED' with merged_into link.
        - Audited in StudentMergeRecord and SecurityAuditEvent.
        """
        if surviving_student_id == merged_student_id:
            raise ValidationError("Cannot merge a student record into itself.")

        survivor = Student.objects.filter(school=school, id=surviving_student_id).first()
        merged = Student.objects.filter(school=school, id=merged_student_id).first()

        if not survivor or not merged:
            raise NotFound("One or both student records not found in this school.")

        if merged.status == 'MERGED':
            raise ValidationError(f"Student record '{merged.admission_number}' is already merged.")

        reassigned_enrollments = 0
        reassigned_contacts = 0

        # 1. Reassign enrollments
        for enrollment in merged.enrollments.all():
            # Check if survivor already has active enrollment in same year
            if enrollment.status == 'ACTIVE':
                survivor_has_active = survivor.enrollments.filter(
                    academic_year=enrollment.academic_year,
                    status='ACTIVE'
                ).exists()
                if survivor_has_active:
                    enrollment.status = 'COMPLETED'
                    enrollment.withdrawal_reason = f"Consolidated via student merge into {survivor.admission_number}"
            enrollment.student = survivor
            enrollment.save()
            reassigned_enrollments += 1

        # 2. Reassign contacts (merged student's primary contacts become secondary if survivor already has one)
        survivor_has_primary = survivor.contacts.filter(is_primary=True).exists()
        for contact in merged.contacts.all():
            if contact.is_primary and survivor_has_primary:
                contact.is_primary = False
            contact.student = survivor
            contact.save()
            reassigned_contacts += 1

        # 3. Soft-mark merged student
        merged_old_name = merged.full_name
        merged_old_adm = merged.admission_number
        merged.status = 'MERGED'
        merged.merged_into = survivor
        merged.save()

        # 4. Resolve any pending DuplicateReviews between them
        DuplicateReview.objects.filter(
            school=school
        ).filter(
            (Q(student_a=survivor) & Q(student_b=merged)) | (Q(student_a=merged) & Q(student_b=survivor))
        ).update(
            status='RESOLVED_MERGED',
            reviewed_by=actor,
            reviewed_at=timezone.now(),
            decision_notes=notes or f"Merged into surviving record {survivor.admission_number}"
        )

        # 5. Ledger entry
        StudentMergeRecord.objects.create(
            school=school,
            surviving_student=survivor,
            merged_student_id=merged.id,
            merged_student_admission_number=merged_old_adm,
            merged_student_name=merged_old_name,
            reassigned_enrollments_count=reassigned_enrollments,
            reassigned_contacts_count=reassigned_contacts,
            performed_by=actor,
            notes=notes
        )

        SecurityAuditEvent.log(
            action='STUDENTS_MERGED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'surviving_student_id': str(survivor.id),
                'surviving_admission_number': survivor.admission_number,
                'merged_student_id': str(merged.id),
                'merged_admission_number': merged_old_adm
            }
        )
        return survivor

    @classmethod
    @transaction.atomic
    def withdraw_enrollment(cls, school: School, enrollment_id, reason: str,
                            end_date: date = None, actor=None) -> StudentEnrollment:
        enrollment = StudentEnrollment.objects.filter(school=school, id=enrollment_id).first()
        if not enrollment:
            raise NotFound("Enrollment not found.")

        enrollment.status = 'WITHDRAWN'
        enrollment.end_date = end_date or timezone.now().date()
        enrollment.withdrawal_reason = reason
        enrollment.save()

        # If student has no other active enrollments, update student status to WITHDRAWN
        if not enrollment.student.enrollments.filter(status='ACTIVE').exists():
            enrollment.student.status = 'WITHDRAWN'
            enrollment.student.save()

        SecurityAuditEvent.log(
            action='STUDENT_ENROLLMENT_WITHDRAWN',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'enrollment_id': str(enrollment.id),
                'student_id': str(enrollment.student_id),
                'reason': reason
            }
        )
        return enrollment


class StudentReportingService:
    """
    Computes class-stream counts and parent ClassLevel aggregated totals
    strictly from active enrollments within the specified academic year.
    """
    @classmethod
    def get_class_summary(cls, school: School, academic_year_id=None):
        if academic_year_id:
            year = AcademicYear.objects.filter(school=school, id=academic_year_id).first()
        else:
            year = AcademicYear.objects.filter(school=school, status='ACTIVE').first() or AcademicYear.objects.filter(school=school).first()

        if not year:
            return {
                'academic_year': None,
                'total_active_students': 0,
                'class_levels': []
            }

        # Query active enrollments for this year
        active_enrollments = StudentEnrollment.objects.filter(
            school=school,
            academic_year=year,
            status='ACTIVE'
        ).select_related('class_group__class_level')

        # Aggregate counts per class group
        group_counts = active_enrollments.values('class_group_id').annotate(count=Count('id'))
        group_map = {item['class_group_id']: item['count'] for item in group_counts}

        levels = ClassLevel.objects.filter(school=school).prefetch_related('groups').order_by('order_index')
        result_levels = []
        school_total = 0

        for lvl in levels:
            lvl_total = 0
            streams = []
            for grp in lvl.groups.all().order_by('stream_name'):
                count = group_map.get(grp.id, 0)
                lvl_total += count
                streams.append({
                    'id': str(grp.id),
                    'display_name': grp.display_name,
                    'stream_name': grp.stream_name,
                    'active_students': count
                })
            school_total += lvl_total
            result_levels.append({
                'id': str(lvl.id),
                'name': lvl.name,
                'stage': lvl.stage,
                'order_index': lvl.order_index,
                'total_active_students': lvl_total,
                'streams': streams
            })

        return {
            'academic_year': {
                'id': str(year.id),
                'name': year.name,
                'status': year.status
            },
            'total_active_students': school_total,
            'class_levels': result_levels
        }


class StudentImportService:
    """
    Handles CSV and Excel (.xlsx) file parsing, row-level validation, duplicate detection,
    staged preview, and atomic execution.
    """
    REQUIRED_COLUMNS = [
        'first_name',
        'last_name',
        'primary_contact_name',
        'primary_contact_phone',
        'class_group'
    ]

    @classmethod
    def generate_csv_template(cls) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'first_name',
            'middle_name',
            'last_name',
            'index_number',
            'date_of_birth',
            'gender',
            'primary_contact_name',
            'primary_contact_relationship',
            'primary_contact_phone',
            'primary_contact_email',
            'class_group'
        ])
        writer.writerow([
            'Kwame',
            'Kofi',
            'Mensah',
            'IDX-2026-001',
            '2014-05-12',
            'Male',
            'Grace Mensah',
            'Mother',
            '+233241234567',
            'grace.mensah@example.com',
            'Basic 4A'
        ])
        return output.getvalue()

    @classmethod
    def preview_import_csv(cls, school: School, file_content: str, file_name: str,
                           academic_year_id=None, actor=None) -> StudentImportBatch:
        """
        Parses CSV string, validates each row against school catalog, stages preview batch.
        """
        if academic_year_id:
            year = AcademicYear.objects.filter(school=school, id=academic_year_id).first()
        else:
            year = AcademicYear.objects.filter(school=school, status='ACTIVE').first()

        reader = csv.DictReader(io.StringIO(file_content))
        # Normalize column header keys
        if not reader.fieldnames:
            raise ValidationError("The uploaded CSV file is empty or missing headers.")

        headers_normalized = [h.strip().lower() for h in reader.fieldnames]
        for req in cls.REQUIRED_COLUMNS:
            if req not in headers_normalized:
                raise ValidationError(f"Missing required CSV column header: '{req}'")

        # Map available class groups in school for instant lookup (whitespace and hyphen normalized)
        def norm_key(text):
            return re.sub(r'[\s\-_]+', '', (text or '').upper())

        all_groups = {}
        for g in ClassGroup.objects.filter(school=school):
            all_groups[norm_key(g.display_name)] = g
            all_groups[norm_key(f"{g.class_level.name}{g.stream_name}")] = g

        rows_preview = []
        valid_count = 0
        invalid_count = 0
        duplicate_count = 0

        for row_idx, raw_row in enumerate(reader, start=1):
            row = {k.strip().lower(): (v.strip() if v else '') for k, v in raw_row.items() if k}
            first_name = row.get('first_name', '')
            last_name = row.get('last_name', '')
            class_group_name = row.get('class_group', '')
            contact_name = row.get('primary_contact_name', '')
            contact_phone = row.get('primary_contact_phone', '')

            errors = []
            warnings = []

            if not first_name:
                errors.append("First name is required.")
            if not last_name:
                errors.append("Last name is required.")
            if not contact_name:
                errors.append("Primary contact name is required.")
            if not contact_phone:
                errors.append("Primary contact phone is required.")

            class_group_obj = all_groups.get(norm_key(class_group_name))
            if not class_group_obj:
                errors.append(f"Class group '{class_group_name}' does not exist in school. Configure classes first.")

            # Parse DOB if present
            dob_val = row.get('date_of_birth', '')
            parsed_dob = None
            if dob_val:
                try:
                    parsed_dob = datetime.strptime(dob_val, '%Y-%m-%d').date()
                except ValueError:
                    try:
                        parsed_dob = datetime.strptime(dob_val, '%d/%m/%Y').date()
                    except ValueError:
                        errors.append(f"Invalid date of birth format '{dob_val}'. Use YYYY-MM-DD.")

            # Check duplicates if row is otherwise valid
            if not errors:
                dups = DuplicateDetectionService.check_duplicates(
                    school=school,
                    first_name=first_name,
                    last_name=last_name,
                    index_number=row.get('index_number') or None,
                    phone_primary=contact_phone,
                    date_of_birth=parsed_dob
                )
                if dups:
                    warnings.append(f"Possible duplicate match: {dups[0]['full_name']} ({dups[0]['admission_number']})")
                    duplicate_count += 1

            row_status = 'INVALID' if errors else ('WARNING_DUPLICATE' if warnings else 'VALID')
            if row_status == 'VALID':
                valid_count += 1
            elif row_status == 'INVALID':
                invalid_count += 1

            rows_preview.append({
                'row_index': row_idx,
                'first_name': first_name,
                'middle_name': row.get('middle_name', ''),
                'last_name': last_name,
                'index_number': row.get('index_number', ''),
                'date_of_birth': str(parsed_dob) if parsed_dob else '',
                'gender': row.get('gender', '').upper() or 'OTHER',
                'primary_contact_name': contact_name,
                'primary_contact_relationship': row.get('primary_contact_relationship', 'GUARDIAN').upper() or 'GUARDIAN',
                'primary_contact_phone': contact_phone,
                'primary_contact_email': row.get('primary_contact_email', ''),
                'class_group_name': class_group_name,
                'status': row_status,
                'errors': errors,
                'warnings': warnings
            })

        batch = StudentImportBatch.objects.create(
            school=school,
            uploaded_by=actor,
            file_name=file_name,
            academic_year=year,
            status='STAGED',
            total_rows=len(rows_preview),
            valid_rows=valid_count,
            invalid_rows=invalid_count,
            duplicate_rows=duplicate_count,
            preview_data=rows_preview
        )
        return batch

    @classmethod
    @transaction.atomic
    def execute_import_batch(cls, school: School, batch_id, actor=None) -> dict:
        batch = StudentImportBatch.objects.filter(school=school, id=batch_id).first()
        if not batch:
            raise NotFound("Import batch not found.")

        if batch.status == 'PROCESSED':
            raise ValidationError("This batch has already been processed.")

        def norm_key(text):
            return re.sub(r'[\s\-_]+', '', (text or '').upper())

        all_groups = {}
        for g in ClassGroup.objects.filter(school=school):
            all_groups[norm_key(g.display_name)] = g
            all_groups[norm_key(f"{g.class_level.name}{g.stream_name}")] = g

        year = batch.academic_year or AcademicYear.objects.filter(school=school, status='ACTIVE').first()

        created_count = 0
        skipped_count = 0

        for row in batch.preview_data:
            if row.get('status') == 'INVALID':
                skipped_count += 1
                continue

            class_group = all_groups.get(norm_key(row.get('class_group_name', '')))
            if not class_group:
                skipped_count += 1
                continue

            dob = None
            if row.get('date_of_birth'):
                try:
                    dob = datetime.strptime(row['date_of_birth'], '%Y-%m-%d').date()
                except ValueError:
                    dob = None

            student_data = {
                'first_name': row.get('first_name'),
                'middle_name': row.get('middle_name') or None,
                'last_name': row.get('last_name'),
                'index_number': row.get('index_number') or None,
                'date_of_birth': dob,
                'gender': row.get('gender') if row.get('gender') in ['MALE', 'FEMALE', 'OTHER'] else 'OTHER',
            }

            contact_data = {
                'name': row.get('primary_contact_name'),
                'relationship': row.get('primary_contact_relationship', 'GUARDIAN'),
                'phone_primary': row.get('primary_contact_phone'),
                'email': row.get('primary_contact_email') or None,
            }

            StudentService.register_student(
                school=school,
                student_data=student_data,
                primary_contact_data=contact_data,
                class_group=class_group,
                academic_year=year,
                actor=actor,
                force_create=True
            )
            created_count += 1

        batch.status = 'PROCESSED'
        batch.created_students_count = created_count
        batch.completed_at = timezone.now()
        batch.save()

        SecurityAuditEvent.log(
            action='STUDENT_BATCH_IMPORT_EXECUTED',
            actor=actor,
            metadata={
                'school_id': str(school.id),
                'batch_id': str(batch.id),
                'created_count': created_count,
                'skipped_count': skipped_count
            }
        )

        return {
            'batch_id': str(batch.id),
            'status': batch.status,
            'total_rows': batch.total_rows,
            'created_students_count': created_count,
            'skipped_count': skipped_count
        }
