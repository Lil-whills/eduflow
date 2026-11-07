"""
Custom exception handling for Eduflow SaaS API.
Enforces standardized error responses across all versioned endpoints.
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Standardizes error responses to the shape:
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE",
            "message": "Human-readable summary",
            "details": { ... } or [ ... ]
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_code = exc.__class__.__name__

        # Map common DRF exceptions to friendly error codes
        code_mapping = {
            'ValidationError': 'VALIDATION_ERROR',
            'AuthenticationFailed': 'AUTHENTICATION_FAILED',
            'NotAuthenticated': 'NOT_AUTHENTICATED',
            'PermissionDenied': 'PERMISSION_DENIED',
            'NotFound': 'RESOURCE_NOT_FOUND',
            'MethodNotAllowed': 'METHOD_NOT_ALLOWED',
            'Throttled': 'REQUEST_THROTTLED',
            'UnsupportedMediaType': 'UNSUPPORTED_MEDIA_TYPE',
        }
        code = code_mapping.get(error_code, error_code.upper())

        # Determine readable message and detail payload
        if isinstance(response.data, dict):
            detail_msg = response.data.get('detail', 'A request validation or execution error occurred.')
            details = {k: v for k, v in response.data.items() if k != 'detail'} if 'detail' in response.data else response.data
        elif isinstance(response.data, list):
            detail_msg = response.data[0] if response.data else 'An error occurred.'
            details = response.data
        else:
            detail_msg = str(response.data)
            details = None

        response.data = {
            'success': False,
            'error': {
                'code': code,
                'message': str(detail_msg),
                'details': details if details else None
            }
        }
    else:
        # Unhandled 500 server error - never leak stack trace in production (Confidentiality)
        logger.exception("Unhandled server error: %s", exc)
        response = Response(
            {
                'success': False,
                'error': {
                    'code': 'INTERNAL_SERVER_ERROR',
                    'message': 'An unexpected error occurred on the server.',
                    'details': None
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return response

