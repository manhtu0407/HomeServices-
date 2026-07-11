export const SERVICE_TYPES = Object.freeze([
  "electrical",
  "plumbing",
  "cleaning",
  "hvac",
  "upholstery",
  "handyman",
] as const);

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const PROBLEM_CHIPS = Object.freeze({
  electrical: Object.freeze([
    "Mất điện một phòng", "Mất điện toàn căn", "Ổ cắm/công tắc hỏng",
    "Cầu dao trip", "Đèn chập chờn", "Lắp thêm thiết bị", "Vấn đề khác",
  ] as const),
  plumbing: Object.freeze([
    "Ống rò rỉ", "Tắc cống/bồn", "Vòi hỏng", "Toilet không xả",
    "Áp nước yếu", "Lắp/thay thiết bị", "Vấn đề khác",
  ] as const),
  cleaning: Object.freeze([
    "Dọn dẹp nhà", "Vệ sinh bếp", "Vệ sinh phòng tắm", "Tổng vệ sinh",
    "Dọn sau sửa chữa", "Vệ sinh cửa kính", "Vấn đề khác",
  ] as const),
  hvac: Object.freeze([
    "Vệ sinh điều hòa", "Máy lạnh yếu", "Máy không mát", "Chảy nước",
    "Kêu bất thường", "Có mã lỗi", "Vấn đề khác",
  ] as const),
  upholstery: Object.freeze([
    "Vệ sinh sofa", "Vệ sinh nệm", "Vệ sinh rèm", "Vệ sinh thảm",
    "Vết bẩn", "Mùi hôi/ẩm mốc", "Vấn đề khác",
  ] as const),
  handyman: Object.freeze([
    "Khoan/lắp kệ", "Lắp thanh rèm", "Lắp đèn/thiết bị nhỏ",
    "Sửa bản lề/tay nắm", "Lắp thiết bị phòng tắm", "Lắp TV/nội thất",
    "Việc nhỏ khác",
  ] as const),
} as const);
