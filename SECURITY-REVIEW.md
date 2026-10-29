# Clutch Zone — Security Review Notes

## Scope and important limitation
Reviewed the supplied static website ZIP (HTML/CSS/JavaScript, `config.js`, and `vercel.json`). The ZIP does **not** include the Supabase database schema, RLS policies, grants, SQL migrations/functions, Edge Functions, or project-level Auth settings. Therefore database-side security cannot be certified or safely rewritten from this ZIP alone. Do not treat this review as a guarantee that the site is unhackable.

## Findings from the supplied files

### 1. CRITICAL TO VERIFY — Admin authorization depends on `public.admin_users`
`admin.js` signs in with Supabase Auth and then queries `admin_users` for the current user's `user_id`. This is a UI check only unless the database also protects every admin-managed table, Storage operation, and RPC with proper authorization. A user who bypasses the UI must still be unable to read/write protected data.

**Required action in Supabase:** Inspect RLS and grants on `admin_users`, `apk_downloads`, `match_categories`, `match_schedule`, `social_links`, `support_users`, `support_messages`, and any tables/functions used by the website. Make sure only trusted admins can read the admin roster and perform admin writes. Keep public read access only for the exact published fields/features the public site needs.

### 2. CRITICAL TO VERIFY — SQL/RPC function authorization
The supplied JavaScript calls RPCs including `delete_support_user`, `get_admin_group_chat_messages`, `send_admin_group_message`, `send_admin_support_message`, `mark_support_messages_read`, `register_support_user`, `verify_support_identity`, `get_support_messages`, `send_support_message`, and `get_group_chat_messages` / `send_group_chat_message`.

The SQL definitions are absent. Review each function's `SECURITY DEFINER`/`SECURITY INVOKER` mode, `search_path`, `EXECUTE` grants, caller identity checks, and whether user-supplied IDs can target another user's records. Any `SECURITY DEFINER` function should use a safe fixed `search_path`, fully qualify objects, and explicitly authorize the caller.

### 3. HIGH — Public frontend configuration
`config.js` contains a Supabase project URL and a publishable key (`sb_publishable_...`). A publishable key is expected to be public and is not an admin secret by itself. Security depends on RLS, grants, Storage policies, and function permissions. Never put `service_role` or `sb_secret_...` keys in browser code or this ZIP.

### 4. HIGH TO VERIFY — Storage access
`admin.js` uploads files using the signed-in user's access token and the public site builds public media URLs. Review Storage policies for bucket `clutch-zone-media`. Limit uploads/deletes to authorized admins, validate file type/size in trusted code where feasible, and make objects public only when they are intentionally public. Public object URLs are not private access controls.

### 5. MEDIUM — Login error detail
The admin login exception handler previously showed raw exception text to the user. It now shows a generic message while retaining a generic console log, reducing accidental disclosure of internal error details.

### 6. Existing HTTP security headers
`vercel.json` already sets `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, and a restrictive `Permissions-Policy`. A Content Security Policy was not added automatically because this site loads third-party scripts and uses inline event handlers; a careless CSP can break functionality. Build and test a tailored CSP before enabling it.

## Safe read-only Supabase audit queries
Run these in Supabase SQL Editor. They inspect current state and do not change data.

### Tables and RLS status
```sql
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
order by c.relname;
```

### Existing policies
```sql
select schemaname, tablename, policyname, permissive,
       roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;
```

### Function security and search path
```sql
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

### Function execute grants
```sql
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
order by routine_name, grantee;
```

## Before applying database changes
1. Export/backup the current schema and policies.
2. Run the read-only queries above and save the output.
3. Review policies per table and function; do not blindly enable/replace policies without understanding the intended public features.
4. Test as anonymous visitor, ordinary authenticated user, and admin in a separate test project.
5. Verify that ordinary users cannot alter other users' records, admin rosters, wallet/reward values, tournament results, or private support messages.
6. Rotate any secret key that was ever exposed. Removing it from the current code does not invalidate a leaked key.

## What was changed in this ZIP
- `admin.js`: login exception messages are generic instead of displaying raw exception details.
- `SECURITY-REVIEW.md`: added this review, limitations, and read-only audit queries.

No database policies were changed because the necessary SQL schema/policies were not included; guessing at them could lock out the admin or break public site features.
