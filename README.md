CLUTCH ZONE V53 — CLASSIC PREMIUM

# CLUTCH ZONE V49 — ARENA EDITION

Fresh rebuild based on the working Clutch Zone feature set.

## New in V49
- Premium Arena visual refresh across the website.
- Match Schedule is now a category hub instead of one long match list.
- Default sections: Battle Royale, Clash Squad, Lone Wolf, FF Survival.
- Admin can add/edit/hide/delete Match Sections and upload a 16:9 image for each section.
- Admin assigns every match to a Match Section.
- Clicking a section on Match Schedule filters to only that section's matches.
- SHOW ALL returns to the complete schedule.
- Match cards retain title, image, mode, date/time, entry fee, prize pool, total players, per-kill reward, status and countdown.
- No website Room ID/Password database feature. Credentials remain app-side only.
- Existing APK, Social, Support, Group Chat and Admin systems are retained.

## Database
Your previous 7 SQL chunks remain the base database. Run `NEW_SUPABASE_SKILL.sql` once to add the new Match Sections system. This ZIP intentionally does not include the old `supabase_setup.sql` file.

## Setup
1. Put your Supabase URL + anon key in `config.js`.
2. Run `NEW_SUPABASE_SKILL.sql` once in Supabase SQL Editor.
3. Deploy all files to the same web root.
4. Hard refresh the site after deployment.
5. In Admin > MATCH SECTIONS, edit the seeded sections and upload their images.
6. In Admin > MATCH SCHEDULE, assign each match to a section.


## V53 Visual Refresh
Strong text contrast, multi-color neon glow, bubble buttons/cards, premium user + admin surfaces. No database schema changes.


## V55 Dark Neon Esports Refresh
- Main palette: #07070A black, #7C3AED purple, #2563EB electric blue, #EC4899 pink, #FBBF24 gold, #EF4444 live, #22C55E success, white text, #A1A1AA secondary text.
- Dark glass tournament cards with controlled neon glow.
- Purple-to-blue CTA buttons.
- Gold prize highlights, red live/status accents, green success accents.
- Homepage clickable sections retain the same bubble/button interaction but use a premium dark glass treatment.
- Match directory/category pages and tournament cards use the same controlled esports system.


V58: full contrast audit, admin action button legibility, chat access black-on-white readability, dark-surface white text, white-surface black text, controlled image glow, and fast-scroll performance safeguards. APK direct Supabase links now use the download query without buffering the APK in page memory.

## V59 — Private Support / Public Group Separation
- 24/7 Support messages are stored with `is_group=false` and are never returned by the public group RPC.
- Public Chat Group messages are stored with `is_group=true`.
- Private support access is verified against the registered Name + UID pair, not UID alone.
- Admin Support Requests show each player's unread private-message count.
- Opening a player's private admin chat marks their unread messages as read, so the count returns to 0.
- Run `private_chat_security.sql` once in Supabase after the existing setup chunks.

## V60 private support unread-count fix
Run `private_chat_unread_fix.sql` once in Supabase SQL Editor. It makes `mark_support_messages_read` set `admin_read_at` for unread private player messages, so the admin list count drops to 0 after opening/reading the player's private chat or replying.
