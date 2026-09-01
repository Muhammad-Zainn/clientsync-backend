# Agency Command Center Backend

## 1. Executive Summary

This repository is the backend for a multi-tenant agency operations platform. The system is designed around an agency-centric model where each agency has its own isolated tenant, users, clients, projects, and generated documents.

The backend currently provides the core foundation for:

- Agency registration and user authentication
- Multi-tenant authorization per agency
- Project management for agency clients
- User management for staff and clients
- Proposal document generation in PDF format
- Dashboard analytics across projects and client spend

From a software architecture standpoint, the application is a Node.js + Express API using MongoDB via Mongoose. It follows a modular structure, separates concerns by domain, and uses JWT-based auth plus tenant isolation to enforce authorization boundaries.

---

## 2. Business Context and Product Goal

This backend is being built for an agency or service business that manages:

- multiple agencies / tenants
- agency staff and clients
- project pipelines and client relationships
- proposal generation and reporting

The product is structured as a SaaS-style platform where tenants are isolated and the same codebase serves many agencies. The design intent is to keep each tenant’s data separate and prevent cross-tenant access.

In simplified business terms, the platform helps an agency:

- onboard a new agency account and admin user
- manage staff and client contacts
- create and track client projects
- generate branded proposals and project documentation
- see performance metrics and project health on a dashboard

---

## 3. Current Architecture Overview

### Technology Stack

- Runtime: Node.js
- Framework: Express.js
- Database: MongoDB via Mongoose ORM
- Auth: JWT (JSON Web Tokens)
- Security: Helmet, CORS
- PDF generation: Puppeteer + EJS templates
- Process management: Nodemon in development

### High-Level Structure

```text
backend/
├── src/
│   ├── app.js
│   ├── config/
│   │   └── db.js
│   ├── modules/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── documents/
│   │   ├── projects/
│   │   ├── tenants/
│   │   └── users/
│   └── shared/
│       ├── middleware/
│       ├── templates/
│       └── utils/
├── public/
│   └── pdfs/
├── package.json
├── Readme.md
└── .env
```

### Runtime Entry Point

The application starts in `src/app.js` and does the following:

1. Loads environment variables
2. Initializes Express
3. Enables security and CORS middleware
4. Connects to MongoDB using `connectDB()`
5. Mounts API routes
6. Starts the HTTP server on `PORT` (defaults to `5000`)
7. Registers the global error handler

This is a straightforward Express bootstrap and is a good starting point for a SaaS API, though it does not yet separate server configuration from app bootstrap for larger scale.

---

## 4. Domain Model and Multi-Tenant Design

The backend is built around a multi-tenant dataset model. Every major entity includes a `tenantId`, which is the key mechanism enforcing data isolation.

### Core Domain Entities

#### Tenant

Represents an agency account.

Fields:

- `name`
- `subdomain`
- `subscriptionPlan`
- timestamps

Purpose:

- acts as the boundary for agency-level data
- ensures each agency has isolated data

#### User

Represents any authenticated identity in a tenant.

Fields:

- `tenantId`
- `fullName`
- `email`
- `passwordHash`
- `role`
- `clientCompanyName`

Roles currently supported:

- `agency_admin`
- `agency_staff`
- `client`

Purpose:

- admin onboarding
- agency staff access
- client/customer records

#### Project

Represents work or an engagement assigned to a client and a tenant.

Fields:

- `tenantId`
- `clientId`
- `title`
- `status`
- `budget`
- `dueDate`
- timestamps

Status values:

- `planning`
- `in_progress`
- `client_review`
- `completed`

Purpose:

- tracks work under a client relationship
- supports revenue and project health reporting

#### Document

Represents generated business docs.

Fields:

- `tenantId`
- `projectId`
- `title`
- `type`
- `totalAmount`
- `customContent`
- `pdfFileUrl`
- `status`
- timestamps

Document types:

- `proposal`
- `invoice`
- `api_spec`
- `contract`

Purpose:

- stores generated PDFs and metadata for downstream workflows
- allows project documents to be tracked and reused

---

## 5. Authentication and Authorization Flow

### Auth Model

Authentication uses JWTs issued when a user logs in or registers an agency.

JWT payload includes:

- `userId`
- `tenantId`
- `role`

This token is then used to authorize requests.

### Middleware Chain

#### `requireAuth`

Located in `src/shared/middleware/requireAuth.js`.

Behavior:

- checks the `Authorization` header for a Bearer token
- verifies token signature using `JWT_SECRET`
- attaches decoded user data to `req.user`
- rejects unauthenticated requests with `401`

#### `requireTenant`

Located in `src/shared/middleware/requireTenant.js`.

Behavior:

- ensures the authenticated user exists
- ensures `req.user.tenantId` exists
- attaches `req.tenantId = req.user.tenantId`
- prevents access for users not linked to an agency

This is the core multi-tenant enforcement layer. Every protected route is mounted with both middlewares.

### Registration Flow

`POST /api/v1/auth/register`

Flow:

1. validate agency and admin input
2. check if subdomain already exists
3. check whether email is already in use
4. create Tenant record
5. hash password
6. create User record with `agency_admin` role
7. sign JWT
8. return token, user, and tenant payload

This is effectively the onboarding flow for a new agency customer.

### Login Flow

`POST /api/v1/auth/login`

Flow:

1. find user by email
2. compare password with `passwordHash`
3. sign JWT with tenant and role info
4. return token and user summary

---

## 6. Module-by-Module Breakdown

### Auth Module

Location: `src/modules/auth`

Files:

- `auth.controller.js`
- `auth.routes.js`

Responsibilities:

- agency registration
- user login
- JWT creation

Routes:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`

---

### Projects Module

Location: `src/modules/projects`

Files:

- `project.model.js`
- `project.controller.js`
- `project.routes.js`

Responsibilities:

- create project
- list tenant projects
- fetch single project by ID
- update project
- delete project

Routes:

- `POST /api/v1/projects`
- `GET /api/v1/projects`
- `GET /api/v1/projects/:id`
- `PATCH /api/v1/projects/:id`
- `DELETE /api/v1/projects/:id`

Important implementation detail:

- all project queries are scoped by `tenantId` to enforce agency isolation
- `GET /api/v1/projects?status=...` supports optional status filtering

---

### Users Module

Location: `src/modules/users`

Files:

- `user.model.js`
- `user.controller.js`
- `user.routes.js`

Responsibilities:

- create agency users
- list users in current tenant

Routes:

- `POST /api/v1/users`
- `GET /api/v1/users`

Important implementation detail:

- users are created with `tenantId` and restricted to the current agency
- password hashes are stored rather than plain text

---

### Documents Module

Location: `src/modules/documents`

Files:

- `document.model.js`
- `document.controller.js`
- `document.routes.js`

Responsibilities:

- generate proposal PDFs for a given project
- store the generated PDF metadata and file path

Routes:

- `POST /api/v1/documents/generate-proposal`

Workflow:

1. find project under current tenant
2. fetch project client and agency details
3. create EJS template data
4. render the proposal EJS template
5. generate PDF using Puppeteer
6. save file to `public/pdfs`
7. save `Document` record to MongoDB

This is the main content-generation feature in the current platform.

---

### Dashboard Module

Location: `src/modules/dashboard`

Files:

- `dashboard.controller.js`
- `dashboard.routes.js`

Responsibilities:

- aggregate project metrics
- summarize status distribution
- compute revenue and spend by client

Routes:

- `GET /api/v1/dashboard/stats`

Included metrics:

- total earnings from completed projects
- total potential revenue across all projects
- project status breakdown
- client details with project counts and spend

This is the analytics foundation for the agency dashboard and executive reporting.

---

### Tenant Module

Location: `src/modules/tenants`

Files:

- `tenant.model.js`

Responsibilities:

- tenant metadata and subscription model
- multi-tenancy root boundary

---

## 7. Shared Infrastructure

### Error Handler

Location: `src/shared/middleware/errorHandler.js`

Behavior:

- logs error message
- handles Mongoose validation errors with `400`
- returns default `500` responses for other failures

This is a standard Express error layer, but it is still minimal and could be extended with structured logging, request IDs, and error classification.

### PDF Generation Utility

Location: `src/shared/utils/pdfGenerator.js`

Behavior:

- renders an EJS template to HTML
- creates the PDF output directory if missing
- launches a headless Chromium browser via Puppeteer
- creates a PDF at `public/pdfs`
- returns a static URL such as `/pdfs/<filename>.pdf`

Template used:

- `src/shared/templates/proposal.ejs`

This is a strong proof of concept for document generation and is likely foundational for future invoice and contract output.

---

## 8. API Surface Summary

| Area      | Method | Route                                 | Purpose                       |
| --------- | ------ | ------------------------------------- | ----------------------------- |
| Auth      | POST   | `/api/v1/auth/register`               | register new agency and admin |
| Auth      | POST   | `/api/v1/auth/login`                  | login and issue JWT           |
| Projects  | POST   | `/api/v1/projects`                    | create project                |
| Projects  | GET    | `/api/v1/projects`                    | list tenant projects          |
| Projects  | GET    | `/api/v1/projects/:id`                | fetch project by ID           |
| Projects  | PATCH  | `/api/v1/projects/:id`                | update project                |
| Projects  | DELETE | `/api/v1/projects/:id`                | delete project                |
| Users     | POST   | `/api/v1/users`                       | create user for tenant        |
| Users     | GET    | `/api/v1/users`                       | list tenant users             |
| Documents | POST   | `/api/v1/documents/generate-proposal` | generate project proposal PDF |
| Dashboard | GET    | `/api/v1/dashboard/stats`             | metrics and client summary    |
| Health    | GET    | `/api/health`                         | service health status         |

---

## 9. Security Model and Considerations

### Current Security Strengths

- JWT-based authentication
- API enforcement through middleware
- tenant-scoped database queries
- password hashing with `bcryptjs`
- Helmet and CORS enabled
- secrets loaded from environment variables

### Current Gaps / Watch Items

The code is functional but still in an early-stage MVP state. Key areas to review before broader production scale:

- No refresh token flow yet
- No role-based authorization beyond `requireAuth` + `requireTenant`
- No granular permission enforcement per role
- No request validation middleware (for example, Joi or express-validator)
- No pagination or filtering for large datasets
- No audit logs or activity history
- No rate limiting or brute-force protection
- No centralized logging/observability stack
- No test suite and no CI pipeline yet

This is a good MVP foundation, but for production it needs stronger access-control patterns and operational guardrails.

---

## 10. Data Flow Example: Project Creation

A typical project lifecycle request looks like this:

1. Client sends authenticated request to `POST /api/v1/projects`
2. `requireAuth` validates JWT token
3. `requireTenant` attaches `req.tenantId`
4. controller receives request body
5. controller creates `Project` document with `tenantId` and `clientId`
6. MongoDB stores the record
7. response returns created project payload

This pattern is repeated across project management, user management, and document generation.

---

## 11. Example Data Patterns

### Example Tenant Record

```json
{
  "name": "Northstar Studio",
  "subdomain": "northstar",
  "subscriptionPlan": "free_trial"
}
```

### Example User Record

```json
{
  "tenantId": "64f7...",
  "fullName": "Sarah Nguyen",
  "email": "sarah@northstar.com",
  "passwordHash": "hashed_value",
  "role": "agency_admin"
}
```

### Example Project Record

```json
{
  "tenantId": "64f7...",
  "clientId": "65a1...",
  "title": "Brand Refresh Campaign",
  "status": "in_progress",
  "budget": 12000,
  "dueDate": "2026-09-15T00:00:00.000Z"
}
```

---

## 12. Setup and Local Development

### Prerequisites

- Node.js 18+
- MongoDB Atlas or local MongoDB instance
- `.env` file with required variables

### Required Environment Variables

The application expects environment values such as:

```env
PORT=5000
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<db-name>
JWT_SECRET=your_super_secret_key
```

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run dev
```

### Health Check

```bash
curl http://localhost:5000/api/health
```

---

## 13. Current State of the Codebase

This backend is best described as a working MVP for an agency management platform. It has a strong domain model and is functionally aligned with the core business process:

- multi-tenant onboarding
- client and project management
- proposal generation
- dashboard analytics

The codebase is organized well enough to support continued feature growth, but it is not yet a production-grade enterprise platform. It needs several hardening improvements around validation, permissions, testing, and operational readiness.

---

## 14. Strengths of the Current Implementation

- clear domain separation by module
- tenant-level data isolation
- clean Express route structure
- JWT auth pattern is easy to maintain
- EJS + Puppeteer provides straightforward document generation
- analytics layer is aligned with agency business needs
- simple and understandable codebase for a junior engineering team

---

## 15. Recommended Next Steps

### Near-Term

1. Add input validation for all route bodies and params
2. Add role-based authorization checks for admin vs staff vs client
3. Add request-level error handling and unified logging
4. Add unit and integration tests
5. Add pagination and sorting for list APIs

### Medium-Term

1. Split controller logic into service layer for business logic
2. Add repository pattern or DAO layer abstraction for Mongo access
3. Add background jobs for document generation and notifications
4. Introduce a proper audit trail and activity log
5. Implement refresh token support and secure cookie strategy if needed

### Long-Term

1. Introduce event-driven architecture for notifications and integration events
2. Add cache layers for analytics-heavy dashboards
3. Add multi-region deployment and observability
4. Expand document engine for invoice, contract, and client reporting workflows

---

## 16. Final CTO Readout

The backend is currently structured as a solid multi-tenant SaaS foundation with enough business logic to support an agency platform MVP. It demonstrates a good understanding of core domain boundaries, authorization needs, and document automation.

The biggest strategic strength is that the architecture is modular and extensible. The main weak point is that it is still early-stage and needs stronger validation, authorization, testing, and operational maturity before treating it as a production-ready enterprise platform.

This is a promising starting point for the next phase of product development, and it is a good base for junior engineers to expand with discipline and structured reviews.

---

## 17. Summary for Junior Engineers

When working in this codebase, keep these rules in mind:

- every tenant-scoped route must respect `tenantId`
- never trust client input without validation
- auth and tenant middleware are the primary security boundary
- business logic should stay in controllers only for now, but plan to move to services later
- document generation and analytics are business-critical workflows and should be treated carefully
- keep routes and models consistent with the existing SaaS multi-tenant pattern

This backend is intentionally simple and understandable, which makes it ideal as a platform for learning disciplined engineering practices while still supporting real agency operations.
