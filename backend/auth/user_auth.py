"""User authentication endpoints (email/password + OAuth).

This file is separate from auth_manager.py which handles browser profile
auth for Playwright agents. Do NOT modify auth_manager.py.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

log = logging.getLogger("trashmy.auth")

router = APIRouter()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 30  # 30 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# In-memory user store (replace with database in production)
# ---------------------------------------------------------------------------

_users: dict[str, dict[str, Any]] = {}
# Indexed by email for fast lookup
_users_by_email: dict[str, str] = {}  # email -> user_id


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class OAuthRegisterRequest(BaseModel):
    email: str
    name: Optional[str] = None
    provider: str = "google"
    provider_account_id: Optional[str] = None
    image: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    email: Optional[str] = None
    user_id: Optional[str] = None
    stripe_session_id: Optional[str] = None
    amount_total: Optional[int] = None


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _create_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def _get_current_user(request: Request) -> dict:
    """Extract and validate JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = auth_header[7:]
    payload = _decode_token(token)
    user_id = payload.get("sub")
    if not user_id or user_id not in _users:
        raise HTTPException(status_code=401, detail="User not found")

    return _users[user_id]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register")
async def register(body: RegisterRequest):
    """Register a new user with email and password."""
    email = body.email.lower().strip()

    if email in _users_by_email:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = str(uuid.uuid4())
    hashed_password = pwd_context.hash(body.password)

    _users[user_id] = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "hashed_password": hashed_password,
        "provider": "credentials",
        "has_paid": False,
        "free_analysis_used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _users_by_email[email] = user_id

    token = _create_token(user_id, email)
    log.info("User registered: %s (%s)", user_id[:8], email)

    return {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "token": token,
        "has_paid": False,
        "free_analysis_used": False,
    }


@router.post("/login")
async def login(body: LoginRequest):
    """Login with email and password. Returns JWT."""
    email = body.email.lower().strip()
    user_id = _users_by_email.get(email)

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = _users[user_id]

    if not user.get("hashed_password"):
        raise HTTPException(
            status_code=401,
            detail="This account uses Google sign-in. Please sign in with Google.",
        )

    if not pwd_context.verify(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_token(user_id, email)
    log.info("User login: %s (%s)", user_id[:8], email)

    return {
        "user_id": user_id,
        "email": email,
        "name": user.get("name"),
        "token": token,
        "has_paid": user.get("has_paid", False),
        "free_analysis_used": user.get("free_analysis_used", False),
    }


@router.post("/register-oauth")
async def register_oauth(body: OAuthRegisterRequest):
    """Register or update an OAuth user (called by NextAuth sign-in callback)."""
    email = body.email.lower().strip()
    existing_id = _users_by_email.get(email)

    if existing_id:
        # Update existing user with latest OAuth info
        user = _users[existing_id]
        if body.name:
            user["name"] = body.name
        if body.image:
            user["image"] = body.image
        user["provider"] = body.provider
        if body.provider_account_id:
            user["provider_account_id"] = body.provider_account_id

        log.info("OAuth user updated: %s (%s)", existing_id[:8], email)
        return {
            "user_id": existing_id,
            "email": email,
            "name": user.get("name"),
            "has_paid": user.get("has_paid", False),
            "free_analysis_used": user.get("free_analysis_used", False),
        }

    # Create new user
    user_id = str(uuid.uuid4())
    _users[user_id] = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "image": body.image,
        "provider": body.provider,
        "provider_account_id": body.provider_account_id,
        "hashed_password": None,
        "has_paid": False,
        "free_analysis_used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _users_by_email[email] = user_id

    log.info("OAuth user created: %s (%s)", user_id[:8], email)
    return {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "has_paid": False,
        "free_analysis_used": False,
    }


@router.get("/me")
async def get_me(request: Request):
    """Get current user info (requires JWT in Authorization header)."""
    user = _get_current_user(request)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "has_paid": user.get("has_paid", False),
        "free_analysis_used": user.get("free_analysis_used", False),
        "provider": user.get("provider"),
    }


@router.post("/verify-payment")
async def verify_payment(body: VerifyPaymentRequest):
    """Mark a user as having paid (called by Stripe webhook)."""
    user_id = body.user_id
    email = body.email.lower().strip() if body.email else None

    # Find the user by ID or email
    if user_id and user_id in _users:
        user = _users[user_id]
    elif email and email in _users_by_email:
        uid = _users_by_email[email]
        user = _users[uid]
    else:
        raise HTTPException(status_code=404, detail="User not found")

    user["has_paid"] = True
    user["stripe_session_id"] = body.stripe_session_id
    user["paid_at"] = datetime.now(timezone.utc).isoformat()

    log.info(
        "Payment verified for user %s (%s) - session: %s",
        user["user_id"][:8],
        user["email"],
        body.stripe_session_id,
    )

    return {
        "success": True,
        "user_id": user["user_id"],
        "has_paid": True,
    }
