-- =============================================================================
-- Plan.md Section 31 A4.1: durable manual-review status for Kael learning candidates.
--
-- Queue and lifecycle state machines already distinguish manual_review. The
-- candidate table needs the same state so admin review can list and act on the
-- exact records that require human approval.
-- =============================================================================

alter type public.learning_candidate_status
  add value if not exists 'manual_review' after 'evidence_gate_passed';
