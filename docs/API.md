# NMP API Documentation

## Base URL
`http://localhost:5000/api`

## Authentication
- `POST /api/auth/login` -> `{ token, user: { id, username, fullName, role, permissions } }`
- `GET /api/auth/me` -> Current authenticated user profile & permissions
- `POST /api/auth/change-password` -> Change own password

## Users & Roles (Admin)
- `GET /api/users` -> List users
- `POST /api/users` -> Create user
- `PUT /api/users/:id` -> Update user / toggle active
- `GET /api/roles` -> List roles and assigned permissions

## Audit Logs (Admin)
- `GET /api/audit-logs` -> Query audit trail with filters (date range, user, action, entity)

## System & Status
- `GET /api/health` -> Health check & DB connection status
- `GET /api/settings` -> System configuration & store profile
- `PUT /api/settings` -> Update settings
