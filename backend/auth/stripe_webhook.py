"""Stripe webhook handler (backend-side backup).

This provides a direct Stripe webhook endpoint on the backend as a backup
to the Next.js webhook handler at /api/stripe/webhook.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import stripe
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

log = logging.getLogger("trashmy.stripe")

router = APIRouter()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

stripe.api_key = STRIPE_SECRET_KEY


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events.

    Validates the webhook signature and processes checkout.session.completed
    events to mark users as paid.
    """
    body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload=body,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError:
        log.warning("Stripe webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as exc:
        log.error("Stripe webhook error: %s", str(exc)[:200])
        raise HTTPException(status_code=400, detail="Webhook error")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_email = (session.get("metadata") or {}).get("user_email") or session.get("customer_email")
        user_id = (session.get("metadata") or {}).get("user_id")

        log.info(
            "Stripe checkout completed: email=%s, user_id=%s, session=%s",
            user_email,
            user_id,
            session.get("id"),
        )

        # Update user payment status in the in-memory store
        from auth.user_auth import _users, _users_by_email

        found = False
        if user_id and user_id in _users:
            _users[user_id]["has_paid"] = True
            _users[user_id]["stripe_session_id"] = session.get("id")
            found = True
        elif user_email:
            email_lower = user_email.lower().strip()
            uid = _users_by_email.get(email_lower)
            if uid and uid in _users:
                _users[uid]["has_paid"] = True
                _users[uid]["stripe_session_id"] = session.get("id")
                found = True

        if found:
            log.info("User payment status updated successfully")
        else:
            log.warning("Could not find user to update payment status: email=%s, id=%s", user_email, user_id)

    return JSONResponse({"received": True})
