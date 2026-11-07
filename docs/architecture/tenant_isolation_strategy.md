# Eduflow — Multi-Tenant Architecture & Data Isolation Strategy

## 1. Overview & Objective
Eduflow is a multi-tenant School Management SaaS platform tailored for basic schools in Ghana. The core architectural decision mandates a **shared PostgreSQL database with explicit school-level logical isolation**.

This document defines how tenant data confidentiality and integrity (CIA principles) are enforced across the platform.

---

## 2. Core Security Principles (CIA Triad)

### 2.1 Backend Authority (No Client Trust)
* **The frontend is never a security boundary**: Hiding UI buttons, masking navigation items, or filtering lists in React does not provide security.
* **Never trust client-submitted tenant identifiers**: Any `school_id`, `tenant_id`, or `school` field submitted via request body, query parameters, route parameters, or headers is treated as untrusted input.
* **Context derivation**: The backend determines the active school context exclusively from the authenticated user's validated `SchoolMembership`.

### 2.2 Logical Tenancy Model
1. **School Tenant**: The root organizational boundary (`School`).
2. **User Identity**: Global credentials (`User`), distinct from any single school membership.
3. **School Membership (`SchoolMembership`)**: Binds a user to exactly one school tenant in the initial release. A user holds one or more explicitly assigned roles within that school.
4. **School-Scoped Records**: Every tenant-owned resource (academic years, classes, streams, subjects, staff assignments, students, enrollments, fees, charges, payments, receipts, attendance, and exam marks) belongs to a school directly via a foreign key `school_id` or indirectly via an authoritative parent entity (e.g. `ClassGroup -> ClassLevel -> School`).

---

## 3. Query Scoping and Enforcement Patterns

### 3.1 Django Model Managers (`TenantManager`)
All tenant-owned models will implement a custom Manager and QuerySet that enforces school filtering by default:
```python
class TenantQuerySet(models.QuerySet):
    def for_school(self, school):
        return self.filter(school=school)

class TenantManager(models.Manager):
    def get_queryset(self):
        return TenantQuerySet(self.model, using=self._db)
    
    def for_school(self, school):
        return self.get_queryset().for_school(school)
```

### 3.2 ViewSet & API QuerySet Scoping
Every protected Django REST Framework view/viewset overrides `get_queryset()`:
```python
def get_queryset(self):
    user = self.request.user
    active_membership = getattr(self.request, 'active_membership', None)
    if not active_membership or not active_membership.is_active:
        return self.model.objects.none()
    return self.model.objects.filter(school=active_membership.school)
```

### 3.3 Relational Consistency & Foreign Key Validation
When creating or updating entities with related foreign keys (e.g. enrolling a student into a class group in an academic year):
* The backend verifies that `student.school == class_group.school == academic_year.school == request.school`.
* Attempting to link a resource from School A to a resource in School B is rejected with a 400 Bad Request / 403 Forbidden.

---

## 4. Role-Based Access Control (RBAC) & Least Privilege
* **Proprietor**: Oversight, subscriptions, high-level reports. No default operational edits.
* **Administrator**: Academic configuration, subjects, classes, staff invitations. **No access to raw daily attendance or individual student marks**.
* **Headmaster**: School-wide operational & academic oversight.
* **Accountant**: Fee configuration, billing runs, payments, receipts, expenses. **No access to academic grades or attendance**.
* **Class Teacher**: Attendance recording, result collation, report card generation for assigned class groups only.
* **Subject Teacher**: Score entry for assigned classes and subjects only.
* **Platform Operator**: Tenant lifecycle and support oversight. **No access to student marks, attendance, or finance**.

---

## 5. Audit Logging (`SecurityAuditEvent`)
Sensitive operations (role assignments, membership suspensions, reversals, corrections, batch finalizations) emit an immutable audit event recording:
* `school_id`
* `actor_user_id`
* `action` (e.g., `PAYMENT_REVERSED`, `ROLE_GRANTED`)
* `target_entity_type` & `target_entity_id`
* `timestamp`
* `reason` and structured diff

