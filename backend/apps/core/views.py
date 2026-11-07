"""
Core system views for Eduflow SaaS API.
"""

from django.db import connection
from django.db.utils import OperationalError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError


class HealthCheckView(APIView):
    """
    Health check endpoint verifying:
    - Service responsiveness
    - Database connectivity (PostgreSQL)
    - Basic API status under /api/v1/health/
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        db_status = "connected"
        try:
            connection.ensure_connection()
        except OperationalError:
            db_status = "disconnected"

        is_healthy = (db_status == "connected")
        status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(
            {
                "success": is_healthy,
                "data": {
                    "status": "healthy" if is_healthy else "degraded",
                    "service": "eduflow-backend",
                    "version": "v1",
                    "database": {
                        "status": db_status,
                        "engine": "postgresql",
                    }
                }
            },
            status=status_code
        )


class TriggerErrorView(APIView):
    """
    Diagnostic view used exclusively in testing to verify standardized error shapes.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        error_type = request.query_params.get("type", "validation")
        if error_type == "validation":
            raise ValidationError({"email": ["A valid email address is required."]})
        raise RuntimeError("Simulated unhandled exception for testing error handling.")
