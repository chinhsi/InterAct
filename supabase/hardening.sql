-- InterAct read-scoping hardening. Run after schema.sql; idempotent.
--
-- Stock InterAct lets anyone holding the publishable key read every session,
-- participant, answer and exit ticket in the project. This file narrows that
-- to session members:
--   * every browser signs in anonymously (Supabase Auth) and so carries a JWT;
--   * join_session records that uid on the participant row;
--   * the presenter's uid is registered in presenter_uids once the owner key
--     has been verified by an Edge Function.
--
-- Everything here is added AS RESTRICTIVE. Postgres ANDs restrictive policies
-- with the permissive ones schema.sql defines, so upstream's own rules (and
-- any later edits to them) keep working, and re-running schema.sql cannot
-- reopen anything: the "using (true)" policies it recreates are still ANDed
-- with the membership checks below.

alter table public.participants add column if not exists auth_uid uuid;
create index if not exists participants_auth_uid_idx on public.participants (auth_uid);

create table if not exists public.presenter_uids (
  uid uuid primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.presenter_uids enable row level security;
revoke all on public.presenter_uids from public, anon, authenticated;
grant all on public.presenter_uids to service_role;

create or replace function public.interact_is_presenter()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.presenter_uids where uid = auth.uid());
$$;

create or replace function public.interact_member_of(target_session uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.presenter_uids where uid = auth.uid())
    or exists (
      select 1 from public.participants
      where session_id = target_session and auth_uid = auth.uid()
    )
  );
$$;

-- True when the row's participant_id belongs to the caller. Used to bind
-- browser-side inserts (danmaku, answers, exit tickets) to the caller's uid.
create or replace function public.interact_owns_participant(target_participant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.participants
    where id = target_participant and auth_uid = auth.uid()
  );
$$;

revoke all on function public.interact_is_presenter() from public;
revoke all on function public.interact_member_of(uuid) from public;
revoke all on function public.interact_owns_participant(uuid) from public;
grant execute on function public.interact_is_presenter() to anon, authenticated;
grant execute on function public.interact_member_of(uuid) to anon, authenticated;
grant execute on function public.interact_owns_participant(uuid) to anon, authenticated;

-- Presence is bumped by the heartbeat Edge Function (service role). The RPC
-- runs as definer and takes any participant id, so it must not stay public.
revoke all on function public.bump_participant_presence(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bump_participant_presence(uuid, bigint, bigint) to service_role;

-- Participants are inserted only by the join_session Edge Function (service
-- role), so the browser never needs INSERT on this table.
drop policy if exists "join active sessions" on public.participants;
revoke insert on public.participants from anon, authenticated;

-- ---- SELECT: members of the row's session only --------------------------------

drop policy if exists "members only: sessions" on public.sessions;
create policy "members only: sessions" on public.sessions as restrictive for select
to anon, authenticated using (public.interact_member_of(id));

drop policy if exists "members only: participants" on public.participants;
create policy "members only: participants" on public.participants as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: messages" on public.messages;
create policy "members only: messages" on public.messages as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: screenshots" on public.screenshots;
create policy "members only: screenshots" on public.screenshots as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: questions" on public.questions;
create policy "members only: questions" on public.questions as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: answers" on public.answers;
create policy "members only: answers" on public.answers as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: ai_summaries" on public.ai_summaries;
create policy "members only: ai_summaries" on public.ai_summaries as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: exit_tickets" on public.exit_tickets;
create policy "members only: exit_tickets" on public.exit_tickets as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: shared_contents" on public.shared_contents;
create policy "members only: shared_contents" on public.shared_contents as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: shared_files" on public.shared_files;
create policy "members only: shared_files" on public.shared_files as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: caption_segments" on public.caption_segments;
create policy "members only: caption_segments" on public.caption_segments as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: session_events" on public.session_events;
create policy "members only: session_events" on public.session_events as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: quizzes" on public.quizzes;
create policy "members only: quizzes" on public.quizzes as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: quiz_items" on public.quiz_items;
create policy "members only: quiz_items" on public.quiz_items as restrictive for select
to anon, authenticated
using (
  exists (
    select 1 from public.quizzes
    where quizzes.id = quiz_items.quiz_id
      and public.interact_member_of(quizzes.session_id)
  )
);

-- Tables added after the original hardening: keep their reads within the
-- class. The board's own reveal policy still applies alongside these checks.
drop policy if exists "members only: participant points" on public.participant_points;
create policy "members only: participant points" on public.participant_points as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: board posts" on public.board_posts;
create policy "members only: board posts" on public.board_posts as restrictive for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "members only: board reactions" on public.board_reactions;
create policy "members only: board reactions" on public.board_reactions as restrictive for select
to anon, authenticated using (
  exists (select 1 from public.board_posts p
          where p.id = board_reactions.post_id
            and public.interact_member_of(p.session_id))
);

-- ---- INSERT: the row's participant must be the caller -------------------------
-- schema.sql's permissive insert policies keep all their content checks
-- (active session, live question, deadlines, lengths); these only add "and it
-- is really you".

drop policy if exists "own participant only: messages" on public.messages;
create policy "own participant only: messages" on public.messages as restrictive for insert
to anon, authenticated with check (public.interact_owns_participant(participant_id));

drop policy if exists "own participant only: answers" on public.answers;
create policy "own participant only: answers" on public.answers as restrictive for insert
to anon, authenticated with check (public.interact_owns_participant(participant_id));

drop policy if exists "own participant only: exit_tickets" on public.exit_tickets;
create policy "own participant only: exit_tickets" on public.exit_tickets as restrictive for insert
to anon, authenticated with check (public.interact_owns_participant(participant_id));

drop policy if exists "own participant only: board posts" on public.board_posts;
create policy "own participant only: board posts" on public.board_posts as restrictive for insert
to anon, authenticated with check (public.interact_owns_participant(participant_id));

-- Names from the first (permissive-rewrite) version of this file; harmless if absent.
drop policy if exists "members read sessions" on public.sessions;
drop policy if exists "members read participants" on public.participants;
drop policy if exists "members read messages" on public.messages;
drop policy if exists "members read screenshots" on public.screenshots;
drop policy if exists "members read questions" on public.questions;
drop policy if exists "members read answers" on public.answers;
drop policy if exists "members read ai summaries" on public.ai_summaries;
drop policy if exists "members read exit tickets" on public.exit_tickets;
drop policy if exists "members read shared contents" on public.shared_contents;
drop policy if exists "members read shared files" on public.shared_files;
drop policy if exists "members read caption segments" on public.caption_segments;
drop policy if exists "members read session events" on public.session_events;
drop policy if exists "members read dispatched quizzes" on public.quizzes;
drop policy if exists "members read dispatched quiz items" on public.quiz_items;

notify pgrst, 'reload schema';
