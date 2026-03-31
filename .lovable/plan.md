

## Add .env entries to .gitignore

### What
Add `.env`, `.env.*`, and `.env.production` entries to `.gitignore` to prevent accidental commits of environment files.

### Change

**`.gitignore`** — Add environment file entries after line 13 (`*.local`):

```
# Environment files
.env
.env.*
.env.production
```

This preserves the existing `*.local` entry (which covers `.env.local`) and adds the missing patterns.

### Technical note
`.env.*` is a superset that covers `.env.production` and `.env.local`, but listing `.env.production` explicitly adds clarity per the user's request. The `*.local` entry on line 13 is preserved as-is.

