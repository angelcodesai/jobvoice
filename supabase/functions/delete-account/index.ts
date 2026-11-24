// delete-account — Supabase Edge Function (Deno)
//
// Permanently deletes the calling user's account and all their cloud data.
// The caller IS the target: identity comes solely from the verified JWT in
// the Authorization header, so no request body, no shared secrets, and no
// way to delete anyone else's account.
//
// What gets deleted and how:
//   1. Storage: any leftover files under `audio-notes/<uid>/` (normally empty
//      — extract-job deletes audio after a validated extraction — but failed
//      extractions leave files behind, and storage.objects has no FK to
//      auth.users, so it must be cleaned explicitly).
//   2. Auth user: `admin.auth.admin.deleteUser(uid)`. Every server table
//      (usage, entitlements, jobs, line_items) references
//      auth.users(id) ON DELETE CASCADE — see supabase/migrations/ — so this
//      single call cascades all row data.
//
// Deploy:   npx supabase functions deploy delete-account
//           (Default JWT verification stays ON — do NOT pass --no-verify-jwt.
//           The platform rejects requests without a valid user JWT before the
//           function even runs; the getUser() check below is defense in depth.)
// Secrets:  none beyond the platform-injected SUPABASE_URL, SUPABASE_ANON_KEY
//           and SUPABASE_SERVICE_ROLE_KEY.
//
// NOTE: This is Deno code — it is excluded from the Expo app's tsconfig.

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // 1. Authenticate the caller (same pattern as extract-job): a client
    // scoped to the caller's JWT, so getUser() resolves the real identity.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    // Service-role client for the storage cleanup and the auth-user delete.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. Storage cleanup: remove leftover audio under the user's folder.
    // Log-and-continue on any error — storage leftovers must NOT block the
    // deletion; the auth-user delete below (which cascades all row data) is
    // the meaningful part, and an orphaned private audio file is recoverable
    // by a later manual sweep while a blocked deletion is a policy failure.
    // Batched with a defensive iteration cap in case a folder somehow holds
    // more than list() returns in one page.
    try {
      for (let i = 0; i < 10; i++) {
        const { data: files, error: listError } = await admin.storage
          .from('audio-notes')
          .list(user.id, { limit: 100 });
        if (listError) {
          console.error('Storage list failed for', user.id, listError);
          break;
        }
        if (!files || files.length === 0) break;
        const { error: rmError } = await admin.storage
          .from('audio-notes')
          .remove(files.map((f) => `${user.id}/${f.name}`));
        if (rmError) {
          console.error('Storage remove failed for', user.id, rmError);
          break;
        }
      }
    } catch (storageErr) {
      console.error('Storage cleanup threw for', user.id, storageErr);
    }

    // 3. Delete the auth user. All server tables FK auth.users(id)
    // ON DELETE CASCADE, so this removes usage, entitlements, jobs and
    // line_items rows in the same stroke.
    const { error: delError } = await admin.auth.admin.deleteUser(user.id);
    if (delError) {
      console.error('deleteUser failed for', user.id, delError);
      return new Response('Deletion failed', { status: 500 });
    }

    return new Response('deleted', { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response('Internal error', { status: 500 });
  }
});
