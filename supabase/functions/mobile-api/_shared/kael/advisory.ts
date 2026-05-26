export function buildAdvisory(indicators: string[]): string | null {
  const joined = indicators.join(" ").toLowerCase();
  if (!joined) return null;
  if (/(cháy|khét|burn|smell|rò điện|giật|ngập|vỡ|tràn|nóng)/i.test(joined)) {
    return "Nếu có mùi khét, rò điện, nước tràn hoặc dấu hiệu nguy hiểm, hãy ngắt nguồn/khóa nước và chờ thợ kiểm tra trực tiếp.";
  }
  return null;
}
