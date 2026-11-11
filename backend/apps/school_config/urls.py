from django.urls import path
from school_config.views import (
    SchoolProfileView,
    AcademicYearListCreateView,
    AcademicYearDetailView,
    AcademicYearActivateView,
    AcademicYearCompleteView,
    AcademicTermCreateView,
    AcademicTermDetailView,
    ClassLevelListCreateView,
    ClassLevelDetailView,
    ClassGroupListCreateView,
    ClassGroupDetailView,
    SubjectListCreateView,
    SubjectDetailView,
    ClassSubjectListCreateView,
    ClassSubjectDetailView,
    SchoolStaffListView,
    StaffDismissView,
    ProprietorAdminReassignView,
    SchoolMemberRolesUpdateView,
    ClassTeacherAssignmentView,
    ClassTeacherAssignmentEndView,
    SubjectTeacherAssignmentView,
    SubjectTeacherAssignmentEndView,
)

urlpatterns = [
    # 1. School Profile
    path('schools/<uuid:school_id>/profile/', SchoolProfileView.as_view(), name='school-profile'),

    # 2. Academic Calendar
    path('schools/<uuid:school_id>/academic-years/', AcademicYearListCreateView.as_view(), name='academic-year-list-create'),
    path('schools/<uuid:school_id>/academic-years/<uuid:year_id>/', AcademicYearDetailView.as_view(), name='academic-year-detail'),
    path('schools/<uuid:school_id>/academic-years/<uuid:year_id>/activate/', AcademicYearActivateView.as_view(), name='academic-year-activate'),
    path('schools/<uuid:school_id>/academic-years/<uuid:year_id>/complete/', AcademicYearCompleteView.as_view(), name='academic-year-complete'),
    path('schools/<uuid:school_id>/academic-years/<uuid:year_id>/terms/', AcademicTermCreateView.as_view(), name='academic-term-create'),
    path('schools/<uuid:school_id>/academic-years/<uuid:year_id>/terms/<uuid:term_id>/', AcademicTermDetailView.as_view(), name='academic-term-detail'),

    # 3. Classes & Streams
    path('schools/<uuid:school_id>/class-levels/', ClassLevelListCreateView.as_view(), name='class-level-list-create'),
    path('schools/<uuid:school_id>/class-levels/<uuid:level_id>/', ClassLevelDetailView.as_view(), name='class-level-detail'),
    path('schools/<uuid:school_id>/class-groups/', ClassGroupListCreateView.as_view(), name='class-group-list-create'),
    path('schools/<uuid:school_id>/class-groups/<uuid:group_id>/', ClassGroupDetailView.as_view(), name='class-group-detail'),

    # 4. Subjects & Availability
    path('schools/<uuid:school_id>/subjects/', SubjectListCreateView.as_view(), name='subject-list-create'),
    path('schools/<uuid:school_id>/subjects/<uuid:subject_id>/', SubjectDetailView.as_view(), name='subject-detail'),
    path('schools/<uuid:school_id>/class-subjects/', ClassSubjectListCreateView.as_view(), name='class-subject-list-create'),
    path('schools/<uuid:school_id>/class-subjects/<uuid:mapping_id>/', ClassSubjectDetailView.as_view(), name='class-subject-detail'),

    # 5. Staff Governance & Dismissal
    path('schools/<uuid:school_id>/staff/', SchoolStaffListView.as_view(), name='school-staff-list'),
    path('schools/<uuid:school_id>/staff/<uuid:membership_id>/dismiss/', StaffDismissView.as_view(), name='staff-dismiss'),
    path('schools/<uuid:school_id>/staff/<uuid:membership_id>/roles/', SchoolMemberRolesUpdateView.as_view(), name='staff-roles-update'),
    path('schools/<uuid:school_id>/governance/reassign-admin/', ProprietorAdminReassignView.as_view(), name='proprietor-reassign-admin'),

    # 6. Teaching Assignments
    path('schools/<uuid:school_id>/teaching-assignments/class-teachers/', ClassTeacherAssignmentView.as_view(), name='class-teacher-assignment-list-create'),
    path('schools/<uuid:school_id>/teaching-assignments/class-teachers/<uuid:assignment_id>/end/', ClassTeacherAssignmentEndView.as_view(), name='class-teacher-assignment-end'),
    path('schools/<uuid:school_id>/teaching-assignments/subject-teachers/', SubjectTeacherAssignmentView.as_view(), name='subject-teacher-assignment-list-create'),
    path('schools/<uuid:school_id>/teaching-assignments/subject-teachers/<uuid:assignment_id>/end/', SubjectTeacherAssignmentEndView.as_view(), name='subject-teacher-assignment-end'),
]
