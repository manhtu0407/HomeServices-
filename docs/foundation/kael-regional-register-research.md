# Kael Regional Register Research — Nhận diện vùng miền VN từ chat text

Status: RESEARCH (design input cho `Plan.md` §39 KC2). CHƯA build. 4 sub-decision (OQ-1a–1d) còn mở chờ Tu.
Date: 2026-07-06.
Plan ref: `Plan.md` §39 — KC2 (Regional Register & Xưng hô).
Author role: Principal Conversation & Agent-Persona Architect.

## Scope

Nghiên cứu feasibility + phương pháp để Kael nhận diện vùng miền (Bắc / Trung / Nam) của user **từ văn bản chat** (và voice → STT transcript), rồi thích ứng register/từ vựng một cách **an toàn, không stereotype**. Đây là input thiết kế cho KC2, chưa phải build-spec. Kết quả mong muốn (Tu 2026-07-06): *trong quá trình giao tiếp, Kael có thể đoán, hoặc khi có bằng chứng thì nhận ra được* vùng miền.

## 0. Channel reality — Kael đọc TEXT, không phải audio

Kael thấy chat text; tính năng voice (plan §36) chạy STT ra transcript. Nên bài toán là **dialect detection từ văn bản**, không phải từ tín hiệu âm thanh. Điều này quyết định feasibility bên dưới: kết quả dialect-ID trên audio **không** chuyển thẳng sang text.

## 1. Feasibility — evidence-grounded (không tô hồng)

- Benchmark mạnh nhất hiện có — **ViMD (Multi-Dialect Vietnamese, EMNLP 2024)** — làm dialect-ID **chỉ trên audio**: ~**91% F1** cho phân loại 3 miền (Bắc ~95%, Nam ~91%, Trung ~88%). Nhưng đó là **audio**, không dùng được cho kênh text của Kael.
- Corpus text thật — **ViDia2Std** (comment người dùng 63 tỉnh) — xác nhận phân biệt được trong văn bản qua **lexical + chính tả + cú pháp**, và dùng **"region-specific keyword lists"** để lọc nội dung giàu phương ngữ → cách tiếp cận bằng **lexicon/từ khóa là khả thi và có hệ thống**.
- Cảnh báo từ chính ViDia2Std: **text ngắn thường KHÔNG đủ marker**; heterogeneity trong nội miền cao (đặc biệt miền Trung); nhiễu (emoji/URL/viết tắt); detection tự động từ đoạn ngắn "vẫn là thách thức"; annotation cần người bản xứ từng vùng.

**Verdict:** mục tiêu thực tế cho Kael = **high-precision, low-recall**. Đa số tin nhắn đầu → "chưa rõ" → giữ trung tính; chỉ khi có marker rõ mới "nhận ra" và thích ứng. Đúng bằng ý Tu: *đoán, hoặc có bằng chứng thì nhận ra*. Không ép nhận đúng ngay câu đầu (ép = đoán bừa = stereotype).

## 2. Marker taxonomy — data asset lõi (3 tầng theo độ chắc chắn)

**Tầng A — marker mạnh, gần như quyết định (chủ yếu Trung / Bắc-Trung):**
`mô` (đâu), `tê` (kia), `răng` (sao), `rứa` (thế/vậy), `chi` (gì), `ni` (này), `nớ` (ấy), `ri` (thế này), `nỏ` (không), `hè/hầy` (nhỉ), `mần` (làm). → xuất hiện 1 từ = confidence cao là **Trung**.

**Tầng B — lexical, độ tin trung bình:**

| Khái niệm | Bắc | Trung | Nam |
|---|---|---|---|
| bố/mẹ | bố, mẹ | ba, mạ (bọ/mạ) | ba, má (tía) |
| bát ăn | bát | đọi | chén |
| thìa | thìa | | muỗng |
| ngô | ngô | | bắp |
| dứa | dứa | | thơm / khóm |
| lợn | lợn | heo | heo |
| rẽ (hướng) | rẽ | | quẹo |
| vâng (dạ) | vâng | dạ | dạ |
| không | không | nỏ | hông / hổng |

**Tầng C — tín hiệu yếu (tiểu từ + chính tả phát âm rớt vào text):**
- Bắc: `nhé, nhá, à, đấy, cơ, thế, ạ`
- Nam: `nha, nghen/nghe, nè, hén, á`; chính tả `v→d/gi` (dzô, dzui), `quá→wá`, `hông/hok`
- Trung: `hè, rứa hè`

**Caveat thật:** truyền thông làm phẳng ngôn ngữ → nhiều từ Tầng B/C nay **liên vùng**, chỉ mang tính xác suất. Vì sản phẩm ở **chung cư HCMC**, phần lớn khách dùng lexis Nam hoặc trung tính → Tầng A (Trung) là tín hiệu đáng tin nhất; Bắc/Nam phải cộng dồn nhiều marker.

## 3. Detection model — progressive, evidence-gated ("đoán → nhận ra")

Tái dùng triết lý **EvidenceGate** đã có trong repo (MIN_EVIDENCE + confidence threshold):
- **State:** `region ∈ {unknown, bac, trung, nam}` + `confidence` (0–1), tích lũy **qua cả cuộc trò chuyện** (không phán từ 1 câu).
- **Scoring có trọng số:** Tầng A ≫ B ≫ C. Marker xung đột → hạ confidence.
- **Hai ngưỡng:** *Guess* (thấp) → thích ứng nhẹ, sai không tốn kém; *Recognize* (cao) → chỉ "nhận ra" khi ≥1 marker Tầng A **hoặc** ≥N marker Tầng B nhất quán, không marker mạnh mâu thuẫn.
- **Default khi unknown:** tiếng Việt chuẩn, lịch sự, hơi nghiêng Nam (HCMC); tránh slang vùng mạnh tới khi có bằng chứng.
- **Bộ máy = lexicon/rule có trọng số (deterministic, auditable), KHÔNG để LLM tự đoán vùng** (LLM đoán bừa = nguồn stereotype + hallucination). LLM chỉ dùng sau khi lexicon đã có bằng chứng.

## 4. Application — "mirror-lite", tuyệt đối không nhại giọng

- **Nên:** khớp nhẹ lựa chọn từ của chính khách (khách nói "chén" → Kael "chén"; "bố mẹ" → "bố mẹ"), tiểu từ ấm (nha/nhé).
- **KHÔNG:** nhại nguyên giọng vùng (Kael phang lại "mô tê răng rứa" = nhại lố, trịch thượng); không đổi bản sắc; không giảm độ rõ. Luôn giữ chuẩn ai cũng hiểu.
- Chiến lược an toàn nhất = **để cách dùng từ của khách dẫn dắt**, Kael soi gương nhẹ — không "diễn vai người vùng đó".

## 5. Safety — chống stereotype + PII (RULES #9, #8)

- Vùng miền là **gợi ý register tạm thời**, KHÔNG phải thuộc tính danh tính lưu cứng. Ưu tiên suy theo cuộc trò chuyện, không dán nhãn "khách này người Bắc".
- **Không bao giờ nói ra** ("Bạn người miền Trung à?"). Sai particle thì rẻ; nói sai gốc gác thì đắt. Không suy dân tộc/giai tầng. Không log suy luận vùng kèm PII.
- Fail an toàn: unknown → trung tính; marker mâu thuẫn → trung tính.

## 6. Build prerequisites (Tu: "setup rất kĩ trước khi build")

1. **Regional lexicon asset** (kiểu `forbidden-language.json`): bảng Tầng A/B/C có trọng số, versioned, mở rộng được — deliverable lõi của KC2.
2. **Scoring + 2 ngưỡng** (tái dùng EvidenceGate).
3. **Application rules** (mirror-lite) + neutral default.
4. **Test set:** golden line mỗi vùng + case markerless→trung tính + case xung đột→trung tính + assertion "không nhại lố".

## 7. Resolved decisions (Tu 2026-07-06)

- **OQ-1a → per-conversation, KHÔNG hardcode/lưu cứng.** Region suy theo từng cuộc trò chuyện, không dán nhãn nhân khẩu. Dữ liệu tương tác (đã sanitize) CÓ THỂ dùng như **training corpus** để Kael nhận diện + tiếp thu cách giao tiếp vùng miền tốt hơn (passive learning, PII-scrubbed, opt-in) — xem §8.
- **OQ-1b → mirror-lite.** Khớp nhẹ, không nhại giọng.
- **OQ-1d → cả 3 miền, focus miền Nam trước.** Lexicon phủ Bắc/Trung/Nam nhưng tune + verify Nam trước (HCMC), rồi mở rộng.
- **OQ-1c → xem §8** (Tu mở rộng scope: build một phần tính năng voice + lưu transcript vào Supabase).

## 8. Voice → Transcript → Store (OQ-1c, Tu mở rộng 2026-07-06)

**Bối cảnh:** UI voice đã có (chỉ ở "Kael Agentic Chatbot"), nhưng **tính năng chưa build** và transcript chưa kĩ. Plan voice canonical = `Plan.md` §36 (SPIKE-GATED, chưa execute): **D1 STT = on-device, audio KHÔNG rời máy** (RULES #9). Tu muốn (mới): (a) build **một phần** tính năng voice (phần "mã hóa voices" = STT → text); (b) lưu transcript (voice đã mã hóa thành text) vào **Supabase**.

**Finding 1 — transcript từ voice YẾU hơn typed text cho region detection.** STT nền tảng on-device (Apple Speech / Android SpeechRecognizer) có xu hướng **chuẩn hóa về tiếng Việt chuẩn** → nhiều marker vùng (đặc biệt Tầng B/C) bị san phẳng. ASR VN chuyên biệt (PhoWhisper, Soniox) giữ dialect tốt hơn nhưng là **cloud → upload audio → nghịch §36 D1**. Vì §36 khóa on-device → **typed text vẫn là tín hiệu region chính; voice transcript chỉ là bonus, có thể mất marker.** Nói thẳng: đừng kỳ vọng region-from-voice mạnh.

**Finding 2 — lưu transcript KHÔNG nghịch §36, nhưng đổi posture privacy.** §36 cấm upload **audio**; transcript (text) vốn đã phải lên server để tới Kael → lưu transcript ≠ vi phạm §36. NHƯNG transcript có thể chứa PII (SĐT/địa chỉ) → **phải scrub trước khi lưu** (RULES #9) + RLS + retention. Đây là **thay đổi posture** so với §36 "nothing uploaded" → Tu phải chủ động sở hữu quyết định. (Muốn lưu cả **audio** → đảo D1 §36, quyết định privacy lớn hơn — xác nhận riêng.)

**Finding 3 — Storage vs table.** Transcript = text → tự nhiên là **DB table** (queryable, RLS per-user). **Supabase Storage bucket** hợp khi lưu file/blob (audio, hoặc transcript-file corpus). Khuyến nghị: table cho transcript vận hành + (tùy chọn) bucket/corpus cho training data đã sanitize.

**Design đề xuất:**
- STT on-device (theo §36) → transcript text → composer → Edge (như hiện tại) → Kael.
- Thêm: Edge **scrub PII** transcript → lưu **DB table** (per-conversation, RLS) cho vận hành + region inference.
- (Opt-in) sanitized transcript → **training corpus** (bucket hoặc table riêng) cải thiện regional-lexicon — tái dùng gate learning đã có (post_job_learning, EvidenceGate), aggregate/PII-safe.
- Region-from-voice chỉ ở Kael Agentic Chatbot (nơi voice tồn tại).

**Resolved (Tu 2026-07-06, đợt 3):**
- **OQ-2a → DB table.** Supabase = Postgres → table qua migration (RLS per-user). KHÔNG dùng Storage bucket cho transcript text.
- **OQ-2b → scrub tiêu chuẩn + Loop Learning.** Scrub PII chuẩn (SĐT/địa chỉ) như discipline hiện có; corpus sanitized nuôi **loop-learning** — Kael học dần qua nhiều cuộc tương tác, tái dùng infra learning sẵn có (post_job_learning/EvidenceGate). Loop chỉ **đề xuất candidate** cải thiện lexicon (như CaseReview), KHÔNG tự mutate charter (tunable add-only qua review).
- **OQ-2c → on-device, ZERO cost.** Giữ Apple/Android native STT (miễn phí, private). Cloud API (Soniox…) trả tiền/lần; PhoWhisper free nhưng cần self-host GPU → nghịch "thuần app no-deploy" + tốn infra. → chọn on-device; chấp nhận region-from-voice yếu, bù bằng typed-text (chính) + loop-learning.

## References

- ViMD — Multi-Dialect Vietnamese: Task, Dataset, Baseline Models and Challenges (EMNLP 2024). https://aclanthology.org/2024.emnlp-main.426/ · https://arxiv.org/html/2410.03458v1
- ViDia2Std — A Parallel Corpus and Methods for Low-Resource Vietnamese Dialect-to-Standard Translation. https://arxiv.org/html/2603.10211
- Transparent Language — Vietnamese Language Variations. https://blogs.transparent.com/vietnamese/vietnamese-language-variations/
- Từ ngữ địa phương Bắc-Trung-Nam. https://rdsic.edu.vn/blog/blog-2/tu-ngu-dia-phuong-mien-bac-trung-nam-vi-cb.html
- Mô tê răng rứa (giải nghĩa từ ngữ miền Trung). https://yody.vn/post/rua-la-gi
- PhoWhisper — Vietnamese ASR (VN-trained, đa accent/dialect). Soniox Vietnamese STT (dialect/accent). https://soniox.com/speech-to-text/vietnamese
- expo-speech-recognition (jamsch) + expo-speech-transcriber (Apple Speech / Android SpeechRecognizer, on-device offline). https://github.com/jamsch/expo-speech-recognition · https://github.com/DaveyEke/expo-speech-transcriber
