-- InterAct read-scoping hardening (applied after schema.sql, idempotent).
--
-- Stock InterAct lets anyone holding the publishable key read every session,
-- participant, answer and exit ticket in the project. This file replaces the
-- unconditional SELECT policies with membership checks:
--   * every browser signs in anonymously (Supabase Auth) and so carries a JWT;
--   * join_session records that uid on the participant row;
--   * the presenter's uid is registered in presenter_uids once the owner key
--     has been verified by an Edge Function.
-- A row is readable only by presenters, or by members of the row's session.

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

revoke all on function public.interact_is_presenter() from public;
revoke all on function public.interact_member_of(uuid) from public;
grant execute on function public.interact_is_presenter() to anon, authenticated;
grant execute on function public.interact_member_of(uuid) to anon, authenticated;

-- Presence is bumped by the heartbeat Edge Function (service role). The RPC
-- runs as definer and takes any participant id, so it must not stay public.
revoke all on function public.bump_participant_presence(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.bump_participant_presence(uuid, bigint, bigint) to service_role;

-- Participants are inserted only by the join_session Edge Function (service
-- role), so the browser never needs INSERT on this table.
drop policy if exists "join active sessions" on public.participants;
revoke insert on public.participants from anon, authenticated;

-- ---- SELECT policies: members only -----------------------------------------

drop policy if exists "mvp read sessions" on public.sessions;
drop policy if exists "members read sessions" on public.sessions;
create policy "members read sessions" on public.sessions for select
to anon, authenticated using (public.interact_member_of(id));

drop policy if exists "mvp read participants" on public.participants;
drop policy if exists "members read participants" on public.participants;
create policy "members read participants" on public.participants for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read messages" on public.messages;
drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read screenshots" on public.screenshots;
drop policy if exists "members read screenshots" on public.screenshots;
create policy "members read screenshots" on public.screenshots for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read questions" on public.questions;
drop policy if exists "members read questions" on public.questions;
create policy "members read questions" on public.questions for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read answers" on public.answers;
drop policy if exists "members read answers" on public.answers;
create policy "members read answers" on public.answers for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read ai summaries" on public.ai_summaries;
drop policy if exists "members read ai summaries" on public.ai_summaries;
create policy "members read ai summaries" on public.ai_summaries for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "mvp read exit tickets" on public.exit_tickets;
drop policy if exists "members read exit tickets" on public.exit_tickets;
create policy "members read exit tickets" on public.exit_tickets for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "public read shared contents" on public.shared_contents;
drop policy if exists "members read shared contents" on public.shared_contents;
create policy "members read shared contents" on public.shared_contents for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "public read shared files" on public.shared_files;
drop policy if exists "members read shared files" on public.shared_files;
create policy "members read shared files" on public.shared_files for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "public read caption segments" on public.caption_segments;
drop policy if exists "members read caption segments" on public.caption_segments;
create policy "members read caption segments" on public.caption_segments for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "public read session events" on public.session_events;
drop policy if exists "members read session events" on public.session_events;
create policy "members read session events" on public.session_events for select
to anon, authenticated using (public.interact_member_of(session_id));

drop policy if exists "read dispatched quizzes" on public.quizzes;
drop policy if exists "members read dispatched quizzes" on public.quizzes;
create policy "members read dispatched quizzes" on public.quizzes for select
to anon, authenticated
using (
  public.interact_member_of(session_id)
  and exists (
    select 1 from public.questions
    where questions.id = quizzes.question_id
      and questions.session_id = quizzes.session_id
  )
);

drop policy if exists "read dispatched quiz items" on public.quiz_items;
drop policy if exists "members read dispatched quiz items" on public.quiz_items;
create policy "members read dispatched quiz items" on public.quiz_items for select
to anon, authenticated
using (
  exists (
    select 1 from public.quizzes
    join public.questions on questions.id = quizzes.question_id
    where quizzes.id = quiz_items.quiz_id
      and public.interact_member_of(quizzes.session_id)
  )
);

-- ---- INSERT policies: the row's participant must be the caller ---------------

drop policy if exists "send messages to active sessions" on public.messages;
create policy "send messages to active sessions" on public.messages for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = messages.session_id and sessions.status = 'active'
  )
  and exists (
    select 1 from public.participants
    where participants.id = messages.participant_id
      and participants.session_id = messages.session_id
      and participants.name = messages.participant_name
      and participants.auth_uid = auth.uid()
  )
  and char_length(btrim(content)) between 1 and 180
);

drop policy if exists "answer active questions" on public.answers;
create policy "answer active questions" on public.answers for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = answers.session_id and sessions.status = 'active'
  )
  and exists (
    select 1 from public.questions
    where questions.id = answers.question_id
      and questions.session_id = answers.session_id
      and questions.status = 'active'
      and questions.type <> 'custom_quiz'
  )
  and exists (
    select 1 from public.participants
    where participants.id = answers.participant_id
      and participants.session_id = answers.session_id
      and participants.name = answers.participant_name
      and participants.auth_uid = auth.uid()
  )
  and is_correct is null
  and coalesce(char_length(answer_value), 0) <= 500
  and coalesce(char_length(answer_text), 0) <= 1000
  and coalesce(array_length(answer_values, 1), 0) <= 20
  and not exists (
    select 1
    from unnest(coalesce(answer_values, '{}'::text[])) as submitted_value
    where char_length(submitted_value) > 500
  )
);

drop policy if exists "submit exit tickets to active sessions" on public.exit_tickets;
create policy "submit exit tickets to active sessions" on public.exit_tickets for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = exit_tickets.session_id
      and sessions.status = 'active'
      and sessions.exit_ticket_prompt is not null
  )
  and exists (
    select 1 from public.participants
    where participants.id = exit_tickets.participant_id
      and participants.session_id = exit_tickets.session_id
      and participants.name = exit_tickets.participant_name
      and participants.auth_uid = auth.uid()
  )
  and coalesce(char_length(response_text), 0) <= 2000
);

notify pgrst, 'reload schema';
