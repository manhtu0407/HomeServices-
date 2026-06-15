# Custom SMTP Setup (launch prerequisite)

**Why:** Supabase built-in SMTP is capped at **2 emails/hour** project-wide — real signup/confirmation
email will fail past 2 users/hour. A custom SMTP provider is required before opening to real users.

**Who must do this:** the project owner. It requires creating a provider account, entering a secret
API key, and DNS changes on your domain — none of which an automated agent can/should do.

---

## Prerequisites (one-time, owner)

1. **A domain you control** (e.g. `homeservices.vn`). If you don't own one yet, buy one first.
2. **An email provider account.** Recommended for transactional/auth mail:
   - **Resend** (`resend.com`) — simplest, free 3,000 emails/month. ← easiest start
   - or Amazon SES (cheapest at volume), SendGrid, Mailgun.
3. **Verify the sending domain** in the provider (add the DNS records they give you: SPF/DKIM,
   usually a few TXT/CNAME records at your domain registrar). Sender address must be on this
   verified domain — Gmail/free addresses will not work.
4. **Create an API key** in the provider (Resend: `re_...`). Treat it as a secret.

---

## Configure in Supabase (per environment)

Dashboard → **Authentication → Emails → SMTP Settings** → toggle **Enable custom SMTP** → fill:

| Field | Value (Resend example) |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `resend` |
| Password | your API key (`re_...`) |
| Sender email | `no-reply@<your-verified-domain>` |
| Sender name | `Home Services` |

→ **Save changes.** Then the **email rate limit** (Authentication → Rate Limits → "sending emails")
unlocks — raise it from `2/h` to a realistic value (e.g. a few hundred/hour) for launch.

Do this on **production** (`iwevizmsedyqozxlawwl`) first; optionally **staging**
(`xyylanuyflrjzbjzhqfl`) to test the email flow.

---

## Verify it works

1. Send a test email from the SMTP Settings page (if the provider supports it) or trigger a real
   signup with a confirmation email.
2. Confirm the email arrives from `no-reply@<domain>` (not spam).
3. Check the provider dashboard shows the send.

## Notes

- Keep the API key only in Supabase SMTP settings — never commit it to the repo (gitleaks CI will flag it).
- Rotate the key if it's ever exposed.
