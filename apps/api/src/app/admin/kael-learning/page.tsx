"use client";

import { useMemo, useState } from "react";

type Candidate = {
  id: string;
  candidate_type: string;
  affected_service: "electrical" | "plumbing" | "cleaning" | null;
  affected_problem: string | null;
  affected_district: string | null;
  confidence: number;
  evidence_count: number;
  status: string;
  audit_reason: string | null;
  created_at: string;
  suggested_payload: Record<string, unknown>;
  evidence_snapshot: Record<string, unknown> | null;
};

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

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_MOBILE_API_URL ?? "";
const MANUAL_REVIEW_SLA_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function KaelLearningAdminPage() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [bearerToken, setBearerToken] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRequest = useMemo(
    () => apiBase.trim().length > 0 && bearerToken.trim().length > 0,
    [apiBase, bearerToken],
  );

  async function loadCandidates() {
    setError(null);
    setNotice(null);
    if (!canRequest) {
      setError("Cần mobile-api URL và admin bearer token.");
      return;
    }
    setLoading(true);
    try {
      const data = await edgeFetch<CandidateListResponse>(
        apiBase,
        bearerToken,
        "/admin/kael/learning/candidates?state=manual_review",
      );
      setCandidates(data.candidates);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function approveCandidate(candidateId: string) {
    setActionId(candidateId);
    setError(null);
    setNotice(null);
    try {
      const result = await edgeFetch<ReviewResult>(
        apiBase,
        bearerToken,
        `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/approve`,
        { method: "POST", body: {} },
      );
      setNotice(`Đã duyệt đề xuất ${result.candidate_id}.`);
      await loadCandidates();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionId(null);
    }
  }

  async function rejectCandidate(candidateId: string) {
    const reason = rejectReasons[candidateId]?.trim();
    if (!reason) {
      setError("Nhập lý do từ chối trước khi lưu quyết định.");
      return;
    }
    setActionId(candidateId);
    setError(null);
    setNotice(null);
    try {
      const result = await edgeFetch<ReviewResult>(
        apiBase,
        bearerToken,
        `/admin/kael/learning/candidates/${encodeURIComponent(candidateId)}/reject`,
        { method: "POST", body: { reason } },
      );
      setNotice(`Đã từ chối và lưu trữ đề xuất ${result.candidate_id}.`);
      setRejectReasons((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
      await loadCandidates();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6fbf8] px-5 py-8 text-[#0e2f2a]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="rounded-2xl border border-[#b9e6d8] bg-[#eaf8f3] p-5">
          <p className="text-xs font-bold uppercase text-[#0e7c66]">Quản trị Kael</p>
          <h1 className="mt-2 text-3xl font-black">Duyệt đề xuất học</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52615c]">
            Trang này gọi trực tiếp Edge mobile-api bằng token admin hiện có. Không lưu khóa service,
            không ghi trực tiếp bảng học từ Next.js.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-[#d8e8e1] bg-white p-4 md:grid-cols-[1.2fr_1.4fr_auto]">
          <label className="grid gap-1 text-sm font-bold text-[#31564f]">
            Đường dẫn mobile-api
            <input
              className="min-h-11 rounded-xl border border-[#c7dcd4] px-3 font-normal text-[#0e2f2a] outline-none focus:border-[#0e7c66]"
              onChange={(event) => setApiBase(event.target.value)}
              placeholder="https://.../functions/v1/mobile-api"
              value={apiBase}
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-[#31564f]">
            Token admin
            <input
              className="min-h-11 rounded-xl border border-[#c7dcd4] px-3 font-normal text-[#0e2f2a] outline-none focus:border-[#0e7c66]"
              onChange={(event) => setBearerToken(event.target.value)}
              placeholder="Dán token phiên admin"
              type="password"
              value={bearerToken}
            />
          </label>
          <button
            className="min-h-11 self-end rounded-xl bg-[#0e7c66] px-5 text-sm font-black text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => void loadCandidates()}
            type="button"
          >
            {loading ? "Đang tải..." : "Tải danh sách"}
          </button>
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
                        className="min-h-24 w-full resize-none rounded-xl border border-[#c7dcd4] p-3 text-sm outline-none focus:border-[#0e7c66]"
                        onChange={(event) => setRejectReasons((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))}
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

async function edgeFetch<T>(
  apiBase: string,
  bearerToken: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const base = apiBase.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${bearerToken.trim()}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  const json = safeJson(text);
  if (!response.ok) {
    throw new Error(json.error ?? `HTTP ${response.status}`);
  }
  return json as T;
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

function serviceLabel(service: Candidate["affected_service"]) {
  if (service === "electrical") return "Sửa điện";
  if (service === "plumbing") return "Sửa nước";
  if (service === "cleaning") return "Vệ sinh nhà";
  return "Toàn hệ thống";
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

function safeJson(text: string): { error?: string } & Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as { error?: string } & Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Không thể xử lý yêu cầu.";
}
