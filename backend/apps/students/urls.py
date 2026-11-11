from django.urls import path
from .views import (
    StudentListCreateView,
    StudentDetailView,
    StudentMergeView,
    DuplicateReviewListView,
    DuplicateReviewResolveView,
    StudentReportSummaryView,
    StudentImportTemplateView,
    StudentImportPreviewView,
    StudentImportConfirmView,
    StudentEnrollmentWithdrawView
)

urlpatterns = [
    # Student directory, search, registration
    path('schools/<uuid:school_id>/students/', StudentListCreateView.as_view(), name='student_list_create'),
    path('schools/<uuid:school_id>/students/merge/', StudentMergeView.as_view(), name='student_merge'),
    path('schools/<uuid:school_id>/students/duplicate-reviews/', DuplicateReviewListView.as_view(), name='duplicate_review_list'),
    path('schools/<uuid:school_id>/students/duplicate-reviews/<uuid:review_id>/resolve/', DuplicateReviewResolveView.as_view(), name='duplicate_review_resolve'),
    
    # Reports & Class summaries
    path('schools/<uuid:school_id>/students/reports/class-summary/', StudentReportSummaryView.as_view(), name='student_class_summary_report'),
    
    # CSV / Excel Bulk Import
    path('schools/<uuid:school_id>/students/import-template/', StudentImportTemplateView.as_view(), name='student_import_template'),
    path('schools/<uuid:school_id>/students/import-preview/', StudentImportPreviewView.as_view(), name='student_import_preview'),
    path('schools/<uuid:school_id>/students/import-batches/<uuid:batch_id>/confirm/', StudentImportConfirmView.as_view(), name='student_import_confirm'),
    
    # Detail & Enrollments
    path('schools/<uuid:school_id>/students/<uuid:student_id>/', StudentDetailView.as_view(), name='student_detail'),
    path('schools/<uuid:school_id>/enrollments/<uuid:enrollment_id>/withdraw/', StudentEnrollmentWithdrawView.as_view(), name='student_enrollment_withdraw'),
]

