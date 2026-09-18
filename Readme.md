# Backend Architecture, Data Flow, and Security Audit

**Audit scope:** `src/app.js`, `src/config/db.js`, every file under `src/modules/` and `src/shared/`, and the MongoDB/Mongoose data paths. This is a static code audit of the repository state reviewed on 2026-09-18. No live database, deployment configuration, secrets, or browser client was available.

## Executive Verdict

The backend has a useful modular structure and many reads include `tenantId: req.tenantId`, but the current authorization boundary is not safe for production multi-tenancy.

**Critical:** There is no role guard on any private route. A valid `client` token can reach agency-admin handlers and can submit a role of `agency_admin` when creating or updating users. Several mutation handlers also accept the complete request body as a MongoDB update, including protected ownership fields such as `tenantId` and relationship IDs.

**High:** Tenant predicates are therefore not sufficient to make cross-tenant leakage impossible. Child-resource endpoints do not authorize access through the parent project, and multi-document operations are not transactional. Cloud-storage and MongoDB operations can leave inconsistent state.

**Overall rating:** **High risk.** Do not rely on the current API as a tenant-isolated RBAC system until the critical authorization and unrestricted-update issues are fixed and tested.

## Findings At A Glance

Examples: [project.routes.js](src/modules/projects/project.routes.js#L12-L21), [user.routes.js](src/modules/users/user.routes.js#L12-L21), [document.routes.js](src/modules/documents/document.routes.js#L17-L25), and [task.routes.js](src/modules/tasks/task.routes.js#L11-L19). The dashboard is also missing an admin guard ([dashboard.routes.js](src/modules/dashboard/dashboard.routes.js#L5-L11)). The comments saying "Agency Admin only" are not enforcement.

Deleting a client removes the user, then deletes projects in a separate call ([user.controller.js](src/modules/users/user.controller.js#L193-L205)); a crash leaves projects pointing to a missing client. The route description also says "associated projects" but does not delete documents/tasks.
| --- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 | Critical | RBAC | All private routers install authentication and tenant middleware, but no role middleware. A client can call admin/staff operations. |
| F2 | Critical | Tenant isolation | `PATCH /projects/:id` and `PATCH /tasks/:id` pass `req.body` directly to Mongoose. A caller can attempt to change `tenantId`, `projectId`, ownership, or other protected fields. |
| F3 | High | Authorization | Project child endpoints only check the tenant. Clients can enumerate another client's tasks/documents when they know a project ID in the same tenant. |
| F4 | High | Relationship integrity | Project creation and staff assignment do not verify that referenced users belong to the current tenant or have the expected role. |
| F5 | High | Atomicity | Registration, user invitation/assignment, user updates/deletion, and storage/document operations are multi-step without MongoDB transactions or reliable compensation. |
| F6 | High | Input validation | Most body, query, and path values are not schema-validated before database access. `express-mongo-sanitize` is installed but never mounted. |
| F7 | High | Sensitive data | Email HTML interpolates user-controlled values without escaping. Stored rich `customContent` can become an XSS source in a consuming frontend. |
| F8 | Medium | Auth lifecycle | JWTs contain role and tenant claims but are not checked against the current user, so role deactivation or tenant changes do not take effect until token expiry. |
| F9 | Medium | Error handling | The handler catches ordinary controller errors, but leaks raw error messages, mishandles cast/duplicate-key errors, and has no explicit 404 or shutdown strategy. |
| F10 | Medium | Availability | The server listens immediately after starting an unawaited database connection; upload memory is bounded per request but not globally; rate limiting trusts `X-Forwarded-For` through `trust proxy`. |

## 1. Data Flow And Tenant Isolation

### Request-to-database flow

1. `src/app.js` loads environment variables, installs Helmet/CORS/body parsing/cookies, applies a global IP limiter, and mounts domain routers.
2. Private routers call `requireAuth`, which verifies the JWT and copies its claims to `req.user` ([requireAuth.js](src/shared/middleware/requireAuth.js#L4-L23)).
3. `requireTenant` copies the JWT's `tenantId` to `req.tenantId` ([requireTenant.js](src/shared/middleware/requireTenant.js#L1-L18)). The tenant is not looked up from MongoDB and is not compared with the current `User` record.
4. Controllers use `req.tenantId` in many filters and create payloads.
5. Mongoose casts and validates model fields, but model validation is not a substitute for authorization or an allowlisted update shape.

### What is scoped correctly

- Project list/get/update/delete queries include `tenantId` ([project.controller.js](src/modules/projects/project.controller.js#L43-L142)).
- Document list/upload/delete queries normally include `tenantId` ([document.controller.js](src/modules/documents/document.controller.js#L12-L182)).
- Task create/list/update/delete queries include `tenantId`, and task creation first checks a same-tenant project ([task.controller.js](src/modules/tasks/task.controller.js#L6-L116)).
- Dashboard project and client queries include the tenant ([dashboard.controller.js](src/modules/dashboard/dashboard.controller.js#L8-L70)).
- User list/update/delete queries include the tenant. The invitation uniqueness query does not, although `User.email` is globally unique ([user.controller.js](src/modules/users/user.controller.js#L12-L203); [user.model.js](src/modules/users/user.model.js#L4-L14)).

### Why isolation is not mathematically guaranteed

1. **Protected fields are writable.** `updateProject` sends `const updates = req.body` to `findOneAndUpdate`; `updateTask` does the same. A valid same-tenant document can be selected, then its `tenantId` or relationship fields can be changed by the caller. This can transfer a record into another tenant or attach a task to another project. The query's tenant predicate protects selection only; it does not constrain the new document state.
2. **Cross-tenant references are accepted.** `createProject` accepts arbitrary `clientId` and `assignedStaff` without checking those users belong to `req.tenantId` ([project.controller.js](src/modules/projects/project.controller.js#L6-L30)). The user invitation assignment updates only projects in the current tenant but does not validate every supplied project ID or reject missing assignments ([user.controller.js](src/modules/users/user.controller.js#L42-L49)).
3. **Child endpoints do not enforce parent authorization.** `GET /documents/project/:projectId` and `GET /tasks/project/:projectId` filter only `{ projectId, tenantId }`. They do not first load the project and apply the same staff/client visibility rule used by project reads. Any client who knows another same-tenant project ID can read its tasks/documents.
4. **Populated references are not independently constrained.** A project can reference a user from a different tenant if created or modified through an unrestricted body. `populate()` follows that ID; tenant integrity must be prevented at write time and checked at read time.
5. **A signed JWT is treated as the tenant authority.** `requireTenant` trusts `tenantId` in the token. If a user's role, activation state, or tenant membership changes, existing tokens retain those claims for up to one day.

### Recommended isolation invariant

Every repository/service operation should require a server-derived `TenantContext`, and every write should use an explicit allowlist. For each resource:

- Parent and child records must carry the same tenant identifier, enforced by service logic and, where practical, MongoDB validation/indexes.
- A client/staff authorization query must constrain both `tenantId` and its permitted ownership relation.
- `tenantId`, ownership IDs, role, and security state must never be accepted from a general request body.
- Child reads and writes must resolve the parent under the caller's role policy before touching the child.

## 2. Authentication And RBAC

### Confirmed authorization gap

The project, user, document, and task routers all contain only:

```js
router.use(requireAuth);
router.use(requireTenant);
```

Examples: [project.routes.js](src/modules/projects/project.routes.js#L12-L21), [user.routes.js](src/modules/users/user.routes.js#L12-L21), [document.routes.js](src/modules/documents/document.routes.js#L17-L25), and [task.routes.js](src/modules/tasks/task.routes.js#L11-L19). The dashboard is also missing an admin guard ([dashboard.routes.js](src/modules/dashboard/dashboard.routes.js#L5-L11)). The comments saying "Agency Admin only" are not enforcement.

Consequences include:

- A client can create, update, and delete projects and tasks.
- A client can create users, choose `agency_admin` as the role, update users, deactivate users, or alter roles.
- A client can access the agency-wide user list and dashboard analytics.
- A client can upload/delete documents and access the global document hub.
- `createUser` defaults to `client`, but accepts any model-valid role from the request ([user.controller.js](src/modules/users/user.controller.js#L12-L41)).

### Authentication observations

- JWT verification uses the configured secret and accepts either an HTTP-only cookie or Bearer token ([requireAuth.js](src/shared/middleware/requireAuth.js#L4-L23)). This is a reasonable mechanism, but the code does not require issuer/audience, check a token version, or rehydrate the user.
- Login and password setup sign tokens with `userId`, `tenantId`, and `role` ([auth.controller.js](src/modules/auth/auth.controller.js#L158-L171); [auth.controller.js](src/modules/auth/auth.controller.js#L221-L234)). A role or account deactivation is not revoked immediately.
- Production cookies use `SameSite=None` and `Secure` ([auth.controller.js](src/modules/auth/auth.controller.js#L15-L29)). Because cookies authenticate state-changing requests, add CSRF protection or use a deliberate same-site/token architecture.
- `JWT_SECRET`, `MONGO_URL`, `FRONTEND_URL`, and email/storage credentials are not validated at startup. Missing `JWT_SECRET` fails later during sign/verify rather than failing with a clear startup error.
- Registration, login, OTP resend, and setup-link resend have only the global limiter except the two OTP endpoints. Login and token endpoints need route-specific throttling, and responses should avoid account enumeration where the product permits it.

### Required RBAC design

Add a parameterized `requireRole(...roles)` after authentication and tenant context, then enforce policy in controllers/services as defense in depth. A minimum policy should explicitly define admin-only user management, document hub, and dashboard access; staff project/task/document permissions; and client access limited to projects where `clientId` equals the authenticated user.

## 3. Database Integrity And Transactional Safety

MongoDB operations are currently independent writes. There is no `session.withTransaction()` and no outbox/job model for external email or storage side effects.

### Incomplete compensation paths

- Agency registration creates a tenant, then a user, then sends email. If email fails, it manually deletes user and tenant ([auth.controller.js](src/modules/auth/auth.controller.js#L41-L86)). A process crash or a failed cleanup leaves an orphan; concurrent requests can also race the pre-checks. Use a transaction for MongoDB writes and a durable email outbox after commit.
- User invitation creates the user, updates project assignments, then sends email. If email fails, only the user is deleted; project assignment references added before the failure remain ([user.controller.js](src/modules/users/user.controller.js#L32-L67)). A crash can leave either partial assignments or an unsent invitation.
- Updating a user first changes the user, then removes/adds project assignments in separate operations ([user.controller.js](src/modules/users/user.controller.js#L151-L180)). A failure between these calls leaves stale or incomplete staff assignments.
- Deleting a client removes the user, then deletes projects in a separate call ([user.controller.js](src/modules/users/user.controller.js#L193-L205)); a crash leaves projects pointing to a missing client. The route description also says "associated projects" but does not delete documents/tasks.
- Document upload writes to Supabase before inserting MongoDB metadata ([document.controller.js](src/modules/documents/document.controller.js#L60-L118)). A MongoDB failure leaves an orphaned object. Delete removes remote storage first and MongoDB second ([document.controller.js](src/modules/documents/document.controller.js#L151-L182)); a database failure leaves metadata pointing to a deleted object.

### Transaction recommendations

Use a MongoDB session for related MongoDB writes, with all reads used for authorization in the same session where appropriate. Do not hold a MongoDB transaction open while calling Resend or Supabase. Commit the database state, enqueue an email/storage job in an outbox, make jobs idempotent, and run reconciliation for orphaned objects. Add unique indexes and handle duplicate-key errors rather than relying on check-then-create sequences.

## 4. Input Validation And Global Security

### NoSQL injection and prototype pollution

`express-mongo-sanitize` appears in `package.json` but is never mounted in [app.js](src/app.js#L1-L49). Most routes do not validate types, lengths, formats, enum values, or object shapes before querying. Mongoose casting may reject some malformed IDs, but it is not a complete injection defense.

The highest-risk pattern is passing request data as an update document: [project.controller.js](src/modules/projects/project.controller.js#L108-L124) and [task.controller.js](src/modules/tasks/task.controller.js#L77-L96). Replace this with explicit fields and `$set` built by the server. Reject keys beginning with `$` or containing dots at the boundary, and use a dedicated validator such as Joi, Zod, or express-validator for body/query/params.

Other gaps:

- `id`, `projectId`, `clientId`, and arrays of IDs are not validated as ObjectIds before database calls. Cast errors currently become generic 500 responses.
- `status`, `type`, budgets, dates, titles, names, emails, and password policy are inconsistently validated. Model enums are useful but do not provide a stable API contract.
- `customContent` is an arbitrary `Object`, and proposal content can be parsed with `JSON.parse` without a size/schema limit ([document.controller.js](src/modules/documents/document.controller.js#L91-L104)). This can create data abuse and prototype-pollution/XSS risk in downstream consumers.
- Multer trusts the client-provided MIME type and stores each file in memory ([document.routes.js](src/modules/documents/document.routes.js#L10-L15)). Validate file signatures, set field/count limits, and prefer streaming or a bounded upload service.
- Uploaded file names are partly sanitized, but use a generated opaque storage key rather than user-controlled names. Ensure public URLs are truly intended to be public.

### XSS and output encoding

`sendEmail.js` inserts `fullName`, `agencyName`, `email`, `role`, and the setup URL into HTML without HTML escaping ([sendEmail.js](src/shared/utils/sendEmail.js#L9-L66)). A malicious name or tenant value can produce an HTML injection in recipients' mail clients. Escape all interpolated HTML values and validate URLs. Treat `customContent` as untrusted data and sanitize or render it through a strict allowlist before any HTML/PDF/frontend use.

Helmet is enabled, which is useful, but it does not sanitize stored content or enforce authorization. CORS is credentialed and depends on `FRONTEND_URL`; validate that it is a single approved origin and fail closed when unset.

## 5. Error Handling And Edge Cases

Express 5 generally forwards rejected async controller promises, and every controller shown calls `next(error)` in its `catch`, so the ordinary request path is covered. Email helpers also rethrow Resend failures after logging ([sendEmail.js](src/shared/utils/sendEmail.js#L22-L66)). There is no obvious unawaited email promise in the reviewed controllers.

The global handler remains insufficient:

- It returns `err.message` to clients for all errors ([errorHandler.js](src/shared/middleware/errorHandler.js#L1-L12)), which can disclose database/provider details. Return stable public error codes/messages and log structured details server-side.
- It handles only `ValidationError`. Add explicit handling for `CastError` (400), duplicate key errors (409), Multer limits/file errors (400/413), and provider/database outages (503).
- There is no final 404 handler, request ID, structured logging, or process-level shutdown path. Handle `SIGTERM`, close the HTTP server, stop accepting work, and close Mongoose cleanly.
- `connectDB()` is called without awaiting it before `app.listen()` ([app.js](src/app.js#L23-L49)). The server can advertise readiness before MongoDB is available. Export the app separately from the server and start listening only after a successful connection, or make readiness reflect database state.
- Database connection failure calls `process.exit(1)` ([db.js](src/config/db.js#L3-L11)); this is acceptable only with an external supervisor and should be paired with startup validation and controlled shutdown.
- Mongoose schema/model mismatches exist: `Task.tenantId` is a `String`, while other tenant IDs are ObjectIds ([task.model.js](src/modules/tasks/task.model.js#L22-L28)). Normalize this type and add indexes.

## 6. Prioritized Remediation Plan

### P0: block privilege and tenant compromise

1. Add role guards to every private route and enforce the same policy inside service methods.
2. Remove `tenantId`, role, user ownership, and parent IDs from client-controlled update payloads. Use allowlisted DTOs and server-built `$set` operations.
3. Validate project client/staff references with same-tenant, role-specific queries. Reject any missing or cross-tenant reference.
4. Add parent-project authorization to task/document endpoints. A client must be restricted to their own project; staff must be assigned; admins must be explicitly permitted.
5. Rotate/invalidate tokens when roles, tenant membership, or active state changes, or rehydrate the user on each request.

### P1: make state consistent

1. Use MongoDB transactions for related MongoDB writes: registration, invitation plus assignments, assignment replacement, and destructive user cleanup.
2. Add an outbox for email and a storage reconciliation/job flow for Supabase. Make remote operations idempotent.
3. Add unique/compound indexes such as tenant plus project relationships, and convert `Task.tenantId` to ObjectId.

### P1: validate and contain input

1. Mount request sanitization before routes, but keep it as a supplement to schema validation.
2. Add validators for every body, query, and param; reject unknown keys and enforce size/length limits.
3. Escape email HTML and sanitize rich content at the rendering boundary. Validate PDF magic bytes and constrain upload concurrency.
4. Add login/setup/OTP rate limits, CSRF protection for cookie-authenticated mutations, and startup environment validation.

### P2: operational hardening

1. Harden error mapping and logging, add request IDs, 404 handling, graceful shutdown, and readiness/liveness endpoints.
2. Add indexes for every frequent tenant query and run explain-plan checks.
3. Replace the placeholder test script with automated authorization, tenant-isolation, validation, transaction-failure, and upload tests.

## 7. Minimum Verification Test Matrix

- A client receives 403 for user creation/update/delete, dashboard stats, global document access, project mutation, and task mutation.
- A client cannot list/get tasks or documents for another client's project, even with a known project ID.
- A staff member cannot access an unassigned project or its children.
- A request body containing `tenantId`, `$set`, `projectId`, `clientId`, or `assignedStaff` cannot change ownership or cross a tenant boundary.
- Project creation rejects a client/staff ID from another tenant and rejects a non-client `clientId`.
- Failed email/storage/database operations do not leave users, assignment references, projects, metadata, or remote files in a partial state.
- Malformed ObjectIds, oversized/custom JSON, invalid enums, duplicate emails, and Multer errors produce controlled 4xx responses.
- Deactivated users and role changes are rejected immediately for previously issued tokens.

## Files Reviewed

`src/app.js`, `src/config/db.js`, all controllers/routes/models under `src/modules/auth`, `users`, `tenants`, `projects`, `documents`, `tasks`, `dashboard`, and all middleware/utilities under `src/shared`.
