# Kael Knowledge Corpus Draft — Plan §31 B3

Status: `approved`
Date: 2026-06-04
Scope: electrical repair, plumbing repair, home cleaning, legal/safety boundaries for HCMC apartments.

This file is the B3 approved corpus package. Tu approved the safety/legal rows in the 2026-06-04 Codex thread; generate the idempotent migration from this document, then review the SQL before applying. The rows are written as runtime guidance candidates for:

- `worker_safety_patterns`
- `legal_awareness_patterns`
- `service_knowledge_boxes` service-level problem hints in `safe_metadata.problem_hints`

Research method: Codex web research with source URLs, manual source-trust proposal, and B3 live source audit through Perplexity Sonar plus direct official-URL fallback. Tu approved the corpus rows on 2026-06-04.

Live audit artifact: `docs/foundation/source-trust-samples/kael-b3-source-audit-1780579373188.json` (`source_count=8`, `on_domain_sources=7`, `failed_sources=0`). S3 was changed from a direct Ministry PDF/page URL to the VSQI QCVN 07 catalog URL because the Ministry URL was searchable but returned unstable direct HTTP/TLS results in local verification.

## Migration Gate

Do not create or apply a migration while any candidate row remains unapproved.

Pre-B3 migrations may already contain a small seed subset from Plan P5. That existing seed is not B3 corpus approval. A B3 seed migration must include explicit signed metadata, including `corpus_version`, `source_refs`, `source_trust_score`, and `signoff_status='approved'`; it must not carry `approved` into SQL.

## Source Set

| Ref | Source | Trust proposal | Evidence used |
| --- | --- | ---: | --- |
| S1 | VSQI, `TCVN 7447-4-41:2010` page | 1.00 official standards catalog | The standard is active and covers low-voltage electrical installations and protection against electric shock. |
| S2 | Cong Bao/Chinhphu.vn, `15/2023/TT-BXD` | 1.00 official legal gazette | The circular was issued by Ministry of Construction and took effect on 2024-07-01 for QCVN 07:2023/BXD. |
| S3 | VSQI construction standards catalog, `QCVN 07:2023/BXD` | 1.00 official standards catalog | QCVN 07:2023/BXD is the active national technical regulation for technical infrastructure systems; S2 records its legal issuance and effective date. |
| S4 | CDC, Cleaning and Disinfecting with Bleach | 0.95 public-health authority | Do not mix bleach/disinfectants with other cleaners; ventilate; clean dirty surfaces first; use PPE as label directs. |
| S5 | US EPA, Biological Contaminants and Indoor Air Quality | 0.95 public-health/environment authority | Ventilation and source control reduce indoor biological pollutants; cleaning products should not be mixed. |
| S6 | VBPL, Law 19/2023/QH15 on consumer protection | 1.00 official legal database mirror | Businesses must ensure safety/quality and warn about unsafe goods/services; consumer information must be protected. |
| S7 | Chinhphu.vn HCMC emergency hotline article | 0.95 official government portal | In emergencies in HCMC, residents can call 113, 114, or 115 and be routed to the appropriate authority. |
| S8 | EVNHCMC electrical safety article | 0.90 local utility | Household electrical equipment should be inspected/maintained and replaced when damaged; unplug heat-generating devices when not in use. |

Source URLs:

- S1: https://tieuchuan.vsqi.gov.vn/tieuchuan/view?sohieu=TCVN+7447-4-41%3A2010
- S2: https://congbao.chinhphu.vn/van-ban/thong-tu-so-15-2023-tt-bxd-41111.htm
- S3: https://tieuchuanxaydung.vsqi.gov.vn/quychuan/view?sohieu=QCVN+07%3A2023%2FBXD
- S4: https://www.cdc.gov/hygiene/about/cleaning-and-disinfecting-with-bleach.html
- S5: https://www.epa.gov/indoor-air-quality-iaq/biological-contaminants-and-indoor-air-quality
- S6: https://vbpl.vn/botaichinh/Pages/vbpq-toanvan.aspx?ItemID=161263
- S7: https://tphcm.chinhphu.vn/tphcm-nang-cap-he-thong-ba-tong-dai-khan-cap-113-114-115-10120674.htm
- S8: https://evnhcmc.vn/Tintuc/chitiet/5

## Candidate `worker_safety_patterns`

Tu has signed off these rows. The seed migration must keep `is_enabled=true` and include `safe_metadata` keys: `source_refs`, `source_trust_score`, `signoff_status`, `corpus_version`.

| Sign-off | pattern_key | service_type | trigger_topic | severity | response_guidance | refs |
| --- | --- | --- | --- | --- | --- | --- |
| approved | electrical_lockout_before_repair | electrical | worker_safety_advisory | urgent | Nhắc thợ ngắt nguồn điện khu vực liên quan, kiểm tra khô ráo và không thao tác nếu còn mùi khét, tia lửa hoặc dấu hiệu rò điện. | S1, S8 |
| approved | electrical_spark_or_burning_stop | electrical | worker_safety_advisory | urgent | Nếu thấy tia lửa, cháy, khói hoặc mùi khét mạnh, dừng thao tác, giữ khoảng cách an toàn và hướng người dùng gọi 114/113/115 khi có nguy cơ khẩn cấp. | S1, S7, S8 |
| approved | electrical_water_near_outlet_stop | electrical | worker_safety_advisory | urgent | Khi có nước gần ổ cắm, thiết bị điện hoặc tủ điện, không chạm tay trực tiếp; chỉ ngắt nguồn nếu có thể làm an toàn và chờ thợ kiểm tra trực tiếp. | S1, S7 |
| approved | electrical_overloaded_socket_warning | electrical | worker_safety_advisory | warning | Nếu ổ cắm, phích cắm hoặc dây dẫn nóng bất thường, đổi màu hoặc bong vỏ, yêu cầu dừng sử dụng thiết bị và không cắm thêm tải. | S1, S8 |
| approved | electrical_repeated_breaker_trip | electrical | worker_safety_advisory | warning | Nếu cầu dao hoặc RCD nhảy lặp lại, không bật lại nhiều lần; ghi nhận thiết bị liên quan và kiểm tra nguyên nhân quá tải, chạm chập hoặc rò điện. | S1 |
| approved | electrical_photo_after_safe_isolation | electrical | worker_safety_advisory | advisory | Chỉ chụp ảnh bằng chứng khi đã đứng ở vị trí an toàn; không tháo sâu ổ cắm, hộp nối hoặc tủ điện nếu chưa cô lập nguồn. | S1 |
| approved | electrical_worker_ppe_dry_tools | electrical | worker_safety_advisory | warning | Nhắc thợ dùng dụng cụ khô, thao tác trên nền khô và xác nhận nguồn đã cô lập trước khi kiểm tra phần dẫn điện. | S1 |
| approved | electrical_common_area_boundary | electrical | worker_safety_advisory | advisory | Với tủ điện tầng, hành lang hoặc phần điện thuộc khu vực chung, hướng khách liên hệ ban quản lý; thợ không tự ý can thiệp ngoài phạm vi căn hộ. | S1 |
| approved | plumbing_shutoff_before_repair | plumbing | worker_safety_advisory | warning | Nhắc thợ khóa van nước khu vực liên quan, đặt khăn hoặc khay hứng và xác nhận dòng nước đã giảm trước khi tháo nối. | S3 |
| approved | plumbing_leak_near_electric_risk | plumbing | worker_safety_advisory | urgent | Nếu nước rò gần ổ cắm, thiết bị điện hoặc dây điện, ưu tiên cách ly khu vực và phối hợp xử lý điện an toàn trước khi sửa nước. | S1, S3, S7 |
| approved | plumbing_dirty_water_contact | plumbing | worker_safety_advisory | warning | Khi có nước bẩn, nước thải hoặc mùi hôi mạnh, dùng găng tay, hạn chế tiếp xúc trực tiếp và vệ sinh khu vực sau xử lý. | S3 |
| approved | plumbing_floor_protection_evidence | plumbing | worker_safety_advisory | advisory | Trước khi đổi phạm vi do thấm sàn, rò tường hoặc phát sinh tháo mở, chụp ảnh bằng chứng và mô tả vị trí rò một cách ngắn gọn. | S3 |
| approved | plumbing_wall_chase_scope_change | plumbing | worker_safety_advisory | warning | Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi scope-change kèm lý do và ảnh; không làm trước khi Kael quyết định. | S3 |
| approved | plumbing_shared_riser_boundary | plumbing | worker_safety_advisory | advisory | Với ống đứng, van tổng hoặc phần cấp thoát nước chung của tòa nhà, hướng khách phối hợp ban quản lý trước khi thợ can thiệp. | S3 |
| approved | plumbing_post_repair_leak_test | plumbing | worker_safety_advisory | advisory | Sau khi thay nối hoặc siết khớp, kiểm tra rò nước tại điểm sửa và báo rõ nếu nghi ngờ ống âm tường cần theo dõi thêm. | S3 |
| approved | plumbing_no_hidden_pipe_guarantee | plumbing | worker_safety_advisory | advisory | Không cam kết chắc chắn về ống âm tường hoặc đoạn khuất nếu chưa mở kiểm tra; trình bày phần chưa quan sát được là giới hạn bằng chứng. | S3 |
| approved | cleaning_do_not_mix_chemicals | cleaning | worker_safety_advisory | urgent | Không trộn thuốc tẩy, chất khử khuẩn hoặc hóa chất lau dọn với sản phẩm khác; nếu đã trộn và có mùi hắc, rời khỏi khu vực và thông gió. | S4, S5 |
| approved | cleaning_bleach_ventilation | cleaning | worker_safety_advisory | warning | Khi dùng thuốc tẩy hoặc chất khử khuẩn trong nhà, mở cửa hoặc tăng thông gió để giảm hơi hóa chất trong căn hộ. | S4, S5 |
| approved | cleaning_ppe_for_disinfectants | cleaning | worker_safety_advisory | warning | Đọc nhãn sản phẩm và dùng găng tay hoặc kính bảo vệ nếu nhãn yêu cầu; tránh để hóa chất bắn vào mắt hoặc da. | S4 |
| approved | cleaning_clean_before_disinfect | cleaning | worker_safety_advisory | advisory | Làm sạch bụi bẩn bằng nước/xà phòng trước khi khử khuẩn; không xem khử khuẩn là thay thế hoàn toàn cho bước làm sạch. | S4 |
| approved | cleaning_sensitive_surface_check | cleaning | worker_safety_advisory | advisory | Kiểm tra nhãn và thử ở vùng nhỏ với bề mặt nhạy cảm trước khi dùng hóa chất mạnh để tránh bạc màu hoặc hư hại. | S5 |
| approved | cleaning_mold_respiratory_caution | cleaning | worker_safety_advisory | warning | Nếu có nấm mốc nhiều hoặc người trong nhà có vấn đề hô hấp, hạn chế khuấy bụi/mốc và khuyến nghị xử lý chuyên nghiệp khi vượt phạm vi dọn thường. | S5 |
| approved | cleaning_children_pets_away | cleaning | worker_safety_advisory | warning | Giữ trẻ nhỏ, thú cưng và đồ ăn tránh xa khu vực đang dùng hóa chất cho tới khi bề mặt khô và thông gió đủ. | S4, S5 |
| approved | cleaning_daily_bleach_solution | cleaning | worker_safety_advisory | advisory | Nếu pha dung dịch thuốc tẩy theo nhãn, không lưu dung dịch quá lâu; ưu tiên pha mới theo hướng dẫn sản phẩm. | S4 |

## Candidate `legal_awareness_patterns`

| Sign-off | pattern_key | topic | boundary_type | response_guidance | refs |
| --- | --- | --- | --- | --- | --- |
| approved | professional_legal_advice_redirect | legal_advice | redirect_required | Câu hỏi này cần tư vấn pháp lý chuyên môn. Kael có thể giải thích quy trình an toàn trong app nhưng không tư vấn pháp lý, không kết luận trách nhiệm và không thay luật sư. | S6 |
| approved | emergency_services_redirect | emergency_response | emergency_redirect | Nếu có nguy cơ tức thời về cháy nổ, điện giật, thương tích hoặc đe dọa an toàn, hãy gọi 113, 114 hoặc 115 tại TP.HCM trước khi tiếp tục trong app. | S7 |
| approved | deposit_refund_awareness | deposit_refund_dispute | awareness_only | Kael chỉ giải thích trạng thái giao dịch và bằng chứng trong app; Kael không kết luận nghĩa vụ hoàn tiền, bồi thường hoặc trách nhiệm pháp lý của các bên. | S6 |
| approved | consumer_complaint_awareness | consumer_complaint | awareness_only | Nếu người dùng muốn khiếu nại quyền lợi người tiêu dùng, Kael có thể hướng dẫn lưu bằng chứng và liên hệ kênh hỗ trợ/chức năng phù hợp, không soạn tư vấn pháp lý. | S6 |
| approved | consumer_data_privacy_awareness | privacy_and_pii | awareness_only | Không yêu cầu người dùng gửi giấy tờ định danh, thông tin tài khoản, mật khẩu, mã xác thực hoặc địa chỉ chi tiết vào nội dung hỏi AI; dữ liệu cá nhân phải được bảo vệ trong app. | S6 |
| approved | worker_liability_no_conclusion | worker_liability_dispute | awareness_only | Khi có tranh chấp với thợ, Kael chỉ tổng hợp bằng chứng và quy trình xử lý; không kết luận lỗi, gian dối hoặc trách nhiệm pháp lý nếu chưa có quyết định hợp lệ. | S6 |
| approved | unsafe_service_warning_awareness | unsafe_service_warning | awareness_only | Kael có thể cảnh báo rủi ro an toàn và đề nghị dừng thao tác nguy hiểm; cảnh báo này không phải kết luận pháp lý về sản phẩm, dịch vụ hoặc cá nhân. | S6, S7 |
| approved | external_contract_boundary | external_contract | awareness_only | Kael không xác nhận, diễn giải hoặc thực thi thỏa thuận ngoài app; nếu có thỏa thuận riêng, người dùng cần tự lưu bằng chứng và tìm tư vấn phù hợp. | S6 |

## Candidate `service_knowledge_boxes` / Problem Hints

Current table is service-level (`service_type` unique), so B3.4 stores problem-level diagnosis hints inside `service_knowledge_boxes.safe_metadata.problem_hints` instead of creating one row per problem. This keeps the migration non-breaking while making runtime retrieval read service/problem hints from the existing knowledge box.

- Keep `service_knowledge_boxes.safe_metadata.problem_hint_version = "b3-draft-2026-06-04"`.
- Store `primary_refs`, `safety_focus`, and compact `problem_hints` per supported service.
- B4/B5 may later promote LS5/LS6 candidates into the same metadata shape or split into a dedicated table if the corpus grows.

| Sign-off | service_type | safe_metadata draft |
| --- | --- | --- |
| approved | electrical | `{"primary_refs":["S1","S8"],"safety_focus":["electric_shock","thermal_damage","overload","common_area_boundary"],"problem_hints":{"power_outage_one_room":"Check localized outage symptoms, avoid repeated breaker resets, and isolate the affected circuit before inspection.","power_outage_whole_unit":"Treat whole-unit power loss as higher risk; confirm building or common-area boundary before worker intervention.","outlet_or_switch_broken":"Warn about heat, discoloration, water exposure, and stop use before repair.","breaker_trip":"Do not repeatedly reset; inspect overload, short-circuit, or leakage causes.","flickering_light":"Check loose connection or overload signs; escalate on burning smell, sparks, or shock risk.","install_device":"Confirm load, dry mounting, and apartment-only circuit scope before installation.","other_electrical":"Ask for safe symptom details and stop if shock, smoke, fire, or common-area risk appears."}}` |
| approved | plumbing | `{"primary_refs":["S3"],"safety_focus":["water_shutoff","wastewater_contact","shared_riser_boundary","hidden_pipe_uncertainty"],"problem_hints":{"pipe_leak":"Prioritize shutoff, visible leak evidence, and electrical proximity risk before repair.","clogged_drain_or_sink":"Check wastewater contact and avoid chemical escalation when blockage source is unknown.","toilet_flush_issue":"Confirm water shutoff and sanitary handling; flag overflow or wastewater exposure.","faucet_broken":"Stabilize local shutoff and check fixture scope before replacing parts.","weak_water_pressure":"Separate apartment fixture issue from shared riser or building system boundary.","install_or_replace_fixture":"Confirm fixture compatibility and stop for scope-change if wall/floor opening is needed.","other_plumbing":"Ask for leak location, wastewater exposure, and shared-pipe boundary before estimating."}}` |
| approved | cleaning | `{"primary_refs":["S4","S5"],"safety_focus":["chemical_mixing","ventilation","ppe","surface_compatibility"],"problem_hints":{"standard_home_cleaning":"Keep cleaning/disinfecting separate and ventilate if chemicals are used.","kitchen_deep_clean":"Check grease, food-contact surfaces, ventilation, and product-label safety.","bathroom_deep_clean":"Avoid mixing cleaners in enclosed wet areas; ventilate and use PPE when labels require.","deep_cleaning":"Scope large areas honestly and flag mold, chemical, or respiratory risks before starting.","post_repair_cleaning":"Treat dust, residue, and chemical compatibility as the main safety checks after repair.","window_cleaning":"Check height/access risk and surface compatibility before using strong cleaners.","other_cleaning":"Ask for surface, chemical, ventilation, child/pet, and mold context before advising."}}` |

## Sign-off Checklist

- [x] Tu approves or edits every `worker_safety_patterns` row.
- [x] Tu approves or edits every `legal_awareness_patterns` row.
- [x] B3 updates `service_knowledge_boxes.safe_metadata.problem_hints` without adding a new table.
- [x] After sign-off, create one idempotent migration with `on conflict (pattern_key) do update` plus service knowledge metadata updates.
- [ ] Run B1 retrieval smoke with `KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED=true`.
