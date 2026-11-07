"""
URL configuration for eduflowbackend project.
"""

from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView
)
from authentication.views import PlatformOperatorLoginView

urlpatterns = [
    path('admin/', admin.site.urls),

    # OpenAPI 3.0 Schema and Interactive Documentation
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/docs/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/v1/docs/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Domain API routes
    path('api/v1/platform/auth/login/', PlatformOperatorLoginView.as_view(), name='platform-login'),
    path('api/v1/admin/login/', PlatformOperatorLoginView.as_view(), name='admin-login'),
    path('api/v1/', include('core.urls')),
    path('api/v1/auth/', include('authentication.urls')),
    path('api/v1/', include('tenants.urls')),
]
