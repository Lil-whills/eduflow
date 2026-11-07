# Eduflow — Development Workflow & Definition of Done (DoD)

## 1. Development Methodology: Full-Stack Vertical Slices
Features in Eduflow are implemented in full-stack vertical slices:
* Do not build the entire UI first and leave backend authorization as an afterthought.
* For each slice:
  1. Data Model & Database Migration (with constraints & indexes)
  2. Business Logic & Transactional Services
  3. Versioned REST API Endpoint (`/api/v1/`) with permissions
  4. Frontend UI Components (conforming to the Navy `#0F172A`, White `#FFFFFF`, Electric Blue `#3B82F6` theme)
  5. Automated Tests (Unit, Integration, and Cross-Tenant Security)

---

## 2. Definition of Done (DoD) Checklist
A feature slice or milestone is only considered complete when:
- [x] **Backend Authority**: Validation, permissions, and multi-tenant scoping are enforced on the backend.
- [x] **Tenant Isolation**: Explicit cross-school access attempts are blocked and verified by automated tests.
- [x] **Database Constraints**: Invariants (e.g. uniqueness, non-null, foreign keys) are enforced at the database level.
- [x] **Auditability**: Sensitive state transitions emit audit events.
- [x] **Testing**:
  - Django test suite passes without errors.
  - Vitest + React Testing Library tests pass.
- [x] **Frontend Quality**:
  - Production build (`npm run build`) compiles with zero errors.
  - UI provides clear loading, empty, error, and success states.
  - Responsive design using the approved color palette.
- [x] **Clean Version Control**: Secrets remain outside Git, `.env.example` is kept up-to-date.

