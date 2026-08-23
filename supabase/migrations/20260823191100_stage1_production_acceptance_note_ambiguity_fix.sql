begin;

do $migration$
declare
  v_signature constant regprocedure :=
    'public.record_stage1_production_acceptance_note(text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text)'::regprocedure;
  v_definition text;
  v_fixed_definition text;
begin
  select pg_get_functiondef(v_signature) into strict v_definition;
  if position('on conflict (release_id) do nothing' in v_definition) = 0 then
    raise exception using errcode = '55000',
      message = 'STAGE1_ACCEPTANCE_CONFLICT_TARGET_SOURCE_CHANGED';
  end if;
  v_fixed_definition := replace(
    v_definition,
    'on conflict (release_id) do nothing',
    'on conflict on constraint stage1_production_acceptance_notes_pkey do nothing'
  );
  execute v_fixed_definition;
end;
$migration$;

comment on function public.record_stage1_production_acceptance_note(
  text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text
) is 'Records the final Vietnamese Dev-review note only after every Production acceptance invariant is proven; the named conflict target preserves PL/pgSQL output-column clarity.';

commit;
