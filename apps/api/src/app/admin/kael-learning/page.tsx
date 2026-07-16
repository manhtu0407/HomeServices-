"use client";

import { useReducer, useRef } from "react";
import {
  edgeAdminFetch,
  resolveTrustedMobileApiBase,
  serviceLabel,
} from "./client";
import {
  adminLearningReducer,
  createAdminLearningState,
  type AdminLearningCandidate as Candidate,
} from "./state";

type CandidateListResponse = {
  candidates: Candidate[];
};

type ReviewResult = {
  ok: boolean;
  candidate_id: string;
  status: string;
  rule_id?: string | null;
  rule_version?: number | null;
};

const TRUSTED_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CONFIGURED_API_BASE = resolveTrustedMobileApiBase(
  process.env.NEXT_PUBLIC_MOBILE_API_URL,
  TRUSTED_SUPABASE_URL,
);
const MANUAL_REVIEW_SLA_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function KaelLearningAdminPage() {
  const [state, dispatch] = useReducer(adminLearningReducer, undefined, createAdminLearningState);
  const loadRequestIdRef = useRef(0);
  const actionRequestIdRef = useRef(0);
  const ownerVersionRef = useRef(0);
  const {
    activeAction,
    bearerToken,
    candidates,
    error,
    loading,
    notice,
    ownerVersion,
    rejectReasons,
  } = state;
  const actionId = activeAction?.candidateId ?? null;
  const canRequest = CONFIGURED_API_BASE !== null && bearerToken.trim().length > 0;

  async function loadCandidates({
    clearNotice = true,
    requestOwnerVersion = ownerVersion,
    token = bearerToken,
  }: {
    clearNotice?: boolean;
    requestOwnerVersion?: number;
    token?: string;
  } = {}) {
    if (!CONFIGURED_API_BASE) {
      dispatch({ type: "validationFailed", error: "Mobile-api quản trị chưa được cấu hình an toàn." });
      return;
    }
    if (!token.trim()) {
      dispatch({ type: "validationFailed", error: "Cần token phiên admin." });
      return;
    }
    if (ownerVersionRef.current !== requestOwnerVersion) {
      return;
    }
    const requestId = ++loadRequestIdRef.current;
    dispatch({ type: "loadStarted", clearNotice, ownerVersion: requestOwnerVersion, requestId });
    try {
      const data = await edgeAdminFetch<CandidateListResponse>(
        CONFIGURED_API_BASE,
        token,
        "/admin/kael/learning/candidates?state=manual_review",
        { trustedSupabaseUrl: TRUSTED_SUPABASE_URL },
      );
      dispatch({
        type: "loadSucceeded",
        candidates: data.candidates,
        ownerVersion: requestOwnerVersion,
        requestId,
      });
    } catch (err) {
      dispatch({
        type: "loadFailed",
        error: errorMessage(err),
        ownerVersion: requestOwnerVersion,
        requestId,
      });
    }
  }

  async function approveCandidate(candidateId: string) {
    if (!CONFIGURED_API_BASE) return;
    const requestId = ++actionRequestIdRef.current;
    const requestOwnerVersion = ownerVersion;
    const token = bearerToken;
    dispatch({ type: "actionStarted", candidateId, ownerVersion: requestOwnerVersion, requestId });
    try {
      const result = await edgeAdminFetch<ReviewResult>(
        CONFIGURED_API_BASE,
        token,
        `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/approve`,
        { method: "POST", body: {}, trustedSupabaseUrl: TRUSTED_SUPABASE_URL },
      );
      dispatch({
        type: "actionSucceeded",
        notice: `Đã duyệt đề xuất ${result.candidate_id}.`,
        ownerVersion: requestOwnerVersion,
        requestId,
      });
      await loadCandidates({ clearNotice: false, requestOwnerVersion, token });
    } catch (err) {
      dispatch({
        type: "actionFailed",
        error: errorMessage(err),
        ownerVersion: requestOwnerVersion,
        requestId,
      });
    } finally {
      dispatch({ type: "actionFinished", ownerVersion: requestOwnerVersion, requestId });
    }
  }

  async function rejectCandidate(candidateId: string) {
    if (!CONFIGURED_API_BASE) return;
    const reason = rejectReasons[candidateId]?.trim();
    if (!reason) {
      dispatch({ type: "validationFailed", error: "Nhập lý do từ chối trước khi lưu quyết định." });
      return;
    }
    const requestId = ++actionRequestIdRef.current;
    const requestOwnerVersion = ownerVersion;
    const token = bearerToken;
    dispatch({ type: "actionStarted", candidateId, ownerVersion: requestOwnerVersion, requestId });
    try {
      const result = await edgeAdminFetch<ReviewResult>(
        CONFIGURED_API_BASE,
        token,
        `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/reject`,
        { method: "POST", body: { reason }, trustedSupabaseUrl: TRUSTED_SUPABASE_URL },
      );
      dispatch({
        type: "actionSucceeded",
        clearRejectReasonFor: candidateId,
        notice: `Đã từ chối và lưu trữ đề xuất ${result.candidate_id}.`,
        ownerVersion: requestOwnerVersion,
        requestId,
      });
      await loadCandidates({ clearNotice: false, requestOwnerVersion, token });
    } catch (err) {
      dispatch({
        type: "actionFailed",
        error: errorMessage(err),
        ownerVersion: requestOwnerVersion,
        requestId,
      });
    } finally {
      dispatch({ type: "actionFinished", ownerVersion: requestOwnerVersion, requestId });
    }
  }

  return (
    <main className="min-h-screen bg-[#f6fbf8] px-5 py-8 text-[#0e2f2a]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="rounded-2xl border border-[#b9e6d8] bg-[#eaf8f3] p-5">
          <p className="text-xs font-bold uppercase text-[#0e7c66]">Quản trị Kael</p>
          <h1 className="mt-2 text-3xl font-black">Duyệt đề xuất học</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52615c]">
            Trang này chỉ gọi Edge mobile-api cố định đã cấu hình bằng token phiên admin. Không lưu
            khóa service và không ghi trực tiếp bảng học từ Next.js.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-[#d8e8e1] bg-white p-4 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-sm font-bold text-[#31564f]">
            Token admin
            <input
              className="min-h-11 rounded-xl border border-[#c7dcd4] px-3 font-normal text-[#0e2f2a] outline-none focus:border-[#0e7c66]"
              onChange={(event) => {
                const nextToken = event.target.value;
                if (nextToken === bearerToken) return;
                ownerVersionRef.current += 1;
                dispatch({ type: "tokenChanged", bearerToken: nextToken });
              }}
              placeholder="Dán token phiên admin"
              type="password"
              value={bearerToken}
            />
          </label>
          <button
            className="min-h-11 self-end rounded-xl bg-[#0e7c66] px-5 text-sm font-black text-white disabled:opacity-50"
            disabled={loading || !canRequest}
            onClick={() => void loadCandidates()}
            type="button"
          >
            {loading ? "Đang tải..." : "Tải danh sách"}
          </button>
          {!CONFIGURED_API_BASE ? (
            <p className="text-sm font-bold text-[#8a1f1f] md:col-span-2">
              Thiếu NEXT_PUBLIC_MOBILE_API_URL hợp lệ; thao tác quản trị đang bị khóa.
            </p>
          ) : null}
        </div>

        {notice ? <p className="rounded-xl border border-[#a8deb7] bg-[#e9f8ef] p-3 text-sm font-bold text-[#155b35]">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-[#f7b4b4] bg-[#fde8e8] p-3 text-sm font-bold text-[#8a1f1f]">{error}</p> : null}

        <div className="rounded-2xl border border-[#d8e8e1] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#d8e8e1] p-4">
            <p className="text-sm font-black">{candidates.length} đề xuất chờ duyệt</p>
            <p className="text-xs font-bold text-[#60736d]">Trạng thái: chờ duyệt</p>
          </div>

          {loading ? (
            <p className="p-6 text-sm text-[#52615c]">Đang tải dữ liệu thật từ Edge...</p>
          ) : candidates.length === 0 ? (
            <p className="p-6 text-sm text-[#52615c]">Không có đề xuất cần duyệt.</p>
          ) : (
            <div className="divide-y divide-[#d8e8e1]">
              {candidates.map((candidate) => {
                const pending = actionId === candidate.id;
                const slaOverdue = isManualReviewSlaOverdue(candidate.created_at);
                return (
                  <article className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]" key={candidate.id}>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-black">{candidateTypeLabel(candidate.candidate_type)}</h2>
                          <p className="mt-1 text-sm text-[#52615c]">
                            {candidateSkill(candidate)} · {serviceLabel(candidate.affected_service)}
                          </p>
                        </div>
                        <div className="grid justify-items-end gap-1">
                          <span className="rounded-full bg-[#ffe9b0] px-3 py-1 text-xs font-black text-[#5c3c00]">
                            Chờ duyệt
                          </span>
                          {slaOverdue ? (
                            <span className="text-xs font-black text-[#9a5a00]">Quá hạn {MANUAL_REVIEW_SLA_DAYS} ngày</span>
                          ) : null}
                        </div>
                      </div>
                      <dl className="grid gap-2 sm:grid-cols-3">
                        <Metric label="Bằng chứng" value={`${candidate.evidence_count}`} />
                        <Metric label="Tin cậy" value={`${Math.round(candidate.confidence * 100)}%`} />
                        <Metric label="Khu vực" value={candidate.affected_district ?? "Không giới hạn"} />
                      </dl>
                      <p className="text-sm text-[#52615c]">Mã vấn đề: {candidate.affected_problem ?? "Không giới hạn"}</p>
                      <p className="text-sm text-[#52615c]">Nguồn: {evidenceSource(candidate)}</p>
                    </div>

                    <div className="space-y-3">
                      <textarea
                        aria-label={`Lý do từ chối ứng viên ${candidate.id}`}
                        className="min-h-24 w-full resize-none rounded-xl border border-[#c7dcd4] p-3 text-sm outline-none focus:border-[#0e7c66]"
                        onChange={(event) => dispatch({
                          type: "rejectReasonChanged",
                          candidateId: candidate.id,
                          text: event.target.value,
                        })}
                        placeholder="Lý do từ chối"
                        value={rejectReasons[candidate.id] ?? ""}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className="min-h-11 rounded-xl bg-[#0e7c66] text-sm font-black text-white disabled:opacity-50"
                          disabled={pending || actionId !== null}
                          onClick={() => void approveCandidate(candidate.id)}
                          type="button"
                        >
                          {pending ? "Đang lưu..." : "Duyệt"}
                        </button>
                        <button
                          className="min-h-11 rounded-xl border border-[#c93a3a] bg-white text-sm font-black text-[#a42727] disabled:opacity-50"
                          disabled={pending || actionId !== null}
                          onClick={() => void rejectCandidate(candidate.id)}
                          type="button"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#eef7f3] p-3">
      <dt className="text-xs font-bold text-[#60736d]">{label}</dt>
      <dd className="mt-1 text-sm font-black text-[#0e2f2a]">{value}</dd>
    </div>
  );
}

function candidateTypeLabel(type: string) {
  return ({
    price_prior_update: "Cập nhật khoảng giá",
    analysis_rule: "Quy tắc phân tích",
    service_knowledge_candidate: "Tri thức dịch vụ",
    safety_pattern_candidate: "Mẫu an toàn",
    decline_reason_candidate: "Lý do từ chối",
  } as Record<string, string>)[type] ?? "Đề xuất học";
}

function candidateSkill(candidate: Candidate) {
  const skill = candidate.suggested_payload.skill_id;
  return typeof skill === "string" ? skill : "Kael";
}

function evidenceSource(candidate: Candidate) {
  const source = candidate.evidence_snapshot?.source ?? candidate.suggested_payload.evidence_source;
  if (source === "completed_reviewed_jobs") return "Việc đã hoàn tất và được đánh giá";
  if (source === "candidate_payload") return "Payload đề xuất đã kiểm tra";
  if (source === "learning_rule_monitor") return "Giám sát quy tắc học";
  return "Bằng chứng đã lưu";
}

function isManualReviewSlaOverdue(createdAt: string) {
  const createdMs = Date.parse(createdAt);
  return Number.isFinite(createdMs) && Date.now() - createdMs > MANUAL_REVIEW_SLA_DAYS * DAY_MS;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Không thể xử lý yêu cầu.";
}
