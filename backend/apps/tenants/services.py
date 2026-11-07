"""
Tenants and Workspace Provisioning Services for Eduflow SaaS.
Enforces:
1. Cryptographic tokens (verification & invitation) stored exclusively as SHA-256 hashes.
2. Sensitive notification payloads encrypted via AES-256-GCM in OutboxEmail.
3. Multi-transaction workspace provisioning with worker lease safety.
4. Onboarding state machine: PENDING_ACTIVATION -> ONBOARDING -> ACTIVE.
5. School row locking, self-role modification prevention, and Last-Administrator protection.
"""

import uuid
import secrets
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.utils.text import slugify
from django.db import transaction
from django.conf import settings
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound

from authentication.models import User
from authentication.services import AuthTokenService
from core.crypto import encrypt_payload
from audit.models import SecurityAuditEvent
from .models import (
    School,
    SchoolAccessRequest,
    EmailVerificationToken,
    ProvisioningRecord,
    InvitationToken,
    SchoolMembership,
    Role,
    RoleAssignment,
    OutboxEmail
)


class SchoolRegistrationService:
    @classmethod
    def create_access_request(cls, school_name: str, requester_name: str = '', contact_email: str = '', contact_phone: str = '', requester_user=None, request=None):
        if requester_user and requester_user.is_authenticated:
            email = requester_user.email.strip().lower()
            name = requester_name.strip() if requester_name else (requester_user.get_full_name() or requester_user.email)
        else:
            email = contact_email.strip().lower()
            name = requester_name.strip()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        # Create access request in EMAIL_UNVERIFIED status
        with transaction.atomic():
            access_request = SchoolAccessRequest.objects.create(
                school_name=school_name.strip(),
                requester_user=requester_user if (requester_user and requester_user.is_authenticated) else None,
                requester_name=name,
                contact_email=email,
                contact_phone=contact_phone.strip(),
                status='EMAIL_UNVERIFIED'
            )

            # Generate unpredictable cryptographically secure token
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            expires_at = timezone.now() + timedelta(hours=72)

            EmailVerificationToken.objects.create(
                request=access_request,
                token_hash=token_hash,
                is_used=False,
                expires_at=expires_at
            )

            # Stage encrypted outbox email
            payload = {
                'token': raw_token,
                'school_name': access_request.school_name,
                'requester_name': access_request.requester_name,
                'verification_url': f"/verify-email?token={raw_token}",
                'expires_at': expires_at.isoformat()
            }
            OutboxEmail.objects.create(
                recipient=email,
                email_type='SCHOOL_REQUEST_VERIFICATION',
                encrypted_payload=encrypt_payload(payload),
                status='PENDING'
            )

            SecurityAuditEvent.log(
                action='SCHOOL_ACCESS_REQUEST_SUBMITTED',
                target_type='SchoolAccessRequest',
                target_id=access_request.id,
                ip_address=ip_address,
                metadata={
                    'school_name': access_request.school_name,
                    'contact_email': email
                }
            )

        return access_request, raw_token

    @classmethod
    def verify_email(cls, raw_token: str, request=None):
        if not raw_token:
            raise ValidationError("Verification token is required.")

        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            token_entry = EmailVerificationToken.objects.select_for_update().filter(
                token_hash=token_hash
            ).select_related('request').first()

            if not token_entry:
                raise ValidationError("Invalid verification token.")

            if token_entry.is_used:
                raise ValidationError("Verification token has already been used.")

            if token_entry.expires_at < timezone.now():
                raise ValidationError("Verification token has expired. Please request a new verification link.")

            # Mark token used
            token_entry.is_used = True
            token_entry.save(update_fields=['is_used'])

            access_request = token_entry.request
            if access_request.status == 'EMAIL_UNVERIFIED':
                access_request.status = 'PENDING'
                access_request.save(update_fields=['status'])

            SecurityAuditEvent.log(
                action='SCHOOL_ACCESS_REQUEST_VERIFIED',
                target_type='SchoolAccessRequest',
                target_id=access_request.id,
                ip_address=ip_address,
                metadata={'email': access_request.contact_email}
            )

        return access_request

    @classmethod
    def resend_verification_email(cls, contact_email: str, request=None):
        email = contact_email.strip().lower()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            pending_request = SchoolAccessRequest.objects.filter(
                contact_email=email,
                status='EMAIL_UNVERIFIED'
            ).order_by('-created_at').first()

            # Anti-enumeration: Return generic success even if no unverified request matches
            if not pending_request:
                return True

            # Invalidate all prior unused tokens for this request
            EmailVerificationToken.objects.filter(
                request=pending_request,
                is_used=False
            ).update(is_used=True)

            # Issue fresh token
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            expires_at = timezone.now() + timedelta(hours=72)

            EmailVerificationToken.objects.create(
                request=pending_request,
                token_hash=token_hash,
                is_used=False,
                expires_at=expires_at
            )

            payload = {
                'token': raw_token,
                'school_name': pending_request.school_name,
                'requester_name': pending_request.requester_name,
                'verification_url': f"/verify-email?token={raw_token}",
                'expires_at': expires_at.isoformat()
            }
            OutboxEmail.objects.create(
                recipient=email,
                email_type='SCHOOL_REQUEST_VERIFICATION_RESEND',
                encrypted_payload=encrypt_payload(payload),
                status='PENDING'
            )

            SecurityAuditEvent.log(
                action='VERIFICATION_EMAIL_RESENT',
                target_type='SchoolAccessRequest',
                target_id=pending_request.id,
                ip_address=ip_address,
                metadata={'email': email}
            )

        return True


class ProvisioningService:
    @classmethod
    def generate_unique_slug(cls, name: str) -> str:
        base_slug = slugify(name) or 'school'
        slug = base_slug
        counter = 1
        while School.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    @classmethod
    def approve_and_provision(cls, access_request_id, operator_user, request=None):
        """
        Executes workspace provisioning across three controlled transactions:
        Tx 1: Row lock and lease acquisition (IN_PROGRESS).
        Tx 2: Workspace creation (PENDING_ACTIVATION) + Proprietor setup + encrypted Invitation.
        Tx 3: Fallback error recording (FAILED) if Tx 2 fails.
        """
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        # --- Transaction 1: Lease Acquisition ---
        with transaction.atomic():
            access_req = SchoolAccessRequest.objects.select_for_update().filter(id=access_request_id).first()
            if not access_req:
                raise NotFound("School access request not found.")

            if access_req.status not in ('PENDING', 'UNDER_REVIEW'):
                raise ValidationError(f"Request cannot be approved in its current status: {access_req.status}")

            prov_record, _ = ProvisioningRecord.objects.select_for_update().get_or_create(
                access_request=access_req
            )

            if prov_record.status == 'PROVISIONED':
                raise ValidationError("Workspace has already been provisioned for this request.")

            access_req.status = 'APPROVED'
            access_req.save(update_fields=['status'])

            prov_record.status = 'IN_PROGRESS'
            prov_record.worker_id = uuid.uuid4()
            prov_record.started_at = timezone.now()
            prov_record.attempt_count += 1
            prov_record.error_message = None
            prov_record.save()

        # --- Transaction 2: Workspace Creation ---
        raw_invitation_token = None
        created_school = None
        try:
            with transaction.atomic():
                slug = cls.generate_unique_slug(access_req.school_name)

                # 1. School Tenant
                created_school = School.objects.create(
                    name=access_req.school_name,
                    slug=slug,
                    workspace_status='PENDING_ACTIVATION'
                )

                # 2. Inactive Proprietor User
                email = access_req.contact_email.strip().lower()
                user, _ = User.objects.get_or_create(
                    email=email,
                    defaults={
                        'is_active': False,
                        'first_name': access_req.requester_name.split()[0] if access_req.requester_name else '',
                        'last_name': " ".join(access_req.requester_name.split()[1:]) if len(access_req.requester_name.split()) > 1 else ''
                    }
                )

                # 3. Membership
                membership, _ = SchoolMembership.objects.get_or_create(
                    school=created_school,
                    user=user,
                    defaults={'status': 'ACTIVE'}
                )

                # 4. Role Assignment: PROPRIETOR
                proprietor_role = Role.objects.get(name=Role.PROPRIETOR)
                RoleAssignment.objects.get_or_create(
                    membership=membership,
                    role=proprietor_role,
                    defaults={'is_active': True}
                )

                # 5. Cryptographic Invitation Token
                raw_invitation_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_invitation_token.encode('utf-8')).hexdigest()
                expires_at = timezone.now() + timedelta(days=7)

                InvitationToken.objects.create(
                    school=created_school,
                    email=email,
                    token_hash=token_hash,
                    is_accepted=False,
                    expires_at=expires_at
                )

                # 6. Stage AES-256-GCM Encrypted Outbox Notification
                payload = {
                    'token': raw_invitation_token,
                    'school_name': created_school.name,
                    'recipient_email': email,
                    'invitation_url': f"/accept-invitation?token={raw_invitation_token}",
                    'expires_at': expires_at.isoformat()
                }
                OutboxEmail.objects.create(
                    recipient=email,
                    email_type='PROPRIETOR_INVITATION',
                    encrypted_payload=encrypt_payload(payload),
                    status='PENDING'
                )

                # 7. Update Provisioning Record
                prov_record.status = 'PROVISIONED'
                prov_record.school = created_school
                prov_record.completed_at = timezone.now()
                prov_record.save()

                SecurityAuditEvent.log(
                    action='WORKSPACE_PROVISIONED',
                    actor=operator_user,
                    school=created_school,
                    target_type='School',
                    target_id=created_school.id,
                    ip_address=ip_address,
                    metadata={
                        'request_id': str(access_req.id),
                        'proprietor_email': email,
                        'school_slug': slug
                    }
                )

        except Exception as exc:
            # --- Transaction 3: Failure Recording ---
            with transaction.atomic():
                ProvisioningRecord.objects.filter(access_request=access_req).update(
                    status='FAILED',
                    error_message=str(exc)
                )
            raise exc

        return created_school, raw_invitation_token


class InvitationService:
    @classmethod
    def accept_invitation(cls, raw_token: str, password: str, request=None):
        if not raw_token:
            raise ValidationError("Invitation token is required.")
        if not password or len(password) < 8:
            raise ValidationError("Password must be at least 8 characters long.")

        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            invitation = InvitationToken.objects.select_for_update().filter(
                token_hash=token_hash
            ).select_related('school').first()

            if not invitation:
                raise ValidationError("Invalid invitation token.")

            if invitation.is_accepted:
                raise ValidationError("This invitation token has already been accepted.")

            if invitation.is_superseded:
                raise ValidationError("This invitation has been superseded by a newer invitation.")

            if invitation.expires_at < timezone.now():
                raise ValidationError("This invitation token has expired.")

            user = User.objects.select_for_update().filter(email=invitation.email).first()
            if not user:
                raise ValidationError("Associated user account not found.")

            # Activate user and set password
            user.set_password(password)
            user.is_active = True
            user.token_version += 1
            user.save()

            # Mark token accepted
            invitation.is_accepted = True
            invitation.save(update_fields=['is_accepted'])

            # Transition School from PENDING_ACTIVATION to ONBOARDING
            school = invitation.school
            if school.workspace_status == 'PENDING_ACTIVATION':
                school.workspace_status = 'ONBOARDING'
                school.save(update_fields=['workspace_status'])

            SecurityAuditEvent.log(
                action='INVITATION_ACCEPTED',
                actor=user,
                school=school,
                target_type='InvitationToken',
                target_id=invitation.id,
                ip_address=ip_address,
                metadata={'email': user.email, 'school_name': school.name}
            )

        # Issue access and refresh tokens
        tokens = AuthTokenService.create_session_and_tokens(user, request=request)
        return user, school, tokens


class SchoolRoleService:
    @classmethod
    def assign_initial_admin(cls, school_id, proprietor_user, admin_email: str, admin_name: str = '', request=None):
        """
        School Onboarding: Proprietor assigns or invites the initial Administrator.
        Transitions School from ONBOARDING to ACTIVE.
        """
        email = admin_email.strip().lower()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            school = School.objects.select_for_update().filter(id=school_id).first()
            if not school:
                raise NotFound("School not found.")

            # Verify proprietor permission in this school
            is_proprietor = RoleAssignment.objects.filter(
                membership__school=school,
                membership__user=proprietor_user,
                membership__status='ACTIVE',
                role__name=Role.PROPRIETOR,
                is_active=True
            ).exists()

            if not is_proprietor and not proprietor_user.is_superuser:
                raise PermissionDenied("Only an active Proprietor can complete school onboarding.")

            admin_role = Role.objects.get(name=Role.ADMINISTRATOR)

            if email == proprietor_user.email.lower():
                # Proprietor assigns self as Administrator
                membership = SchoolMembership.objects.get(school=school, user=proprietor_user)
                RoleAssignment.objects.get_or_create(
                    membership=membership,
                    role=admin_role,
                    defaults={'is_active': True}
                )
                admin_user = proprietor_user
            else:
                # Assign/invite separate user as Administrator
                admin_user, _ = User.objects.get_or_create(
                    email=email,
                    defaults={
                        'is_active': False,
                        'first_name': admin_name.split()[0] if admin_name else '',
                        'last_name': " ".join(admin_name.split()[1:]) if len(admin_name.split()) > 1 else ''
                    }
                )
                admin_membership, _ = SchoolMembership.objects.get_or_create(
                    school=school,
                    user=admin_user,
                    defaults={'status': 'ACTIVE'}
                )
                RoleAssignment.objects.get_or_create(
                    membership=admin_membership,
                    role=admin_role,
                    defaults={'is_active': True}
                )

                # If new/inactive user, generate invitation token
                if not admin_user.is_active:
                    raw_token = secrets.token_urlsafe(32)
                    token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
                    expires_at = timezone.now() + timedelta(days=7)
                    InvitationToken.objects.create(
                        school=school,
                        email=email,
                        token_hash=token_hash,
                        is_accepted=False,
                        expires_at=expires_at
                    )
                    payload = {
                        'token': raw_token,
                        'school_name': school.name,
                        'recipient_email': email,
                        'role': Role.ADMINISTRATOR,
                        'invitation_url': f"/accept-invitation?token={raw_token}",
                        'expires_at': expires_at.isoformat()
                    }
                    OutboxEmail.objects.create(
                        recipient=email,
                        email_type='ADMIN_INVITATION',
                        encrypted_payload=encrypt_payload(payload),
                        status='PENDING'
                    )

            # Transition school status to ACTIVE
            school.workspace_status = 'ACTIVE'
            school.save(update_fields=['workspace_status'])

            SecurityAuditEvent.log(
                action='ADMINISTRATOR_ASSIGNED',
                actor=proprietor_user,
                school=school,
                target_type='User',
                target_id=admin_user.id,
                ip_address=ip_address,
                metadata={'admin_email': email, 'workspace_status': 'ACTIVE'}
            )

        return school, admin_user

    @classmethod
    def assign_role(cls, school_id, target_user_id, role_name: str, actor_user, request=None):
        """
        Assigns an operational role to a school member.
        Enforces:
        - School row locking.
        - Prohibition against self-role elevation.
        - Authorization check: Actor must be Proprietor or Administrator.
        """
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        if str(actor_user.id) == str(target_user_id):
            raise PermissionDenied("Self-role modification is strictly prohibited.")

        with transaction.atomic():
            school = School.objects.select_for_update().filter(id=school_id).first()
            if not school:
                raise NotFound("School not found.")

            # Check actor authority in school
            actor_has_perm = RoleAssignment.objects.filter(
                membership__school=school,
                membership__user=actor_user,
                membership__status='ACTIVE',
                role__name__in=[Role.PROPRIETOR, Role.ADMINISTRATOR],
                is_active=True
            ).exists()

            if not actor_has_perm and not actor_user.is_superuser:
                raise PermissionDenied("You do not have permission to manage roles in this school.")

            target_membership = SchoolMembership.objects.filter(
                school=school,
                user_id=target_user_id,
                status='ACTIVE'
            ).first()

            if not target_membership:
                raise NotFound("Target user is not an active member of this school.")

            role = Role.objects.filter(name=role_name).first()
            if not role:
                raise ValidationError(f"Role '{role_name}' does not exist.")

            assignment, created = RoleAssignment.objects.update_or_create(
                membership=target_membership,
                role=role,
                defaults={'is_active': True}
            )

            SecurityAuditEvent.log(
                action='ROLE_ASSIGNED',
                actor=actor_user,
                school=school,
                target_type='RoleAssignment',
                target_id=assignment.id,
                ip_address=ip_address,
                metadata={
                    'target_user_id': str(target_user_id),
                    'role': role_name
                }
            )

        return assignment

    @classmethod
    def remove_role(cls, school_id, target_user_id, role_name: str, actor_user, request=None):
        """
        Removes an operational role from a school member.
        Enforces:
        - School row locking.
        - Prohibition against self-demotion/self-modification.
        - Last-Administrator Protection: Cannot remove Administrator role if only 1 active Administrator remains.
        """
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        if str(actor_user.id) == str(target_user_id):
            raise PermissionDenied("Self-role modification is strictly prohibited.")

        with transaction.atomic():
            school = School.objects.select_for_update().filter(id=school_id).first()
            if not school:
                raise NotFound("School not found.")

            actor_has_perm = RoleAssignment.objects.filter(
                membership__school=school,
                membership__user=actor_user,
                membership__status='ACTIVE',
                role__name__in=[Role.PROPRIETOR, Role.ADMINISTRATOR],
                is_active=True
            ).exists()

            if not actor_has_perm and not actor_user.is_superuser:
                raise PermissionDenied("You do not have permission to manage roles in this school.")

            target_membership = SchoolMembership.objects.filter(
                school=school,
                user_id=target_user_id,
                status='ACTIVE'
            ).first()

            if not target_membership:
                raise NotFound("Target user is not an active member of this school.")

            if role_name == Role.ADMINISTRATOR:
                # Count active administrators in school
                active_admin_count = RoleAssignment.objects.filter(
                    membership__school=school,
                    membership__status='ACTIVE',
                    membership__user__is_active=True,
                    role__name=Role.ADMINISTRATOR,
                    is_active=True
                ).count()

                if active_admin_count <= 1:
                    raise ValidationError("Cannot remove the last active Administrator in the school.")

            assignment = RoleAssignment.objects.filter(
                membership=target_membership,
                role__name=role_name,
                is_active=True
            ).first()

            if not assignment:
                raise NotFound(f"Target member does not have active role '{role_name}'.")

            assignment.is_active = False
            assignment.save(update_fields=['is_active'])

            SecurityAuditEvent.log(
                action='ROLE_REMOVED',
                actor=actor_user,
                school=school,
                target_type='RoleAssignment',
                target_id=assignment.id,
                ip_address=ip_address,
                metadata={
                    'target_user_id': str(target_user_id),
                    'role': role_name
                }
            )

        return True

    @classmethod
    def invite_staff_member(cls, school_id, email: str, role_name: str, actor_user, request=None):
        """
        Invites a new or existing user to the school with a specific operational role.
        Enforces:
        - School row locking.
        - Actor authority: Must be Proprietor or Administrator.
        - Cryptographic single-use invitation token stored as SHA-256 hash.
        - Staged AES-256-GCM encrypted email in OutboxEmail.
        """
        normalized_email = email.strip().lower()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            school = School.objects.select_for_update().filter(id=school_id).first()
            if not school:
                raise NotFound("School not found.")

            actor_has_perm = RoleAssignment.objects.filter(
                membership__school=school,
                membership__user=actor_user,
                membership__status='ACTIVE',
                role__name__in=[Role.PROPRIETOR, Role.ADMINISTRATOR],
                is_active=True
            ).exists()

            if not actor_has_perm and not actor_user.is_superuser:
                raise PermissionDenied("You do not have permission to invite staff to this school.")

            role = Role.objects.filter(name=role_name).first()
            if not role:
                raise ValidationError(f"Role '{role_name}' does not exist.")

            target_user, _ = User.objects.get_or_create(
                email=normalized_email,
                defaults={'is_active': False}
            )

            membership, _ = SchoolMembership.objects.get_or_create(
                school=school,
                user=target_user,
                defaults={'status': 'ACTIVE'}
            )

            RoleAssignment.objects.update_or_create(
                membership=membership,
                role=role,
                defaults={'is_active': True}
            )

            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            expires_at = timezone.now() + timedelta(days=7)

            # Invalidate any prior active invitations for this email & school
            InvitationToken.objects.filter(school=school, email=normalized_email, is_accepted=False).update(is_superseded=True)

            InvitationToken.objects.create(
                school=school,
                email=normalized_email,
                token_hash=token_hash,
                is_accepted=False,
                expires_at=expires_at
            )

            payload = {
                'token': raw_token,
                'school_name': school.name,
                'recipient_email': normalized_email,
                'role': role_name,
                'invitation_url': f"/accept-invitation?token={raw_token}",
                'expires_at': expires_at.isoformat()
            }
            OutboxEmail.objects.create(
                recipient=normalized_email,
                email_type='STAFF_INVITATION',
                encrypted_payload=encrypt_payload(payload),
                status='PENDING'
            )

            SecurityAuditEvent.log(
                action='STAFF_INVITATION_SENT',
                actor=actor_user,
                school=school,
                target_type='InvitationToken',
                ip_address=ip_address,
                metadata={
                    'invited_email': normalized_email,
                    'role': role_name
                }
            )

        return target_user, raw_token


