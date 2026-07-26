# Route Generator Worker

Long-running Fitdog report retrieval, geocoding, travel-matrix, and OR-Tools optimization for `staff.ruffops.com`.

## Why a separate service?

Vercel serverless requests cannot reliably host Playwright browser sessions or multi-minute OR-Tools solves. Deploy this worker on Railway, Render, Fly.io, or Cloud Run.

## Auth

Every request must include:

- `X-Route-Timestamp` (unix seconds)
- `X-Route-Signature` = HMAC-SHA256 hex of `${timestamp}.${rawBody}` using `ROUTE_WORKER_SIGNING_SECRET`
- Reject timestamps older than 5 minutes (replay protection)

Callbacks to staff.ruffops.com use `ROUTE_WORKER_CALLBACK_SECRET`.

## Endpoints

- `GET /health`
- `POST /jobs/pull-report`
- `POST /jobs/optimize`
- `POST /jobs/geocode`

## Local

```bash
cd services/route-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8091
```
