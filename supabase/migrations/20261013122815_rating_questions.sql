begin;
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check check (type in (
  'send_screen','poll','rating','multiple_choice','true_false','short_answer',
  'pronunciation','oral_response','custom_quiz','file_upload','drawing','hotspot',
  'ordering','matching','board','camera_poll'
));
alter table public.questions drop constraint if exists questions_rating_shape_check;
alter table public.questions add constraint questions_rating_shape_check check (
  type <> 'rating' or (
    options = '["1","2","3","4","5","6","7","8","9","10"]'::jsonb
    and not allow_multiple and correct_answer is null and cardinality(correct_answers) = 0
  )
);
-- Additional validation only: existing classroom/participant/deadline policies
-- remain in force. A forged 0, 11 or fractional score is rejected in Postgres.
drop policy if exists "valid rating answers" on public.answers;
create policy "valid rating answers" on public.answers as restrictive for insert
to anon, authenticated with check (
  not exists (select 1 from public.questions where questions.id = answers.question_id and questions.type = 'rating')
  or (answer_value in ('1','2','3','4','5','6','7','8','9','10')
    and answer_values is null and answer_text is null and is_correct is null)
);
commit;
