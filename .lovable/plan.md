
Diagnosis
- Do I know what the issue is? Yes.
- The published frontend is crashing before React mounts because the auto-generated backend client in `src/integrations/supabase/client.ts` is being created with an undefined `VITE_SUPABASE_URL`.
- The preview is healthy and making successful backend requests, so this is not a database/auth/data problem. It is a published-build env injection problem.
- The “edge function secret” pattern is not the root cause here; the error happens in the browser before any backend function is called.
- We should not edit `src/integrations/supabase/client.ts`, and it is imported across the app, so the fix should happen at build/bootstrap level.

Implementation plan
1. Harden env injection in `vite.config.ts`
   - Load envs explicitly with `loadEnv(...)`.
   - Backfill `VITE_SUPABASE_URL` from a safe chain:
     `VITE_SUPABASE_URL` → `SUPABASE_URL` → `https://${VITE_SUPABASE_PROJECT_ID}.supabase.co`
   - Backfill `VITE_SUPABASE_PUBLISHABLE_KEY` from:
     `VITE_SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_PUBLISHABLE_KEY` → `SUPABASE_ANON_KEY`
   - Inject only these public values with `define` so the generated client can keep working unchanged in published builds.

2. Prevent the blank-screen crash in `src/main.tsx`
   - Remove the static `import App from "./App.tsx"`.
   - Read the required envs first.
   - If both exist, dynamically import `App` and render normally.
   - If either is missing, render a small configuration error screen instead of importing the app, so users see a useful message rather than a white page.

3. Keep the rest of the app untouched
   - No edits to the generated backend client.
   - No database migrations, auth changes, or backend function updates.
   - No need to rewrite the many existing imports that use the shared client.

4. Publish the frontend update
   - After implementation, publish/update the frontend again so the hardened build logic is what runs on `zuper-budget.lovable.app`.

Verification
- Preview still loads and login works.
- Published URL renders instead of blanking.
- Chrome console no longer shows `Uncaught Error: supabaseUrl is required`.
- If the published environment is still missing config, the site shows the fallback message instead of crashing, which cleanly confirms a publish-time env issue.

Technical details
- Files to change: `vite.config.ts`, `src/main.tsx` and optionally one tiny fallback UI component.
- Important guardrail: only inject the backend URL and publishable key; never expose any service-role secret.
- This is the smallest safe fix because it solves the publish-only failure without touching the auto-generated client file.
