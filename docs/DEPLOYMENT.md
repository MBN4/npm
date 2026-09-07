# NMP Deployment Guide

## Production Architecture (Single Server / Multi-Terminal LAN)
- Main Host PC runs Node.js server with SQLite in WAL mode on LAN IP (e.g. `http://192.168.1.100:5000`).
- Cashier counters access the frontend served directly by the server or built as a lightweight client.
- Zero external cloud reliance required for uninterrupted pharmacy operation during internet outages.

## Environment Variables (.env)
```env
PORT=5000
HOST=0.0.0.0
NODE_ENV=production
JWT_SECRET=nmp_pharmacy_production_secret_key_2026
DB_PATH=./data/nmp.sqlite
```

## Startup Commands
```bash
# In server directory
npm run build
npm start
```
