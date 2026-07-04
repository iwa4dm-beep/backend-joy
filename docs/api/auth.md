# Auth API — Phase 31

All endpoints live under `/auth/v1/*` and require the workspace publishable
key in the `apikey` header. User-scoped endpoints additionally require a
valid `Authorization: Bearer <access_token>`.

## Configuration

Server-side feature flags (env vars):

| Variable | Default | Effect |
| --- | --- | --- |
| `PLUTO_ENABLE_AUTH_COMPLETION` | `1` | Register the plugin at all |
| `PLUTO_REQUIRE_EMAIL_CONFIRM` | `0` | Enforce `requireEmailConfirmed` on opt-in routes |
| `PLUTO_ENABLE_SMS_OTP` | `0` | Enable `/otp/*` endpoints |
| `PLUTO_APP_URL` | derived from headers | Absolute base URL used inside emailed links |
| `PLUTO_EMAIL_WEBHOOK_URL` | — | If set, emails POST to this URL (JSON body). Otherwise emails go to stdout. |
| `PLUTO_EMAIL_WEBHOOK_SECRET` | — | Sent as `x-pluto-signature` header for verification |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | — | Enable the Twilio SMS provider. Without them SMS goes to stdout (dev). |

### `GET /auth/v1/config`
Returns the enabled surface so the frontend can hide UI it can't use.

```json
{
  "require_email_confirmation": false,
  "sms_otp_enabled": true,
  "email_provider": "webhook",
  "sms_provider": "twilio"
}
```

---

## Password reset

### `POST /auth/v1/recover`
Always returns `200 { "ok": true }` regardless of whether the email exists
(no user enumeration).

```json
{ "email": "alice@example.com" }
```

On success (email is registered) a link is dispatched via the configured
email provider:

```
${PLUTO_APP_URL}/auth/reset-password#token=<32-byte base64url>
```

Token TTL: **30 minutes**, single-use.

### `POST /auth/v1/verify-recovery`
Consumes the token, sets a new password, and revokes all outstanding
refresh tokens for that user.

```json
{ "token": "…", "new_password": "hunter2hunter2" }
```

**Response `200`**
```json
{
  "ok": true,
  "session": {
    "access_token": "eyJ…",
    "refresh_token": "…",
    "expires_at": 1728000000,
    "user": { "id": "…", "email": "alice@example.com", "role": "user" }
  }
}
```

**Errors:** `400 invalid_body`, `400 invalid_or_expired_token`, `500 user_missing`.

---

## Email confirmation

### `POST /auth/v1/send-email-confirmation` — _bearer_
Sends a confirmation link to the currently-signed-in user's address.

- `429 cooldown` if called within 60s of the previous send.
- Link points to `${PLUTO_APP_URL}/auth/confirm-email#token=…` and expires in **24h**.

### `POST /auth/v1/confirm-email`
```json
{ "token": "…" }
```
Marks the user as `email_verified = true` and stamps `email_confirmed_at`.
Returns `{ "ok": true }` or `400 invalid_or_expired_token`.

### `POST /auth/v1/resend-confirmation`
Anonymous resend (no session required). Never enumerates users; returns
`{ "ok": true }` even for unknown addresses. 60s cooldown enforced when the
address is real.

### Opt-in enforcement
When `PLUTO_REQUIRE_EMAIL_CONFIRM=1`, routes can attach
`requireEmailConfirmed` as a preHandler. Unconfirmed users receive
`403 email_not_confirmed`.

---

## Phone / SMS OTP

Requires `PLUTO_ENABLE_SMS_OTP=1`. Without it every `/otp/*` route returns
`404 sms_otp_disabled`.

### `POST /auth/v1/otp/send`
```json
{ "phone": "+15551234567", "channel": "sms" }
```
Sends a 6-digit code. Codes are stored as sha-256 hashes; TTL **10 minutes**.

- Rate limit: **5 sends per phone per hour** → `429 rate_limited`.
- Provider errors bubble up as `502 sms_send_failed`.

### `POST /auth/v1/otp/verify`
```json
{ "phone": "+15551234567", "code": "482913" }
```

Success returns a normal session; on first successful verification for a new
phone number, a user is created with a placeholder email
(`phone+<digits>@phone.pluto.local`) that the user can replace later.

| HTTP | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_phone` | Not valid E.164 format |
| 400 | `invalid_or_expired_code` | Wrong code, expired, or already consumed |
| 429 | `too_many_attempts` | ≥ 5 wrong attempts on the current code |

---

## Common errors

| HTTP | `error` | Meaning |
| --- | --- | --- |
| 400 | `invalid_body` | Zod validation failed |
| 401 | `unauthenticated` | Missing/invalid session bearer |
| 429 | `cooldown` | Retry after `retry_after_sec` |
| 429 | `rate_limited` | OTP send window exhausted |
| 404 | `sms_otp_disabled` | Feature not enabled |
