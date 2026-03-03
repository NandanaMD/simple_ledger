# SimpleLedger

**A simplified offline accounting system for personal and household finances**

*by NMD*

---

## Overview

SimpleLedger is a lightweight desktop application for managing personal and household finances. Built with Electron, React, and SQLite, it runs entirely offline on Windows with no cloud dependencies.

**This is NOT business accounting software.** SimpleLedger is designed for individuals and households who need straightforward expense tracking, income management, and basic labor/maintenance records without enterprise complexity.

---

## Features (Phase 1 - Foundation)

Currently implemented:
- ✅ Electron desktop application framework
- ✅ React + TypeScript UI
- ✅ SQLite local database (fully offline)
- ✅ Database schema for all planned modules
- ✅ Clean left-sidebar navigation layout
- ✅ Strict main/renderer process separation

Planned modules (future phases):
- Accounts management
- Categories/subcategories
- Transaction logging
- Asset tracking
- Maintenance records
- Reports and analytics

---

## Tech Stack

- **Electron** - Desktop application framework
- **React 18** - UI rendering
- **TypeScript** - Type-safe codebase
- **Vite** - Build tooling
- **SQLite** (`better-sqlite3`) - Local database
- **NSIS** - Windows installer packaging

---

## Project Structure

```
SimpleLedger/
├── electron/
│   ├── main.ts              # Electron main process
│   └── preload.ts           # IPC bridge (secure)
├── src/
│   ├── main/                # Backend logic (Node/Electron context)
│   │   ├── db/
│   │   │   ├── DatabaseClient.ts
│   │   │   └── schema.ts    # Centralized SQL schema
│   │   ├── ipc/
│   │   │   └── registerIpcHandlers.ts
│   │   └── services/
│   │       └── HealthService.ts
│   ├── renderer/            # React UI (browser context)
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   └── AppShell.module.css
│   │   └── pages/
│   │       ├── DashboardPage.tsx
│   │       ├── AccountsPage.tsx
│   │       ├── CategoriesPage.tsx
│   │       ├── TransactionsPage.tsx
│   │       ├── AssetsPage.tsx
│   │       ├── MaintenancePage.tsx
│   │       └── ReportsPage.tsx
│   ├── shared/
│   │   └── types/           # Shared TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── tsconfig.*.json
```

---

## Setup & Installation

### Prerequisites
- Node.js 20+ ([Download](https://nodejs.org/))
- Windows 10/11

### Development Setup

1. **Clone the repository**
   ```powershell
   git clone <repository-url>
   cd SimpleLedger
   ```

2. **Install dependencies**
   ```powershell
   npm install
   ```

3. **Run in development mode**
   ```powershell
   npm run dev
   ```
   This launches Vite dev server + Electron with hot reload.

4. **Build for production**
   ```powershell
   npm run build
   ```

5. **Create Windows installer**
   ```powershell
   npm run dist
   ```
   Generates `.exe` installer in `dist/` folder.

---

## Architecture Principles

### Security & Separation
- **Renderer process** (React UI) has NO direct access to Node.js APIs or SQLite.
- **Main process** handles all database operations and business logic.
- Communication happens via typed IPC channels through `preload.ts`.

### Code Organization
- ❌ **No inline SQL in React components**
- ✅ All SQL schema definitions in `src/main/db/schema.ts`
- ✅ Business logic in `src/main/services/*`
- ✅ Typed API contracts in `src/shared/types/*`

---

## Current Development Phase

**Phase 1 (COMPLETE):** Foundation + skeleton UI  
**Phase 2 (NEXT):** Accounts & Categories CRUD operations

---

## Contributing

**Contributors are welcome!**

If you want to help:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with clear description

Please maintain the existing architecture patterns (main/renderer separation, no inline SQL, typed IPC).

---

## License & Credits

**Author:** NMD  
**License:** *(Add license here - e.g., MIT, GPL, etc.)*

---

## Support

This is personal finance software, not enterprise-grade accounting. For business use cases, consider dedicated solutions like QuickBooks or Xero.