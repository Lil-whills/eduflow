import uuid
from django.db import models
from django.conf import settings
from django.core.exceptions import PermissionDenied
from core.models import UUIDModel


class SecurityAuditEvent(UUIDModel):
    """
    Immutable audit log capturing critical security and tenant operations.
    Enforces append-only semantics at both ORM and application layers.
    """
    school = models.ForeignKey(
        'tenants.School',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_events'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_actions'
    )
    action = models.CharField(max_length=100, db_index=True)
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.UUIDField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if self._state.adding is False:
            raise PermissionDenied("Security audit records are strictly immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied("Security audit records cannot be deleted.")

    @classmethod
    def log(cls, action, actor=None, school=None, target_type='', target_id=None, ip_address=None, metadata=None):
        return cls.objects.create(
            action=action,
            actor=actor,
            school=school,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            metadata=metadata or {}
        )

