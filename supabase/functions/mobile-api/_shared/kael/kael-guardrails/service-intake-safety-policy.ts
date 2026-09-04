export function scanServiceIntakeSafetySignals(selectedService: string, input: string): string[] {
  if (selectedService === "plumbing") return scanPlumbingSafetySignals(input);
  if (selectedService === "cleaning") return scanCleaningSafetySignals(input);
  if (selectedService === "hvac") return scanHvacSafetySignals(input);
  if (selectedService === "upholstery") return scanUpholsterySafetySignals(input);
  if (selectedService === "handyman") return scanHandymanSafetySignals(input);
  return [];
}

function scanPlumbingSafetySignals(input: string): string[] {
  const text = normalizeServiceSafetyText(input);
  const affirmative = withoutNegatedPlumbingSafetySignals(text);
  const signals: string[] = [];
  if (/(?:khong khoa duoc|khong dung duoc|phun lien tuc|phun manh|dong nuoc khong dung|nuoc khong ngung|uncontrolled|keeps? flowing|won t stop|cannot stop)/.test(affirmative)) {
    signals.push("uncontrolled_flow");
  }
  if (/(?:\bngap\b|\btran\b|lan sang|lan ra|lan tren|ra san|ra nen|chay vao nha|phu .* nen|flood|spreading)/.test(affirmative)) {
    signals.push("flooding");
  }
  if (/(?:nuoc thai|nuoc ban|trai nguoc|nuoc den|backflow|wastewater|contaminat)/.test(affirmative)) {
    signals.push("sewage");
  }
  if (/(?:nuoc nong|hoi nong|steam|scald)/.test(affirmative)) {
    signals.push("hot_water_hazard");
  }
  if (/(?:ong am|am trong tuong|trong tuong|duoi nen|tren tran|tran thach cao|trong tu|concealed|inside wall|under floor|ceiling void)/.test(affirmative)) {
    signals.push("concealed_pipe");
  }
  if (/(?:ong dung chung|tuyen .* chung|hai can|nhieu can|cung truc|shared stack|riser|vertical stack|more than one apartment|two apartments)/.test(affirmative)) {
    signals.push("shared_stack");
  }
  if (/(?:ong nuoc chinh|cap chinh|van cap chinh|nuoc dau vao|main supply|meter-side|main isolation)/.test(affirmative)) {
    signals.push("main_supply");
  }
  if (/(?:chong tham|lop chong tham|ranh chong tham|ban cong|balcony slab|bathroom floor|wall-floor boundary)/.test(affirmative)) {
    signals.push("waterproofing_boundary");
  }
  return [...new Set(signals)];
}

function withoutNegatedPlumbingSafetySignals(input: string) {
  return input
    .replace(
      /\b(?:khong|chua)\s+(?:(?:co|bi|thay|con)\s+)?(?:tran|trai nguoc|nuoc thai|nuoc ban|nuoc den|nuoc nong|hoi nong|ngap|phun|flood|backflow|wastewater)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function scanCleaningSafetySignals(input: string): string[] {
  const text = normalizeServiceSafetyText(input);
  const affirmative = withoutNegatedServiceSignals(text, [
    "moc",
    "mold",
    "nam moc",
    "biohazard",
    "sharp waste",
    "rac sac",
    "kinh vo",
    "unsafe height",
    "fragile surface",
    "specialist floor",
    "heavy machinery",
  ]);
  const signals: string[] = [];
  if (hasServiceTerm(affirmative, [
    "biohazard",
    "chat thai sinh hoc",
    "dich co the",
    "mau",
    "nuoc tieu",
    "phan nguoi",
    "kim tiem",
    "blood",
    "urine",
    "feces",
    "bodily fluid",
  ])) {
    signals.push("biohazard");
  }
  if (hasServiceTerm(affirmative, [
    "hoa chat khong ro",
    "dung dich la",
    "hoa chat la",
    "unknown chemical",
    "chemical spill",
  ])) {
    signals.push("unknown_chemical");
  }
  if (hasServiceTerm(affirmative, [
    "rac sac",
    "kinh vo",
    "kim tiem",
    "manh kim loai",
    "sharp waste",
    "broken glass",
    "needle",
  ])) {
    signals.push("sharp_waste");
  }
  if (hasServiceTerm(affirmative, [
    "moc den",
    "moc day",
    "moc lan rong",
    "nam moc day",
    "heavy mold",
    "black mold",
    "mold spreading",
  ])) {
    signals.push("heavy_mold");
  }
  if (hasServiceTerm(affirmative, [
    "tren cao",
    "ngoai ban cong",
    "gieng troi",
    "cua so cao",
    "unsafe height",
    "high window",
    "ladder",
  ])) {
    signals.push("unsafe_height");
  }
  if (hasServiceTerm(affirmative, [
    "be mat de tray",
    "kinh mong",
    "da tu nhien",
    "go tu nhien",
    "son de tray",
    "fragile surface",
    "delicate surface",
  ])) {
    signals.push("fragile_surface");
  }
  if (hasServiceTerm(affirmative, [
    "san go tu nhien",
    "san da dac biet",
    "san chuyen dung",
    "specialist floor",
    "specialty flooring",
  ])) {
    signals.push("specialist_floor");
  }
  if (hasServiceTerm(affirmative, [
    "may cha san cong nghiep",
    "thiet bi nang",
    "heavy machinery",
    "industrial floor machine",
  ])) {
    signals.push("heavy_machinery");
  }
  return [...new Set(signals)];
}

function scanHvacSafetySignals(input: string): string[] {
  const text = normalizeServiceSafetyText(input);
  const affirmative = withoutNegatedServiceSignals(text, [
    "mui khet",
    "mui chay",
    "boc khoi",
    "smoke",
    "sparking",
    "tia lua",
    "toe lua",
    "refrigerant",
    "ro gas",
    "xi gas",
    "sua may lanh",
    "sua dieu hoa",
    "repair",
    "sealed system",
    "nap gas",
    "thu hoi gas",
    "bo mach",
    "mach dieu khien",
    "control board",
    "height access",
  ]);
  const unitContext = hasServiceTerm(affirmative, [
    "may lanh",
    "dieu hoa",
    "air conditioner",
    "air conditioning",
    "dan nong",
    "dan lanh",
    "hvac",
  ]);
  const signals: string[] = [];
  if (unitContext && hasServiceTerm(affirmative, [
    "mui khet",
    "mui chay",
    "boc khoi",
    "smoke",
    "burning smell",
  ])) {
    signals.push("burning_smell");
  }
  if (unitContext && hasServiceTerm(affirmative, [
    "toe lua",
    "tia lua",
    "phat lua",
    "spark",
    "sparking",
    "arcing",
  ])) {
    signals.push("sparking");
  }
  if (hasServiceTerm(affirmative, [
    "xi gas",
    "ro gas",
    "ro moi chat",
    "nghi ro moi chat",
    "refrigerant leak",
    "refrigerant suspected",
  ])) {
    signals.push("refrigerant_suspected");
  }
  if (hasServiceTerm(affirmative, [
    "ngoai mat dung",
    "ban cong khong lan can",
    "ban cong cao",
    "khong an toan khi tiep can",
    "unsafe unit access",
    "external facade",
  ])) {
    signals.push("unsafe_unit_access");
  }
  if (hasServiceTerm(affirmative, [
    "sua may lanh",
    "sua dieu hoa",
    "can sua",
    "repair",
    "fault diagnosis",
  ])) {
    signals.push("repair");
  }
  if (hasServiceTerm(affirmative, [
    "he thong kin",
    "mach gas kin",
    "may nen",
    "compressor",
    "sealed system",
  ])) {
    signals.push("sealed_system");
  }
  if (hasServiceTerm(affirmative, [
    "nap gas",
    "thu hoi gas",
    "bo sung moi chat",
    "refrigerant service",
  ])) {
    signals.push("refrigerant");
  }
  if (hasServiceTerm(affirmative, [
    "bo mach",
    "mach dieu khien",
    "main board",
    "control board",
  ])) {
    signals.push("control_board");
  }
  if (hasServiceTerm(affirmative, [
    "tren cao",
    "dan nong tren cao",
    "dieu hoa tren cao",
    "ban cong cao",
    "can leo",
    "dung thang",
    "height access",
  ])) {
    signals.push("height_access");
  }
  return [...new Set(signals)];
}

function scanUpholsterySafetySignals(input: string): string[] {
  const text = normalizeServiceSafetyText(input);
  const affirmative = withoutNegatedServiceSignals(text, [
    "dich co the",
    "mau",
    "nuoc tieu",
    "phan",
    "pest evidence",
    "rep",
    "ratz",
    "nguoi di ung",
    "hen",
    "lua",
    "nhung",
    "da that",
    "lem mau",
    "phai mau",
    "high value",
    "gia tri cao",
  ]);
  const signals: string[] = [];
  if (hasServiceTerm(affirmative, [
    "dich co the",
    "mau",
    "nuoc tieu",
    "phan",
    "bio contamination",
    "bodily fluid",
    "blood",
    "urine",
    "feces",
  ])) {
    signals.push("bio_contamination");
  }
  if (hasServiceTerm(affirmative, [
    "hoa chat khong ro",
    "dung dich la",
    "unknown chemical",
    "chemical spill",
  ])) {
    signals.push("unknown_chemical");
  }
  if (hasServiceTerm(affirmative, [
    "rep",
    "ratz",
    "con trung",
    "bedbug",
    "pest evidence",
    "infestation",
  ])) {
    signals.push("pest_evidence");
  }
  if (hasServiceTerm(affirmative, [
    "tre so sinh",
    "nguoi di ung",
    "hen",
    "nguoi nhay cam",
    "sensitive occupant",
    "infant",
    "allergic",
  ])) {
    signals.push("sensitive_occupant");
  }
  if (/(?:khong co|mat|missing|no)\s+(?:nhan giat|care label)/.test(text)) {
    signals.push("missing_care_label");
  }
  if (hasServiceTerm(affirmative, [
    "lua",
    "nhung",
    "da that",
    "vai mong",
    "delicate fabric",
    "silk",
    "velvet",
  ])) {
    signals.push("delicate_fabric");
  }
  if (hasServiceTerm(affirmative, [
    "lem mau",
    "phai mau",
    "mau chay",
    "color transfer",
    "bleeding color",
  ])) {
    signals.push("color_transfer_risk");
  }
  if (hasServiceTerm(affirmative, [
    "gia tri cao",
    "do co",
    "hang thiet ke",
    "high value",
    "antique",
    "designer",
  ])) {
    signals.push("high_value_item");
  }
  return [...new Set(signals)];
}

function scanHandymanSafetySignals(input: string): string[] {
  const text = normalizeServiceSafetyText(input);
  const affirmative = withoutNegatedServiceSignals(text, [
    "tuong chiu luc",
    "load bearing",
    "day dien am",
    "duong dien am",
    "concealed electrical",
    "ong nuoc am",
    "duong ong am",
    "concealed plumbing",
    "tren cao",
    "regulated electrical",
    "regulated plumbing",
    "structural work",
    "specialist appliance",
  ]);
  const signals: string[] = [];
  if (hasServiceTerm(affirmative, [
    "tuong chiu luc",
    "dam chiu luc",
    "cot nha",
    "san ket cau",
    "load bearing",
    "structural wall",
  ])) {
    signals.push("load_bearing_change");
  }
  if (hasServiceTerm(affirmative, [
    "day dien am",
    "duong dien am",
    "cap dien am",
    "dau vao day dien",
    "concealed electrical",
    "wiring behind wall",
  ])) {
    signals.push("concealed_electrical");
  }
  if (hasServiceTerm(affirmative, [
    "ong nuoc am",
    "ong cap thoat am",
    "duong ong am",
    "pipe behind wall",
    "concealed plumbing",
  ])) {
    signals.push("concealed_plumbing");
  }
  if (hasServiceTerm(affirmative, [
    "tren cao",
    "ngoai ban cong",
    "khong co diem dung an toan",
    "unsafe height",
    "high access",
    "ladder",
  ])) {
    signals.push("unsafe_height");
  }
  if (hasServiceTerm(affirmative, [
    "dau dien",
    "di day",
    "lap cb",
    "them o cam",
    "mach dien",
    "regulated electrical",
    "rewire",
    "circuit breaker",
  ])) {
    signals.push("regulated_electrical");
  }
  if (hasServiceTerm(affirmative, [
    "di doi ong",
    "noi ong",
    "thay ong",
    "duong cap nuoc",
    "regulated plumbing",
    "water line",
  ])) {
    signals.push("regulated_plumbing");
  }
  if (hasServiceTerm(affirmative, [
    "pha tuong",
    "cat dam",
    "thay doi ket cau",
    "mo rong cua",
    "structural work",
    "demolish wall",
  ])) {
    signals.push("structural_work");
  }
  if (hasServiceTerm(affirmative, [
    "sua ben trong may giat",
    "sua may lanh",
    "sua tu lanh",
    "specialist appliance",
    "internal appliance repair",
  ])) {
    signals.push("specialist_appliance");
  }
  return [...new Set(signals)];
}

function hasServiceTerm(input: string, terms: readonly string[]) {
  return terms.some((term) => input.includes(term));
}

function withoutNegatedServiceSignals(input: string, terms: readonly string[]) {
  let affirmative = input;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    affirmative = affirmative.replace(
      new RegExp(
        `\\b(?:khong|chua|no|not|without|never)\\s+(?:(?:co|bi|thay|con|phai|can|any|a|have|see|detect)\\s+)?${escaped}\\b`,
        "g",
      ),
      " ",
    );
  }
  return affirmative.replace(/\s+/g, " ").trim();
}


function normalizeServiceSafetyText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
