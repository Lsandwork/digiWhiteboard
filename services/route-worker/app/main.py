"""Route Generator worker — OR-Tools + signed job API."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from .optimizer import optimize_vrp

app = FastAPI(title="Fitdog Route Worker", version="1.0.0")

SIGNING_SECRET = os.environ.get("ROUTE_WORKER_SIGNING_SECRET", "")
MAX_SKEW_SECONDS = 300


def verify_signature(timestamp: str, body: bytes, signature: str) -> None:
    if not SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="ROUTE_WORKER_SIGNING_SECRET is not configured.")
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid timestamp.") from exc
    if abs(int(time.time()) - ts) > MAX_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="Stale request timestamp.")
    message = f"{timestamp}.".encode("utf-8") + body
    expected = hmac.new(SIGNING_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature or ""):
        raise HTTPException(status_code=401, detail="Invalid signature.")


class OptimizeRequest(BaseModel):
    seed: str = "1"
    depot: dict[str, Any]
    vehicles: list[dict[str, Any]]
    stops: list[dict[str, Any]] = Field(default_factory=list)
    time_limit_seconds: int = 20


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "route-worker"}


@app.post("/jobs/optimize")
async def jobs_optimize(
    request: Request,
    x_route_timestamp: str = Header(default=""),
    x_route_signature: str = Header(default=""),
) -> dict[str, Any]:
    body = await request.body()
    verify_signature(x_route_timestamp, body, x_route_signature)
    payload = OptimizeRequest.model_validate_json(body)
    # Hard ban Van 4
    for vehicle in payload.vehicles:
        key = str(vehicle.get("van_key", ""))
        if key == "van_4" or "van 4" in key.lower():
            raise HTTPException(status_code=400, detail="Van 4 is not allowed.")
    result = optimize_vrp(payload.model_dump())
    return result
