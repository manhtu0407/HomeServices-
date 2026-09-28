export type JobChatContactGuard = {
  flagged: boolean;
  originalContent: string;
  redactedContent: string;
  signals: string[];
};

const JOB_CHAT_CONTACT_REDACTED =
  "Kael đã ẩn nội dung có dấu hiệu xin liên hệ hoặc thanh toán ngoài app.";

const JOB_CHAT_CONTACT_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "phone", pattern: /\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/i },
  { id: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { id: "sdt", pattern: /\b(?:sdt|số điện thoại|so dien thoai)\b/i },
  { id: "zalo", pattern: /\b(?:zalo|za lo)\b/i },
  {
    id: "call_direct",
    pattern:
      /\b(?:gọi em|goi em|gọi anh|goi anh|gọi riêng|goi rieng|số riêng|so rieng)\b/i,
  },
  { id: "cash", pattern: /\b(?:tiền mặt|tien mat|cash)\b/i },
  {
    id: "off_app",
    pattern:
      /\b(?:khỏi qua app|khoi qua app|không qua app|khong qua app|ngoài app|ngoai app|trực tiếp|truc tiep|ra ngoài app|ra ngoai app)\b/i,
  },
];

export function evaluateJobChatContactGuard(
  content: string,
): JobChatContactGuard {
  const normalized = normalizeGuardText(content);
  const signals = JOB_CHAT_CONTACT_PATTERNS
    .filter((entry) =>
      entry.pattern.test(content) || entry.pattern.test(normalized)
    )
    .map((entry) => entry.id);
  return {
    flagged: signals.length > 0,
    originalContent: content,
    redactedContent: JOB_CHAT_CONTACT_REDACTED,
    signals,
  };
}

export function normalizeGuardText(content: string) {
  return content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}
