# Eduflow — Cross-School Security & Boundary Testing Strategy

## 1. Objective
Tenant isolation is non-negotiable. As mandated by the Eduflow Architecture Decision Record (Feature 0 ADR):
> *"Multi-school isolation must be tested explicitly. The tests must attempt to access another school's records through direct API requests, manipulated identifiers, filters, and other applicable access paths. Hiding a button in React does not count as an authorization test."*

This document defines the automated security testing matrix that every feature slice must pass.

---

## 2. Test Environment Setup
Security regression suites create a controlled two-tenant test harness:
* **Tenant Alpha (`School A`)**:
  * Administrator: `admin_a@school-a.org`
  * Accountant: `accountant_a@school-a.org`
  * Teacher: `teacher_a@school-a.org`
  * Sample Records: `ClassLevel A1`, `Student A1`, `Charge A1`
* **Tenant Beta (`School B`)**:
  * Administrator: `admin_b@school-b.org`
  * Sample Records: `ClassLevel B1`, `Student B1`, `Charge B1`

---

## 3. Negative Security Test Cases (Must Fail / Return 403 or 404)

### 3.1 Direct ID Tampering (Insecure Direct Object Reference - IDOR)
1. **Resource Fetching**: Authenticated User of School A requests `GET /api/v1/.../{id}/` where `{id}` belongs to School B.
   * *Expected Outcome*: Returns HTTP 404 Not Found (preferred to avoid leaking existence of foreign IDs) or HTTP 403 Forbidden.
2. **Resource Mutation**: User of School A issues `PATCH` or `PUT` or `DELETE` with `{id}` belonging to School B.
   * *Expected Outcome*: Denied with 404 or 403; database state unchanged.

### 3.2 Payload School ID Manipulation
1. **Creation Spoofing**: User of School A sends `POST /api/v1/students/` with `"school": "<School B UUID>"`.
   * *Expected Outcome*: Request payload `school` is ignored or rejected; student is created in School A only.
2. **Cross-Tenant Relationship Association**: User of School A attempts to associate Student A1 with Class Group B1 (belonging to School B).
   * *Expected Outcome*: Foreign key relationship rejected with 400 Validation Error.

### 3.3 Query Filtering & Search Boundaries
1. **List Filtering**: User of School A queries `GET /api/v1/students/?search=...`
   * *Expected Outcome*: Results contain ONLY School A students, even if a School B student matches the exact query name.
2. **Export / Aggregate Reporting**: User of School A requests student count or finance summaries.
   * *Expected Outcome*: Calculations strictly bounded to School A records.

---

## 4. Execution Requirement
These security test suites run as part of the automated Django test suite (`python manage.py test`) and must pass before any feature branch is merged.

