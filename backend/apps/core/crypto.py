"""
Cryptographic utility module using AES-256-GCM.
Used for encrypting sensitive outbox emails and refresh token idempotency backups.
"""

import os
import json
import base64
from django.conf import settings
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_aesgcm_instance():
    key_b64 = getattr(settings, 'EDUFLOW_ENCRYPTION_KEY', None)
    if not key_b64:
        raise ValueError("EDUFLOW_ENCRYPTION_KEY is not configured in settings.")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise ValueError("EDUFLOW_ENCRYPTION_KEY must be exactly 32 bytes (256 bits).")
    return AESGCM(key)


def encrypt_payload(data) -> str:
    """
    Encrypts a string or JSON-serializable dictionary with AES-256-GCM.
    Returns: base64(nonce_12bytes + ciphertext_with_tag)
    """
    if isinstance(data, (dict, list)):
        payload_bytes = json.dumps(data).encode('utf-8')
    elif isinstance(data, str):
        payload_bytes = data.encode('utf-8')
    else:
        payload_bytes = bytes(data)

    aesgcm = _get_aesgcm_instance()
    nonce = os.urandom(12)  # 96-bit nonce
    ciphertext = aesgcm.encrypt(nonce, payload_bytes, associated_data=None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode('utf-8')


def decrypt_payload(encrypted_b64: str):
    """
    Decrypts an AES-256-GCM encrypted base64 payload.
    Attempts JSON deserialization if applicable; otherwise returns decoded string.
    """
    if not encrypted_b64:
        return None

    combined = base64.b64decode(encrypted_b64.encode('utf-8'))
    nonce = combined[:12]
    ciphertext = combined[12:]

    aesgcm = _get_aesgcm_instance()
    decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, associated_data=None)
    text = decrypted_bytes.decode('utf-8')

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text

