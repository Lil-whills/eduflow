from django.urls import path
from .views import HealthCheckView, TriggerErrorView

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='api-health-check'),
    path('test-error/', TriggerErrorView.as_view(), name='api-test-error'),
]
