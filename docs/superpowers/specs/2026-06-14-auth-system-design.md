# Auth System — Ferret Beta

## Overview

Add email/password authentication to limit Ferret to 20 beta test users. Each user receives an auto-generated reward key for 1 month free at highest tier on full release. A waitlist collects emails once the 20-user cap is reached.

## Architecture

All auth is self-contained in the existing FastAPI + Next.js stack. No external auth provider. The `users` table in Supabase stores credentials (hashed) and reward keys.

```
user → [Next.js frontend] → [FastAPI backend] → [Supabase users/waitlist tables]
                              ↑ JWT auth required for protected routes
```

## Database (migration `005_auth.sql`)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    reward_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Function to check user count (used in signup gate)
-- Query: SELECT COUNT(*) FROM users
```

No ALTER TABLE on existing tables — auth is fully additive.

## Backend

### New dependencies (`requirements.txt`)
- `passlib[bcrypt]` — password hashing
- `python-jose[cryptography]` — JWT create/verify

### `app/services/auth_service.py`
- `hash_password(password) → str`
- `verify_password(password, hash) → bool`
- `create_access_token(user_id) → str` — JWT with `sub=user_id`, exp=7 days
- `verify_token(token) → dict` — decode JWT, raise on invalid/expired
- `get_user_count() → int` — count rows in users table
- `register_user(email, password) → dict` — check 20-limit, hash, insert, return user + reward_key
- `authenticate_user(email, password) → dict` — verify credentials, return user
- `add_waitlist(email)` — insert into waitlist table

### `app/api/auth.py`
- `POST /api/auth/signup` — body: `{email, password}` — checks 20-limit, returns `{token, user: {id, email, reward_key}}` or 403 with waitlist prompt
- `POST /api/auth/login` — body: `{email, password}` — returns `{token, user: {id, email, reward_key}}`
- `GET /api/auth/me` — requires `Authorization: Bearer <token>` — returns `{id, email, reward_key, created_at}`
- `POST /api/auth/waitlist` — body: `{email}` — stores email, returns success

### `app/core/deps.py`
- Add `get_current_user` FastAPI dependency: reads `Authorization` header, verifies JWT, returns user dict (or 401)

### Protected routes
- **Protected** (require valid JWT): `POST /upload`, `GET /`, `GET /{id}`, `DELETE /{id}`, `GET /{id}/graph`, `GET /{id}/files`, `GET /{id}/status`, `POST /{id}/ask`, `POST /{id}/symbols/*`, `POST /{id}/call-chain/*`, `POST /{id}/impact/*`, `POST /{id}/onboarding`, `POST /{id}/subgraph`, `POST /{id}/invalidate-cache`, `POST /{id}/query/*`
- **Public** (no auth): `GET /api/health`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/waitlist`
- Strategy: add `Depends(get_current_user)` to each protected endpoint. This is explicit — no magic middleware.
- Frontend public pages (no redirect): landing (`/`), login (`/login`), signup (`/signup`)
- Frontend protected pages (redirect to `/login`): dashboard (`/dashboard`), repos (`/repos/*`)

### Config (`app/core/config.py`)
- Add `JWT_SECRET: str = os.getenv("JWT_SECRET", "")`
- Add `JWT_ALGORITHM = "HS256"`
- Add `JWT_EXPIRY_DAYS = 7`

## Frontend

### `src/lib/auth.tsx`
- `AuthContext` with: `user`, `token`, `login()`, `signup()`, `logout()`, `loading`
- On mount: check `localStorage` for token, call `/api/auth/me` to validate, set user or clear
- `login(email, password)` — POST to `/api/auth/login`, store token in localStorage, set user
- `signup(email, password)` — POST to `/api/auth/signup`, handle 403 (full) with waitlist prompt, store token, set user
- `logout()` — clear localStorage, set user to null, redirect to `/login`

### `src/app/layout.tsx`
- Wrap children with `<AuthProvider>`

### `src/app/login/page.tsx`
- Simple form: email input, password input, submit button
- Link to signup
- On success, redirect to `/dashboard`
- On error, show inline error message

### `src/app/signup/page.tsx`
- Simple form: email input, password input, submit button
- Link to login
- On success (user <= 20): redirect to `/dashboard`, show reward key toast
- On 403 (full): show "Ferret is in private beta with 20 users..." message + waitlist email input field
- Waitlist submit: POST to `/api/auth/waitlist`, show "You're on the list!"

### `src/app/dashboard/page.tsx`
- Wrap with auth guard: if no token, redirect to `/login`
- Add user menu in header (email + reward key display)

### `src/lib/api.ts`
- Add `Authorization: Bearer <token>` header to all API calls when token exists
- Add user-related API functions: `login`, `signup`, `getMe`, `joinWaitlist`

## Reward Key

- Generated as UUID v4 at user creation
- Stored in `users.reward_key`
- Shown to user in dashboard (with a "save this key" note)
- No redemption endpoint yet — that's for full release

## API Flow — Signup

```
POST /api/auth/signup {email, password}
  → check user count (SELECT COUNT(*) FROM users)
  → if >= 20: return 403 {detail: "Beta full", waitlist: true}
  → hash password
  → generate reward_key
  → INSERT INTO users
  → create JWT
  → return {token, user: {id, email, reward_key}}
```

## API Flow — Login

```
POST /api/auth/login {email, password}
  → SELECT * FROM users WHERE email = ?
  → verify password hash
  → create JWT
  → return {token, user: {id, email, reward_key}}
```

## Security

- Passwords hashed with bcrypt (via passlib)
- JWTs signed with HS256 using `JWT_SECRET`
- JWT expiry: 7 days
- No password storage in plaintext anywhere
- No session cookies — token in `Authorization` header + localStorage

## File Changes

### New files:
- `backend/app/services/auth_service.py`
- `backend/app/api/auth.py`
- `backend/migrations/005_auth.sql`
- `frontend/src/lib/auth.tsx`
- `frontend/src/app/login/page.tsx`
- `frontend/src/app/signup/page.tsx`

### Modified files:
- `backend/app/main.py` — include auth router
- `backend/app/core/config.py` — add JWT_SECRET
- `backend/app/core/deps.py` — add get_current_user
- `backend/requirements.txt` — add passlib, python-jose
- `frontend/src/app/layout.tsx` — wrap with AuthProvider
- `frontend/src/app/dashboard/page.tsx` — add auth guard + user menu
- `frontend/src/lib/api.ts` — add auth headers + user API functions
- `frontend/src/app/page.tsx` — add link to login/signup in header

## Deployment Notes

### Vercel (frontend)
- Set `NEXT_PUBLIC_API_URL` to Railway backend URL
- Auto-deploys on push to main branch

### Railway (backend)
- Set env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`, `JWT_SECRET`, `ALLOWED_ORIGINS` (set to Vercel frontend URL)
- Run migration `005_auth.sql` against Supabase

### Supabase
- Run `005_auth.sql` to create users + waitlist tables

## Blockers / Open Items

- None. Deployment to Vercel/Railway is independent of auth — just needs env vars set.
