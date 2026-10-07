# Cache / offline / 3G end-to-end check

The display cache, the offline pill, the recovery probe and the offline session screen only show their worth
against a backend that can be slowed, cut and hung on demand. Production cannot be, so this check runs the Expo
web build against a local mock of Supabase Auth, PostgREST and `mobile-api` and drives it through a headless
Chromium browser.

## Run it

```bash
node scripts/preview/cache-e2e/run.mjs
```

- Needs `apps/mobile/node_modules` (an offline `corepack pnpm install` is enough) and Chrome or Edge.
  Set `CACHE_E2E_BROWSER` to the binary if it is not in a standard location.
- Ports 54399 (mock), 8098 (Metro) and 9333 (browser debugging) must be free.
- The first Metro build takes a few minutes; Metro runs with a private `TEMP` so another checkout's
  transform cache cannot leak in.
- Exit code 0 = every scenario passed, 1 = a scenario failed, 2 = the harness could not start.
- Screenshots and `results.json` land in `.scratch/cache-e2e/` (gitignored).

To explore by hand instead, start only the mock and Metro, then open `http://localhost:8098/login`
(or `preview_start` the `mobile-web-mock` entry in `.claude/launch.json`):

```bash
node scripts/preview/cache-e2e/run.mjs --serve
```

Accounts are `customer.a@nestscout.test`, `customer.b@nestscout.test` and `worker.a@nestscout.test`; the
password is `MOCK_PASSWORD` in `scripts/preview/cache-e2e/mock-backend.mjs`. They exist only inside the mock.
Switch the network with `http://127.0.0.1:54399/__mock/mode?offline=1` (connection reset), `hang=1`
(no answer), `delayMs=2000`, `profileDelayMs=5000`; `offline=0&hang=0` restores it. `/__mock/log` lists
every request the app sent.

## What it checks

| Scenario | Pass condition |
|---|---|
| Disk envelope | one owner, display families only |
| Cold start, slow backend | cached history paints before the role read returns |
| Tab re-entry, 3 s backend | no `/me/jobs/history` request, data within 300 ms |
| Offline launch with a cache | data shown, offline pill, stays on the screen |
| Link returns | pill clears without a tap |
| Idle screen, link drops and returns | the recovery probe (`/notifications`) brings it back |
| Hanging link | offline within two 15 s timeouts, cached data still shown |
| DevTools Slow 3G | cached tab paints within 500 ms |
| Sign-out | cache and session removed from disk |
| Second account | sees only its own history |
| Leftover envelope + offline first launch | no data of the previous account; offline session screen instead of the Login Gate |
| Offline session screen | recovers to the account without a tap |

## What it cannot check

- Native behaviour: the real splash, SecureStore, the expo-image disk cache, iOS/Android radio states.
- Image re-encoding and upload deadlines: they need the native image picker.
- The real Edge and database: the mock answers only the reads these scenarios use, with fixed rows.
