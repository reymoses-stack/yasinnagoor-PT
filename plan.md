# Pioneer Technical — React + Go Full-Stack Upgrade

## Architecture
```
riser-one-v2/
├── backend/          # Go (Gin) REST API
│   ├── main.go
│   ├── models/
│   ├── handlers/
│   └── go.mod
└── frontend/         # React + Vite
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── api.js
    │   └── App.jsx
    └── package.json
```

## Backend Endpoints (Go + Gin)
- GET  /api/projects            — list all projects
- POST /api/projects            — create project
- PUT  /api/projects/:id        — update project
- DELETE /api/projects/:id      — delete project
- GET  /api/employees           — list all employees
- POST /api/employees           — create employee
- PUT  /api/employees/:id       — update employee
- DELETE /api/employees/:id     — delete employee
- GET  /api/projects/:id/assigned — get assigned employees for project (popup)
- GET  /api/export/dashboard    — download Excel (dashboard sheet)
- GET  /api/export/projects     — download Excel (projects sheet)
- GET  /api/export/employees    — download Excel (employees sheet)

## New Features
1. Export to Excel button on every page (calls Go export endpoint → file download)
2. "Assigned Employees" clickable → glass popup modal with full employee list
3. React component architecture with proper state management
