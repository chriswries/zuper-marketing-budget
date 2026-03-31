

## Supabase Anon Key Rotation — Lovable Cloud

### Is the key actually at risk?

**No.** The `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) is a **public, client-side key by design**. It is:

- Embedded in every built JavaScript bundle served to browsers
- Visible in browser DevTools network tab on every API call
- Intentionally unprivileged — it can only do what your Row-Level Security (RLS) policies allow

This is identical to a Firebase API key or Stripe publishable key. Exposure in Git history does not constitute a security incident. Your RLS policies are the actual security boundary, not the anon key.

### Can you rotate it in Lovable Cloud?

**No.** Lovable Cloud manages the Supabase instance internally. There is no dashboard access or CLI access to regenerate JWT secrets or API keys. The `.env` file is auto-generated and read-only.

### If you still wanted to rotate (not recommended/needed)

The only path would be to contact Lovable support and request a key rotation on the managed instance. But given the key is public by design, this provides no security benefit.

### What actually matters

Your project's security posture depends on:

1. **RLS policies** — already in place on your tables
2. **Service role key** — stored as a secret, never exposed to the client ✓
3. **Edge function authentication** — your admin functions verify caller identity ✓

**Conclusion:** No action needed. The anon key is public by design and your security controls are correctly implemented at the RLS and edge function layers.

