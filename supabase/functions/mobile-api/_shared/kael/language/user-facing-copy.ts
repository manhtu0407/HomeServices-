const INTERNAL_PRODUCT_NAME = /\bNestScout\b/giu;
const INTERNAL_MODEL_ENVELOPE = /\bUNTRUSTED_(?:CUSTOMER_EVIDENCE|CONVERSATION)_JSON\b/u;

type KaelLanguage = "vi" | "en";

const SERVICE_FALLBACK_COPY: Record<string, Record<KaelLanguage, string>> = {
  cleaning: { en: "Home cleaning request", vi: "Nhu cầu vệ sinh nhà" },
  electrical: { en: "Electrical issue", vi: "Sự cố điện" },
  handyman: { en: "Minor repair or installation request", vi: "Nhu cầu sửa vặt hoặc lắp đặt" },
  hvac: { en: "Air conditioner or indoor air issue", vi: "Sự cố điều hòa hoặc không khí" },
  plumbing: { en: "Plumbing issue", vi: "Sự cố nước" },
  upholstery: { en: "Upholstery care request", vi: "Nhu cầu chăm sóc nội thất" },
};

const PROBLEM_COPY: Record<string, Record<KaelLanguage, string>> = {
  "electrical-general": { en: "Electrical issue", vi: "Sự cố điện" },
  "plumbing-general": { en: "Plumbing issue", vi: "Sự cố nước" },
  "cleaning-general": { en: "Home cleaning request", vi: "Nhu cầu vệ sinh nhà" },
  "hvac-general": { en: "Air conditioner issue", vi: "Sự cố điều hòa" },
  "upholstery-general": { en: "Upholstery care request", vi: "Nhu cầu chăm sóc nội thất" },
  "handyman-general": { en: "Minor repair or installation request", vi: "Nhu cầu sửa vặt hoặc lắp đặt" },
  bathroom_deep_clean: { en: "Bathroom deep cleaning", vi: "Vệ sinh sâu phòng tắm" },
  breaker_trip: { en: "Circuit breaker trips", vi: "Cầu dao tự ngắt" },
  carpet_cleaning: { en: "Carpet cleaning", vi: "Vệ sinh thảm" },
  clogged_drain_or_sink: { en: "Clogged drain or sink", vi: "Tắc cống hoặc bồn" },
  curtain_cleaning: { en: "Curtain cleaning", vi: "Vệ sinh rèm" },
  deep_cleaning: { en: "Deep home cleaning", vi: "Tổng vệ sinh" },
  drill_or_mount_shelf: { en: "Drill or mount a shelf", vi: "Khoan hoặc lắp kệ" },
  error_code: { en: "Air conditioner error code", vi: "Điều hòa báo mã lỗi" },
  faucet_broken: { en: "Broken faucet", vi: "Vòi nước hỏng" },
  flickering_light: { en: "Flickering light", vi: "Đèn chập chờn" },
  install_bathroom_fixture: { en: "Install a bathroom fixture", vi: "Lắp thiết bị phòng tắm" },
  install_curtain_rod: { en: "Install a curtain rod", vi: "Lắp thanh rèm" },
  install_device: { en: "Install an electrical device", vi: "Lắp thêm thiết bị điện" },
  install_or_replace_fixture: { en: "Install or replace a fixture", vi: "Lắp hoặc thay thiết bị nước" },
  install_small_fixture: { en: "Install a small fixture", vi: "Lắp thiết bị nhỏ" },
  kitchen_deep_clean: { en: "Kitchen deep cleaning", vi: "Vệ sinh sâu nhà bếp" },
  mattress_cleaning: { en: "Mattress cleaning", vi: "Vệ sinh nệm" },
  mount_tv_or_furniture: { en: "Mount a TV or furniture", vi: "Lắp TV hoặc nội thất" },
  no_cooling: { en: "Air conditioner not cooling", vi: "Điều hòa không mát" },
  odor_or_mold: { en: "Odor or mold treatment", vi: "Xử lý mùi hôi hoặc ẩm mốc" },
  other_cleaning: { en: "Other home cleaning request", vi: "Nhu cầu vệ sinh khác" },
  other_electrical: { en: "Other electrical issue", vi: "Sự cố điện khác" },
  other_handyman: { en: "Other minor repair request", vi: "Nhu cầu sửa vặt khác" },
  other_hvac: { en: "Other air conditioner issue", vi: "Sự cố điều hòa khác" },
  other_plumbing: { en: "Other plumbing issue", vi: "Sự cố nước khác" },
  other_upholstery: { en: "Other upholstery care request", vi: "Nhu cầu chăm sóc nội thất khác" },
  outlet_or_switch_broken: { en: "Broken outlet or switch", vi: "Ổ cắm hoặc công tắc hỏng" },
  pipe_leak: { en: "Leaking pipe", vi: "Ống rò rỉ" },
  post_repair_cleaning: { en: "Post-repair cleaning", vi: "Vệ sinh sau sửa chữa" },
  power_outage_one_room: { en: "Power outage in one room", vi: "Mất điện một phòng" },
  power_outage_whole_unit: { en: "Power outage in the whole home", vi: "Mất điện toàn căn" },
  repair_hinge_or_handle: { en: "Repair a hinge or handle", vi: "Sửa bản lề hoặc tay nắm" },
  replace_cabinet_hinges: { en: "Replace two cabinet hinges", vi: "Thay hai bản lề tủ" },
  routine_hvac_cleaning: { en: "Air conditioner cleaning", vi: "Vệ sinh điều hòa" },
  sofa_cleaning: { en: "Sofa cleaning", vi: "Vệ sinh sofa" },
  stain_treatment: { en: "Stain treatment", vi: "Xử lý vết bẩn" },
  standard_home_cleaning: { en: "Standard home cleaning", vi: "Dọn dẹp nhà" },
  toilet_flush_issue: { en: "Toilet not flushing", vi: "Toilet không xả" },
  unusual_noise: { en: "Unusual air conditioner noise", vi: "Điều hòa kêu bất thường" },
  water_leak: { en: "Air conditioner water leak", vi: "Điều hòa chảy nước" },
  weak_cooling: { en: "Weak air conditioner cooling", vi: "Điều hòa làm lạnh yếu" },
  weak_water_pressure: { en: "Weak water pressure", vi: "Áp lực nước yếu" },
  window_cleaning: { en: "Window cleaning", vi: "Vệ sinh cửa kính" },
};

export function normalizeKaelResponseBrand(text: string) {
  return text.replace(INTERNAL_PRODUCT_NAME, "Kael");
}

export function customerVisibleKaelProblemSummary(
  value: string,
  language: KaelLanguage,
) {
  const summary = stripInternalModelEnvelope(value).trim().replace(/[.\s]+$/u, "");
  const scopedTaxonomy = summary.match(/^([a-z]+)\s*:\s*([a-z][a-z0-9_-]*)$/u);
  if (scopedTaxonomy) {
    const [, service, problem] = scopedTaxonomy;
    return PROBLEM_COPY[problem]?.[language] ??
      SERVICE_FALLBACK_COPY[service]?.[language] ??
      (language === "vi" ? "Yêu cầu dịch vụ" : "Service request");
  }
  if (/^[a-z][a-z0-9_-]*$/u.test(summary)) {
    return PROBLEM_COPY[summary]?.[language] ??
      (language === "vi" ? "Yêu cầu dịch vụ" : "Service request");
  }
  return summary;
}

function stripInternalModelEnvelope(value: string): string {
  const markerIndex = value.search(INTERNAL_MODEL_ENVELOPE);
  if (markerIndex < 0) return value;

  const visiblePrefix = value
    .slice(0, markerIndex)
    .replace(/(?:Mô tả đã xác nhận|Confirmed description)\s*:\s*$/iu, "")
    .replace(/[.\s]+$/u, "")
    .trim();
  if (visiblePrefix) return visiblePrefix;

  const jsonStart = value.indexOf("{", markerIndex);
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(value.slice(jsonStart)) as { text?: unknown };
      if (typeof payload.text === "string") return payload.text;
    } catch {
      return "";
    }
  }
  return "";
}
