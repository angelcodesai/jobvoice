# JobVoice — Plan 2 Setup: Play Console, RevenueCat & Quotas

**Prerequisite:** [SETUP.md](./SETUP.md) is done — Supabase project live, `extract-job`
deployed once, `.env` filled with the Supabase URL + anon key. Estimated time: ~60–90 min
(mostly Play Console review waits).

Follow the sections **in order** — RevenueCat needs the Play products, the webhook needs
the database migration, and the QA flow needs everything above it.

## 1. Google Play Console (~$25 one-time)

1. No developer account yet? https://play.google.com/console → register (**$25 one-time fee**;
   identity verification can take a day or two — start this first).
2. **Create app** → name `JobVoice`, app type App, free. Package name is fixed by the code:
   **`com.riseupkings.jobvoice`** (set in `src/verticals/jobvoice.ts` via `app.config.ts`).
3. **Set up a CLOSED TESTING track** (Testing → Closed testing → create track). This is
   required twice over: Google's new-personal-account rule (**12 testers for 14 days**
   before production access) AND subscription products are **only purchasable from a
   testing track** — you cannot QA purchases without one. Upload your first build here
   (see section 5 for how to build an `.aab` with EAS).
4. **Monetize → Subscriptions → Create subscription**, twice:
   - `jobvoice_pro_annual` — base plan **$49.99/year**, plus an **offer with a 7-day free
     trial** on that base plan.
   - `jobvoice_pro_monthly` — base plan **$8.99/month** (no trial).

   The product IDs must match exactly — the app hardcodes them in
   `src/verticals/jobvoice.ts`. Activate both.
5. **Add license testers**: Play Console home (all-apps level) → Settings → **License testing**
   → add your own Google account. License testers' purchases are **free sandbox purchases**
   that auto-renew on an accelerated schedule — this is how you QA without spending money.

## 2. RevenueCat (~15 min)

1. https://app.revenuecat.com → create a project (e.g. `jobvoice`).
2. **Add a Play Store app** to the project. RC needs a **Google Play service-account
   credentials JSON** to talk to the Play API. Follow RC's guide step by step:
   https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials
   — in short: Google Cloud console → create service account + JSON key, then Play Console
   → **Users and permissions** → invite that service account with financial-data
   permissions. (Credentials can take up to ~36h to propagate, usually much less.)
3. **Entitlements** → create one with identifier **`pro`** (must match
   `src/verticals/jobvoice.ts`).
4. **Products** → import/add `jobvoice_pro_annual` and `jobvoice_pro_monthly`, then
   **attach both products to the `pro` entitlement**. (Skipping the attach step is the
   classic "purchase succeeds but Pro never activates" bug.)
5. **Offerings** → create/edit the **default** offering → add an **Annual package** with
   `jobvoice_pro_annual` and a **Monthly package** with `jobvoice_pro_monthly`. The
   paywall reads the default offering's packages.
6. Project settings → API keys → copy the **public** Google Play SDK key (`goog_...`) into
   `.env`:

   ```
   EXPO_PUBLIC_RC_API_KEY=goog_xxxxxxxxxxxx
   ```

   Never use the secret key in the app. Leave the key empty in dev if you want billing
   disabled (the paywall then shows "Billing isn't available in this build.").

## 3. RevenueCat webhook → Supabase

The `rc-webhook` edge function is the only writer of **verified** entitlement rows.

1. Generate a random secret, e.g. in PowerShell:

   ```powershell
   -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
   ```

2. RC dashboard → **Integrations → Webhooks** → add:
   - URL: `https://<project-ref>.supabase.co/functions/v1/rc-webhook`
   - **Authorization header value**: the secret from step 1 (bare or `Bearer <secret>` —
     the function accepts both).
3. Give the function the same secret:

   ```powershell
   cd e:\self\business_ide\jobvoice
   npx supabase secrets set RC_WEBHOOK_SECRET=<same secret>
   ```

## 4. Database migration + function deploys

Order matters — the webhook and the new `extract-job` both write to tables the migration
creates.

```powershell
cd e:\self\business_ide\jobvoice
npx supabase db push                                    # applies everything in supabase/migrations/
npx supabase functions deploy extract-job               # quota-enforcing version
npx supabase functions deploy rc-webhook --no-verify-jwt
npx supabase functions deploy delete-account            # in-app account deletion (keep JWT verification ON — no flag)
```

- `db push` now applies **two** migrations: `20260720_usage_entitlements.sql` (usage +
  entitlements tables and the `increment_usage` function) plus the Plan 3
  `20260721_jobs_sync.sql` (cloud `jobs`/`line_items` mirror for backup/restore).
  **Run it before deploying either function.**
- **Enable the Email provider** (Plan 3 account linking + restore): Supabase dashboard →
  **Authentication → Sign In / Up → Email** → enable it with **magic link / OTP** sign-in
  on. The app's "Secure your data" (profile) sends a confirmation link via
  `updateUser({ email })`, and "Restore from another device" signs in with a 6-digit
  email OTP — both require the Email provider.
- **Set the Site URL** (Authentication → URL Configuration → Site URL): the
  email-confirmation link from "Secure your data" redirects there after verifying. The
  default `localhost:3000` lands users on a broken page — point it at a simple hosted
  "you're linked" page or the marketing site.
- `--no-verify-jwt` is required: RevenueCat calls without a Supabase JWT; auth is the
  shared secret from section 3.
- **`expo-notifications` needs no extra config** for the Plan 3 follow-up reminders —
  they are local (on-device) notifications, so no push credentials, FCM setup, or
  config-plugin options are required.
- Quotas enforced by the new `extract-job`: **trial 25 notes total**, **unverified-pro
  grace 50/month**, **verified pro 300/month** (429 with `TRIAL_LIMIT`/`MONTHLY_LIMIT`).
- ⚠️ The new `extract-job` requires the `vertical` field the new app sends — **old app
  builds will get a 400** after this deploy. Ship the function and the app build together.

## 5. Build the app (Expo Go no longer works)

`react-native-purchases` is a **native module** — the app no longer runs in Expo Go.
Web preview (`npx expo start --web`) still works for UI iteration (billing shows its
unavailable state there).

**Local dev build** (Android device with USB debugging, or an emulator):

```powershell
cd e:\self\business_ide\jobvoice
npx expo run:android
```

**EAS alternative** (cloud build, installable dev client):

```powershell
npx eas init            # first time only — adds the projectId
npx eas build --profile development --platform android
```

For the Play Console closed-testing upload, build a release `.aab`:

```powershell
npx eas build --profile production-jobvoice --platform android
```

## 6. Purchase QA flow

Use the license-tester Google account from section 1.5 on the device.

1. Install the dev build and use the app normally until you've recorded **25** notes
   (trial cap).
2. Record the **26th** note → processing fails with the trial-limit message
   (`TRIAL_LIMIT`, HTTP 429 under the hood).
3. Tap **See plans** → paywall opens.
4. Paywall shows **both** plans with sandbox prices (Annual $49.99 with "7-day free
   trial · Best value", Monthly $8.99).
5. Purchase the **annual** plan with the license-tester account (Google shows it's a
   test purchase — free).
6. **"Welcome to Pro!"** alert appears and you land back on the job's error screen.
7. The error screen now shows **Retry** instead of "See plans" (the app sees the RC
   entitlement locally).
8. Tap **Retry** → extraction succeeds. (Immediately after purchase this may run under
   the unverified **grace window** — 50 notes/month — until the webhook lands.)
9. Supabase dashboard → Table editor → **`entitlements`** → within ~a minute a row for
   your user appears with **`verified = true`** (written by `rc-webhook`).
10. Check the **`usage`** table → your user's row for the current month increments with
    each processed note.

## 7. Verification checklist

- [ ] `entitlements` row for the QA user has `verified = true` and a future `expires_at`.
- [ ] `usage.note_count` increments after each successful extraction (and does NOT
      increment on failed extractions).
- [ ] Quota 429s render as friendly in-app messages (trial: "free trial notes are used
      up…"; monthly: limit message) — never a raw error.
- [ ] **Restore purchases** works: uninstall → reinstall the dev build → paywall →
      Restore purchases → "Purchases restored", Pro active again.

## 8. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Paywall shows "Plans are unavailable right now" (no products) | Play subscriptions were created minutes ago (propagation can take hours — wait); the build isn't from a **testing track**-eligible package/signing; or the RC **default Offering** doesn't contain both packages. |
| No rows appearing in `entitlements` after purchase | `RC_WEBHOOK_SECRET` doesn't match the Authorization header value in RC → check `npx supabase functions logs rc-webhook` for 401s; or the migration wasn't pushed (`npx supabase db push`) so the upsert fails. |
| "Billing isn't available in this build." | `EXPO_PUBLIC_RC_API_KEY` is empty in `.env` (restart the bundler after editing), or you're running in Expo Go / web instead of a dev build. |
| Purchase succeeds but Pro doesn't activate ("Purchase completed but Pro didn't activate") | The products aren't **attached to the `pro` entitlement** in RevenueCat (section 2.4). |
| Old installed builds fail with 400 after redeploying `extract-job` | Expected — they don't send the `vertical` field. Update the app build. |

## Before Play review

The paywall links to hardcoded legal URLs — these pages **must be live** before
submitting for Play review (and be listed in the Play Console store listing):

- https://riseupkings.com/jobvoice/privacy
- https://riseupkings.com/jobvoice/terms

### Before production

Two pages **must be live** before a production release (not just closed testing):

- The **privacy policy** above (also linked from the Play store listing).
- The **delete-account page** at `https://riseupkings.com/jobvoice/delete-account` —
  Play's account-deletion policy requires a web link to request deletion for any app
  that enables account creation, entered in the Data safety form. The complete page
  content is ready to host in
  [../docs/launch/delete-account-page.md](../docs/launch/delete-account-page.md);
  the in-app path (Profile → Delete account & data) is already built and backed by the
  `delete-account` edge function deployed in section 4.

See [../docs/launch/data-safety.md](../docs/launch/data-safety.md) for the full Data
safety answers and the deletion-path details.
