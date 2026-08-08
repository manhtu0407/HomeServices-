"use client";

import { useReducer, useRef, useState } from "react";
import { queueAdminFetch, type AdminKaelQueueListResponse, type AdminKaelQueueResolveResponse } from "./client";
import { adminKaelQueueReducer, createAdminKaelQueueState } from "./state";
import { resolveTrustedMobileApiBase } from "../kael-learning/client";

const TRUSTED_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CONFIGURED_API_BASE = resolveTrustedMobileApiBase(
  process.env.NEXT_PUBLIC_MOBILE_API_URL,
  TRUSTED_SUPABASE_URL,
);

export default function KaelQueueAdminPage() {
  const [state, dispatch] = useReducer(adminKaelQueueReducer, undefined, createAdminKaelQueueState);
  const [status, setStatus] = useState("open");
  const [level, setLevel] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const requestId = useRef(0);

  async function load(targetPage = 1) {
    if (!CONFIGURED_API_BASE) {
      dispatch({ type: "validationFailed", error: "Mobile-api quản trị chưa được cấu hình an toàn." });
      return;
    }
    if (!state.bearerToken.trim()) {
      dispatch({ type: "validationFailed", error: "Cần token phiên admin." });
      return;
    }
    const id = ++requestId.current;
    const ownerVersion = state.ownerVersion;
    dispatch({ type: "loadStarted", ownerVersion, requestId: id });
    try {
      const params = new URLSearchParams({ limit: String(state.limit), page: String(targetPage) });
      if (status) params.set("status", status);
      if (level) params.set("escalation_level", level);
      if (fromDate) params.set("from", `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set("to", `${toDate}T23:59:59.999Z`);
      const result = await queueAdminFetch<AdminKaelQueueListResponse>(
        CONFIGURED_API_BASE,
        state.bearerToken,
        `/admin/kael-queue?${params}`,
        { trustedSupabaseUrl: TRUSTED_SUPABASE_URL },
      );
      dispatch({
        type: "loadSucceeded",
        items: result.items,
        limit: result.limit,
        nextPage: result.next_page,
        ownerVersion,
        page: result.page,
        requestId: id,
      });
    } catch (error) {
      dispatch({ type: "loadFailed", error: message(error), ownerVersion, requestId: id });
    }
  }

  async function resolveItem(id: string) {
    if (!CONFIGURED_API_BASE) {
      dispatch({ type: "validationFailed", error: "Mobile-api quản trị chưa được cấu hình an toàn." });
      return;
    }
    if (!state.bearerToken.trim()) {
      dispatch({ type: "validationFailed", error: "Cần token phiên admin." });
      return;
    }
    const ownerVersion = state.ownerVersion;
    dispatch({ type: "resolveStarted", id, ownerVersion });
    try {
      const note = state.notes[id]?.trim();
      const result = await queueAdminFetch<AdminKaelQueueResolveResponse>(
        CONFIGURED_API_BASE,
        state.bearerToken,
        `/admin/kael-queue/${encodeURIComponent(id)}/resolve`,
        { method: "POST", body: note ? { note } : {}, trustedSupabaseUrl: TRUSTED_SUPABASE_URL },
      );
      dispatch({ type: "resolveSucceeded", id, item: result.item, ownerVersion });
    } catch (error) {
      dispatch({ type: "resolveFailed", error: message(error), ownerVersion });
    }
  }

  return (
    <main className="min-h-screen bg-[#f6fbf8] px-5 py-8 text-[#0e2f2a]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-2xl border border-[#b9e6d8] bg-[#eaf8f3] p-5">
          <p className="text-xs font-bold uppercase text-[#0e7c66]">Quản trị Kael</p>
          <h1 className="mt-2 text-3xl font-black">Hàng đợi escalation</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52615c]">Đọc và xử lý các trường hợp Kael chủ động dừng để xin quyết định của con người. Dữ liệu hiển thị đã được route Edge giới hạn PII.</p>
        </header>

        <div className="grid gap-3 rounded-2xl border border-[#d8e8e1] bg-white p-4 lg:grid-cols-3">
          <input aria-label="Token phiên admin" className="rounded-xl border border-[#c7dcd4] p-3 lg:col-span-3" onChange={(event) => dispatch({ type: "tokenChanged", value: event.target.value })} placeholder="Token phiên admin" type="password" value={state.bearerToken} />
          <select aria-label="Trạng thái hàng đợi" className="rounded-xl border border-[#c7dcd4] p-3" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">Tất cả trạng thái</option><option value="open">Mở</option><option value="acknowledged">Đã tiếp nhận</option><option value="resolved">Đã xử lý</option><option value="cancelled">Đã hủy</option>
          </select>
          <select aria-label="Mức độ cần xử lý" className="rounded-xl border border-[#c7dcd4] p-3" onChange={(event) => setLevel(event.target.value)} value={level}>
            <option value="">Tất cả mức</option><option value="soft">Mức nhẹ</option><option value="hard">Mức cao</option>
          </select>
          <button className="rounded-xl bg-[#0e7c66] px-5 font-black text-white disabled:opacity-50" disabled={state.loading} onClick={() => void load(1)} type="button">{state.loading ? "Đang tải…" : "Tải hàng đợi"}</button>
          <label className="grid gap-1 text-sm font-bold text-[#52615c]">Từ ngày<input className="rounded-xl border border-[#c7dcd4] p-3 font-normal" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} /></label>
          <label className="grid gap-1 text-sm font-bold text-[#52615c]">Đến ngày<input className="rounded-xl border border-[#c7dcd4] p-3 font-normal" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} /></label>
          <div className="flex items-end justify-end gap-2">
            <button className="min-h-11 rounded-xl border border-[#c7dcd4] px-4 font-bold disabled:opacity-40" disabled={state.loading || state.page <= 1} onClick={() => void load(state.page - 1)} type="button">Trang trước</button>
            <span className="pb-3 text-sm font-bold">Trang {state.page}</span>
            <button className="min-h-11 rounded-xl border border-[#c7dcd4] px-4 font-bold disabled:opacity-40" disabled={state.loading || state.nextPage === null} onClick={() => void load(state.nextPage ?? state.page)} type="button">Trang sau</button>
          </div>
        </div>

        {state.notice ? <p className="rounded-xl border border-[#a8deb7] bg-[#e9f8ef] p-3 text-sm font-bold text-[#155b35]">{state.notice}</p> : null}
        {state.error ? <p className="rounded-xl border border-[#f7b4b4] bg-[#fde8e8] p-3 text-sm font-bold text-[#8a1f1f]">{state.error}</p> : null}

        <div className="overflow-hidden rounded-2xl border border-[#d8e8e1] bg-white">
          {state.items.length === 0 ? <p className="p-6 text-sm text-[#52615c]">Không có mục hàng đợi trong bộ lọc hiện tại.</p> : (
            <div className="divide-y divide-[#d8e8e1]">
              {state.items.map((item) => (
                <article className="grid gap-4 p-4 lg:grid-cols-[1fr_300px]" key={item.id} data-testid={`kael-queue-item-${item.id}`}>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2"><strong>{queueTypeLabel(item.queue_type)}</strong><span className="rounded-full bg-[#ffe9b0] px-2 py-1 text-xs font-black">{escalationLevelLabel(item.escalation_level)}</span><span className="rounded-full bg-[#eef7f3] px-2 py-1 text-xs font-black">{statusLabel(item.status)}</span></div>
                    <p className="text-sm text-[#52615c]">{reasonCodeLabel(item.reason_code)}</p>
                    <p className="text-sm">{item.response_summary ?? "Không có tóm tắt an toàn."}</p>
                    <p className="text-xs text-[#60736d]">{new Date(item.created_at).toLocaleString("vi-VN")}</p>
                  </div>
                  <div className="space-y-2">
                    <textarea aria-label={`Ghi chú xử lý ${item.id}`} className="min-h-24 w-full rounded-xl border border-[#c7dcd4] p-3 text-sm" disabled={item.status === "resolved"} maxLength={500} onChange={(event) => dispatch({ type: "noteChanged", id: item.id, value: event.target.value })} placeholder="Ghi chú xử lý không chứa PII" value={state.notes[item.id] ?? item.resolution_note ?? ""} />
                    <button className="min-h-11 w-full rounded-xl bg-[#0e7c66] font-black text-white disabled:opacity-50" disabled={item.status === "resolved" || state.resolvingId !== null} onClick={() => void resolveItem(item.id)} type="button">{state.resolvingId === item.id ? "Đang xử lý…" : item.status === "resolved" ? "Đã xử lý" : "Xử lý"}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function message(error: unknown) { return error instanceof Error ? error.message : "Không thể xử lý yêu cầu."; }

function statusLabel(status: string) {
  return ({ open: "Mở", acknowledged: "Đã tiếp nhận", resolved: "Đã xử lý", cancelled: "Đã hủy" } as Record<string, string>)[status] ?? "Trạng thái khác";
}

function escalationLevelLabel(level: string | null) {
  return ({ soft: "Mức nhẹ", hard: "Mức cao" } as Record<string, string>)[level ?? ""] ?? "Không phân mức";
}

function queueTypeLabel(queueType: string) {
  return ({
    demanding_customer: "Khách hàng cần hỗ trợ",
    worker_cancellation_review: "Xem xét hủy từ thợ",
    worker_no_show: "Thợ không đến",
    customer_cancellation_review: "Xem xét hủy từ khách",
    autonomy_escalation: "Ca cần quyết định",
    worker_application_review: "Xem xét hồ sơ thợ",
  } as Record<string, string>)[queueType] ?? "Mục hàng đợi Kael";
}

function reasonCodeLabel(reasonCode: string) {
  return ({
    high_stakes: "Rủi ro cao",
    admin_required: "Cần admin xem xét",
    threat_complaint: "Khiếu nại có dấu hiệu đe dọa",
    PII_OR_SECRET_DETECTED: "Phát hiện dữ liệu nhạy cảm",
    EVIDENCE_INSUFFICIENT_DECIDE_PAYMENT: "Chưa đủ bằng chứng để quyết định thanh toán",
    HIGH_STAKES_LOW_CONFIDENCE: "Rủi ro cao và độ tin cậy thấp",
  } as Record<string, string>)[reasonCode] ?? "Lý do cần xem xét";
}
