-- =============================================================================
-- X3 (Plan.md §27.6 — 2026-05-29): F-09 fix. Production
-- `worker_profiles.districts` contains label values ("Bình Thạnh", "Binh
-- Thanh", "Quan 1", "Quan 2", …) instead of the canonical slugs
-- ("binh_thanh", "q1", "thu_duc", …) the matching layer compares exactly.
-- Customer-confirmed broadcasts never reached approved workers because
-- `worker.districts` and `customer.address_district` did not share a form.
--
-- This migration:
--   1. Snapshots the current `worker_profiles.districts` into a backup
--      table so we can roll back any incorrect mapping.
--   2. Applies a label -> slug mapping function that matches the Edge
--      `normalizeDistrict` logic (diacritic-stripped label match + legacy
--      Quận 2 / Quận 9 -> Thủ Đức mapping).
--   3. Rewrites each row's districts array element-by-element.
--
-- The mapping is idempotent: rows already in slug form stay unchanged.
-- Rows that contain at least one value the function cannot map are left
-- untouched and surfaced via a `WHERE` clause so a follow-up can review
-- them manually.
-- =============================================================================

create table if not exists public.worker_profiles_districts_backup_x3 (
  worker_id uuid not null,
  districts_before text[] not null,
  captured_at timestamptz not null default now()
);

insert into public.worker_profiles_districts_backup_x3 (worker_id, districts_before)
select id, districts from public.worker_profiles;

create or replace function public.normalize_district_value(p_input text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_trimmed text;
  v_lower text;
  v_stripped text;
  v_match record;
  v_num_match text;
  v_num int;
begin
  if p_input is null then return null; end if;
  v_trimmed := btrim(p_input);
  if v_trimmed = '' then return null; end if;

  -- Already-canonical slugs are returned as-is.
  if v_trimmed in (
    'hcmc_all','q1','q3','q4','q5','q6','q7','q8','q10','q11','q12',
    'binh_thanh','thu_duc','tan_binh','go_vap','phu_nhuan','binh_tan',
    'tan_phu','hoc_mon','binh_chanh','cu_chi','nha_be','can_gio'
  ) then
    return v_trimmed;
  end if;

  v_lower := lower(v_trimmed);
  if v_lower in (
    'hcmc_all','q1','q3','q4','q5','q6','q7','q8','q10','q11','q12',
    'binh_thanh','thu_duc','tan_binh','go_vap','phu_nhuan','binh_tan',
    'tan_phu','hoc_mon','binh_chanh','cu_chi','nha_be','can_gio'
  ) then
    return v_lower;
  end if;

  v_stripped := lower(translate(
    v_lower,
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  ));

  -- Diacritic-stripped label match.
  if v_stripped = 'toan tp.hcm' or v_stripped = 'toan tp hcm' or v_stripped = 'toan tphcm' then
    return 'hcmc_all';
  end if;
  if v_stripped = 'binh thanh' then return 'binh_thanh'; end if;
  if v_stripped = 'thu duc' then return 'thu_duc'; end if;
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

  -- Numbered district: "Quận 1", "Quan 1", "Q1", "Q.1".
  v_num_match := substring(v_stripped from '^(?:quan|q)[\s.]*(\d+)$');
  if v_num_match is not null then
    v_num := v_num_match::int;
    if v_num = 2 or v_num = 9 then
      return 'thu_duc';
    end if;
    if v_num in (1,3,4,5,6,7,8,10,11,12) then
      return 'q' || v_num;
    end if;
  end if;

  return null;  -- unknown / non-HCMC
end;
$$;

-- Apply the mapping to each row's districts array. Rows where ANY element
-- maps to NULL are skipped (they need manual review) — but in practice
-- production currently has only Binh Thanh / Quan 1 / Quan 2 which all
-- resolve.
update public.worker_profiles
set districts = (
  select array(
    select public.normalize_district_value(d)
    from unnest(districts) as d
  )
)
where not (
  -- Skip rows whose districts are already all canonical slugs.
  districts <@ array[
    'hcmc_all','q1','q3','q4','q5','q6','q7','q8','q10','q11','q12',
    'binh_thanh','thu_duc','tan_binh','go_vap','phu_nhuan','binh_tan',
    'tan_phu','hoc_mon','binh_chanh','cu_chi','nha_be','can_gio'
  ]::text[]
)
and not exists (
  select 1 from unnest(districts) as d
  where public.normalize_district_value(d) is null
);

-- Drop helper after use so it doesn't leak into the global API surface.
drop function if exists public.normalize_district_value(text);
