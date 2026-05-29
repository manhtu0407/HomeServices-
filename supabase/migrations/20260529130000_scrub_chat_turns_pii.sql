-- =============================================================================
-- X5 (Plan.md §27.8 — 2026-05-29): F-22 one-time historical PII scrub of
-- kael_chat_turns.text_content. Going forward the Edge persist layer scrubs
-- before INSERT (scrubSensitiveForLLM); this migration cleans rows written
-- before that fix so raw phone / CCCD / email / bank numbers do not linger.
--
-- Conservative, unambiguous patterns only (mirrors the high-confidence subset
-- of scrubSensitiveForLLM). Building / unit / floor are intentionally left to
-- the Edge scrubber going forward — rewriting them in SQL across arbitrary
-- free text risks corrupting legitimate problem descriptions.
-- =============================================================================

update public.kael_chat_turns
set text_content = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        text_content,
        '\+?84[0-9]{8,10}', '[phone]', 'g'              -- +84 / 84 phone
      ),
      '\m0[0-9]{8,10}\M', '[phone]', 'g'                -- 0xxxxxxxxx phone
    ),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'  -- email
  ),
  '\m[0-9]{9,12}\M', '[id-number]', 'g'                 -- CCCD / long id / bank
)
where text_content is not null
  and (
    text_content ~ '\+?84[0-9]{8,10}'
    or text_content ~ '\m0[0-9]{8,10}\M'
    or text_content ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
    or text_content ~ '\m[0-9]{9,12}\M'
  );
