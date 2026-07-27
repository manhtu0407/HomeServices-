# SePay VietQR Production Activation

The source tree contains a fail-closed code path. It cannot create a Production QR or move a job to `paid` until every required Edge secret is present and `NESTSCOUT_SEPAY_VIETQR_ENABLED=true`.

Do not place any value from this document in mobile configuration, source code, git, or chat logs.

## What Is Ready

- Customer payment intent creates a VietQR image URL on the server only.
- The customer can open the QR and see the transfer content, but cannot confirm that money was received.
- `sepay-webhook` verifies SePay HMAC over the exact raw request body before calling the database.
- `create_worker_vietqr_payment_intent` atomically locks the job, freezes the qualifying worker tier and commission, then creates one pending worker-ledger credit with the QR intent.
- `apply_sepay_vietqr_payment_webhook` locks the transaction, job, and ledger, accepts retries idempotently, and moves the job to `paid` plus the worker-ledger credit to `available` only when the verified inbound amount exactly matches the frozen gross amount.
- A wrong amount is kept in `payment_pending` with `payment_status=amount_mismatch`; it never marks the job paid.
- Worker earnings and the in-app account balance read the immutable payment ledger, not mutable job totals.

## Money Boundary

- The customer pays the configured NestScout merchant account through VietQR. A verified callback creates an **in-app payable balance** for the assigned worker after the platform commission has been frozen.
- The base worker commission is 15% at Level 1. Higher levels are server-managed policy rows and may only reduce that percentage; no lower-rate tier is seeded automatically.
- Each payment keeps its own frozen rate and level. Changing a future tier never rewrites a completed worker credit.
- Before a worker is selected, shared Kael briefs do not show a fabricated net amount. Worker-specific offer and job estimates read the current server tier; the payment intent then freezes the final rate.
- This rail does **not** send money to a worker bank account and does not make a bank payout claim in the app. A licensed/approved payout provider, settlement controls, and reconciliation are required before withdrawals can be enabled.

## Required Provider Setup

1. Create and verify the SePay merchant account, then link the bank account that should receive NestScout payments.
2. Configure SePay payment-code recognition for the `NS` prefix and an alphanumeric suffix of 24 characters. The Edge function creates codes in that format.
3. Create a webhook for incoming transfers only, pointing to:

```text
https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/sepay-webhook
```

4. Configure HMAC-SHA256 verification in SePay. The receiver expects `X-SePay-Signature` and `X-SePay-Timestamp` and rejects callbacks outside the five-minute signature window.
5. Restrict the SePay webhook as far as the provider permits: only the linked merchant account and transfers whose recognized payment code begins with `NS`.

## Edge Secrets

Set these values in the Production Supabase Edge secret store, never in `.env` tracked by git:

```text
NESTSCOUT_SEPAY_VIETQR_ENABLED=true
SEPAY_VIETQR_BANK_CODE=<VietQR bank code>
SEPAY_VIETQR_ACCOUNT_NUMBER=<merchant account number>
SEPAY_VIETQR_ACCOUNT_HOLDER=<merchant account holder>
SEPAY_WEBHOOK_SECRET=<SePay HMAC secret>
```

Keep `NESTSCOUT_SEPAY_VIETQR_ENABLED` unset or false until the migration, function deployments, and a provider Test Mode callback have all passed.

## Activation Order

1. Record the current Production migration state and make a backup or export suitable for the live data volume.
2. Run `supabase db push --dry-run --linked` against Production. It must show the expected pending migrations, including `20260727153000_sepay_vietqr_webhook_atomic.sql` and `20260727160000_worker_payment_ledger_commission.sql`, and no unexpected migration.
3. Before applying, reconcile or remove any duplicate non-null `jobs.payment_code` or `jobs.sepay_transaction_id`. The ledger migration intentionally fails rather than attach one provider event to two jobs.
4. Inspect existing SePay rows. The migration backfills only rows whose frozen gross amount, fee, net, worker, and prior rate agree exactly; any unresolved row deliberately aborts the migration for manual reconciliation.
5. Apply the approved migrations. Do not manually alter migration history.
6. Configure any approved higher worker tiers through the protected admin path. Each higher level must have equal-or-higher qualification thresholds and an equal-or-lower commission than the prior level.
7. Deploy `mobile-api` and `sepay-webhook` together after the migration succeeds.
8. Set the five Edge secrets above, then redeploy both functions so the runtime reads the new configuration.
9. Use SePay Test Mode or a controlled low-value transfer to a disposable test job. Confirm that the webhook returns HTTP 200 with `{ "success": true }`, the customer sees `paid`, and the assigned worker sees the frozen net amount as an in-app available balance only after the verified callback.
10. Test a duplicate callback and a deliberately mismatched amount. Both must remain safe: duplicate is idempotent and mismatch must not pay the job or credit the worker balance.

## Rollback And Operations

- To stop new Production QR intents, set `NESTSCOUT_SEPAY_VIETQR_ENABLED=false` and redeploy `mobile-api` plus `sepay-webhook`.
- Do not delete payment records, callbacks, job events, or customer jobs during rollout or investigation.
- Do not add a client-side "payment confirmed" button. Payment status is authoritative only after the HMAC-verified webhook and atomic RPC complete.
- Static VietQR images do not have a provider-enforced expiry. Operations should reconcile a stale `payment_pending` job instead of assuming that the QR expired.
- Keep the payout controls disabled until an approved provider can initiate and reconcile a bank transfer against an immutable debit ledger. An available in-app balance is a liability to the worker, not evidence that their bank has received funds.

## Provider References

- [SePay webhook authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- [SePay webhook payload and acknowledgement](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- [SePay payment-code recognition](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan)
- [VietQR dynamic image URL](https://docs.sepay.vn/tao-qr-code-vietqr-dong.html)
