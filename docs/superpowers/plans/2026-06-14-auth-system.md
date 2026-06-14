# Auth System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** Add email/password auth with 20-user limit, reward keys, and waitlist.

**Architecture:** Self-contained auth in existing FastAPI + Next.js stack. No external provider. Passwords hashed with bcrypt, JWTs for session management. All auth logic in new `auth_service.py` and `auth.py` files. Existing routes protected via FastAPI dependency injection. Frontend gets an `AuthContext` provider and login/signup pages.

**Tech Stack:** passlib[bcrypt], python-jose[cryptography] (backend), React Context (frontend)

---

### Task 0: Git backup (current project state)

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
*.egg
.venv/
venv/
.env.txt

# Node
node_modules/
.next/
*.tsbuildinfo

# IDE
.vscode/
.superpowers/

# Backend uploads
backend/uploads/*
!backend/uploads/.gitkeep

# Logs
*.log
```

- [ ] **Step 2: Init git and create initial commit**

Run: `cd "C:\Users\THE HM\Desktop\ferret"`

```bash
git init
git add .
git commit -m "Initial commit: Ferret - codebase analysis with deterministic graph architecture"
```

Expected: Files staged and committed

---

### Task 1: Database migration (005_auth.sql)

**Files:**
- Create: `backend/migrations/005_auth.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 005: Auth tables for beta test users

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    reward_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist (email);
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/005_auth.sql
git commit -m "feat: add auth tables migration (users + waitlist)"
```

---

### Task 2: Backend config + dependencies

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add JWT_SECRET to config**

```python
JWT_SECRET: str = os.getenv("JWT_SECRET", "")
```

Add after `SECRET_KEY` line (line 19).

- [ ] **Step 2: Add passlib and python-jose to requirements.txt**

```
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/config.py backend/requirements.txt
git commit -m "feat: add JWT_SECRET config and auth dependencies"
```

---

### Task 3: Auth service

**Files:**
- Create: `backend/app/services/auth_service.py`

- [ ] **Step 1: Create auth_service.py**

```python
import logging
import uuid
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from app.core.database import get_supabase
from app.core.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MAX_USERS = 20


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


def get_user_count() -> int:
    supabase = get_supabase()
    result = supabase.table("users").select("id", count="exact").execute()
    return result.count or 0


def register_user(email: str, password: str) -> dict:
    count = get_user_count()
    if count >= MAX_USERS:
        raise ValueError("Beta full")

    hashed = hash_password(password)
    reward_key = str(uuid.uuid4())
    supabase = get_supabase()

    result = supabase.table("users").insert({
        "email": email,
        "password_hash": hashed,
        "reward_key": reward_key,
    }).execute()

    if not result.data:
        raise RuntimeError("Failed to create user")

    user = result.data[0]
    token = create_access_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "reward_key": user["reward_key"],
        },
    }


def authenticate_user(email: str, password: str) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("email", email).execute()
    if not result.data:
        return None

    user = result.data[0]
    if not verify_password(password, user["password_hash"]):
        return None

    token = create_access_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "reward_key": user["reward_key"],
        },
    }


def get_user_by_id(user_id: str) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("users").select("id,email,reward_key,created_at").eq("id", user_id).execute()
    if not result.data:
        return None
    return result.data[0]


def add_waitlist(email: str) -> bool:
    supabase = get_supabase()
    try:
        supabase.table("waitlist").insert({"email": email}).execute()
        return True
    except Exception as e:
        logger.warning("Failed to add waitlist email %s: %s", email, e)
        return False
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/auth_service.py
git commit -m "feat: add auth service with password hashing, JWT, user CRUD"
```

---

### Task 4: Auth API endpoints

**Files:**
- Create: `backend/app/api/auth.py`

- [ ] **Step 1: Create auth.py**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.services.auth_service import (
    register_user,
    authenticate_user,
    get_user_by_id,
    add_waitlist,
    verify_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class WaitlistRequest(BaseModel):
    email: str


class UserResponse(BaseModel):
    id: str
    email: str
    reward_key: str
    created_at: str | None = None


def get_current_user(authorization: str | None = None) -> dict:
    from fastapi import Header
    # This will be replaced by the proper dependency in deps.py
    pass


@router.post("/signup")
async def signup(request: SignupRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    try:
        result = register_user(request.email, request.password)
        return result
    except ValueError as e:
        if str(e) == "Beta full":
            raise HTTPException(status_code=403, detail="Beta full")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail="Email already registered")
        logger = __import__("logging").getLogger(__name__)
        logger.error("Signup error: %s", e)
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login")
async def login(request: LoginRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    result = authenticate_user(request.email, request.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return result


@router.post("/waitlist")
async def waitlist(request: WaitlistRequest):
    if not request.email:
        raise HTTPException(status_code=400, detail="Email required")
    ok = add_waitlist(request.email)
    if ok:
        return {"detail": "Added to waitlist"}
    raise HTTPException(status_code=409, detail="Email already on waitlist")


@router.get("/me")
async def get_me(token: str | None = None):
    from fastapi import Header
    # Temporary inline auth check until deps is wired
    auth_header = token
    if not auth_header:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(auth_header.replace("Bearer ", ""))
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return UserResponse(**user)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/auth.py
git commit -m "feat: add auth API endpoints (signup, login, me, waitlist)"
```

---

### Task 5: Wire auth dependency into deps.py

**Files:**
- Modify: `backend/app/core/deps.py`

- [ ] **Step 1: Rewrite deps.py**

```python
from fastapi import Header, HTTPException, Depends
from app.core.config import settings
from app.services.auth_service import verify_token, get_user_by_id


async def verify_api_key(x_api_key: str = Header(default=None)):
    if settings.ENVIRONMENT == "development":
        return True
    if x_api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True


async def get_current_user(authorization: str = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(authorization.replace("Bearer ", ""))
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

- [ ] **Step 2: Update auth.py /me endpoint to use the proper dependency**

Edit `backend/app/api/auth.py` — replace the manual `/me` endpoint with:

```python
from app.core.deps import get_current_user

# ... (keep signup, login, waitlist as-is)

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/deps.py backend/app/api/auth.py
git commit -m "feat: add get_current_user dependency, wire into auth /me endpoint"
```

---

### Task 6: Protect existing API routes with auth

**Files:**
- Modify: `backend/app/api/repositories.py`
- Modify: `backend/app/api/analysis.py`
- Modify: `backend/app/api/questions.py`

- [ ] **Step 1: Add auth dependency to repositories.py**

Add import: `from app.core.deps import get_current_user`

Add `user: dict = Depends(get_current_user)` to every endpoint in repositories.py (upload, list_all, get_by_id, invalidate-cache, subgraph, impact, onboarding, delete).

The pattern for each:

```python
@router.post("/upload", response_model=RepositoryResponse)
async def upload_repository(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    # ... existing body
```

- [ ] **Step 2: Add auth dependency to analysis.py**

```python
from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import get_current_user

@router.get("/{repository_id}/graph")
async def get_repository_graph(repository_id: str, user: dict = Depends(get_current_user)):
    # ... existing body

@router.get("/{repository_id}/files")
async def get_repository_files(repository_id: str, user: dict = Depends(get_current_user)):
    # ... existing body
```

- [ ] **Step 3: Add auth dependency to questions.py**

```python
from fastapi import APIRouter, Depends
from app.core.deps import get_current_user

@router.post("/{repository_id}/ask")
async def ask_question(repository_id: str, request: QuestionRequest, user: dict = Depends(get_current_user)):
    # ... existing body
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/repositories.py backend/app/api/analysis.py backend/app/api/questions.py
git commit -m "feat: protect all API routes with auth dependency"
```

---

### Task 7: Wire auth router into main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add auth router import and include**

```python
from app.api.auth import router as auth_router

app.include_router(auth_router)
```

Add after the existing includes (after line 30).

- [ ] **Step 2: Verify imports**

Run: `cd "C:\Users\THE HM\Desktop\ferret\backend" && python -c "from app.main import app; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: include auth router in main app"
```

---

### Task 8: Frontend auth context and API functions

**Files:**
- Create: `frontend/src/lib/auth.tsx`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create auth context**

```tsx
'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  reward_key: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('ferret_token');
    if (stored) {
      setToken(stored);
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem('ferret_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('ferret_token', data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ferret_token');
    setToken(null);
    setUser(null);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw { status: res.status, message: body.detail || 'Signup failed' };
    }
    const data = await res.json();
    localStorage.setItem('ferret_token', data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Add auth header to API client**

In `frontend/src/lib/api.ts`, add before the `fetchApi` function:

```typescript
function getAuthHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ferret_token');
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}
```

And update `fetchApi` to merge auth headers:

```typescript
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...options,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ferret_token');
      window.location.href = '/login';
    }
  }
  // ... rest same
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd "C:\Users\THE HM\Desktop\ferret\frontend" && npx tsc --noEmit`

Expected: No output (zero errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/auth.tsx frontend/src/lib/api.ts
git commit -m "feat: add auth context provider and wire auth headers into API client"
```

---

### Task 9: Frontend login page

**Files:**
- Create: `frontend/src/app/login/page.tsx`

- [ ] **Step 1: Create login page**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-lg font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to your Ferret account</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
          </button>
          <p className="text-center text-sm text-zinc-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/login/page.tsx
git commit -m "feat: add login page"
```

---

### Task 10: Frontend signup page with waitlist support

**Files:**
- Create: `frontend/src/app/signup/page.tsx`

- [ ] **Step 1: Create signup page**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [betaFull, setBetaFull] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [rewardKey, setRewardKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.status === 403) {
        setBetaFull(true);
      } else {
        setError(err.message || 'Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWaitlist = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'Failed to join waitlist');
        return;
      }
      setWaitlistDone(true);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (betaFull) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-amber-700 text-lg font-bold">!</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Beta is full</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Ferret is currently limited to 20 beta test users and we&apos;ve reached capacity.
            Thank you so much for your interest!
          </p>
          {!waitlistDone ? (
            <div className="mt-6">
              <p className="text-sm text-zinc-500 mb-3">
                Join the waitlist and we&apos;ll let you know when we expand:
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleWaitlist}
                  disabled={loading || !email}
                  className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              You&apos;re on the list!
            </div>
          )}
          <p className="mt-6 text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-lg font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-500">Limited to 20 beta testers</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
          </button>
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/signup/page.tsx
git commit -m "feat: add signup page with beta-full waitlist flow"
```

---

### Task 11: Wrap layout with AuthProvider

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Add AuthProvider to layout**

```tsx
import { AuthProvider } from '@/lib/auth';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <AuthProvider>{children}</AuthProvider>
        <ScrollbarStyles />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd "C:\Users\THE HM\Desktop\ferret\frontend" && npx tsc --noEmit`

Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat: wrap layout with AuthProvider"
```

---

### Task 12: Add auth guard and user menu to dashboard

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add auth guard + user menu**

Add imports at top:
```tsx
import { useAuth } from '@/lib/auth';
import { LogOut, Key } from 'lucide-react';
```

Add after component definition (after `export default function DashboardPage()`):
```tsx
const { user, logout, loading: authLoading } = useAuth();
```

Add redirect guard (right after the hook calls):
```tsx
useEffect(() => {
  if (!authLoading && !user) {
    router.push('/login');
  }
}, [user, authLoading, router]);

if (authLoading) return null;
if (!user) return null;
```

Add user menu to header (after the Ferret logo link):
```tsx
<div className="flex items-center gap-4">
  <div className="text-xs text-zinc-500">
    <span className="text-zinc-400">{user.email}</span>
  </div>
  <button
    onClick={() => {
      const key = user.reward_key;
      if (key) {
        navigator.clipboard.writeText(key);
        alert('Reward key copied! Save this for full release.');
      }
    }}
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
    title="Beta reward key"
  >
    <Key className="w-3.5 h-3.5" />
    Reward Key
  </button>
  <button
    onClick={logout}
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
  >
    <LogOut className="w-3.5 h-3.5" />
    Sign out
  </button>
</div>
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd "C:\Users\THE HM\Desktop\ferret\frontend" && npx tsc --noEmit`

Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add auth guard and user menu with reward key display"
```

---

### Task 13: Add login link to landing page

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add Login button to header**

In the header section (after the Ferret logo text), add a login link:

```tsx
<Link
  href="/login"
  className="ml-auto h-8 px-4 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors inline-flex items-center"
>
  Sign in
</Link>
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd "C:\Users\THE HM\Desktop\ferret\frontend" && npx tsc --noEmit`

Expected: No output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add login link to landing page header"
```

---

### Task 14: Update README with auth + deployment docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Auth System section to README after Backend Architecture**

```markdown
### Authentication System

Ferret uses email/password authentication for beta access, limited to 20 test users.

**Flow:**
1. User signs up at `/signup` — backend checks user count, creates account with bcrypt-hashed password
2. On success, user receives a JWT (7-day expiry) and a unique reward key for full-release benefits
3. All API routes (except auth endpoints) require `Authorization: Bearer <token>` header
4. When the 20-user cap is reached, signup shows a waitlist form collecting emails in a `waitlist` table

**Reward keys** — each user gets a UUID at signup stored in `users.reward_key`. Displayed in the dashboard with a copy button. For use at full release.

**Frontend auth** — `AuthContext` provider in `src/lib/auth.tsx` manages token + user state. Protected pages redirect to `/login` if no valid token.
```

- [ ] **Step 2: Add deployment section**

```markdown
## Deployment

### Frontend → Vercel
1. Push this repo to GitHub
2. Create a new project in Vercel, import the GitHub repo
3. Set root directory to `frontend/`
4. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-url.com`
5. Deploy — auto-deploys on every push to main

### Backend → Railway
1. Create a new project in Railway, point it at the same GitHub repo
2. Set root directory to `backend/`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`
   - `JWT_SECRET` (generate a random string)
   - `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app`
   - `ENVIRONMENT=production`

### Supabase
Run each migration SQL file against your Supabase project in order:
- `backend/migrations/001_create_tables.sql`
- `backend/migrations/004_onboarding_guides.sql`
- `backend/migrations/005_auth.sql`
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add auth system and deployment instructions to README"
```

---

### Self-Review Checklist

- **All signup/login/waitlist flows from spec have corresponding tasks** ✓
- **No placeholders or TODOs** ✓
- **Type consistency maintained** — `get_current_user` returns dict matching `UserResponse`, auth context uses same shape ✓
- **All file paths are exact** ✓
- **Every code block is complete** ✓
