begin;

do $block$
begin
  if to_regclass('vault.decrypted_secrets') is not null
    and not exists (
      select 1
      from vault.decrypted_secrets secret
      where secret.name = 'kael_matching_maintainer_secret'
        and nullif(btrim(secret.decrypted_secret), '') is not null
    )
  then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'kael_matching_maintainer_secret',
      'Database-owned credential for the Kael matching outbox dispatcher'
    );
  end if;
end;
$block$;

create or replace function public.verify_kael_matching_maintainer_secret(
  p_secret text
) returns boolean
language sql
security definer
set search_path = ''
stable
as $func$
  select p_secret is not null
    and length(p_secret) between 32 and 256
    and exists (
      select 1
      from vault.decrypted_secrets secret
      where secret.name = 'kael_matching_maintainer_secret'
        and extensions.digest(secret.decrypted_secret, 'sha256') =
          extensions.digest(p_secret, 'sha256')
    );
$func$;

revoke all on function public.verify_kael_matching_maintainer_secret(text)
from public, anon, authenticated;
grant execute on function public.verify_kael_matching_maintainer_secret(text)
to service_role;

do $block$
begin
  if to_regprocedure('private.schedule_kael_matching_maintainer()') is not null then
    perform private.schedule_kael_matching_maintainer();
  end if;
end;
$block$;

comment on function public.verify_kael_matching_maintainer_secret(text) is
  'Validates the database-owned dispatcher credential without exposing it to Edge environment configuration or query results.';

commit;
