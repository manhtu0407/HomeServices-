-- Regex matching is STABLE under the active collation. Unicode escapes keep
-- the Vietnamese accent map byte-safe across Windows checkout and SQL tools.
create or replace function public.normalize_hcmc_district_code(p_input text)
returns text
language plpgsql
stable
set search_path = public, pg_catalog
as $function$
declare
  v_trimmed text;
  v_lower text;
  v_stripped text;
  v_num_match text;
  v_num integer;
begin
  if p_input is null then return null; end if;

  v_trimmed := btrim(p_input);
  if v_trimmed = '' then return null; end if;

  v_lower := lower(v_trimmed);
  if v_lower in (
    'hcmc_all', 'q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q10', 'q11', 'q12',
    'binh_thanh', 'thu_duc', 'tan_binh', 'go_vap', 'phu_nhuan', 'binh_tan',
    'tan_phu', 'hoc_mon', 'binh_chanh', 'cu_chi', 'nha_be', 'can_gio'
  ) then
    return v_lower;
  end if;

  v_stripped := translate(
    v_lower,
    U&'\00E0\00E1\1EA1\1EA3\00E3\00E2\1EA7\1EA5\1EAD\1EA9\1EAB\0103\1EB1\1EAF\1EB7\1EB3\1EB5\00E8\00E9\1EB9\1EBB\1EBD\00EA\1EC1\1EBF\1EC7\1EC3\1EC5\00EC\00ED\1ECB\1EC9\0129\00F2\00F3\1ECD\1ECF\00F5\00F4\1ED3\1ED1\1ED9\1ED5\1ED7\01A1\1EDD\1EDB\1EE3\1EDF\1EE1\00F9\00FA\1EE5\1EE7\0169\01B0\1EEB\1EE9\1EF1\1EED\1EEF\1EF3\00FD\1EF5\1EF7\1EF9\0111',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );

  if v_stripped in ('toan tp.hcm', 'toan tp hcm', 'toan tphcm') then return 'hcmc_all'; end if;
  if v_stripped = 'binh thanh' then return 'binh_thanh'; end if;
  if v_stripped in ('thu duc', 'thanh pho thu duc', 'tp thu duc') then return 'thu_duc'; end if;
  if v_stripped = 'tan binh' then return 'tan_binh'; end if;
  if v_stripped = 'go vap' then return 'go_vap'; end if;
  if v_stripped = 'phu nhuan' then return 'phu_nhuan'; end if;
  if v_stripped = 'binh tan' then return 'binh_tan'; end if;
  if v_stripped = 'tan phu' then return 'tan_phu'; end if;
  if v_stripped = 'hoc mon' then return 'hoc_mon'; end if;
  if v_stripped = 'binh chanh' then return 'binh_chanh'; end if;
  if v_stripped = 'cu chi' then return 'cu_chi'; end if;
  if v_stripped = 'nha be' then return 'nha_be'; end if;
  if v_stripped = 'can gio' then return 'can_gio'; end if;

  v_num_match := substring(v_stripped from '^(?:quan|q|district|dist)[\s.]*(\d+)$');
  if v_num_match is not null then
    v_num := v_num_match::integer;
    if v_num = 2 or v_num = 9 then return 'thu_duc'; end if;
    if v_num in (1, 3, 4, 5, 6, 7, 8, 10, 11, 12) then return 'q' || v_num; end if;
  end if;

  return null;
end;
$function$;
