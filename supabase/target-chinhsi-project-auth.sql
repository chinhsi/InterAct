-- Target-project compatibility: InterAct uses anonymous Supabase Auth users.
-- The existing SaaS profile trigger requires email NOT NULL, so anonymous
-- accounts must bypass that application's profile table. Existing registered
-- users continue through the original profile creation path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
declare
  detected_provider text;
begin
  if new.is_anonymous then
    return new;
  end if;

  detected_provider := 'email';
  if new.raw_user_meta_data->>'registration_method' is not null then
    detected_provider := new.raw_user_meta_data->>'registration_method';
  elsif new.raw_app_meta_data->>'provider' is not null then
    detected_provider := new.raw_app_meta_data->>'provider';
  elsif new.raw_user_meta_data->>'iss' is not null then
    if new.raw_user_meta_data->>'iss' like '%google%' then
      detected_provider := 'google';
    elsif new.raw_user_meta_data->>'iss' like '%github%' then
      detected_provider := 'github';
    end if;
  elsif new.raw_user_meta_data->>'provider_id' is not null then
    if new.raw_user_meta_data->>'email' like '%@gmail.com'
       or new.raw_user_meta_data->>'aud' = 'https://accounts.google.com' then
      detected_provider := 'google';
    end if;
  end if;

  insert into public.profiles_saas (
    id, email, full_name, avatar_url, email_verified,
    registration_method, created_at, updated_at
  ) values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.email_confirmed_at is not null,
    case when detected_provider in ('google', 'github', 'email')
      then detected_provider::text else 'email' end,
    now(), now()
  );
  return new;
end;
$function$;
