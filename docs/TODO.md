# NMP Project Todo List

## Phase 1: Foundation (Current)
- [x] Create project structure and `/docs/` memory files
- [x] Configure server package.json, TypeScript, better-sqlite3, Express
- [ ] Implement database migration schema and seed scripts
- [ ] Implement JWT auth, bcrypt password hashing, and user login/me endpoints
- [ ] Implement RBAC middleware and audit logger
- [ ] Setup Vite + React + TS frontend with custom CSS design system
- [ ] Build base layout (header, sidebar navigation, dark/light theme, user profile)
- [ ] Write and run Phase 1 unit and integration tests
- [ ] Prepare Phase 1 manual testing walkthrough for user approval

## Phase 2: Medicine Master & Inventory
- [ ] Category, Manufacturer, Generic models and APIs
- [ ] Medicine Master management
- [ ] Batch entry, stock movements, and valuation

## Phase 3: Suppliers & Purchases
- [ ] Supplier management & ledgers
- [ ] Purchase invoices with batch generation
- [ ] Purchase returns and payment entries

## Phase 4: POS & Sales Counter
- [ ] Fast search & barcode listener
- [ ] FEFO auto-batch selection & expired batch hard block
- [ ] Hold/resume bills, sales returns, 80mm thermal receipt
