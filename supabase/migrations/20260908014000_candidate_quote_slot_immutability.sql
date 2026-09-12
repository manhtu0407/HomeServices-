begin;

create or replace function private.protect_candidate_original_scope_price_quote()
returns trigger language plpgsql set search_path='' as $func$
begin
  -- Absence of a priced offer is itself part of the terms presented for consent.
  if new.original_scope_price_quote is distinct from old.original_scope_price_quote then
    raise exception using errcode='23514',message='CANDIDATE_PRICE_TERMS_IMMUTABLE';
  end if;
  return new;
end;
$func$;

commit;
