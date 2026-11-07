"""
Authentication and Token Management Service for Eduflow SaaS.
Implements:
1. Two-tier token family tracking via AuthSession and RefreshTokenLedgerEntry.
2. Verified cryptographic claims extraction.
3. Durable database-backed refresh idempotency via AES-256-GCM.
4. Token replay detection and immediate session-family revocation.
"""

import hashlib
import secrets
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from django.core.cache import cache
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from rest_framework.exceptions import ValidationError
from authentication.models import User, AuthSession, RefreshTokenLedgerEntry, PasswordResetToken
from tenants.models import OutboxEmail
from core.crypto import encrypt_payload, decrypt_payload
from audit.models import SecurityAuditEvent


class AuthTokenService:
    @classmethod
    def create_session_and_tokens(cls, user, request=None):
        """
        Creates a new AuthSession and issues initial access and refresh tokens.
        """
        ip_address = None
        user_agent = ''
        if request:
            ip_address = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT', '')

        # 14-day absolute session lifetime
        session_expires_at = timezone.now() + timedelta(days=14)

        session = AuthSession.objects.create(
            user=user,
            status='ACTIVE',
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=session_expires_at
        )

        refresh = RefreshToken.for_user(user)
        refresh['sid'] = str(session.id)
        refresh['ver'] = user.token_version

        # Embed sid and ver in access token
        access = refresh.access_token
        access['sid'] = str(session.id)
        access['ver'] = user.token_version

        jti = refresh['jti']
        jti_hash = hashlib.sha256(jti.encode('utf-8')).hexdigest()

        RefreshTokenLedgerEntry.objects.create(
            session=session,
            token_jti_hash=jti_hash,
            status='ISSUED',
            expires_at=timezone.now() + settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
        )

        # Cache session status in Redis/memory
        cache.set(f"session:{session.id}:status", 'ACTIVE', timeout=60)

        return {
            'access': str(access),
            'refresh': str(refresh),
            'session_id': str(session.id),
        }

    @classmethod
    def rotate_refresh_token(cls, raw_refresh_token: str, idempotency_key: str = None, request=None):
        """
        Rotates a refresh token with strict cryptographic verification,
        database-backed idempotency retry recovery, and replay theft revocation.
        """
        # Step 1: Cryptographic verification of signature and standard claims
        try:
            untyped_token = UntypedToken(raw_refresh_token)
        except Exception as e:
            raise InvalidToken(f"Invalid refresh token: {str(e)}")

        token_type = untyped_token.get('token_type')
        if token_type != 'refresh':
            raise InvalidToken("Token is not a refresh token.")

        jti = untyped_token.get('jti')
        user_id = untyped_token.get(settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id'))
        session_id = untyped_token.get('sid')
        token_ver = untyped_token.get('ver')

        if not all([jti, user_id, session_id]):
            raise InvalidToken("Token missing required identity claims.")

        jti_hash = hashlib.sha256(jti.encode('utf-8')).hexdigest()
        idemp_hash = hashlib.sha256(idempotency_key.encode('utf-8')).hexdigest() if idempotency_key else None

        replay_detected = False
        retry_payload = None
        new_token_payload = None

        with transaction.atomic():
            # Step 2: Pessimistically lock parent AuthSession first
            try:
                session = AuthSession.objects.select_for_update().get(id=session_id)
            except AuthSession.DoesNotExist:
                raise AuthenticationFailed("Associated session does not exist.", code='session_not_found')

            if session.status != 'ACTIVE':
                raise AuthenticationFailed("Session is no longer active.", code='session_inactive')

            if timezone.now() > session.expires_at:
                session.status = 'EXPIRED'
                session.save(update_fields=['status'])
                raise AuthenticationFailed("Session has reached absolute expiration.", code='session_expired')

            # Step 3: Pessimistically lock the specific ledger entry
            try:
                entry = RefreshTokenLedgerEntry.objects.select_for_update().get(
                    session=session,
                    token_jti_hash=jti_hash
                )
            except RefreshTokenLedgerEntry.DoesNotExist:
                raise InvalidToken("Token record not found in session ledger.")

            # Step 4: Ledger evaluation
            if entry.status == 'ISSUED':
                user = session.user
                if not user.is_active:
                    raise AuthenticationFailed("User account is inactive.", code='user_inactive')

                if token_ver is not None and token_ver != user.token_version:
                    raise AuthenticationFailed("Credentials have changed globally.", code='token_outdated')

                # Generate replacement token pair
                new_refresh = RefreshToken.for_user(user)
                new_refresh['sid'] = str(session.id)
                new_refresh['ver'] = user.token_version

                new_access = new_refresh.access_token
                new_access['sid'] = str(session.id)
                new_access['ver'] = user.token_version

                new_jti_hash = hashlib.sha256(new_refresh['jti'].encode('utf-8')).hexdigest()

                replacement_payload = {
                    'access': str(new_access),
                    'refresh': str(new_refresh),
                    'session_id': str(session.id)
                }
                encrypted_payload = encrypt_payload(replacement_payload)

                # Create child entry
                child_entry = RefreshTokenLedgerEntry.objects.create(
                    session=session,
                    token_jti_hash=new_jti_hash,
                    status='ISSUED',
                    expires_at=timezone.now() + settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
                )

                # Transition current entry to ROTATED
                entry.status = 'ROTATED'
                entry.rotated_at = timezone.now()
                entry.idempotency_key_hash = idemp_hash
                entry.encrypted_replacement_tokens = encrypted_payload
                entry.replaced_by = child_entry
                entry.save()

                # Blacklist old token in SimpleJWT
                try:
                    outstanding = OutstandingToken.objects.filter(jti=jti).first()
                    if outstanding:
                        BlacklistedToken.objects.get_or_create(token=outstanding)
                except Exception:
                    pass

                session.last_activity_at = timezone.now()
                session.save(update_fields=['last_activity_at'])
                new_token_payload = replacement_payload

            elif entry.status == 'ROTATED':
                is_valid_retry = (
                    idemp_hash is not None and
                    entry.idempotency_key_hash == idemp_hash and
                    entry.replaced_by is not None and
                    entry.replaced_by.status == 'ISSUED' and
                    entry.rotated_at is not None and
                    (timezone.now() - entry.rotated_at) <= timedelta(seconds=60)
                )

                if is_valid_retry:
                    retry_payload = decrypt_payload(entry.encrypted_replacement_tokens)
                else:
                    # REPLAY ATTACK: Mark replayed and revoke session immediately
                    entry.status = 'REPLAYED'
                    entry.save(update_fields=['status'])

                    session.status = 'REVOKED'
                    session.revocation_reason = 'REPLAY_ATTACK_DETECTED'
                    session.save(update_fields=['status', 'revocation_reason'])
                    cache.delete(f"session:{session.id}:status")
                    replay_detected = True
            else:
                raise AuthenticationFailed("Presented token has been revoked.", code='token_revoked')

        # Raised outside atomic transaction so the revocation remains committed in DB!
        if replay_detected:
            SecurityAuditEvent.log(
                action='TOKEN_REPLAY_ATTACK_DETECTED',
                actor=session.user,
                target_type='AuthSession',
                target_id=session.id,
                metadata={'replayed_jti_hash': jti_hash}
            )
            raise AuthenticationFailed(
                "Token reuse detected. All sessions in this token family have been permanently revoked.",
                code='token_reuse_detected'
            )

        if retry_payload:
            return retry_payload

        return new_token_payload

    @classmethod
    def revoke_session(cls, session_id, reason='USER_LOGOUT', actor=None):
        """
        Revokes an entire AuthSession, immediately affecting all child tokens.
        """
        with transaction.atomic():
            try:
                session = AuthSession.objects.select_for_update().get(id=session_id)
            except AuthSession.DoesNotExist:
                return False

            session.status = 'REVOKED'
            session.revocation_reason = reason
            session.save(update_fields=['status', 'revocation_reason'])

            session.ledger_entries.filter(status='ISSUED').update(status='REVOKED')
            cache.delete(f"session:{session.id}:status")

            SecurityAuditEvent.log(
                action='AUTH_SESSION_REVOKED',
                actor=actor or session.user,
                target_type='AuthSession',
                target_id=session.id,
                metadata={'reason': reason}
            )
            return True

    @classmethod
    def request_password_reset(cls, email: str, request=None):
        """
        Initiates secure account recovery.
        Emits single-use cryptographically hashed token and enqueues encrypted outbox notification.
        Uses anti-enumeration (returns True even if user does not exist).
        """
        normalized_email = email.strip().lower()
        ip_address = request.META.get('REMOTE_ADDR') if request else None
        raw_token = None

        with transaction.atomic():
            user = User.objects.filter(email=normalized_email, is_active=True).first()
            if user:
                # Invalidate any prior unused tokens
                PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)

                raw_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
                expires_at = timezone.now() + timedelta(hours=1)

                PasswordResetToken.objects.create(
                    user=user,
                    token_hash=token_hash,
                    is_used=False,
                    expires_at=expires_at
                )

                payload = {
                    'token': raw_token,
                    'email': user.email,
                    'reset_url': f"/reset-password?token={raw_token}",
                    'expires_at': expires_at.isoformat()
                }
                OutboxEmail.objects.create(
                    recipient=user.email,
                    email_type='PASSWORD_RESET',
                    encrypted_payload=encrypt_payload(payload),
                    status='PENDING'
                )

                SecurityAuditEvent.log(
                    action='PASSWORD_RESET_REQUESTED',
                    actor=user,
                    target_type='User',
                    target_id=user.id,
                    ip_address=ip_address,
                    metadata={'email': user.email}
                )

        return True, raw_token

    @classmethod
    def confirm_password_reset(cls, raw_token: str, password: str, request=None):
        """
        Confirms account recovery, updates password, increments token_version
        (invalidating already-issued access tokens), and revokes all active sessions.
        """
        if not raw_token:
            raise ValidationError("Password reset token is required.")
        if not password or len(password) < 8:
            raise ValidationError("Password must be at least 8 characters long.")

        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            reset_token = PasswordResetToken.objects.select_for_update().filter(
                token_hash=token_hash
            ).select_related('user').first()

            if not reset_token:
                raise ValidationError("Invalid or unverified password reset token.")
            if reset_token.is_used:
                raise ValidationError("Password reset token has already been used.")
            if reset_token.expires_at < timezone.now():
                raise ValidationError("Password reset token has expired.")

            user = reset_token.user
            user.set_password(password)
            user.token_version += 1
            user.save()

            reset_token.is_used = True
            reset_token.save(update_fields=['is_used'])

            # Revoke all active sessions
            active_sessions = AuthSession.objects.filter(user=user, status='ACTIVE')
            for session in active_sessions:
                session.status = 'REVOKED'
                session.revocation_reason = 'PASSWORD_RESET'
                session.save(update_fields=['status', 'revocation_reason'])
                session.ledger_entries.filter(status='ISSUED').update(status='REVOKED')
                cache.set(f"session:{session.id}:status", 'REVOKED', timeout=60)

            SecurityAuditEvent.log(
                action='PASSWORD_RESET_COMPLETED',
                actor=user,
                target_type='User',
                target_id=user.id,
                ip_address=ip_address,
                metadata={'email': user.email}
            )

        return user

    @classmethod
    def change_password(cls, user, old_password: str, new_password: str, request=None):
        """
        Authenticated password change: verifies old password, updates credentials,
        increments token_version, revokes existing sessions, and issues fresh tokens.
        """
        if not user.check_password(old_password):
            raise ValidationError("Current password is incorrect.")
        if not new_password or len(new_password) < 8:
            raise ValidationError("New password must be at least 8 characters long.")

        ip_address = request.META.get('REMOTE_ADDR') if request else None

        with transaction.atomic():
            user.set_password(new_password)
            user.token_version += 1
            user.save()

            # Revoke prior active sessions
            active_sessions = AuthSession.objects.filter(user=user, status='ACTIVE')
            for session in active_sessions:
                session.status = 'REVOKED'
                session.revocation_reason = 'PASSWORD_CHANGE'
                session.save(update_fields=['status', 'revocation_reason'])
                session.ledger_entries.filter(status='ISSUED').update(status='REVOKED')
                cache.set(f"session:{session.id}:status", 'REVOKED', timeout=60)

            SecurityAuditEvent.log(
                action='PASSWORD_CHANGED',
                actor=user,
                target_type='User',
                target_id=user.id,
                ip_address=ip_address,
                metadata={'email': user.email}
            )

        # Issue fresh session and tokens for caller
        tokens = cls.create_session_and_tokens(user, request=request)
        return tokens

