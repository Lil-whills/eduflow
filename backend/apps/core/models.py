import uuid
from django.db import models


class UUIDModel(models.Model):
    """
    Abstract base model providing an immutable UUIDv4 primary key.
    Eliminates sequential integer predictability and enumeration.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimestampedModel(UUIDModel):
    """
    Abstract base model adding created_at and updated_at tracking.
    """
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
