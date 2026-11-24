# JobVoice — One-Time Setup & First Run

Everything code-side is done. These are the only steps left before the app works end
to end. Estimated time: ~30 minutes.

## 1. Create the Supabase project (~10 min)

1. Go to https://supabase.com/dashboard → **New project** → name it `jobvoice` (free tier is fine).
2. **Authentication → Sign In / Up → enable "Anonymous sign-ins"** (zero-friction trial accounts).
3. **Storage → New bucket** → name `audio-notes`, keep it **private**.
4. **SQL Editor → New query** → run this RLS policy (lets each user manage only their own audio):

```sql
create policy "users manage own audio"
on storage.objects for all
to authenticated
using (bucket_id = 'audio-notes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'audio-notes' and (storage.foldername(name))[1] = auth.uid()::text);
```

5. **Settings → API** → copy the **Project URL** and **anon public key**.

## 2. Configure the app env

```powershell
cd e:\self\business_ide\jobvoice
copy .env.example .env
```
Edit `.env` and paste your Project URL and anon key. (`.env` is gitignored.)

## 3. Get a Gemini API key (~2 min)

https://aistudio.google.com → **Get API key** → create key. (Free tier covers testing;
each voice note costs well under $0.01 on gemini-2.5-flash.)

## 4. Deploy the edge function (~5 min)

```powershell
cd e:\self\business_ide\jobvoice
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF   # ref is in your project's dashboard URL
npx supabase secrets set GEMINI_API_KEY=YOUR-GEMINI-KEY
npx supabase functions deploy extract-job
```

## 5. Run the app on your Android phone

```powershell
cd e:\self\business_ide\jobvoice
npx expo start
```
Scan the QR with the **Expo Go** app. If any native-module error appears (unlikely —
all deps are Expo-bundled), build a dev client instead: `npx expo run:android` with an
Android device connected and USB debugging on.

## Optional: quick UI preview in a web browser (no phone needed)

```powershell
cd e:\self\business_ide\jobvoice
npx expo start --web
```
All screens render in the browser using an **in-memory preview store** (amber banner
reminds you data isn't saved there). **Voice recording works in the browser too**
(Chrome/Edge/Firefox record WebM-Opus; Safari records MP4) — with steps 1–4 above done,
the full record → extract → review flow runs end to end on web. PDF generation and
sharing remain native-only. Web caveats: recordings don't survive a page reload if
extraction fails, and web notes count against the same usage quotas.

## 6. End-to-end test script (the money path)

1. Fresh open → Home shows the empty state.
2. **⚙️ My business** → fill business name, trade, tax % → Save → kill the app → reopen → values persisted.
3. **🎙️ New voice note** → grant mic permission (custom message should show) → record a
   realistic note: client name + address, two materials with prices, labor hours + rate → **Stop & process**.
4. Review screen: extraction populated; uncertain items highlighted amber with "check this";
   editing a highlighted field clears the highlight; decimal prices typeable (e.g. 19.99).
5. **Create quote →** preview shows your business name, correct subtotal/tax/total →
   **Share quote PDF** → send it to yourself → PDF opens correctly.
6. Home shows the job as 📤 Quoted. Kill and reopen — everything persists. Re-open the
   job, tap Save — status must STAY Quoted (regression-tested fix).
7. Airplane mode → record a note → should show a retryable error → disable airplane
   mode → Retry succeeds.
8. Check https://aistudio.google.com usage: the note should cost < $0.01. Also check the
   Supabase Storage bucket — the audio file should be GONE (deleted after extraction).

## If something fails

- **"Missing EXPO_PUBLIC_SUPABASE_URL/ANON_KEY"** on first recording → step 2 not done
  (restart `expo start` after editing `.env`).
- **Extraction failed (401/403)** → anonymous sign-ins not enabled (step 1.2).
- **Upload failed: row-level security** → RLS policy not applied (step 1.4).
- **Extraction failed (502)** → check `npx supabase functions logs extract-job`
  (usually a missing/invalid GEMINI_API_KEY secret).
