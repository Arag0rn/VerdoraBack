# Verdora Backend

Express + MongoDB backend implementing the auth endpoints used by the frontend.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET  /users/current-user`

## How it works

- **MongoDB is required** — the server fails fast on startup if it cannot connect.
- Passwords are hashed with `bcryptjs`.
- Auth uses an access token + refresh token, both stored in **httpOnly cookies** (`accessToken`, `refreshToken`). Refresh tokens are rotated on every `/auth/refresh` and stored in the `RefreshToken` collection (TTL-indexed).
- Password reset tokens live in the `PasswordResetToken` collection (TTL-indexed); changing a password invalidates all refresh sessions.
- Responses follow the frontend's `ApiResponse` / `ApiErrorResponse` envelope (`{ timestamp, status, message, data }`).

## Local development

```bash
cd backend
npm install
cp .env.example .env   # then fill in the values
npm start
```

Required env (`.env`):

| Variable | Notes |
|---|---|
| `MONGO_URI` | MongoDB connection string (Atlas or local). **Required.** |
| `JWT_ACCESS_SECRET` | Random secret for access tokens. |
| `JWT_REFRESH_SECRET` | Random secret for refresh tokens. |
| `FRONTEND_ORIGIN` | Allowed CORS origin (e.g. `http://localhost:5173`). |
| `PORT` | Defaults to `4000`. |
| `USE_HTTPS` | `true` to serve HTTPS locally with self-signed certs. |

> `.env` and `certs/` are gitignored — never commit secrets or private keys.

## Deploying to Render

This backend runs as a normal long-lived Node process (no code changes needed).

1. Create a new **Web Service** on Render pointed at this repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Environment variables (Render dashboard):
   - `MONGO_URI` — your production MongoDB connection string.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — strong random values (not the dev defaults).
   - `FRONTEND_ORIGIN` — the deployed frontend origin (e.g. `https://<account>.github.io`).
   - `NODE_ENV=production` — makes cookies `SameSite=None; Secure` for cross-site auth.
   - Do **not** set `PORT` — Render injects it automatically.
4. In MongoDB Atlas, allow Render's outbound IPs (or `0.0.0.0/0` for simplicity) under Network Access.

Render terminates TLS at its edge and forwards HTTP to the app, so `USE_HTTPS` stays `false`; `trust proxy` is enabled in `index.js` so secure cookies still work.
