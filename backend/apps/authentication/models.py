import uuid
from django.db import models
from django.db.models.functions import Lower
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.conf import settings


class CustomUserManager(BaseUserManager):
    """
    Custom user manager where email is the unique identifier for authentication.
    """
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set.")
        email = self.normalize_email(email).strip().lower()
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_platform_operator', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get('is_superuser') is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Custom user model using UUID primary key and email as unique identifier.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True, db_index=True)
    is_platform_operator = models.BooleanField(
        default=False,
        help_text="Designates platform-level administrative privileges (independent of school roles)."
    )
    token_version = models.PositiveIntegerField(
        default=1,
        help_text="Monotonically increasing counter for global credential/session invalidation."
    )

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'
        constraints = [
            models.UniqueConstraint(
                Lower('email'),
                name='unique_user_email_case_insensitive'
            )
        ]

    def __str__(self):
        return self.email


class AuthSession(models.Model):
    """
    Represents an authenticated session family.
    Controls multi-device session tracking, absolute expiry, and family-level revocation.
    """
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('REVOKED', 'Revoked'),
        ('EXPIRED', 'Expired'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='auth_sessions'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE', db_index=True)
    revocation_reason = models.CharField(max_length=100, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Session {self.id} ({self.user.email}) - {self.status}"


class RefreshTokenLedgerEntry(models.Model):
    """
    Immutable ledger of every refresh token issued within an AuthSession.
    Enforces replay-theft detection and durable database-backed idempotency recovery.
    """
    STATUS_CHOICES = [
        ('ISSUED', 'Issued'),
        ('ROTATED', 'Rotated'),
        ('REPLAYED', 'Replayed'),
        ('REVOKED', 'Revoked'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        AuthSession,
        on_delete=models.CASCADE,
        related_name='ledger_entries'
    )
    token_jti_hash = models.CharField(max_length=64, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ISSUED', db_index=True)
    idempotency_key_hash = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    encrypted_replacement_tokens = models.TextField(null=True, blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    rotated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    replaced_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replaces'
    )

    class Meta:
        ordering = ['-issued_at']

    def __str__(self):
        return f"LedgerEntry {self.token_jti_hash[:10]}... ({self.status})"


class PasswordResetToken(models.Model):
    """
    Single-use cryptographically hashed token for secure account recovery.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='password_reset_tokens'
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"PasswordResetToken for {self.user.email} (Used: {self.is_used})"


