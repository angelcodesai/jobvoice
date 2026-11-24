// rc-webhook — Supabase Edge Function (Deno)
//
// RevenueCat webhook → entitlements table (source of truth for the
// server-side quota tier; this function is the ONLY writer of
// verified rows — extract-job's grace path only ever creates
// unverified rows with ignoreDuplicates).
//
// Configure in the RevenueCat dashboard:
//   URL = <project>/functions/v1/rc-webhook
//   Authorization header value must equal the RC_WEBHOOK_SECRET function
//   secret (set via: npx supabase secrets set RC_WEBHOOK_SECRET=...).
// Deploy: npx supabase functions deploy rc-webhook --no-verify-jwt
//   (RevenueCat calls without a Supabase JWT; auth is the shared secret.)
//
// NOTE: This is Deno code — it is excluded from the Expo app's tsconfig.

import { createClient } from 'npm:@supabase/supabase-js@2';

// entitlements.user_id is a uuid FK to auth.users. The app sets the RC
// app_user_id to the Supabase user id, but RevenueCat can also emit events
// for anonymous ids ("$RCAnonymousID:...") or otherwise non-UUID ids; those
// can never satisfy the FK, so they get a 200 "ignored" below — a 4xx/5xx
// would make RevenueCat retry a permanently-bad id forever.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

Deno.serve(async (req) => {
  try {
    // 1. Shared-secret auth. RevenueCat sends the configured value verbatim
    //    in the Authorization header, so accept it bare or Bearer-prefixed
    //    (dashboard docs suggest "Bearer <value>"; being strict about the
    //    prefix is a foot-gun during setup).
    const auth = req.headers.get('Authorization') ?? '';
    const secret = Deno.env.get('RC_WEBHOOK_SECRET');
    if (!secret || (auth !== secret && auth !== `Bearer ${secret}`)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse the event envelope: { api_version, event: {...} }.
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
    const event = (payload as { event?: Record<string, unknown> } | null)?.event;
    if (!event || typeof event !== 'object') {
      return new Response('No event', { status: 400 });
    }

    const type = String(event.type ?? '');
    // SANDBOX events are stored too (closed-testing QA buys through the
    // sandbox and still needs verified pro); we just log the environment
    // so sandbox rows are traceable in the function logs.
    console.log('rc-webhook:', type, 'env=', event.environment ?? 'UNKNOWN');

    // Service-role client (RLS allows no client writes to entitlements).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const eventAt = typeof event.event_timestamp_ms === 'number'
      ? event.event_timestamp_ms
      : 0;

    // 3. TRANSFER re-keying — handled BEFORE the app_user_id guard because
    //    TRANSFER events carry no app_user_id, only transferred_from/to.
    //    Why this matters: after an app reinstall the user gets a NEW
    //    anonymous Supabase uid; Restore Purchases makes RevenueCat move the
    //    store subscription to that uid and emit TRANSFER. Without re-keying,
    //    the new uid has no verified entitlements row until the NEXT
    //    subscription event (up to 12 months away on annual) — the paying
    //    user's grace window would expire into a hard trial limit.
    if (type === 'TRANSFER') {
      const from = Array.isArray(event.transferred_from)
        ? (event.transferred_from as unknown[]).find(isUuid)
        : undefined;
      const to = Array.isArray(event.transferred_to)
        ? (event.transferred_to as unknown[]).find(isUuid)
        : undefined;
      if (!to || !from || from === to) {
        // No destination uid, nothing attributable to transfer from (e.g.
        // anonymous-only ids), or a degenerate self-transfer (copying then
        // deactivating the SAME row would cut off a paying user). The next
        // real subscription event will populate the right row; retries
        // can't fix any of these.
        console.log('rc-webhook: TRANSFER ignored', 'from=', from ?? '(none)',
          'to=', to ?? '(none)');
        return new Response('ignored');
      }
      const { data: rows } = await admin.from('entitlements')
        .select('user_id, is_active, expires_at, product_id, last_event_at')
        .in('user_id', [from, to]);
      const fromRow = rows?.find((r) => r.user_id === from);
      const toRow = rows?.find((r) => r.user_id === to);
      if (!fromRow) {
        console.log('rc-webhook: TRANSFER ignored — no source row for', from);
        return new Response('ignored');
      }
      // Same out-of-order protection as the main path: a redelivered old
      // TRANSFER must not clobber newer state on either uid.
      const staleAgainst = [fromRow.last_event_at, toRow?.last_event_at]
        .some((t) => typeof t === 'number' && t > eventAt);
      if (staleAgainst) {
        console.log('rc-webhook: stale TRANSFER ignored', 'event_at=', eventAt);
        return new Response('stale event ignored');
      }
      // Copy the entitlement to the new uid first, THEN deactivate the old
      // row — if the second write fails, RC retries the whole (idempotent)
      // event and the paying user never loses access in between.
      const { error: upErr } = await admin.from('entitlements').upsert({
        user_id: to,
        is_active: fromRow.is_active,
        expires_at: fromRow.expires_at,
        product_id: fromRow.product_id,
        verified: true,
        last_event_at: eventAt,
        updated_at: new Date().toISOString(),
      });
      if (upErr) {
        if (upErr.code === '23503') {
          // Destination uid has no auth.users row (deleted account) —
          // permanently bad, stop retries.
          console.log('rc-webhook: TRANSFER ignored — unknown user', to);
          return new Response('ignored');
        }
        console.error('TRANSFER upsert failed for', to, upErr);
        return new Response('Upsert failed', { status: 500 });
      }
      const { error: downErr } = await admin.from('entitlements')
        .update({ is_active: false, last_event_at: eventAt,
          updated_at: new Date().toISOString() })
        .eq('user_id', from);
      if (downErr) {
        console.error('TRANSFER deactivate failed for', from, downErr);
        return new Response('Deactivate failed', { status: 500 });
      }
      console.log('rc-webhook: TRANSFER re-keyed', from, '→', to);
      return new Response('ok');
    }

    // Events we can't attribute to a Supabase user get a 200 "ignored", not
    // a 4xx: RevenueCat retries any non-2xx, and no retry can fix a missing
    // or non-UUID id (e.g. anonymous "$RCAnonymousID:..." ids).
    const userId = event.app_user_id; // the app sets this to the Supabase user id
    if (!isUuid(userId)) {
      console.log('rc-webhook: ignoring unattributable event',
        'type=', type, 'app_user_id=', userId ?? '(none)');
      return new Response('ignored');
    }

    // 4. Event-type allowlist: only subscription-entitlement events may
    //    write. Anything else (TEST, SUBSCRIBER_ALIAS, a future
    //    NON_RENEWING_PURCHASE with null expiration, types RC adds later)
    //    would fall through the logic below as is_active:true +
    //    expires_at:null + verified:true — i.e. permanent lifetime pro —
    //    and could clobber a real subscription row. 200 so RC doesn't
    //    retry an event class we deliberately don't handle. (TRANSFER is
    //    handled by its own branch above, not this allowlist — it has no
    //    app_user_id and never reaches here.)
    const HANDLED_TYPES = [
      'INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION',
      'EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE',
    ];
    if (!HANDLED_TYPES.includes(type)) {
      console.log('rc-webhook: ignoring unhandled event type', type);
      return new Response('ignored');
    }

    // 5. Active/expiry semantics. Only EXPIRATION means access has actually
    //    ended NOW. CANCELLATION merely means auto-renew was turned off and
    //    BILLING_ISSUE opens a billing-retry window — in both cases access
    //    continues until the period end, which expiration_at_ms carries and
    //    extract-job independently enforces (it requires is_active AND
    //    expires_at in the future). If access truly lapses, RevenueCat sends
    //    a follow-up EXPIRATION event. So we keep is_active=true for those
    //    and let expires_at do the gating, instead of cutting paid-up users
    //    off early.
    const isActive = type !== 'EXPIRATION';
    const expiresAt = typeof event.expiration_at_ms === 'number'
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
    // Null-expiry guard: well-formed subscription events always carry
    // expiration_at_ms, and extract-job treats an active row with a null
    // expires_at as never-expires — so an active write without an expiry
    // must never persist. 200: a malformed event won't improve on retry.
    if (isActive && expiresAt === null) {
      console.log('rc-webhook: ignoring active event without expiration_at_ms',
        'type=', type, 'user=', userId);
      return new Response('ignored');
    }

    // 6. Ordering guard. RC guarantees neither ordering nor at-most-once
    //    delivery, and each event carries the FULL current state — so a
    //    late-arriving older event (e.g. an INITIAL_PURCHASE redelivered
    //    after a refund's mid-period EXPIRATION) would resurrect revoked
    //    access if we blindly overwrote. Drop anything older than the last
    //    event we stored. Grace rows from extract-job have last_event_at
    //    null, so the webhook's first real event always wins over those.
    //    (select-then-upsert has a benign race: both racers carry real RC
    //    timestamps and the loser is at most one event stale until the
    //    next webhook — acceptable for this table.)
    const { data: existing } = await admin.from('entitlements')
      .select('last_event_at').eq('user_id', userId).maybeSingle();
    if (typeof existing?.last_event_at === 'number' &&
        existing.last_event_at > eventAt) {
      console.log('rc-webhook: stale event ignored', 'type=', type,
        'user=', userId, 'event_at=', eventAt,
        'stored=', existing.last_event_at);
      return new Response('stale event ignored');
    }

    // 7. Upsert the verified entitlement.
    const { error } = await admin.from('entitlements').upsert({
      user_id: userId,
      is_active: isActive,
      expires_at: expiresAt,
      product_id: typeof event.product_id === 'string' ? event.product_id : null,
      verified: true,
      last_event_at: eventAt,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // FK violation (23503): UUID-shaped id with no auth.users row — a
      // deleted account or a dashboard TEST event. Permanently bad, so 200
      // to stop retries. Anything else gets a 500 so RevenueCat retries —
      // transient DB failures self-heal.
      if (error.code === '23503') {
        console.log('rc-webhook: ignoring event for unknown user', userId);
        return new Response('ignored');
      }
      console.error('entitlements upsert failed for', userId, error);
      return new Response('Upsert failed', { status: 500 });
    }
    return new Response('ok');
  } catch (e) {
    console.error(e);
    return new Response('Internal error', { status: 500 });
  }
});
