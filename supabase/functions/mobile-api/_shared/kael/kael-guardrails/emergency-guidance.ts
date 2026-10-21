import {
  blankMatches,
  buildSignalText,
  insideNamedQuote,
  segmentAt,
  segmentRanges,
  sentenceRanges,
  tonesAgree,
  type Segment,
  type SignalText,
  type ToneCheck,
  type ToneRules,
} from "./emergency-signal-text.ts";

export type EmergencyRoute = "fire" | "medical" | "police" | "electrical_water" | "gas" | "uncertain";

export type EmergencyGuidance = {
  route: EmergencyRoute;
  response: string;
};

// The service the report was made in. "Gas" is the everyday word for HVAC refrigerant, so a bare
// "xi gas" inside the HVAC service is a refrigerant request, not a fuel-gas leak.
export type EmergencyContext = { readonly serviceType?: string | null };

// Bumped whenever the cues or the routing rule change what a report is answered with, so a trace can say which
// classifier produced a reply.
export const EMERGENCY_GATE_VERSION = "case_emergency_gate.v2";

type CueRoute = Exclude<EmergencyRoute, "uncertain" | "gas">;

type Cue = {
  readonly pattern: RegExp;
  readonly tone?: ToneCheck;
  readonly toneRules?: ToneRules;
  readonly technicalBleeding?: boolean;
  // Context in the same clause that makes the words ordinary (cooking, a candle, a cigarette).
  readonly unless?: RegExp;
};

const cue = (pattern: RegExp, extra: Omit<Cue, "pattern"> = {}): Cue => ({ pattern, ...extra });

const FIXED_WIRING_NOUNS = "o dien|o cam|tu dien|bang dien|day dien|cau dao|aptomat|cong to dien";
const HOME_NOUNS = "nha|phong|can ho|chung cu|toa nha|tang";
const WIRED_FIXTURES = "hop cau dao|o cam|o dien|bang dien|tu dien|cau dao|day dien|cong to dien|aptomat|cong tac|hop dien";

// Words a cue shares letters with: dầy/đầy/dây, ngập/ngáp, tràn/trấn, bốc/bóc, bùng/bụng, bắt/bát, rò/rõ, rỉ/rì,
// nhỏ/nho, hở/họ/hồ, chảy/cháy. The rules apply to that cue only, so no other cue changes meaning.
const SMOKE_FILL_TONES: ToneRules = {
  day: /^(?:day|\u0111\u1ea7y)$/u,
  ngap: /^(?:ngap|ng\u1eadp)$/u,
  tran: /^(?:tran|tr\u00e0n)$/u,
};
const THICK_SMOKE_TONES: ToneRules = { day: /^(?:day|d\u00e0y)$/u };
const SMOKE_OUT_TONES: ToneRules = {
  boc: /^(?:boc|b\u1ed1c)$/u,
  toa: /^(?:toa|t\u1ecfa)$/u,
  tran: /^(?:tran|tr\u00e0n)$/u,
};
const COOKING_SMOKE = /\b(?:nau|nuong|chien|xao|thuoc|nhang|huong|bbq|barbecue|grill|cigarette|incense|cooking|frying|toast|candle|nen|roast)\b/u;
const FALL_TONES: ToneRules = {
  nga: /^(?:nga|ng\u00e3)$/u,
  day: /^(?:day|d\u1eady)$/u,
  dung: /^(?:dung|\u0111\u1ee9ng)$/u,
};
const HEART_TONES: ToneRules = { dau: /^(?:dau|\u0111au)$/u };
const ARMED_TONES: ToneRules = {
  cam: /^(?:cam|c\u1ea7m)$/u,
  dao: /^dao$/u,
  sung: /^(?:sung|s\u00fang)$/u,
};
const SOAKED_TONES: ToneRules = { ngam: /^(?:ngam|ng\u00e2m)$/u };
const RAIN_TONES: ToneRules = { tat: /^(?:tat|t\u1ea1t)$/u };
// A cue with a stretch of free words in it must not be vetoed by a tone rule meant for another cue: "máy giặt" is
// not "giật" (shock), and "khói", "lửa" or "chảy" inside the stretch are not the cue's own words.
const FILLER_TONES: ToneRules = {
  giat: /^gi\p{L}t$/u,
  chay: /^ch\p{L}y$/u,
  khoi: /^kh\p{L}i$/u,
  lua: /^l\p{L}a$/u,
  kho: /^kh\p{L}$/u,
  tho: /^th\p{L}$/u,
};
const FAINT_TONES: ToneRules = { ngat: /^(?:ngat|ng\u1ea5t)$/u };
const CATCH_FIRE_TONES: ToneRules = {
  boc: /^(?:boc|b\u1ed1c)$/u,
  bung: /^(?:bung|b\u00f9ng)$/u,
  bat: /^(?:bat|b\u1eaft)$/u,
};
const WATER_TONES: ToneRules = {
  chay: /^ch[a\u1ea3]y$/u,
  ngap: /^(?:ngap|ng\u1eadp)$/u,
  nho: /^nh[o\u1ecf]$/u,
  ro: /^r[o\u00f2]$/u,
  ri: /^r[i\u1ec9]$/u,
};
const EXPOSED_WIRE_TONES: ToneRules = { ho: /^h[o\u1edf]$/u };

// Patterns run on accent-free text; `tone` tells the matcher how strictly the tone marks must
// agree, so "đang chạy" and "đang chảy" never read as "đang cháy".
const EMERGENCY_CUES: Record<CueRoute, readonly Cue[]> = {
  fire: [
    cue(/\b(?:boc khoi|phat khoi|tuon khoi|toa khoi|bao dong chay)\b/u),
    cue(/(?<!\bbep )\b(?:dang co|dang thay|co|thay|ngui thay) khoi(?! (?:thuoc|nhang|huong|bep|xe|bui|tran|dong co|than|hut|luong|nghiep|dau|lap|dong|cong|sac|su|phat|tao))\b/u),
    cue(new RegExp(`\\b(?:${HOME_NOUNS})(?: (?:toi|minh|ben canh|hang xom|ben|nha))?(?: dang| bi) chay(?! (?:nuoc|mau|chua))\\b`, "u")),
    cue(new RegExp(`\\b(?:${FIXED_WIRING_NOUNS})(?: (?:toi|nha toi|nha minh))? dang chay(?! (?:nuoc|mau|chua))\\b`, "u")),
    cue(new RegExp(`\\b(?:dang|co) chay (?:${HOME_NOUNS}|${FIXED_WIRING_NOUNS})\\b|\\bchay (?:o cam|o dien)\\b`, "u")),
    cue(/\b(?:dang chay|chay nha|chay phong|chay roi|chay lon|chay to|chay lan|chay ngun ngut|hoa hoan)\b/u, { tone: "acute" }),
    cue(/\b(?:(?:co|xay ra) chay|chay (?:o|tai))(?! (?:xem|den|nang|bong|vet|nuoc|mau|chua))\b/u, { tone: "acute" }),
    cue(/(?<!\b(?:bep|gas|lo|noi|ga|than) )\b(?:co|thay) lua(?! (?:yeu|xanh|nho|deu|vang|chap chon|dao|gat))\b|\blua dang chay\b/u),
    cue(/\b(?:chuong bao chay|bao chay) (?:dang )?(?:keu|reo|hu|vang)\b/u),
    cue(/\b(?:there (?:is|s) (?:a )?(?:smoke|fire|flames?)|smoke is (?:coming|pouring|rising)|(?:smoke|flames?) (?:is |are )?(?:visible|spreading|everywhere|coming (?:out|from))|visible (?:smoke|flames?)|(?:i|we) (?:can )?(?:see|saw|smell|smelled) (?:smoke|fire|flames?)|fire (?:started|broke out|is spreading|is out of control)|(?:caught|catching) fire|on fire|in flames|(?:fire|smoke) alarm (?:is |has )?(?:going off|ringing|sounding|blaring))\b/u),
    cue(/\b(?:outlet|socket|wire|wiring|device|appliance|panel|house|building|unit|room|kitchen|apartment|ac|air conditioner|heater|charger|breaker|stove|oven|tv|laptop|o cam|o dien|tu dien|bang dien|day dien|may lanh|nha|phong|can ho|chung cu) (?:is |are |s |dang )?(?:smoking|burning up)\b/u),
    cue(/\b(?:day|ngap|tran) khoi(?! (?:thuoc|nhang|huong|bep|xe|bui|dong co|than|hut|luong|nghiep|dau|lap|dong|cong|sac|su|phat|tao))\b/u, { toneRules: SMOKE_FILL_TONES }),
    cue(/\bkhoi (?:tran|bay vao|lan|cuon cuon)\b/u, { toneRules: SMOKE_FILL_TONES }),
    cue(/\bkhoi day dac\b/u, { toneRules: THICK_SMOKE_TONES }),
    cue(/(?<!\b(?:bep|gas|ga|lo|noi|chao|than|nen) )\blua (?:cao|to|lon|bao trum|ngun ngut)\b/u, { unless: COOKING_SMOKE }),
    cue(/\b(?:(?:thick|black|dense|heavy|billowing) smoke|smoke (?:is |was )?(?:pouring|billowing|streaming|gushing|rolling))\b/u, { unless: COOKING_SMOKE }),
    cue(/\bkhoi (?:dang )?(?:boc|toa|tran|phun) (?:ra|len|vao)\b/u, { toneRules: SMOKE_OUT_TONES, unless: COOKING_SMOKE }),
    cue(/\b(?:hallway|corridor|stairwell|staircase|lobby|balcony|floor|kitchen|bedroom|bathroom|living room|garage|basement|roof|ceiling|wall|door|building|house|flat|apartment|room|elevator|lift|stove|oven|heater|cable|cord|wire|outlet|socket|tv|fridge|washing machine) (?:is |are |was |has been |just |now |suddenly )*(?:burning|ablaze)\b/u, { unless: COOKING_SMOKE }),
    cue(/\b(?:(?:filled|filling|fills|full|fill) (?:up )?(?:with|of) smoke|smoke[ -]filled|flames? (?:came|come|comes|coming|shot|shoots|burst|bursts|bursting|leaping|leaped))\b/u),
    cue(/(?<!\b(?:bep|gas|ga|lo|noi|chao|than) )\blua (?:bung|boc|lan|phun|tuon)\b/u, { toneRules: CATCH_FIRE_TONES }),
    cue(/(?<!\b(?:de|kho|chong|khong|vai|chat lieu) )\b(?:boc|bung|bat) chay\b/u, { tone: "acute", toneRules: CATCH_FIRE_TONES }),
  ],
  medical: [
    cue(/\b(?:dien giat|giat dien|bat tinh|ngat xiu|ngat roi|ngung tho|ngung tim|khong tho (?:duoc|noi)|tho khong (?:duoc|noi)|ngat tho|nghet tho|khong the tho|co giat|dot quy|bi thuong|kho tho|dau nguc|cap cuu|bi bong nang|ngo doc|chay mau(?: nhieu| khong ngung| ao at| rat nhieu)?)\b/u),
    cue(/\b(?:electric(?:al)? shock|electrocuted|got shocked|was shocked|unconscious|passed out|not breathing|stopped breathing|difficulty breathing|struggling to breathe|can t breathe|cannot breathe|shortness of breath|chest pain|heart attack|seizure|overdose|medical emergency|needs? an ambulance|call an ambulance|injured|i m hurt|(?:someone|somebody|he|she|they|person|child|kid|baby|man|woman) (?:is|was|got|s) (?:badly |seriously )?hurt|seriously hurt|badly hurt)\b/u),
    cue(/\b(?:(?:i|he|she|they|someone|somebody|person|child|kid|baby|man|woman)(?: m| s| is| am| are| was)?(?: badly| heavily)? bleeding|bleeding (?:heavily|badly|profusely|a lot|won t stop))\b/u, { technicalBleeding: true }),
    cue(/\b(?:(?:i|he|she|they|we|someone|somebody|person|child|kid|baby|man|woman|dad|mum|mom|mother|father|wife|husband|son|daughter|grandma|grandpa|grandmother|grandfather|worker|technician|electrician)(?: m| s| is| was| has| just| suddenly)* (?:fainted|collapsed(?! (?:the|a|an|my|our|his|her|their|this|that|those|these|all|everything)\b)|passed out|unresponsive|not responding|not breathing|stopped moving)|(?:fainted|collapsed) (?:after|when|while)|is not responding to (?:me|us|anyone))\b/u),
    cue(/\bngat (?:di|luon|nguoi)\b/u, { toneRules: FAINT_TONES }),
    cue(/\bnga(?: [a-z]+){0,6} khong (?:day|dung day|dung|di|cu dong|ngoi) duoc\b/u, { toneRules: FALL_TONES }),
    cue(/\b(?:drank|swallowed|ingested|ate) (?:some |a |the |my |his |her )?(?:cleaning (?:liquid|fluid|product)|bleach|poison|detergent|pesticide|batter(?:y|ies)|chemicals?)\b|\b(?:uong|an|nuot) nham (?:thuoc|hoa chat|chat tay rua|nuoc tay|thuoc tru sau|pin|xang)\b/u),
    cue(/\b(?:len con |bi |con )?dau tim\b|\bnhoi mau co tim\b/u, { toneRules: HEART_TONES }),
    cue(/\b(?:choking|choked)(?! hazards?)\b|\b(?:asthma|anaphylactic|allergic) (?:attack|shock|reaction)\b|\bblood (?:is )?(?:everywhere|pouring|gushing)\b|\blosing (?:a lot of )?blood\b|\bbleeding out\b/u),
    cue(/\bnam im (?:khong cu dong|khong nhuc nhich|bat dong)\b/u),
    cue(/\b(?:got an? (?:electric(?:al)? )?shock|(?:received|suffered) an? electric(?:al)? shock)\b/u),
    cue(/\b(?:fell|fallen|collapsed|slipped|lying|lay|passed out)(?: [a-z]+){0,6} (?:isn t|is not|aren t|are not|wasn t|was not|not|stopped) (?:moving|responding|breathing)\b/u),
    cue(/\b(?:he|she|they|someone|somebody|person|man|woman|child|kid|baby|dad|mum|mom|mother|father|grandma|grandpa)(?: s| is| was| are)? (?:not|isn t|aren t|wasn t) (?:moving|responding|breathing)\b/u),
  ],
  police: [
    cue(/\b(?:dot nhap|co nguoi dot nhap|dang bi tan cong|bi tan cong|bi de doa|dang bi de doa|bi cuop|dang bi cuop|bao luc|co trom|ke trom|bi xam hai)\b/u),
    cue(/\b(?:intruder|breaking in|break in|being attacked|being threatened|robbery in progress|assault in progress|burglar|burglary in progress|someone is in my (?:house|home|apartment|room))\b/u),
    cue(/\b(?:ke la|nguoi la|ke gian|ten trom|ai do|co nguoi) (?:dang )?(?:cay|pha|dap|nay) (?:cua|khoa)\b/u),
    cue(/\b(?:nguoi la mat|nguoi la|ke la mat|ke la|ke gian|ten trom|dua la mat) (?:dang )?(?:cay|pha|dap|nay) (?:cua|khoa)\b/u),
    cue(/\b(?:se|doa|muon) giet (?:em|toi|minh|chung toi|tui|ca nha)\b/u),
    cue(/\b(?:armed (?:man|men|person|people|robber|robbers|intruder|attacker)|(?:man|person|people|guy) with an? (?:gun|knife|weapon)|(?:somebody|someone|a man|a stranger|strangers|intruders?|burglars?|thieves|a thief)(?: [a-z]+){0,4} (?:smashed|broke|kicked in|forced|climbed))\b/u),
    cue(/\b(?:ke la|nguoi la|dua la mat|ke gian|ten trom|ai do|co nguoi|thang la|dua nao do|nguoi dan ong) (?:dang )?(?:treo|leo|nhay|chui) (?:qua |len |vao )?(?:ban cong|cua so|rao|tuong|cua)\b/u),
    cue(/\bde doa (?:em|toi|minh|chung toi|tui|con|me|bo|vo|chong)\b/u),
    cue(/\b(?:nguoi la|ke la|ke gian|dua la mat|ten trom|ai do) (?:[a-z]+ ){0,3}(?:cam|vung|rut|chia) (?:dao|sung|vu khi)\b/u, { toneRules: ARMED_TONES }),
    cue(/\btieng (?:la het|keu cuu|danh nhau|dap pha)\b|\bco nguoi bi (?:danh|tan cong|hanh hung|bat coc|bat cuop)\b/u),
    cue(/\b(?:(?:banging|pounding|hammering) (?:on|at) (?:my|our|the) door|(?:stalking|following|followed) (?:me|us) (?:into|to|home|up))\b/u),
    cue(/\b(?:threatening (?:me|us|my|our)|(?:he|she|they|someone|somebody|man|men|guy|guys|intruder|stranger) (?:has|have|had|is holding|are holding|pulled|is brandishing) (?:a |an )?(?:knife|gun|weapon)|trying to (?:force|pry|kick) (?:open )?(?:the |my |our )?(?:door|lock|window))\b/u),
    cue(/\b(?:(?:trying|tried|attempting|attempts?|about) to break (?:in|into)|break(?:ing)? into (?:my|our|the) (?:house|home|apartment|flat|room|unit|place)|(?:someone|somebody|a stranger|strangers|people|men|a man) (?:is |are )?(?:forcing|prying|picking|kicking) (?:open )?(?:the |my |our )?(?:door|lock))\b/u),
  ],
  electrical_water: [
    cue(/\b(?:tia lua dien|phat tia lua|toe lua|danh lua|o dien (?:co )?(?:tia lua|phat tia lua)|day dien lo|day dien tran|day dien dang co dien|day dien phat tia lua)\b/u),
    cue(/\b(?:nuoc (?:dang )?ngap (?:gan|quanh) (?:o dien|o cam|nguon dien|day dien)|nuoc gan (?:o dien|o cam|day dien)|nuoc dang cham vao o dien|nuoc cham vao day dien)\b/u),
    cue(/\b(?:electrical sparking|(?:outlet|socket|wire|panel|breaker) is sparking|sparking (?:from|at) (?:an? )?(?:outlet|socket|wire)|exposed live wire|live wire exposed|water near live wire|water touching an outlet|water near (?:an? )?(?:outlet|electricity|electrical equipment)|water (?:is )?(?:rising|flooding) near (?:an? )?(?:outlet|electricity)|electrical flooding|flooding near electricity|electrical hazard)\b/u),
    cue(/\b(?:live wires? (?:is |are |was |were )?(?:exposed|showing|hanging|dangling|bare|touching|sparking)|(?:exposed|bare|frayed) (?:live )?wires? (?:in|near|next to|by|at|touching|over) (?:the |a |an )?(?:water|bathroom|shower|sink|wet|puddle)|water (?:is |has |was )?(?:leak(?:ing|ed)?|dripping|pouring|running|flowing|seeping|spraying|gushing) (?:in|into|onto|on|over|across|through|near|towards|toward|inside) (?:the |an? )?(?:outlet|socket|breaker|fuse box|electrical panel|electric panel|panel|wiring|junction box|circuit breaker|electrics?))\b/u),
    cue(new RegExp(`\\bnuoc (?:[a-z]+ ){0,4}?(?:ngap|tran|chay|nho|tham|ri|ro) (?:toi|vao|xuong|sat|gan|len|ngay) (?:[a-z]+ ){0,2}(?:${WIRED_FIXTURES})\\b`, "u"), { toneRules: { ...FILLER_TONES, ...WATER_TONES } }),
    cue(new RegExp(`\\b(?:${WIRED_FIXTURES})(?: [a-z]+){0,2} (?:bi |dang )?nuoc (?:tran|ngap|chay|nho|tham|ri|ro) (?:vao|toi|vao trong)\\b`, "u"), { toneRules: WATER_TONES }),
    cue(/\bday dien (?:bi |dang )?(?:ho|troc)\b/u, { toneRules: EXPOSED_WIRE_TONES }),
    cue(new RegExp(`\\b(?:${WIRED_FIXTURES})(?: [a-z]+){0,2} (?:bi |dang )?(?:ngam|ngap) nuoc\\b`, "u"), { toneRules: { ...WATER_TONES, ...SOAKED_TONES } }),
    cue(new RegExp(`\\btia lua(?: [a-z]+){0,2} (?:tu|o|ngay|tai|phat ra tu|bat ra tu) (?:${WIRED_FIXTURES})\\b`, "u")),
    cue(new RegExp(`\\b(?:mua|nuoc mua) (?:tat|hat|bat) (?:vao|toi) (?:[a-z]+ ){0,2}(?:${WIRED_FIXTURES})\\b`, "u"), { toneRules: RAIN_TONES }),
    cue(new RegExp(`\\bnuoc(?: [a-z]+){0,8} (?:cham|lan|bat) (?:toi|vao|den|sat) (?:[a-z]+ ){0,1}(?:${WIRED_FIXTURES})\\b`, "u"), { toneRules: FILLER_TONES }),
    cue(new RegExp(`\\b(?:ngap nuoc|nuoc ngap|tran nuoc)(?: [a-z]+,?){0,8} (?:${WIRED_FIXTURES})\\b`, "u"), { toneRules: WATER_TONES }),
    cue(/\b(?:cord|cable|extension cord|plug|adapter|charger|power strip|wiring|fuse box|junction box|light switch|switch|lamp)s? (?:is |are |was |has been |keeps? )?(?:sparking|arcing)\b/u),
    cue(/\b(?:flooded|submerged|soaked|drenched|swamped) (?:the |an? |our |my )?(?:electrical (?:room|panel|cabinet|box)|fuse box|breaker box|panel|outlets?|sockets?|wiring)\b/u),
  ],
};

// Fuel gas (LPG, cooking gas) leaking is an emergency; refrigerant leaking is a service request, and
// Vietnamese calls both "gas". The word alone never decides: a leaking stove, cylinder or pipe, a fuel-gas
// word or a smell of gas reports fuel gas; a bare leak is ambiguous and the surrounding service decides.
// Words a gas cue shares letters with: gà (chicken), họ (they), rõ (clear), dày (thick), ông (grandfather).
const GAS_TONES: ToneRules = {
  phut: /^(?:phut|ph\u1ee5t)$/u,
  ga: /^ga$/u,
  ho: /^h[o\u1edf]$/u,
  ro: /^r[o\u00f2]$/u,
  ri: /^r[i\u1ec9]$/u,
  xi: /^x[i\u00ec]$/u,
  day: /^d[a\u00e2]y$/u,
  ong: /^(?:ong|\u1ed1ng)$/u,
};
const gasCue = (pattern: RegExp): Cue => cue(pattern, { toneRules: GAS_TONES });
const FUEL = "(?<!\\bnha )(?<!\\bsan )(?:khi )?(?:gas|ga)(?! (?:lanh|giuong|trai|goi|boc|nem|tau|xe))";
const FUEL_WORD = "(?:khi dot|khi gas(?! lanh)|khi ga(?! (?:lanh|giuong))|lpg|propane|butane)";
const LEAK = "(?:ro ri|ro|ri|ho|xi|thoat|phun|phut|tuon)";
const GAS_OBJECT = "(?:binh|bep|lo|ong(?: dan)?|day(?: dan)?|van|bo dieu ap|dieu ap|duong ong|dau noi)";
const FILLER = "(?:(?!khong |chua |het )[a-z]+ )";

const GAS_DAMAGE_TONES: ToneRules = {
  ...GAS_TONES,
  nut: /^(?:nut|n\u1ee9t)$/u,
  vo: /^(?:vo|v\u1ee1)$/u,
};
const GAS_OBJECT_CUES: readonly Cue[] = [
  gasCue(/\bgas (?:cylinder|bottle|tank|stove|hob|cooker|pipe|pipeline|hose|regulator|line|meter|valve)(?: [a-z]+){0,5} (?:hissing|leaking|escaping)\b/u),
  cue(new RegExp("\\b" + GAS_OBJECT + " (?:[a-z]+ ){0,3}" + FUEL + " (?:[a-z]+ ){0,3}(?:nut|rach|vo|dut|thung|ho)\\b", "u"), { toneRules: GAS_DAMAGE_TONES }),
  gasCue(new RegExp("\\b" + GAS_OBJECT + " " + FUEL + " " + FILLER + "{0,4}(?:dang |bi |dang bi )?" + LEAK + "\\b", "u")),
  gasCue(new RegExp("\\b" + LEAK + " (?:o |tu |ra tu |tai |ra o )?" + GAS_OBJECT + " " + FUEL + "\\b", "u")),
  gasCue(new RegExp("\\b" + FUEL_WORD + " " + FILLER + "{0,2}(?:dang |bi )?" + LEAK + "\\b|\\b" + LEAK + " " + FUEL_WORD + "\\b", "u")),
  gasCue(/\b(?:(?:(?:lpg|propane|butane|cooking gas|fuel gas|natural gas) (?:(?:cylinder|bottle|tank|stove|pipe|pipeline|hose|regulator|line|meter|valve) ){0,3}|gas (?:cylinder|bottle|tank|stove|hob|cooker|pipe|pipeline|hose|regulator|line|meter|valve) )(?:is |has |was |are )?(?:currently |actively )?(?:leak(?:ing|ed|s)?|hissing|escaping)|leak(?:ing|s)? (?:lpg|propane|butane|cooking gas|natural gas)|hissing (?:sound |noise )?(?:from |at |coming from )?(?:the |a )?(?:gas )?(?:cylinder|bottle|regulator|stove|hose|pipe))\b/u),
];
const GAS_SMELL_CUES: readonly Cue[] = [
  gasCue(new RegExp("\\bmui (?:cua )?" + FUEL + "\\b|\\bmui khi dot\\b|\\b" + FUEL + " (?:nong nac|bay mui|toa mui|nac mui)\\b|\\bnong nac mui " + FUEL + "\\b", "u")),
  gasCue(/\b(?:smell(?:s|ed|ing)?|smelt)(?: strongly)?(?: of| like)? (?:(?:natural |cooking |lpg |propane )?gas|propane|lpg|butane)\b|\b(?:gas|propane|lpg|butane) (?:smell|odou?r)\b/u),
];
const GAS_BARE_VI: readonly Cue[] = [
  gasCue(new RegExp("\\b" + LEAK + " (?:ra )?" + FUEL + "\\b|\\b" + FUEL + " (?:dang |bi |dang bi )?" + LEAK + "\\b", "u")),
];
const GAS_BARE_EN: readonly Cue[] = [
  gasCue(/\b(?:gas (?:leak(?:s|ing|age|ed)?|is leaking|has leaked|is escaping)|leak(?:s|ing|age)? (?:of )?gas|leaking gas)\b/u),
];
const REFRIGERANT_CONTEXT = /\b(?:may lanh|may dieu hoa|dieu hoa|dan lanh|dan nong|cuc nong|cuc lanh|inverter|may nen|ong dong|r32|r410a?|r22|r134a|r290|freon|refrigerants?|gas lanh|nap (?:them )?gas|bom (?:them )?gas|thieu gas|het gas may|air ?cond\w*|ac|hvac|compressor|condenser|evaporator|split (?:unit|ac)|heat pump)\b/u;
const KITCHEN_CONTEXT = /\b(?:bep|nha bep|phong bep|nau an|binh (?:gas|ga)|kitchen|stove|hob|cooker|cylinder|lpg|propane|butane|cooking)\b/u;
// The line between a cylinder and a stove. In the air-conditioning service the same words name the refrigerant line,
// so they say "fuel gas" only outside it.
const GAS_LINE_CONTEXT = /\b(?:day dan|ong dan|van binh|bo dieu ap|dieu ap|dau noi)\b/u;

// Generic urgency says a request is pressing, not that anyone is in danger.
const UNCERTAIN_SPECIFIC_CUES = [
  cue(/\b(?:dang gap nguy hiem|gap nguy hiem|khong ro goi ai|khong biet (?:phai |nen |can )?goi (?:ai|so nao|cho ai)|khong (?:ro|biet|chac) (?:nen |phai |can )?goi (?:so )?11[2345]|goi 11[2345] hay (?:goi )?11[2345]|khong (?:ro|biet|chac) (?:nen |phai |can )?goi so nao|khong chac day co phai tinh huong khan cap|khong biet day co phai nguy hiem khong)\b/u),
  cue(/\b(?:don t know who to call|not sure who to call|which emergency number|unsure which emergency service|not sure if this is an emergency|not sure (?:whether to |if (?:i|we) should |who to |which (?:number|service) to )call (?:the )?(?:fire (?:brigade|department|service)|police|an? ambulance|emergency|112|113|114|115|999|911))\b/u),
];
const UNCERTAIN_GENERIC_CUES = [
  cue(/\b(?:tinh huong khan cap|can ho tro khan cap)\b/u),
  cue(/\b(?:emergency help|urgent emergency)\b/u),
];

// Fire-safety equipment and training talk names the words without reporting a fire.
const PREVENTION_PHRASES =
  /\b(?:canh (?:co )?(?:chay|hoa hoan)|phong chay chua chay|chua chay|binh chua chay|binh cuu hoa|cuu hoa|pccc|(?:canh )?bao ro (?:khi )?(?:gas|ga)|dau do (?:khi )?(?:gas|ga)|cam bien (?:khi )?(?:gas|ga)|(?:kiem tra|do) ro (?:khi )?(?:gas|ga)|gas (?:detectors?|alarms?|sensors?)|(?:check|checking|test|testing|detect|detecting) (?:for )?(?:a )?gas leaks?|fire (?:drill|safety|prevention|extinguisher|exit|escape|door|rated|proof|sprinkler|code)|fire-?proof|smoke (?:detectors?|alarms?) (?:battery|install\w*|replac\w*|test\w*))\b/u;

const NEGATED_CUE_SUFFIX = /\b(?:khong|chua|chang|het|no|not|never|without|no longer|does not|do not|is not|are not|was not|were not|doesn t|don t|isn t|aren t)\b(?:\s+[\p{L}\p{N}]+){0,4}\s*$/u;
const SELF_NEGATION = /\b(?:khong phai|khong|chua|chang)\s+(?:phai\s+)?(?:la\s+)?(?:toi|minh|tui|em|chung toi|nha toi|bon toi)\b|\b(?:toi|minh|tui|em|chung toi)\s+(?:khong|chua|chang)\b|\b(?:not|never)\s+(?:me|i|us|myself)\b|\b(?:i|we)\s+(?:am not|m not|was not|wasn t|did not|didn t|have not|haven t|do not|don t)\b/u;
// Someone other than the speaker is the one affected: "not me, the person next to me", "not me but my child".
const THIRD_PARTY_REST = /\b(?:nguoi (?:ben canh|khac|nha|kia|ay|do|trong nha)|ai do|hang xom|(?:ong|ba|anh|chi|co|chu|bac|em|con|be) (?:ay|kia|do|ben canh|hang xom))(?: [a-z]+){0,2} (?:moi|cung|thi|dang) bi\b|\bma la (?:con|chong|vo|me|bo|ba|ong|anh|chi|em|nguoi|hang xom|be)\b|\b(?:con|chong|vo|me|bo) (?:toi|minh|nha toi) thi co\b/u;
const HYPOTHETICAL_BEFORE = /\b(?:neu|neu nhu|gia su|gia dinh|gia nhu|lo ma|phong khi|de phong|de tranh|if|what if|in case|suppose|supposing|should there be|to prevent|to avoid)\b/u;
const PAST_MARKER = /\b(?:sau (?:khi |vu |dam )?(?:chay|hoa hoan)|after (?:the|a) fire|aftermath|hom qua|hom truoc|bua truoc|tuan truoc|tuan roi|thang truoc|thang roi|nam ngoai|truoc day|luc truoc|hoi sang|toi qua|dem qua|hom kia|da tung|tung bi|tung co|lan truoc|lan roi|tu lau|yesterday|last (?:night|week|month|year|time)|(?:days?|weeks?|months?|years?) ago|used to|previously|a while back)\b/u;
const PRESENT_MARKER = /\b(?:dang|van (?:con|dang|boc|co|phat|toa|tuon|chay|nong|bi)|bay gio|hien tai|hien gio|ngay luc nay|luc nay|still|right now|now|currently|at the moment)\b/u;
// Words that say the smoke or fire itself has ended; "đã tắt aptomat" says only that a switch was turned off.
const RESOLVED_AFTER = /\b(?:da (?:het|dap|tan|ngung)(?: (?:roi|han|khoi|lua))?\s*(?:,|$)|da tat (?:khoi|lua|roi)|het (?:roi|khoi|lua)|khong con (?:khoi|lua|boc khoi)|ngung roi|has stopped|stopped|went out|put out|no longer|is gone|has gone|died down)/u;
const BLEED_TARGET = "radiators?|brakes?|valves?|pipes?|lines?|hydraulic|heating|refrigerant|coolant|tyres?|tires?|systems?|boiler|loop|air";
const BLEED_TARGET_AFTER = new RegExp(
  "^\\s*(?:(?:the|a|an|my|our)\\s+)?(?:" + BLEED_TARGET + ")\\b|^\\s*(?:of\\s+)?(?:air|coolant|fluid|gas)\\b",
  "u",
);
const BLEED_TARGET_BEFORE = new RegExp("\\b(?:" + BLEED_TARGET + ")\\s*$", "u");

const GUIDANCE: Record<EmergencyRoute, { vi: string; en: string }> = {
  fire: {
    vi: "Có dấu hiệu khói hoặc lửa đang diễn ra. Hãy rời khỏi khu vực; chỉ cảnh báo người xung quanh nếu an toàn. Gọi 114 và không chạm vào thiết bị hoặc ổ điện.",
    en: "There may be active smoke or fire. Leave the area, alert others only if safe, and call 114. Do not touch the equipment or outlet.",
  },
  medical: {
    vi: "Có người cần cấp cứu y tế. Gọi 115 và làm theo hướng dẫn của tổng đài. Chỉ di chuyển người đó ra xa nguy hiểm nếu việc đó an toàn.",
    en: "Someone may need emergency medical care. Call 115 and follow the operator's instructions. Move them away from danger only if it is safe.",
  },
  police: {
    vi: "Nếu đang bị đe dọa hoặc có người đột nhập, hãy tìm nơi an toàn và gọi công an 113. Không đối đầu; làm theo hướng dẫn của tổng đài.",
    en: "If someone is threatening you or breaking in, get to a safe place and call police at 113. Do not confront them; follow the operator's instructions.",
  },
  electrical_water: {
    vi: "Không chạm vào dây điện, ổ điện, thiết bị hoặc nước gần nguồn điện. Tránh xa và giữ người khác tránh xa; không tự ngắt điện nếu phải đi tới khu vực nguy hiểm. Nếu có khói hoặc lửa, gọi 114; nếu có người bị điện giật hoặc bị thương, gọi 115. Nếu nguy cơ khẩn cấp chưa rõ, gọi 112.",
    en: "Do not touch wiring, outlets, equipment, or water near electricity. Stay back and keep others away; do not approach a breaker if that is unsafe. Call 114 for smoke or fire, 115 for electric shock or injury, and 112 if the immediate emergency response is unclear.",
  },
  gas: {
    vi: "Có dấu hiệu rò rỉ gas (khí đốt). Không dùng lửa; không bật hoặc tắt công tắc, quạt hay thiết bị điện. Hãy rời khỏi khu vực, chỉ cảnh báo người xung quanh nếu an toàn, rồi gọi 114 từ nơi an toàn.",
    en: "There may be a fuel-gas leak. Do not use flames, and do not switch lights, fans or electrical devices on or off. Leave the area, alert others only if it is safe, and call 114 from a safe place.",
  },
  uncertain: {
    vi: "Nếu đang có tình huống khẩn cấp nhưng chưa rõ cần lực lượng nào, gọi 112 và mô tả ngắn gọn nguy cơ. Rời xa nguồn nguy hiểm nếu an toàn; làm theo hướng dẫn của tổng đài.",
    en: "If there is an emergency and you are unsure which service is needed, call 112 and briefly describe the danger. Move away if safe and follow the operator's instructions.",
  },
};

export function resolveEmergencyGuidance(
  text: string,
  language: "vi" | "en",
  context: EmergencyContext = {},
): EmergencyGuidance | null {
  return guidanceFor(routeOfReadings([readEmergencySignals(text, true, context)]), language);
}

// The Case-intake gate acts on a reported danger only; "urgent" alone is an ordinary priority.
export function resolveReportedEmergencyGuidance(
  text: string,
  language: "vi" | "en",
  context: EmergencyContext = {},
): EmergencyGuidance | null {
  return resolveReportedEmergencyGuidanceFromTexts([text], language, context);
}

// A request carries several customer-authored texts (a message, a transcript, a note). Each is read on its own,
// so a negation or a sentence stop in one never reaches the next, and the hazards found are then routed by the
// same rule as hazards inside one text: the order and the boundaries between fields never change the answer.
export function resolveReportedEmergencyGuidanceFromTexts(
  texts: readonly string[],
  language: "vi" | "en",
  context: EmergencyContext = {},
): EmergencyGuidance | null {
  return guidanceFor(
    routeOfReadings(texts.map((text) => readEmergencySignals(text, false, context))),
    language,
  );
}

function guidanceFor(route: EmergencyRoute | null, language: "vi" | "en"): EmergencyGuidance | null {
  return route ? { route, response: GUIDANCE[route][language] } : null;
}

// What one text reports, before any rule combines it with other texts.
type EmergencyReading = {
  readonly routes: readonly EmergencyRoute[];
  readonly unclear: boolean;
  readonly genericUrgency: boolean;
};

function readEmergencySignals(
  text: string,
  includeGenericUrgency: boolean,
  context: EmergencyContext,
): EmergencyReading {
  const signal = blankMatches(buildSignalText(text), PREVENTION_PHRASES);
  const segments = segmentRanges(signal.plain);
  const sentences = sentenceRanges(signal.plain);
  const affirmed = (cues: readonly Cue[]) =>
    cues.some((candidate) => hasAffirmedCue(signal, segments, sentences, candidate));

  const routes: EmergencyRoute[] = (Object.keys(EMERGENCY_CUES) as CueRoute[])
    .filter((route) => affirmed(EMERGENCY_CUES[route]));
  const gas = classifyGasLeak(signal, segments, sentences, context.serviceType ?? null);
  if (gas === "gas") routes.push("gas");
  return {
    routes,
    unclear: gas === "uncertain" || affirmed(UNCERTAIN_SPECIFIC_CUES),
    genericUrgency: includeGenericUrgency && affirmed(UNCERTAIN_GENERIC_CUES),
  };
}

function routeOfReadings(readings: readonly EmergencyReading[]): EmergencyRoute | null {
  const routes = [...new Set(readings.flatMap((reading) => reading.routes))];
  // Smoke with sparking or live wiring is one electrical hazard whose guidance already names 114, 115 and 112.
  // Fuel gas with smoke, fire or sparking keeps the gas guidance, which already names 114 and forbids ignition.
  if (routes.length > 1) {
    const fireOrWiring = (route: EmergencyRoute) => route === "fire" || route === "electrical_water";
    if (routes.includes("gas")) {
      return routes.every((route) => route === "gas" || fireOrWiring(route)) ? "gas" : "uncertain";
    }
    return routes.every(fireOrWiring) ? "electrical_water" : "uncertain";
  }
  if (routes.length === 1) return routes[0] ?? null;
  if (readings.some((reading) => reading.unclear || reading.genericUrgency)) return "uncertain";
  return null;
}

// A fuel-gas object or smell is an emergency; a bare leak is refrigerant unless the kitchen, the English
// wording or the service says otherwise, and is asked about (112) only when nothing says which gas it is.
function classifyGasLeak(
  signal: SignalText,
  segments: readonly Segment[],
  sentences: readonly Segment[],
  serviceType: string | null,
): "gas" | "uncertain" | null {
  const hit = (cues: readonly Cue[], accept?: (index: number, end: number) => boolean) =>
    cues.some((candidate) => hasAffirmedCue(signal, segments, sentences, candidate, accept));
  const clause = (index: number) => {
    const segment = segmentAt(segments, index);
    return signal.plain.slice(segment.start, segment.end);
  };
  const near = (index: number, end: number) => {
    const segment = segmentAt(segments, index);
    return signal.plain.slice(Math.max(segment.start, index - 30), Math.min(segment.end, end + 30));
  };
  const refrigerant = (index: number) => REFRIGERANT_CONTEXT.test(clause(index));
  const kitchen = (index: number) => KITCHEN_CONTEXT.test(clause(index));
  const hvac = serviceType === "hvac";
  // "Ống gas máy lạnh" is the refrigerant line of an air conditioner. A refrigerant word inside the object phrase
  // makes it one, and so does a bare pipe, hose or valve in the air-conditioning service; a refrigerant word merely
  // nearby ("a gas cylinder beside the air conditioner is leaking") does not hide a fuel-gas object.
  const fuelObject = (index: number, end: number) => {
    const phrase = signal.plain.slice(index, end);
    // The object phrase is the object, the gas word and up to two words after it; what lies between that and the
    // leak word is free text and says nothing about which gas the object holds.
    const words = phrase.split(" ");
    const gasWord = words.findIndex((word) => word === "gas" || word === "ga");
    if (REFRIGERANT_CONTEXT.test(gasWord < 0 ? phrase : words.slice(0, gasWord + 3).join(" "))) return false;
    return !(
      hvac && /^(?:ong|day|van|dau noi|duong ong|bo dieu ap|dieu ap|gas (?:pipe|pipeline|hose|line|valve|regulator))\b/u.test(phrase) &&
      !kitchen(index)
    );
  };
  if (hit(GAS_OBJECT_CUES, fuelObject)) return "gas";
  if (hit(GAS_SMELL_CUES, (index, end) => !REFRIGERANT_CONTEXT.test(near(index, end)))) return "gas";
  // In the air-conditioning service a smell named beside refrigerant words, with nothing from a kitchen in the
  // sentence, is the refrigerant the customer is asking about, not an unclear fuel-gas report.
  if (hit(GAS_SMELL_CUES)) {
    const kitchenSmell = hit(GAS_SMELL_CUES, (index) => kitchen(index));
    return hvac && !kitchenSmell ? null : "uncertain";
  }
  const gasLine = (index: number) => !hvac && GAS_LINE_CONTEXT.test(clause(index));
  if (hit(GAS_BARE_VI, (index) => !refrigerant(index) && (kitchen(index) || gasLine(index)))) return "gas";
  if (hit(GAS_BARE_EN, (index) => !refrigerant(index) && (kitchen(index) || !hvac))) return "gas";
  if (!hvac && hit(GAS_BARE_VI, (index) => !refrigerant(index))) return "uncertain";
  return null;
}

// A negation word whose plain spelling is also another word: "nổ" (explodes) reads as the English "no", "hét"
// (shouts) as "hết" (no more), "chữa" (to cure) as "chưa" (not yet). Only the accented twin can tell them apart, so
// a plain word counts as a negation when the accented twin spells it unmarked or with its own marks.
const NEGATION_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  no: ["no"],
  het: ["het", "h\u1ebft"],
  chua: ["chua", "ch\u01b0a"],
  khong: ["khong", "kh\u00f4ng"],
  chang: ["chang", "ch\u1eb3ng"],
};

function negationText(plainPrefix: string, accentedPrefix: string): string {
  const accentedWords = accentedPrefix.split(" ");
  return plainPrefix.split(" ")
    .map((word, index) => {
      const spellings = Object.hasOwn(NEGATION_SPELLINGS, word) ? NEGATION_SPELLINGS[word] : undefined;
      return spellings && !spellings.includes(accentedWords[index] ?? "") ? "_" : word;
    })
    .join(" ");
}

// Bleeding a radiator, brake line or valve is maintenance; a person bleeding is a medical emergency.
function isBleedingATarget(plain: string, start: number, end: number): boolean {
  return BLEED_TARGET_AFTER.test(plain.slice(end, end + 40)) ||
    BLEED_TARGET_BEFORE.test(plain.slice(Math.max(0, start - 28), start));
}

function hasAffirmedCue(
  signal: SignalText,
  segments: readonly Segment[],
  sentences: readonly Segment[],
  candidate: Cue,
  accept?: (index: number, end: number) => boolean,
): boolean {
  for (const match of signal.plain.matchAll(new RegExp(candidate.pattern.source, "gu"))) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (!tonesAgree(match[0], signal.accented.slice(index, end), candidate.tone ?? "tolerant", candidate.toneRules)) continue;
    const segment = segmentAt(segments, index);
    const segmentText = signal.plain.slice(segment.start, segment.end);
    const prefix = signal.plain.slice(segment.start, index);
    // A condition ends at its comma: "if that fails, the house is on fire" still reports a fire.
    if (HYPOTHETICAL_BEFORE.test(prefix.slice(prefix.lastIndexOf(",") + 1))) continue;
    if (PAST_MARKER.test(segmentText) && !PRESENT_MARKER.test(segmentText)) continue;
    if (RESOLVED_AFTER.test(signal.plain.slice(end, segmentAt(sentences, index).end))) continue;
    if (insideNamedQuote(signal.plain, index)) continue;
    if (candidate.unless?.test(segmentText)) continue;
    if (candidate.technicalBleeding && isBleedingATarget(signal.plain, index, end)) continue;
    if (accept && !accept(index, end)) continue;
    if (!NEGATED_CUE_SUFFIX.test(negationText(prefix, signal.accented.slice(segment.start, index)))) return true;
    if (SELF_NEGATION.test(prefix) && THIRD_PARTY_REST.test(signal.plain.slice(end, segmentAt(sentences, index).end))) {
      return true;
    }
  }
  return false;
}
