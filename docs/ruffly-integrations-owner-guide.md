# Ruffly integrations — Fitdog owner + developer guide

Short version: **Gingr, SMS, Email, Gemini, and Web Chat are live.**  
Google Business Profile, Facebook, Instagram, WhatsApp, and AI Voice show up in the UI as placeholders. They are **not broken passwords** — the product code for those channels is not built yet.

---

## What is already working (no action needed to “connect” these)

| Channel | Status | Notes |
|---|---|---|
| **Gingr** | Live | Contacts + webhook fanout into Ruffly |
| **Twilio SMS** | Live (pending Twilio toll-free approval for US delivery) | Number + Messaging Service configured. US carriers still require Toll-Free Verification / A2P before phones receive messages |
| **Resend Email** | Live | Sending flag can stay off until you want outbound email |
| **Gemini AI** | Live | Used for AI text help; not the phone receptionist |
| **Web Chat** | Live | Public widget on `staff.ruffops.com/ruffly/public`; messages land in Ruffly Inbox |

Review links already configured in Vercel:
- `RUFFLY_GOOGLE_REVIEW_URL`
- `RUFFLY_FACEBOOK_REVIEW_URL`

Those power review-request links. They do **not** mean Ruffly can reply to Google/Facebook reviews inside the app yet.

---

## Why those five cards say “Coming soon”

Ruffly’s Integrations page used to say “Setup Required” for Google / Facebook / Instagram / WhatsApp / AI Voice. That was misleading.

Reality:
- There is **no OAuth connect button**
- There is **no place to paste API keys** for those five
- There is **no working adapter** that pulls DMs, comments, reviews, or phone calls into Inbox

So clicking **Test connection** cannot turn them green. Someone has to **build** each channel, then Fitdog leadership has to **approve access** on Google/Meta/etc.

---

## What Fitdog ownership needs to prepare (Brian / Lonnie)

Do these once, before engineering wires each channel. Keep logins in a shared password manager.

### 1) Google Business Profile (reviews / replies later)
1. Confirm Fitdog owns the Google Business Profile for the Santa Monica location.
2. Make sure Lonnie (or whoever will manage reviews) is a **Manager** or **Owner** on that listing.
3. Decide whether Ruffly should only *send* review links (already possible) or also *read/reply* to Google reviews (needs API build).
4. If you want read/reply: create a Google Cloud project under Fitdog, enable **Google Business Profile API**, and be ready to complete OAuth consent as the business.

### 2) Facebook Page
1. Confirm Fitdog owns [Fitdog Sports Club](https://www.facebook.com/FitdogSportsClub) (or the current Page).
2. Lonnie/Brian should be **Page Admin**.
3. Create (or reuse) a Meta Business Portfolio that owns the Page.
4. Decide scope: review links only (done), or Page inbox / comments / posts inside Ruffly (needs build + Meta App Review).

### 3) Instagram
1. Convert/confirm the Fitdog Instagram account is a **Professional / Business** account.
2. Link it to the Fitdog Facebook Page in Meta Business Suite.
3. Same Meta Business Portfolio as Facebook.
4. Decide scope: comments/DMs in Ruffly later; lobby social videos on Digi-board are separate and do **not** use Instagram’s API.

### 4) WhatsApp Business
1. Decide provider:
   - **Meta WhatsApp Cloud API** (direct), or
   - **Twilio WhatsApp** (same Twilio account already used for SMS)
2. Have the business legal name + display name ready (**Fitdog Health & Social Club, Inc.** / Fitdog).
3. Be ready for Meta’s business verification if asked.
4. Pick the public WhatsApp number customers will message (can be new; should not casually reuse a personal phone).

### 5) AI Voice / Phone receptionist
1. Pick a voice vendor (common options: Twilio Voice + AI, Vapi, Retell, Bland — not chosen yet).
2. Decide the public Fitdog phone number that should ring the AI (new Twilio number vs forward existing main line).
3. Write the call script rules: what AI can answer, when to transfer to a human, after-hours behavior.
4. Keep `RUFFLY_VOICE_ENABLED=false` until a real provider is wired and tested.

---

## What developers need to build (engineering checklist)

For each planned channel, the build is the same shape:

1. **Adapter** under `lib/integrations/...` with `isConfigured()`, `testConnection()`, send/receive methods.
2. **OAuth or credential storage** (never show secrets in the UI after save).
3. **Webhook endpoints** under `app/api/ruffly/webhooks/...` for inbound events.
4. **Inbox mapping** into `ruffly_conversations` / `ruffly_messages` (same pattern as webchat/SMS).
5. **Integrations card** flipped from `kind: "planned"` to live once test passes.
6. **Feature flag** in Vercel, default off, turned on only after a successful test.

Suggested order (most customer value first):
1. WhatsApp (customers already text; inbox unification)
2. Google Business Profile review sync/reply
3. Facebook/Instagram comments + DMs
4. AI Voice receptionist

Do **not** turn on `RUFFLY_VOICE_ENABLED` or invent Meta env vars until the adapter exists.

---

## Current Vercel flags (production)

Keep these intentional:

| Flag | Intent |
|---|---|
| `RUFFLY_ENABLED=true` | Ruffly app on |
| `RUFFLY_WEBCHAT_ENABLED=true` | Public web chat on |
| `RUFFLY_SENDING_SMS_ENABLED=true` | Outbound SMS attempts on (carrier delivery still needs Twilio toll-free/A2P approval) |
| `RUFFLY_SENDING_EMAIL_ENABLED` | Only on when you want outbound email |
| `RUFFLY_AI_ENABLED` | Text AI features |
| `RUFFLY_VOICE_ENABLED=false` | Leave off until voice is real |

---

## How to tell “working” from “placeholder” in the UI

- **Credentials present / Connected** → live channel; Test connection is meaningful.
- **Coming soon** → not built; Test is disabled.
- Web Chat messages appearing in **Inbox** → that channel is confirmed working (already verified).

---

## Bottom line for Fitdog leadership

Ruffly is already useful for:
- Gingr-linked customer care
- Web chat into staff Inbox
- SMS/email plumbing (SMS waiting on Twilio verification)
- AI text assist (Gemini)

The social + phone receptionist cards are a **roadmap**, not a login problem. Ownership’s job is account access and business verification. Engineering’s job is to build each adapter, test it, then flip the flag.
