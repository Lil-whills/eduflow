"""
Backend Foundation Tests for Eduflow (Feature 0).
Tests health check endpoint, database connectivity, and standardized error handling.
"""

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.db import connection


class Feature0FoundationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_database_connection(self):
        """Verify that the PostgreSQL database connection is operational."""
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            row = cursor.fetchone()
            self.assertEqual(row[0], 1)

    def test_health_check_endpoint(self):
        """Verify the versioned /api/v1/health/ endpoint returns healthy status and DB info."""
        url = reverse('api-health-check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('data', {}).get('status'), 'healthy')
        self.assertEqual(data.get('data', {}).get('version'), 'v1')
        self.assertEqual(data.get('data', {}).get('database', {}).get('status'), 'connected')
        self.assertEqual(data.get('data', {}).get('database', {}).get('engine'), 'postgresql')

    def test_standardized_validation_error_shape(self):
        """Verify that validation errors conform to the standardized error structure."""
        url = reverse('api-test-error') + '?type=validation'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        data = response.json()
        self.assertFalse(data.get('success'))
        self.assertIn('error', data)
        self.assertEqual(data['error']['code'], 'VALIDATION_ERROR')
        self.assertIsNotNone(data['error']['details'])

    def test_standardized_500_error_shape(self):
        """Verify unhandled exceptions return sanitized 500 responses without leaking internals."""
        url = reverse('api-test-error') + '?type=unhandled'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        data = response.json()
        self.assertFalse(data.get('success'))
        self.assertIn('error', data)
        self.assertEqual(data['error']['code'], 'INTERNAL_SERVER_ERROR')
        self.assertEqual(data['error']['message'], 'An unexpected error occurred on the server.')
        self.assertIsNone(data['error']['details'])
