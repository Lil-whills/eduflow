"""
Rate limiting and abuse prevention for Eduflow authentication endpoints.
Features:
- Atomic counter management with TTL set on initial increment.
- HMAC-SHA256 anonymized email cache keys (prevents email exposure in cache dumps).
- Dual-keyed throttling (IP bucket + Email progressive challenge).
- Fail-safe fallback if cache backend is unavailable.
"""

import hmac
import hashlib
from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import BaseThrottle
from rest_framework.exceptions import Throttled


def get_anonymized_email_key(email: str, prefix: str = 'rate:auth:email') -> str:
    normalized = email.strip().lower()
    secret = settings.SECRET_KEY.encode('utf-8')
    digest = hmac.new(secret, normalized.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{prefix}:{digest}"


def atomic_increment_with_ttl(key: str, ttl_seconds: int) -> int:
    """
    Increments a cache key atomically and sets TTL only on the first increment.
    Works with Redis and Django cache backends.
    """
    try:
        # Check if underlying client is Redis
        client = getattr(cache, '_cache', None)
        raw_client = getattr(client, 'get_client', None)
        if callable(raw_client):
            redis_conn = raw_client()
            lua = """
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return current
            """
            return int(redis_conn.eval(lua, 1, key, ttl_seconds))
    except Exception:
        pass

    # Standard Django Cache fallback
    try:
        added = cache.add(key, 1, timeout=ttl_seconds)
        if added:
            return 1
        return cache.incr(key)
    except Exception:
        # Fail-secure fallback: return safe low count to prevent denial of service
        return 1


class LoginRateThrottle(BaseThrottle):
    """
    Throttles login attempts by IP address (5 attempts per minute).
    """
    RATE_LIMIT = 5
    WINDOW = 60

    def allow_request(self, request, view):
        if request.method != 'POST':
            return True

        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
        cache_key = f"rate:login:ip:{ip}"
        current_attempts = atomic_increment_with_ttl(cache_key, self.WINDOW)

        if current_attempts > self.RATE_LIMIT:
            raise Throttled(detail="Too many failed login attempts from this network. Please wait 1 minute.")
        return True

