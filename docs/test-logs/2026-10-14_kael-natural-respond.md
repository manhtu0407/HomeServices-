# Kael natural respond (Plan §61) — evidence

Nothing here is a Production result. Every row below comes from code run in this worktree with scripted providers; no real model was called.

## Output guard, before and after

`checkKaelResponse` for a customer in Vietnamese mode. "Before" is the file at `main` (`a29a0ac0`) run through the same harness; "after" is this branch.

| Case | Text | Before | After |
|---|---|---|---|
| Ảnh/video | Bạn gửi thêm ảnh hoặc video chỗ rò để Kael xem giúp nhé. | chặn (language_mismatch) | qua |
| App + link | Bạn mở app và gửi link bảng điện cho Kael. | chặn (language_mismatch) | qua |
| Chat | Bạn có thể chat với Kael bất cứ lúc nào. | chặn (language_mismatch) | qua |
| Check-in | Thợ sẽ check-in khi đến tòa nhà. | chặn (language_mismatch) | qua |
| "Không bao giờ" (trấn an) | Kael không bao giờ tự xác nhận thay bạn. | chặn (absolute_claim) | qua |
| Câu 22 âm tiết | Bạn nên ngắt aptomat nhánh đó trước, rồi chụp lại ổ cắm đ… | chặn (sentence_too_long) | qua |
| Câu 32 âm tiết | Với ổ cắm bị nóng thì bạn nên ngắt aptomat của nhánh đó t… | chặn (sentence_too_long) | qua |
| Câu 40 âm tiết (vẫn bị chặn) | tốt tốt tốt tốt tốt tốt tốt tốt tốt tốt tốt tốt tốt tốt t… | chặn (sentence_too_long) | chặn (sentence_too_long) |
| Tiếng Anh thật (vẫn bị chặn) | Please check the filter then book service in the app. | chặn (language_mismatch) | chặn (language_mismatch) |
| Lẫn tiếng Anh (vẫn bị chặn) | Kael sẽ check payment status cho bạn. | chặn (language_mismatch) | chặn (language_mismatch) |
| Cam kết kết quả (vẫn bị chặn) | Kael đảm bảo không bao giờ lỗi lại. | chặn (absolute_claim) | chặn (absolute_claim) |
| Tuyệt đối (vẫn bị chặn) | Tuyệt đối an toàn, chắc chắn 100%. | chặn (absolute_claim) | chặn (absolute_claim) |

## Scenarios the new pillars run (scripted provider)

- P385: "mình ở Gò Vấp" / "tân bình" / "Phu Nhuan" / "Bình Tân" resolve to a district; after the reply a district already named is not asked again; a first message is not read as an answer before Kael has asked; the model's own-word value and extra details in the same message are filed under the right detail; a reply the model read as another topic fills nothing.
- P386: the district is asked a second time, never a third (the third becomes on-site verification through the existing path); the same limit holds for a model-written clarification.
- P384: a rejected customer answer costs exactly one guided rewrite; a failing rewrite falls back to the canned text; a clean answer makes one call; secrets are never retried.
- P387: a reworded reply that adds a number, a second question, a link, or drops the confirm instruction is replaced by the canned sentence; a provider failure never retries.
- P382: routed template replies, AI answers and fallbacks are told apart in `reply_source`; AI replies store provider, model and latency in the turn columns.

## What this does not show

- No real model output, no latency measurement, no Production behaviour. Whether replies *feel* more natural is for a person to judge on a device.
- The Edge on Production is still v297 (11/10) and does not run Plan §60 or §61.
- Kael thợ was changed only through the shared guard and prompt style; no worker turn was run.
