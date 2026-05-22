# 🎡 Spin Wheel Game System

A real-time multiplayer spin wheel game where users pay an entry fee in coins to join, compete for a prize pool, and one winner takes all. Built with **Node.js**, **Express**, **PostgreSQL**, and **Socket.IO**.

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                        Client (Browser / App)                     │
│                                                                   │
│  REST API (JWT Bearer)         Socket.IO (JWT handshake)          │
└───────────────┬──────────────────────────┬────────────────────────┘
                │                          │
                ▼                          ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│      Express Server      │   │      Socket.IO Server       │
│                          │   │                             │
│  /api/auth   → authCtrl  │   │  middleware: JWT verify     │
│  /api/wheel  → wheelCtrl │   │  join-wheel-room            │
│  /api/admin  → adminCtrl │   │  leave-wheel-room           │
│  /api/users  → userCtrl  │   │                             │
└───────────┬──────────────┘   └─────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────┐
│               Service Layer                   │
│                                               │
│  wheelService.js  ←→  gameEngine.js           │
│  (lifecycle, DB transactions, refunds)        │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
┌───────────────────────────────────────────────┐
│           PostgreSQL Database                 │
│                                               │
│  users │ spin_wheels │ participants │         │
│  transactions │ config                        │
└───────────────────────────────────────────────┘
```

### Real-Time Event Flow

```
Admin creates wheel ──► [wheel-created broadcast]
Player joins        ──► [player-joined broadcast]
Auto / manual start ──► [game-started broadcast]
  every 7 seconds   ──► [player-eliminated broadcast]
Last player wins    ──► [game-ended broadcast]
```

---

## Database Schema

### Tables

| Table          | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| `users`        | Accounts with coin balance and role                        |
| `spin_wheels`  | One wheel per game; tracks pools and status                |
| `participants` | Join table; tracks elimination state                       |
| `transactions` | Immutable ledger: entry_fee, refund, winning, admin_payout |
| `config`       | Key-value store for coin split percentages                 |

### Default Config

| Key                 | Default |
| ------------------- | ------- |
| `winner_percentage` | 70%     |
| `admin_percentage`  | 20%     |
| `app_percentage`    | 10%     |

---

## Setup Instructions

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14
- **npm** ≥ 9

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd spin_wheel_game
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DB_NAME=spinwheel
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
SERVER_PORT=3000
JWT_SECRET=a_long_random_secret_at_least_32_chars
```

### 3. Create Database & Run Migrations

```bash
# Create database
psql -U postgres -c "CREATE DATABASE spinwheel;"

# Run migrations in order
psql -U postgres -d spinwheel -f migrations/001_initial_schema.sql
psql -U postgres -d spinwheel -f migrations/002_add_password.sql
```

Migration 001 seeds:

- 1 admin user (`admin1`)
- 4 player users (`player1`–`player4`), each with 1000 coins
- Default coin split config (70/20/10)

Migration 002 adds `password_hash` and sets all seed users' password to `password123`.

### 4. Run the Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000`.

---

## API Reference

### Authentication

All protected routes require:

```
Authorization: Bearer <jwt_token>
```

#### `POST /api/auth/register`

```json
{ "username": "alice", "password": "secret123" }
```

**Response:** `{ token, user }`

#### `POST /api/auth/login`

```json
{ "username": "admin1", "password": "password123" }
```

**Response:** `{ token, user }`

---

### Wheel Lifecycle

#### `GET /api/wheel/active` 🔐

Returns the currently open or running wheel (if any).

#### `POST /api/wheel/create` 🔐👑 Admin only

```json
{ "entry_fee": 100 }
```

- Creates a new wheel (only 1 active at a time)
- Starts a 3-minute timer; auto-aborts + refunds if < 3 players

#### `POST /api/wheel/join/:wheelId` 🔐

- Deducts entry fee from player's balance atomically
- Splits coins: 70% → winner pool, 20% → admin pool, 10% → app pool

#### `POST /api/wheel/start/:wheelId` 🔐👑 Admin only

- Manually starts the wheel (minimum 3 participants required)
- Game runs in the background; eliminations happen every 7 seconds

#### `GET /api/wheel/status/:wheelId` 🔐

Returns wheel state and current participant list.

---

### Admin

#### `GET /api/admin/config` 🔐👑

Returns current coin split percentages.

#### `PUT /api/admin/config` 🔐👑

```json
{ "winner_percentage": 70, "admin_percentage": 20, "app_percentage": 10 }
```

All three must be provided and must sum to 100.

#### `GET /api/admin/users` 🔐👑

Lists all users with balances.

#### `POST /api/admin/users/:userId/topup` 🔐👑

```json
{ "amount": 500 }
```

Adds coins to a user's balance (for testing convenience).

---

### Users

#### `GET /api/users/me` 🔐

Returns own profile and coin balance.

#### `GET /api/users/me/transactions` 🔐

Returns last 50 transactions (entry fees, refunds, winnings).

#### `GET /api/users/me/games` 🔐

Returns full game history with win/loss info.

---

### Health Check

#### `GET /health`

```json
{ "status": "ok", "timestamp": "..." }
```

---

## Socket.IO

Connect with JWT auth:

```js
const socket = io("http://localhost:3000", {
  auth: { token: "<jwt_token>" }
});

// Join a wheel room to receive live events
socket.emit("join-wheel-room", wheelId);

// Events you'll receive:
socket.on("player-joined",     ({ username }) => { ... });
socket.on("game-started",      ({ wheelId, participantCount, participants }) => { ... });
socket.on("player-eliminated", ({ username, eliminationNumber, remainingCount }) => { ... });
socket.on("game-ended",        ({ winner }) => { ... });
socket.on("wheel-aborted",     ({ reason }) => { ... });
```

---

## Complete Game Walkthrough

```bash
# 1. Login as admin
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin1","password":"password123"}' | jq -r .token)

# 2. Create a wheel (entry fee = 100 coins)
curl -X POST http://localhost:3000/api/wheel/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entry_fee": 100}'

# 3. Players join (use their own tokens)
# P1_TOKEN, P2_TOKEN, P3_TOKEN obtained via /api/auth/login
curl -X POST http://localhost:3000/api/wheel/join/1 \
  -H "Authorization: Bearer $P1_TOKEN"

# 4. Admin manually starts (or wait 3 minutes for auto-start)
curl -X POST http://localhost:3000/api/wheel/start/1 \
  -H "Authorization: Bearer $TOKEN"

# 5. Watch events via Socket.IO in real-time
```

---

## Edge Cases Handled

| Edge Case                         | Handling                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Only 1 active wheel at a time     | `createWheel` checks for existing `waiting`/`running` wheels; throws if found |
| Player tries to join twice        | `UNIQUE(user_id, spin_wheel_id)` constraint + explicit duplicate check        |
| Insufficient coin balance         | Balance check inside DB transaction before deduction                          |
| < 3 participants after 3 min      | Auto-abort: full refund to each player, logged in transactions                |
| Manual start with < 3 players     | HTTP 400 returned, game not started                                           |
| Race condition on coin balance    | All coin ops use `FOR UPDATE` row locks inside transactions                   |
| Concurrent joins                  | `BEGIN…COMMIT` with row-level lock on both user and wheel                     |
| Partial coin distribution failure | Full `ROLLBACK` on any error; no partial state committed                      |
| Token expired / invalid           | Middleware returns 401 with clear message                                     |
| Socket without valid token        | Handshake middleware rejects unauthenticated connections                      |
| Admin joining their own wheel     | Allowed by design (admin is also a user); treated like any other player       |

---

## Design Decisions & Assumptions

1. **Simple JWT auth (no refresh tokens)**: Tokens expire in 7 days. For production, add refresh token rotation.
2. **Coins as integers**: Avoids floating-point rounding errors. All amounts are whole numbers.
3. **App pool not distributed**: The `app_pool` column is tracked but coins are not credited to any user — this simulates the platform taking a cut. A house account could be added trivially.
4. **`startGame` runs async**: The game engine loop (`setInterval` via `setTimeout`) is fire-and-forget after the HTTP response is sent. This prevents request timeouts on long games.
5. **Elimination is pre-computed**: The full random elimination order is shuffled at game start (Fisher-Yates), not re-randomized per step. This prevents manipulation and ensures determinism.
6. **Password hashing**: bcrypt with 10 salt rounds — secure default, fast enough for auth.
7. **No separate Redis / pub-sub**: Socket.IO rooms are in-process. For multi-instance deployment, add a Redis adapter (`@socket.io/redis-adapter`).

---

## Performance Considerations

- **Row-level locks (`FOR UPDATE`)** prevent lost updates without locking entire tables
- **Connection pooling** via `pg.Pool` — default 10 connections, configurable via `pg` options
- **Atomic transactions** for all coin operations ensure consistency under concurrent load
- **Background game loop** keeps HTTP layer responsive even during multi-minute games
- **Indexed foreign keys** on `participants(spin_wheel_id)` and `transactions(user_id)` for fast lookups

---

## Project Structure

```
spin_wheel_game/
├── server.js                    # Entry point: HTTP + Socket.IO server
├── src/
│   ├── app.js                   # Express app + route registration
│   ├── controllers/
│   │   ├── authController.js    # register, login
│   │   ├── wheelController.js   # createWheel, joinWheel, manualStart, getStatus, getActiveWheel
│   │   ├── adminController.js   # getConfig, updateConfig, getAllUsers, topupUser
│   │   └── userController.js    # getMe, getMyTransactions, getMyGameHistory
│   ├── services/
│   │   ├── wheelService.js      # Core game lifecycle + DB transactions
│   │   └── gameEngine.js        # Elimination loop + winner payout
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── wheelRoutes.js
│   │   ├── adminRoutes.js
│   │   └── userRoutes.js
│   ├── middleware/
│   │   └── auth.js              # JWT verification + admin guard
│   └── socket/
│       └── socketHandler.js     # Socket.IO setup + JWT handshake auth
├── config/
│   └── database.js              # pg Pool connection
├── migrations/
│   ├── 001_initial_schema.sql   # Schema + seed data
│   └── 002_add_password.sql     # password_hash column
├── .env                         # Local environment variables (not committed)
├── .env.example                 # Template for environment variables
└── package.json
```
