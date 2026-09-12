# Production transaction readiness — audit đang mở

## Danh tính và ranh giới

- Worktree: `.claude/worktrees/production-agentic-readiness-20260904`.
- Branch: `codex/production-agentic-transaction-readiness`.
- Base ban đầu của batch: `468c7fdc0740bbafa4ca07f7bb7a1c6e28dd1c1b`; candidate đã lưu tại `b7b3c239`, đang tích hợp main `5d75e268` trước publication.
- Staging đã xác minh: `xyylanuyflrjzbjzhqfl`, HomeServices Staging, ACTIVE_HEALTHY.
- Production mục tiêu: `iwevizmsedyqozxlawwl`. Batch này **không mutate Production**.
- Đã commit bản review; chưa push/PR hoặc merge PR tại cập nhật ngày 12/09. Không dùng dirty root checkout để triển khai. Chi tiết tiếp nối nằm trong [test report](../test-logs/2026-09-05_production-transaction-readiness.md).
- Đây là bằng chứng theo thời điểm, không phải tuyên bố Production-ready.

Yêu cầu của Tu là bảo vệ giao dịch thật và uy tín giữa khách và thợ, không chỉ làm demo chạy được. Plan đã duyệt là thẩm quyền implementation; tài liệu Dev là đầu vào để đối chiếu, không tự cấp quyền sửa dữ liệu hay bỏ Customer confirmation. Kết luận cuối phải dựa trên Production. Không dùng CI, mock hoặc Staging thay cho native/Production proof.

## Phát hiện và trạng thái đã kiểm chứng

| Phát hiện | Bằng chứng trực tiếp | Xử lý / phần còn mở |
|---|---|---|
| Completion nhận ảnh giả hoặc không thuộc công việc | P79 HTTP/domain có 9 ca RED trước sửa; P81 SQL RED trước migration | Kiểm tra asset được attach, cùng job/Worker, stage after, 1–10 ảnh; trigger DB chặn TOCTOU. Local và Staging SQL xanh; Production chưa deploy |
| RPC eligibility thanh toán trực tiếp cũ vẫn có execute grant | SQL manual-bank RED: legacy direct payment rail is still executable or advertised | Forward migration `20260905100000` revoke quyền rail đã retire; SQL Staging xanh |
| UI có thể mời chuyển tiền theo SePay QR cũ | Review code receipt/payment rail và P80 | Receipt cũ chỉ đọc; QR manual-bank cần capability hiện tại; không mở review từ receipt chưa verified. Chưa native proof |
| Support code bị mất qua action/provider hoặc header bị bỏ qua | P78 và network/media-upload tests | Giữ response metadata và ưu tiên support header; diagnostic NSL là mã máy cục bộ, không được giả làm server trace |
| Foreground/polling reconciliation có promise rejection không được bắt | Hai effect gọi async bằng void, lỗi storage có thể thoát | Hook scheduler riêng, serialize, retry và cleanup; test rejection/unmount. Chưa physical relaunch proof |
| P75 có thể gắn mọi entry vào P36 rồi vẫn xanh | Mutation all55→P36 tái hiện trước sửa | Tách catalog integrity khỏi behavior; required mode đọc exact passed assertion. 53 UNVERIFIED, 2 PARTIAL tại snapshot này |
| Review handler thực tế thiếu collected gate cho unpaid/actor | P82 gọi service thật với unpaid và actor matrix | 11 assertions collected; 404 cho Customer khác bảo vệ existence privacy. Chưa phải HTTP/hosted review proof đầy đủ |
| Worker cancellation có thể commit nhưng mất replacement khi Edge dừng | Audit cancellation và maintainer | Đang chuyển sang transactional outbox; chỉ rõ recovery cho legacy job thiếu durable receipt, không tạo receipt giả |
| Quyết định hoàn tiền chưa tương đương tiền đã hoàn | Dispute lưu refund_amount JSON; ledger completed-only chưa có outbound verified receipt | Refund obligation/review-required đang implementation. Không chuyển tiền, không tạo trạng thái refunded giả |
| Hosted migration ledger có nhưng RPC Worker memory không tồn tại | Ledger có `20260801090000`; pg_proc không có function; P85 SQL RED | Forward repair `20260905103000`; SQL role/input/idempotency/metadata-preservation xanh trên Staging |

Trạng thái “chưa có binding behavior” không đồng nghĩa chắc chắn code chưa được build. Nó có nghĩa chưa có bằng chứng đã được review và chạy đúng seam/state đủ để release. Tương tự, test HTTP với DB fixture không chứng minh hosted SQL, provider, push hoặc thiết bị thật.

## Release integrity: không được suy diễn xanh

P75 strict mode được wire trong PR workflow và post-merge quality job. Hai workflow tạo JSON từ API Vitest và mobile Jest ở chính checkout đang kiểm tra, rồi gọi `--require-behavioral --results ...`. Thiếu/skipped/failed/ambiguous assertion hoặc entry PARTIAL/UNVERIFIED chặn gate. Artifact vẫn được giữ khi fail. Không deploy trong PR workflow.

Tu đã duyệt ngày 12/09 thứ tự PR → human review → isolated Production canary có rollback → trên 80% được chứng minh và tất cả gate an toàn nghiêm trọng xanh → merge. Đây là quyền publication trước final proof, không phải miễn gate hay đánh dấu Goal complete. Username reviewer chính xác đã kiểm tra qua GitHub collaborator API là `kouuuuuuuuu`, quyền write; tên viết tắt `kouuuuuu` trong Plan không khớp tài khoản repo. Hai bước release approval được sửa về đúng login, vẫn bắt current APPROVED của người khác tác giả trên exact head SHA. Gate đỏ phải được sửa bằng evidence thật, không nới checker. Pipeline hiện tại vẫn chỉ deploy sau merge; pre-merge canary chưa được wire/chạy và không được giả receipt của một PR đã merge.

EAS workflow hiện mới cover đăng nhập/home, **không phải full transaction native**. Schema chính thức đã được validate trên object schema thực (không phải response envelope), deliberate invalid job type bị từ chối. Backend EAS từ chối Maestro do tài khoản cần paid plan: `BLOCKED_EAS_PLAN`. Không mua plan hoặc ngụy trang job để vượt giới hạn này.

## Backend placement và parity

- Các mutation workflow ở Edge domain/DB RPC; không đưa workflow-sensitive write vào mobile client.
- Admin recovery dùng Admin surface hiện có. Type operations được tách khỏi file contracts quá 800 dòng; barrel cũ giữ tương thích.
- Contract Edge cần bundle độc lập. Các type Worker mới dùng namespace `EdgeWorker*` theo convention hiện hữu; P71 kiểm tra type equality và constant parity với public shared types. Không cần nới structural baseline.
- Query live Staging đã kiểm 162 tên RPC quét được: ban đầu thiếu một, sau repair query không còn thiếu.
- Scanner báo **11 dynamic call sites không resolve được**. Chưa được coi là contract coverage đầy đủ; phải kiểm tra từng runtime dispatcher.
- Ledger presence không chứng minh object tồn tại. Phát hiện Worker memory minh họa vì sao inventory phải đi cùng live object scan.
- Chưa claim Edge Deno/local Postgres xanh khi Docker toolchain không chạy được. Staging rollback-only SQL suite là evidence riêng, không phải migration replay từ empty DB.

## Sai khác và quyết định trong batch

1. Sửa completion tại cả Edge và DB: gate phía UI/API đơn lẻ không chặn race hoặc caller cũ.
2. Giữ các migration đã có trong lịch sử; dùng forward repair cho object/grant thiếu. Tool áp dụng migration tạo timestamp riêng; chỉ row Staging mới tạo được chuẩn hóa về version authored, kèm name/source-MD5/destination-absent guard. Không sửa ledger Production.
3. Phát hiện validation EAS lần đầu đã đọc envelope thay vì schema; không dùng lần đó làm PASS. Lần validate schema thật và mutation invalid job mới là bằng chứng.
4. P75 không còn coi route-to-pillar metadata là test full flow. Giữ debt đỏ, kể cả khi các assertion đã bind đều xanh.
5. Đã thử allowance cho bốn contract twins; baseline ratchet từ chối. Không giữ allowance đó: đổi Edge exports theo namespace sẵn có và giữ equality test. Cần rerun gate sau tích hợp.
6. Chạy song song các slice độc lập theo quyền delegation hiện tại; main giữ integration/review. Workplan chưa đóng vì toàn transaction và release evidence còn thiếu, không đổi status để linter xanh giả.
7. Chỉ tạo audit/test evidence mới theo `docs/INDEX.md`; không sửa locked governance hoặc ghi session memory khi chưa qua show-before-write.

## Gate chưa đủ để bàn giao Production

- Full collected critical route × actor × state behavior; no-show/reschedule/refund/recovery còn cần chứng minh.
- Full type-check/test/build và clean-code gates trên diff cuối, không chỉ targeted suites.
- Generated types/hosted inventory, migration replay/SQL concurrency và Edge checks.
- Staging hosted two-persona E2E, confirm p95 ≤3s qua 20 runs, delivery p95 ≤10s, injected faults.
- Exact-source native build/full-flow evidence; physical iOS/Android push, background, killed-app, deep-link do Dev validate.
- Credentials bình thường cho hai tài khoản thật, không reset Admin/bypass onboarding.
- Production synthetic auto-quote/RFQ/recovery đến paid→review, mỗi scenario ba lần liên tiếp.
- Public supply: ≥3 Worker thật distinct, eligible và reachable theo từng service×district. Không dùng synthetic để đủ ngưỡng.
- Outbound refund receipt ingestion/maker-checker chưa được chứng minh; không hiển thị “đã hoàn tiền”.
- Exact-head PR approval, green CI và user merge authority mới.

Goal vẫn active. Snapshot toàn chương trình: `BUILT_NOT_DEPLOYED` / verification đang mở, **không complete**.

## Bổ sung sau integration — chưa phải Production proof

- Durable Worker replacement, refund obligation và Customer-only scope decision đã có rollback-only SQL PASS trên Staging; xem [receipt và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md). Những mục “đang implementation” phía trên là snapshot cũ, không được dùng để phủ nhận kết quả mới hoặc suy diễn đã deploy Production.
- Customer refund đã đi xuyên API snapshot, shared reducer và state khôi phục. UI phân biệt chờ rà soát / chờ hoàn / cần đối soát; không mở QR, claim thanh toán, review hay trạng thái “đã hoàn tiền”. Mobile receipt dùng lại Shared contract thay vì một bản sao thiếu trường.
- Type-check ba package, Shared115 tests và API913 tests xanh; API hosted tests vẫn có2 skip. Mobile full run còn1 assertion cũ sai quy tắc VI; targeted61 tests đã xanh sau sửa, full rerun đang chạy. React Doctor63 changed files0 issues, không phải native proof.
- Types được tạo lại từ Staging có cả public/GraphQL, so sánh byte chính xác. Công cụ generate giữ nguyên file lân cận, không xóa thư mục; ba bảng mới được gắn owner job lifecycle cụ thể.
- Gate access phát hiện quyền trực tiếp thừa trên coverage SECURITY DEFINER. Migration mới thu hẹp server-only; P94 và coverage SQL PASS trên Staging. Không nới access gate.
- Các rủi ro còn phải điều tra: reservation ở accept/official-match không phải replacement; notification lặp khi retry; synthetic cancellation trong query hỗ trợ; paid-cancelled có thể lọt khỏi danh sách Finance; outbound refund receipt/maker-checker chưa triển khai. Đây là câu hỏi còn mở, không phải kết luận đã tái hiện.
- Ngắt tool/agent không đảm bảo probe tạm tự phục hồi: đã tìm thấy constant operation ID còn sót từ mutation test và khôi phục, rồi root chạy lại P86. Phải tiếp tục quét source residue trước publication.

Không đóng Goal, không commit/push/merge; public supply thật, native physical proof và Production end-to-end vẫn là gate bắt buộc.

## Cập nhật tiếp theo — Finance và gate thanh toán

- Giả thuyết paid-cancelled bị mất khỏi Finance đã **tái hiện thật bằng SQL**; đồng thời tái hiện synthetic paid detail lọt vào cùng RPC. Đã sửa năm owner Finance hiện có, không tạo hệ thống tài chính song song. P95 Staging rollback PASS chứng minh tiền đã nhận không biến mất khi hủy, nghĩa vụ hoàn tiền chưa bị tính là tiền đã trả, và synthetic không lọt qua detail/page/export/overview/breakdown của nhóm RPC này.
- Migration113000 có một lỗi tham chiếu cohort trên ledger, được test phát hiện và forward-fix114000 sửa bằng job join. Giữ đầy đủ lịch sử lỗi và hash Staging trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md); không gọi lần apply đầu là thành công chức năng.
- Edge/Shared cho phép lọc giao dịch đã hủy; Admin support VI/EN nói đúng nghĩa vụ hoàn tiền, không nói đã chuyển tiền. Test Finance cũ không còn chèn completed refund không có receipt; nó kiểm tra fail-closed và tổng tiền trung thực.
- Gate release dùng đúng hai route chuyển khoản hiện tại. Registry, assurance và transaction manifest được sửa đồng bộ sau RED thật; không bỏ safety assertion. Node harness272/272, API914 PASS +2 hosted skip, Mobile1619/1619, Shared115/115; ba type-check xanh, React Doctor63 files0 issues.
- Sau review và binding P86, strict transaction gate vẫn **đỏ**:52 UNVERIFIED,3 PARTIAL dù35/35 assertion đã bind đều xanh. Đó là thiếu bằng chứng toàn luồng, không phải52 lỗi runtime đã xác minh. Workplan sáu slice chưa đóng cũng chưa xanh.
- Chưa giải quyết xong: normal durable matching reservation/TTL khi accept và official match; notification retry; synthetic trong toàn bộ support/analytics ngoài nhóm Finance vừa test; outbound refund receipt/maker-checker; SQL concurrency/replay; native/EAS; Staging SLO; real-account và Production proof.

Review uncommitted từ `468c7fdc0740bbafa4ca07f7bb7a1c6e28dd1c1b`: spec compliance mới đạt một phần; rule/data-honesty giữ fail-closed; maintainability giữ existing owners và predicate dùng chung. Chưa đủ điều kiện publication review PASS, chưa commit/push/merge. Goal vẫn active.

## Cập nhật matching — reservation, TTL và Customer authority

- Đã tái hiện bằng SQL: lease matching thông thường đã release nhưng Worker vẫn tạo được candidate; Customer ID NULL vẫn có thể xác nhận RFQ ở RPC. Guard cũ chỉ đủ cho replacement. Đã mở rộng đúng owner hiện có, kiểm tra lease/delivery/cohort, eligibility, role và thời gian sau khi lấy lock; các RPC chọn/từ chối thợ từ chối NULL/wrong-owner/non-Customer. Edge trước đó đã kiểm Customer, nên không suy diễn thành exploit HTTP đã chứng minh.
- Test auto-quote phát hiện lỗi mới do candidate TTL và price receipt không cùng deadline. Đã forward-fix, validate receipt trước khi đồng bộ deadline; không bỏ price constraint. P96 Staging PASS cả auto-quote/RFQ/inspection và 100 replay tuần tự. Chưa phải bằng chứng race nhiều connection.
- HTTP phân biệt capacity hết hiệu lực bằng safe409 ở cả accept/proposal/Customer confirm; Mobile dùng copy VI/EN có sẵn và giữ support code. API923 PASS +2 hosted skip, Mobile1620/1620, Node272/272, root type-check xanh. Workplan và strict full-transaction evidence vẫn mở.
- Staging đã có hai migration mới, inventory352 và168 RPC quét được hiện diện, nhưng hosted Edge vẫn mang release cũ; drift gate đỏ là đúng. Phân biệt SQL Staging PASS với Edge/Mobile **BUILT_NOT_DEPLOYED**; không gọi là Production-ready.
- Vẫn phải chứng minh expiry/rematching recovery, concurrency thực, toàn bộ SQL/native/EAS/CI, public supply và Production full flow. Các receipt RED→GREEN, giới hạn legacy compatibility và lỗi công cụ được ghi trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

Không commit/push/merge, không mutate Production, không đóng Goal.

## Bổ sung: đọc trạng thái không được chọn thợ thay khách

Phát hiện GET candidate dùng lệnh xác nhận RFQ/từ chối auto-quote để xử lý hết hạn theo đồng hồ Edge. P97 HTTP tái hiện đường gọi sai khi thời gian không khớp; đã thay bằng RPC chỉ được hết hạn theo DB và không được xác nhận/từ chối thợ còn hạn. Đây là command-path proof, chưa phải sự cố trên tài khoản thật.

P96 Staging đã chứng minh hết hạn đồng bộ,100 replay tuần tự, không phá candidate mới khi retry candidate cũ, không gỡ official match, và không cho NULL/non-owner/Admin thay Customer. Lỗi DB không còn bị gộp vào xung đột trạng thái. Migration123000, generated types và receipt RED→GREEN ở [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

Chưa khép kín rematching sau crash/hết toàn bộ lease hoặc khi không có app foreground; chưa có concurrency/native/Production proof cho nhóm sửa này. Gate publication và Goal tiếp tục mở.

## Cập nhật: outbox không được làm mất quyết định đã hoàn tất

Đã tái hiện và sửa trên Staging bốn lỗi: settlement trả chậm lùi candidate state, retry5 vỡ constraint DB, NULL state bị nhận sai, và crash ở attempt8 không bao giờ được claim/đóng lại. Hai forward migration giữ job-first locking, deadline wall-clock, Customer decision và replacement mới; crash reconciliation được gắn vào batch claim hiện có, không chạy matching lần9 hay giành lease còn sống.

P98/P99 cùng ba suite hồi quy đã pass5/5 qua runner SQL Staging thật. API932 PASS +2 hosted skip; types, inventory355, access và comment/structure gates xanh. Scanner search-path được sửa sau2 unit RED; không bỏ security gate. Chi tiết lỗi công cụ, MD5 migration, command receipts và phạm vi test có trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

Scheduler Staging có chạy đều; HTTP200 tổng hợp không chứng minh recovery toàn luồng. Chưa hoàn thiện general candidate expiry/rematching không cần foreground, replacement cap/lock parity và side-effect deduplication. Strict evidence vẫn52 UNVERIFIED/3 PARTIAL. Không mutate Production, không commit/push/merge, không đóng Goal và không gọi Staging là bằng chứng Production cuối cùng.

## Cập nhật: maintenance cho candidate/inbox hết hạn

Source đã có bước maintenance server-owned cho candidate và delivery quá hạn, release reservation đã hết và ghi operation `no_reachable_worker`; không quyết định thay Customer. Scan đi qua RPC service-only, attestation của maintainer và release/cohort gate. Test mở rộng bắt thêm trường hợp inbox đã expired nhưng operation vẫn broadcasting; forward143000 sửa điểm bỏ sót này.

SQL deploy trên Staging:140000 và143000. P100/P101 cùng hồi quy:6/6 SQL Staging,947 API PASS+2 hosted skip,15/15 runtime-boundary cases,4/4 type-check và6/6 Deno checks. Chi tiết lỗi fixture/tool, RED→GREEN, migration hash và giới hạn ở [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

**Chưa** deploy Edge mới hoặc chứng minh cron hosted trên bundle mới. Chưa hoàn thiện lượt rematching cấp lại reservation sau exhausted; không được hiểu expiry terminal là đã tự tìm thành công thợ tiếp theo. Authenticated native, concurrency, public supply, whole-plan behavioral proof và Production full transaction vẫn mở. Strict evidence52 UNVERIFIED/3 PARTIAL;315 path chưa publication-ready. Không commit/push/merge, không mutate Production, Goal ACTIVE.

## Cập nhật: replacement outbox lease không được ghi đè Customer

Trong lúc chuẩn bị durable Customer rematching, tái lập thêm hai lỗi trên SQL Staging: settlement nhận lease đã hết theo wall-clock và crash tại attempt8 không bao giờ được đối soát. Forward150000 đổi job-before-outbox locking, kiểm tra token/deadline sau locks, wire exhausted reconciliation vào public batch claim hiện có, không chạy matching lần9. Candidate, official match và successor không bị hồi quy.

P102 cùng6 suite hồi quy: **7/7 SQL Staging PASS**; API947 PASS/2 hosted skip, inventory358, access165 tables/299 functions,126 unique pillars, comment/structure xanh. Hosted function-body readback4/4 trùng migration;0 fixture actor/cohort còn lại sau rollback. Receipt/hash, các lỗi fixture đã sửa và lệnh thật nằm trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

Đây là prerequisite fix, **chưa phải durable retry end-to-end**: chưa có Customer request-id/expected-parent command và mobile recovery cho lượt tìm mới. Public replacement threshold/side-effect deduplication, concurrency/native/CI/exact-release/Production proof còn mở. Behavioral gate exit1 với52 UNVERIFIED/3 PARTIAL; workplan sáu slice OPEN,317 path chưa publication-ready. Goal ACTIVE. Không mutate Production, không cash/commit/push/merge.

### Goal được Tu cập nhật trong lúc thực thi

Tu đã bổ sung quyền **commit, push và merge sau khi hoàn tất**, rồi sẽ nhờ Dev Kouuuuu kiểm tra result. `get_goal` xác nhận objective mới đang ACTIVE. Quyền merge có điều kiện này thay thế yêu cầu đợi một lệnh merge mới; không phải quyền bỏ qua CI, release/Production evidence, các kiểm soát review đang áp dụng hoặc bảo vệ dữ liệu thật. Hiện chưa đủ gate nên chưa thực hiện commit/push/merge; không đánh dấu Goal complete.

## Cập nhật: Customer retry command, receipt và regression guard

Đã có Customer retry atomic request/read, immutable request/parent identity, recheck fresh supply và reuse đúng durable outbox hiện có. HTTP giữ URL confirm-search nhưng nhận stable identity và trả202 + receipt; thêm owned GET recovery/latest parent. Unknown outcome không trở thành final failure, queued không được claim delivery, Admin/Worker không thể thay Customer.

Ba forward migration153000/154000/155000 đã apply và đối chiếu exact identity trên Staging. Hồi quy rộng bắt một regression của154000 ghi đè canonical capacity guard;155000 khôi phục guard dùng chung và các ca expiry/offline/role sau Customer retry. Kết quả cuối: **9/9 SQL Staging PASS,13/13 latest function bodies khớp;972 API PASS +2 hosted skip;115 shared PASS;4/4 type-check**. Inventory361, access165 tables/301 functions,128 collected pillars. Chi tiết RED→GREEN, hashes, lỗi fixture và lệnh nằm trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md).

**Chưa phải end-to-end:** mobile chưa lưu/wire request identity và recovery; không được deploy Edge mới một mình vì client hiện tại vẫn gọi bodyless. Deno mới UNVERIFIED: kael-docker version gate thất bại, không retry updater/restart hoặc dùng kết quả cũ. Native/real accounts/supply/concurrency/exact-release/Production vẫn chưa chứng minh. Strict evidence51 UNVERIFIED/6 PARTIAL;43/43 bound assertions là local scripted evidence, không phải Production proof.323 path, sáu slice OPEN; Goal ACTIVE, chưa commit/push/merge.

Đã dừng automation PR229 Production gate lỗi thời khi nó tiếp tục trỏ tới release/SHA cũ; không rerun Production workflow. Tiếp theo là mobile persistence/relaunch recovery, rà lại các nhánh legacy/favorite matching và kiểm chứng toàn vertical slice trước bất kỳ publication nào.

## Cập nhật: mobile retry đã wire, Production vẫn chưa được chứng minh

Mobile đã nối durable Customer retry: persist actor/job/request/parent trước POST, dùng token của tài khoản khởi tạo, schema/binding validation cho receipt, double-tap single-flight và GET reconciliation khi timeout/relaunch/foreground. Unknown outcome không tự thành failure cuối cùng hoặc request mới. Client không evict unresolved local command khi storage đầy; lỗi đọc/ghi giữ fail-closed. Callback tài khoản cũ không hydrate tài khoản mới; polling foreground có budget20 lượt/window, không được coi là push/background proof.

Feedback VI/EN + support code được giữ ở provider theo job để refresh không xóa mất trạng thái đối soát. Receipt202 không được tạo timeline broadcast giả; chỉ job response thật mới hydrate. Audit tìm và sửa thêm source path vốn suy ra `sent` từ `broadcasting` dù thiếu broadcast evidence. Test RED đã chứng minh lỗi trước khi sửa. Không đổi layout/glass/motion; design/frontend skills giữ implementation trong owner có sẵn.

Bằng chứng cuối của lượt này: **mobile174 suites/1651 PASS, API972 PASS+2 hosted SKIP, mobile type-check PASS, React Doctor63 files/0 issue, P10524/24**. P105 có100 local concurrent preparations, account switch, storage corruption/failure/full, terminal hydration, bounded foreground và shared reducer thật. Không coi scripted fetch, AsyncStorage/RNTL hay serial SQL trước đó là native/Production/concurrent DB proof. Chi tiết lệnh, RED→GREEN và warnings tại [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-mobile-durable-matching-retry-và-đối-soát-foreground).

P105 đã bind vào critical manifest:49/49 assertions chạy xanh, nhưng strict gate vẫn **51 UNVERIFIED/6 PARTIAL**, sáu workplan slice OPEN,331 changed/331 declared. Catalog129 pillars không thay thế whole-flow evidence. Trạng thái slice: **BUILT_NOT_DEPLOYED**. Chưa chạy SQL/deploy/Production mutation trong lượt này, chưa commit/push/merge; không gọi Goal complete.

Next Step: rà legacy case-quote/initial confirm và matching preference/favorite/general fallback, sau đó hosted Edge-to-SQL + native two-persona/exact-release validation. Docker/Deno current-source, public real supply, physical push, CI và Production full transaction vẫn mở. Bằng chứng source/local ở đây thay thế nhận định “mobile chưa wire” phía trên, không thay thế gate Production cuối cùng của Tu.

## Cập nhật: initial activation có lease fence và giải phóng capacity

Default confirmation dispatcher đã chuyển sang một RPC activation gắn outbox ID/token/confirmation ID. SQL job-first locking bảo vệ Customer authority, replay stable recipient/batch, RFQ/inspection không đòi giá giả, saved-only không tự mở rộng. Forward161000 sửa lỗi thật mà SQL bắt được: no reachable target vẫn để capacity held; saved-only cũng release Worker ngoài lựa chọn. P106 bổ sung kiểm tra này, không suy ra đúng chỉ từ source.

Bằng chứng kiểm chứng lại: **API986 PASS+2 hosted SKIP; SQL Staging10/10 PASS; types4/4 (3 cache hits);173 RPC names tồn tại,10 dynamic residue**. Hosted activation body khớp161000, fixture actors/jobs/cohort đều0 sau rollback. Comments/structure/baseline/capability/privileged/migration/access gates xanh; access drift đã regenerate rồi check thật. Critical gate vẫn **50 UNVERIFIED/7 PARTIAL**,56/56 assertions bound xanh; workplan6 OPEN. Chi tiết command/RED/limitations tại [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-initial-confirmation-activation-có-lease-authority).

Staging SQL không có nghĩa current Edge đã deploy: health vẫn release`harness-5696b2e2da33-2a04d3e4984b`, Git5696b2e2, không phải candidate468c7fdc+dirty. Migration ledger363/363 nhưng release/inventory attestation chưa khép, drift gate exit1. **BUILT_NOT_DEPLOYED** cho Edge changes; SQL là Staging proof, không phải Production synthetic hoặc real-account proof.

Rà source kế tiếp xác nhận: governed confirmation làm mất`matching_mode`; preference selection gửi đồng bộ; fallback ghi marker trước broadcast. Các nhánh này cần durable command/receipt và explicit consent, không được coi fail-closed ở activation là đã hoàn thiện toàn matching feature. Legacy case-quote, native, real supply, exact-release CI/deploy và Production full transaction tiếp tục OPEN. Không commit/push/merge/Production mutation trong lượt kiểm chứng này; Goal ACTIVE.

## Cập nhật: matching intent đã được ghi cùng confirmation

Governed confirmation truyền matching_mode vào atomic_v4/authorized_v6 và trả matching receipt. SQL giữ preference ở first commit; replay không đổi lựa chọn/không cấp lại expired capacity. Pending choice release capacity và không bị dispatcher claim. Full SQL regression đã phát hiện mất exhausted-outbox reconciler trong162000; forward162100 sửa, giữ nguyên assertion và migration đã apply.

Bằng chứng: API990 PASS/0 FAIL/2 hosted SKIP;11/11 SQL Staging PASS, P108 rerun sau bổ sung Admin denial PASS;types4/4 với1 cache hit. Ba function bodies khớp hosted Staging; generated public+graphql_public types byte parity PASS;365 migrations,165 tables/304 signatures,132 pillars. Critical gate vẫn49 UNVERIFIED/8 PARTIAL dù60/60 bound assertions xanh; workplan6 OPEN. Xem [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-persist-matching-intent-cùng-confirmation) cho RED, forward regression, ledger hash và giới hạn.

**Chưa deploy Edge / chưa Production proof.** Post-choice selection hiện vẫn là legacy synchronous path và yêu cầu broadcasting; phải thay bằng durable selection có capacity recheck, stable receipt/relaunch trước khi phát hành governed pending-choice flow. Saved-worker fallback, mobile first-confirm, native và full Production transaction tiếp tục OPEN. Không commit/push/merge; không thay đổi Production.

## Cập nhật: post-choice selection và mobile relaunch đã được nối

163000 tạo immutable preference receipt, atomic Customer command/capacity recheck và read-by-request. Governed POST trả202, GET recover được sau restart; same request không đổi consent/Worker và không broadcast inline. Mobile đã bỏ ref-only request: persist trước send, GET trước replay, bind initiating token, fence account switch/background, validate receipt và chỉ hydrate GET job thật. Provider cùng màn Kael giữ thông báo đối soát đúng case; không giả giá, Worker hoặc delivery.

P111 tái hiện hai POST khi double press và, ở review, một broader-consent press bị join nhầm automatic recovery rồi báo accepted. Hai lỗi được sửa và có RED/GREEN; P75 manifest binding, missing API test double method và Kael shell clock-dependent test cũng được sửa, không hạ quality gate.

Kết quả mới: **API1007 PASS/2 hosted SKIP; mobile176 suites/1676 PASS; types4/4; SQL Staging12/12; React Doctor63 files/0 issue**. Bốn function bodies khớp hosted163000, fixtures rollback0, inventory366/access306/capability227. Critical evidence **74/74 bound assertions**, nhưng **49 UNVERIFIED/10 PARTIAL và sáu workplan OPEN**. Chi tiết command và phạm vi trong [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-durable-matching-selection-và-mobile-recovery).

Next: durable saved-worker fallback cùng UI consent/disclosure, legacy first-confirm, multi-connection races và live Edge-to-SQL trước native/exact-release/Production. Hiện first selection vẫn yêu cầu favorite reachable dù auto_generaltrue; không coi đó là hoàn thành fallback. Status **BUILT_NOT_DEPLOYED**; chưa có Production proof, không commit/push/merge. Các kết quả local/Staging không thay thế physical push, tester account, real supply hoặc Production full transaction.

## Cập nhật: fallback đã có durable continuation

170000/171000 đã apply và được kiểm tra trên Staging: marker, capacity, child operation và outbox atomic; source fallback bất biến và khác Customer retry. Consent saved-only không mở rộng. Khi favorite unavailable ngay lúc chọn, auto-generaltrue được giữ và initial settlement lưu continuation trong cùng transaction. Governed Edge bỏ legacy inline path; receipt giữ identity nhưng phản ánh child progress; không phát thông báo Worker cancellation cho fallback.

P112/P113 có RED/GREEN, bao gồm thiếu capacity, declined/expired/unavailable,100 serial replays, immutable consent/source và expired dispatcher lease bị fence. Latest API **1016 PASS/2 hosted SKIP**, types4/4, SQL13/13 và final P112 rerunPASS. 10 SQL function bodies khớp hosted. Critical gate vẫn **49 UNVERIFIED/10 PARTIAL** dù77/77 bound assertionsPASS; sáu workplan slicesOPEN. Xem [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-durable-saved-worker-fallback-và-favorite-unavailable).

Live Staging Edge vẫn release5696b2e2, không phải candidate hiện tại. Trạng thái **BUILT_NOT_DEPLOYED**, không Production mutation, không publication. Next: UI consent/disclosure thực sự, legacy first-confirm, multi-connection races và current-source hosted Edge trước native/release/Production proof. Không đổi các gate cuối thành bằng chứng local hoặc Staging.

## Cập nhật 2026-09-06: UI consent đã nối durable recovery

Customer saved-worker selection nay mặc định saved-only; quyền tìm thợ khác chỉ có sau checkbox explicit VI/EN. Worker unavailable không được giả thành available. UI đọc request/receipt theo actor/job/generation từ durable hook, khóa lựa chọn trong storage restore/unknown outcome, hiển thị consent đã lưu và không để close/reopen hay stale list response đổi nó. Receipt timeline thiếu recipient_count không còn tự hiện0. Source wiring đi qua provider/case panel thật; P111 kiểm tra UI → storage → scripted API → relaunch, không phải test helper đứng riêng.

Final mobile **177suites/1691PASS**, mobile type-checkPASS, React Doctor65files/0issue; node harness/copy23/23PASS. P11411cases được collect và bind; critical gate **83/83 assertions nhưng49UNVERIFIED/10PARTIAL**, workplan6OPEN. REDs gồm default consenttrue, fake0recipient và snapshot count trong harness đã cũ; đã sửa mà không hạ required proof. Xem [test log](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-explicit-matching-consent-trên-app).

Native capture chưa có: adb/xcrun/device process không khả dụng trong probe này; matrix device-bound được ghi trong test-log, không dùng browser thay thế. SQL/API số liệu phía trên là batch trước, không rerun/deploy trong batch UI này. **BUILT_NOT_DEPLOYED**, GoalACTIVE; chưa chứng minh current-source hosted Edge, race thật, legacy first-confirm, native/physical push, real accounts/supply hoặc Production full transaction. Không commit/push/merge và không đụng Production.

## Cập nhật 2026-09-06: first-confirm identity và recovery faults

Đã tái hiện và sửa local:100 simultaneous prepare sinh100keys; storage corrupt/read-failure bị coi là chưa có receipt; pending overflow bị evict; callback account cũ tiếp tục GET/POST/hydrate; server commit thành công nhưng clear storage lỗi làm mất đường mở job; pre-send RFQ/inspection báo “đã gửi”; auth refusal bị coi là outcome cuối rồi xóa consent; legacy confirmed session có job nhưng app vẫn POST lại.

Storage nay serialize theo owner, giữ một key/intent, không overwrite known operation/job identity và fail closed khi chưa biết outcome. Recovery có owner/generation fences ở helper/UI/provider; auth401/403 và ALREADY_CONFIRMED giữ pending; confirmed legacy session recover valid matching job identity qua read. Lỗi sau server acceptance vẫn giữ receipt và mở job đã nhận, không tự tạo job/consent khác. UI process copy đã tách vào helper ngôn ngữ hiện có. Legacy record không xác minh được owner vẫn giữ nguyên và BLOCKED, chưa có server-assisted recovery proof.

Final mobile177suites/**1720PASS**, type-checkPASS, Doctor65files/0issues; API**1016PASS+2hostedSKIP**; node44/44PASS. Inventory đã dùng all-untracked, thực370 = declared370; workplan6OPEN. Critical gate chỉ chứng minh**89/89 bound assertions**, còn49UNVERIFIED/10PARTIAL, exit1. Xem [bằng chứng, RED/GREEN, report hashes và review](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-confirmation-identity-account-fencing-và-storage-faults).

Không có Production/SQL/native mutation hoặc proof mới trong batch này. **BUILT_NOT_DEPLOYED**, GoalACTIVE. Next: audit các generic refresh/create/case-quote rails và storage/auth recovery UX; tiếp đó current-source hosted integration, multi-connection/native và toàn bộ Production acceptance. Không gọi local green là full readiness, không commit/push/merge trước khi các gate thật đủ.

## Cập nhật 2026-09-06: job selection và legacy draft entry

Đã có real-provider RED/GREEN cho refresh job cũ ghi đè job vừa chọn. Runtime nay fence actor lifecycle/selection/job identity; request trùng dùng cùng Promise/kết quả thật, job mới không bị request cũ khóa hoặc ghi lỗi. Negative tests chứng minh callback cũ A→B→A/unmount không GET và private reads không dùng shared credentials khi thiếu captured token. Đây là local runtime proof, không phải cross-account leak đã quan sát trên Production.

Mobile compatibility action tạo trực tiếp từ draft nay fail closed với `KAEL_CASE_WORK_REQUIRED` và hướng dẫn VI/EN. Source Edge vốn đã reject `/jobs` và UI không gọi action này; không suy diễn server từng cho bypass consent. Test trước fix chứng minh callback cũ vẫn gửi network request, sau fix không gửi.

Full mobile **177suites/1730PASS**, type-check/Doctor65files0issues/comment/structure/copy/residue/diff gatesPASS. Workplan371/371 nhưng6OPEN; critical89/89boundPASS nhưng49UNVERIFIED/10PARTIAL. API report reuse từ lượt trước, không SQL/native/Production proof mới. [RED/GREEN và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-job-selection-race-và-legacy-draft-entry). Next: cancellation/favorite/case-quote fences, recovery UX và hosted/native/Production acceptance. **BUILT_NOT_DEPLOYED; GoalACTIVE; không publication.**

## Cập nhật 2026-09-06: cancellation actor/job isolation

P115 đã tái hiện8RED và nay13PASS: retired callback vẫn POST, double tap, wrong-job receipt, old selection/favorite response và unknown cancellation. Hook nay bind Customer/token/job, coalesce request, validate receipt, GET reconcile sau timeout; chỉ server-confirmed cancelled mới tạo cancelled snapshot. Refresh cũ không hồi sinh broadcasting, paid cancellation review không biến thành cancelled/refunded. Không thay đổi API/RPC authority.

Final mobile **178suites/1745PASS**; type-check, Doctor65files0issues, comment/structure/copy/residue/diffPASS; registry139pillars. Critical binding cancellation chuyển UNVERIFIED→PARTIAL bằng8exact assertions: tổng97/97boundPASS nhưng48UNVERIFIED/11PARTIAL,exit1; workplan372/372,6OPEN. API report reused từ lượt trước. [Bằng chứng và gap](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-cancellation-và-favorite-actorjob-isolation).

Chưa chứng minh cancellation public HTTP/SQL concurrency, relaunch unknown-outcome durability, hosted capacity/refund/outbox hoặc native/Production. GoalACTIVE, **BUILT_NOT_DEPLOYED**, không commit/push/merge. Next: đóng những gap này và case-quote/fulfillment, không lấy local tests thay full Production acceptance.

## Cập nhật 2026-09-06: cancellation HTTP và UUID false positive

P116 đã chứng minh actual HTTP từng trả201/cancelled khi RPC thiếu status, chấp nhận persisted receipt sai job/owner, bỏ qua lookup error và default invalid conflict status. Đã thêm receipt schemas trước effects, unknown-outcome503, owned persisted-request recovery và direct-cancel replay không duplicate mutation/event. Policy cancellation vẫn bị chặn khi autonomy flag-off; direct Customer pre-accept cancel không bị phụ thuộc cờ đó.

Numeric UUID suffix có thể bị autonomy guard nhận nhầm là PII: test thật qua HTTP bị409 dù identity hợp lệ. Đã giới hạn exemption vào catalogued UUID reference field, không miễn summary/unknown reference. Audit giữ UUID để tra cứu và scrub phone trong reference cùng secret-like text trong decision. P13 negative tests giữ chặn PII, secret và unknown evidence. Đây là local defect proof, không kết luận đã tìm được nguyên nhân duy nhất của khác biệt Tu/Dev hoặc đã quan sát Production leak.

Full API **1061PASS/0FAIL/2hostedSKIP**, P11639PASS/P1316PASS, API type-checkPASS; comment/structure/residue/diffPASS. Staging metadata176resolvable RPC names đều có,10dynamic sites ngoài scan; không SQL mutation/deploy. Critical108/108boundPASS nhưng48UNVERIFIED/11PARTIAL, workplan373/373 và6OPEN. [RED/GREEN, hashes và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-cancellation-http-receipt-và-uuid-guardrail).

**BUILT_NOT_DEPLOYED; GoalACTIVE.** Hosted SQL concurrency/outbox recovery, Deno/native và Production acceptance vẫn mở; mobile1745PASS là lượt trước. Không commit/push/merge hoặc thao tác Production. Next: cancellation SQL/capacity/notification recovery và các fulfillment rails, không lấy local green thay Production proof.

## Cập nhật 2026-09-06: cancellation SQL và durable inbox

Hai lỗi tái hiện trên Postgres Staging đã được sửa bằng migration mới: `20260906010000` đồng bộ cancelled job với operation/outbox/delivery trong cùng transaction; `20260906011000` ghi Worker cancellation notice cùng cancellation record và deduplicate notification retry qua job lock. Không backfill dữ liệu cũ, không chạm Production. P117/P118 RED→GREEN; kiểm tra100retry tuần tự, stale dispatcher lease, sai Worker, inbox RLS, scheduled cancellation và completion dispute đều PASS. Không suy diễn thành multi-connection race hay push-device proof.

API1063PASS/0FAIL/2hostedSKIP, focused41PASS/type-check clean; P98/P106/P96/P84 SQL regressions chạy thành công; schema370/370 và176resolvableRPCnames đủ,10dynamic sites chưa scan. Release drift **RED**: hosted Staging Edge vẫn SHA5696b2e, không phải dirty candidate. Critical48UNVERIFIED/11PARTIAL, workplan378/378 nhưng6OPEN. [Commands, hashes, RED/GREEN và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-cancellation-sql-và-durable-worker-inbox).

**GoalACTIVE.** SQL fixes chỉ chứng minh trên Staging; Edge copy chưa deploy. Còn candidate/actor-boundary SQL, legacy recovery, native relaunch/push, refund, current-source hosted composition và full Production proof. Không commit/push/merge; không lấy số test xanh làm kết luận hoàn thành.

## Cập nhật 2026-09-06: candidate cancellation và stale replay

P117 tái hiện ba lỗi SQL: null Customer làm candidate bị declined dù job chưa hủy; cancellation để proposal proposed; late proposal retry trả ok/already_applied khiến Edge báo candidate_ready dù job vẫn cancelled. Ba forward migrations12000/13000/14000 đã apply Staging và kiểm chứng: null/foreign/role authority, atomic proposal retirement, job–delivery binding và active/unexpired replay validation. Không có chứng cứ job bị tạo lại; false success đã được phân biệt rõ với mutation.

P117/P118/P96 mở rộng đềuPASS, gồm100valid retries và expired/late/foreign replay negatives; API1063PASS/2hostedSKIP/type-checkPASS. Schema373/373 nhưng hosted Edge vẫn SHA5696b2e, driftRED. Workplan381/381 nhưng6OPEN. [Bằng chứng và sai khác test contract](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-candidate-cancellation-authority-và-stale-proposal-receipt).

**GoalACTIVE; Staging SQL proof only.** Next: public Worker proposal HTTP/reconcile, atomic candidate decision side effects, source-bound hosted E2E và full Production gates. Chưa publication, chưa Production mutation; native/real-account/supply/physical push còn thiếu.

## Cập nhật 2026-09-06: durable Customer candidate rejection

P119 đã tái hiện job broadcasting nhưng proposal proposed, offer accepted, capacity offered và confirmation/matching candidate_ready sau Customer reject. Migration15000 apply Staging đóng proposal/offer/capacity, fence old lease, ghi event/inbox cùng transaction và dùng existing durable continuation khi đủ supply; thiếu supply hoặc chưa có fallback consent giữ no_reachable_worker trung thực.100replays không duplicate; Worker mới nhận/đề xuất thành công; stale rejection không ảnh hưởng candidate mới. Saved preference/expiry negative cases PASS.

P120 HTTP chứng minh hậu xử lý Edge cũ còn mutate notification/proposal và gọi synchronous retry; đã bỏ các bước đó khỏi rejection. Malformed replay status từng bị coercion thành200; nay503/unknown-outcome với support trace. Final API1075PASS/2hostedSKIP, SQL P119+P117/P118/P96/P103/P112/P100 không lỗi; type-check/structure/access/capability/privileged gatesPASS. [Bằng chứng và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-durable-customer-candidate-rejection).

Schema374/374,384/384changed-file accounting nhưng6OPEN. Hosted Staging Edge vẫn SHA5696b2e: **BUILT_NOT_DEPLOYED** cho Edge mới, không phải hosted E2E/Production proof. Legacy recovery chưa có fixture riêng; candidate confirm/expiry side effects, current-source deployment, native/physical push, real accounts/supply và Production gates vẫn mở. Không publication hoặc Production mutation. **GoalACTIVE.**

## Cập nhật 2026-09-06: candidate expiry/withdrawal durable projection

Migration16000–19000 đã apply và xác minh Staging: exact candidate/proposal identity trước RFQ confirmation; server expiry dùng chung cho GET và late confirm; unavailable candidate retires capacity/offer; outbox/operation/audit cùng transaction. Offer khác còn hạn được giữ, exhausted round đóng trung thực và explicit Customer retry vẫn hoạt động. P121/P96 RED→GREEN;100expiry +100retry replays không duplicate.

P97 HTTP22PASS: không synchronous matching hoặc post-command DML trên GET expiry/refused confirmation, malformed/uncertain outcome recoverable. Full API1088PASS/0FAIL/2hostedSKIP, type-check và quality gatesPASS. Schema378/378,6current SQL bodies khớp hosted source;390/390file accounting nhưng6OPEN. [Commands, SQL/HTTP evidence, hashes và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-06-candidate-identity-expiry-và-withdrawal).

**GoalACTIVE; Edge BUILT_NOT_DEPLOYED.** Fresh hosted Staging Edge vẫnSHA5696b2e, driftRED. Successful official-match event/notification/brief còn post-processing; legacy recovery, exact-source hosted E2E, native/physical push, real accounts/supply và full Production proof chưa hoàn tất. Không publication/Production mutation, không thay đổi dữ liệu thật hay xóa file.

## Cập nhật 2026-09-08: official-match audit/inbox atomic và receipt recovery

Migration08010000 đã apply Staging, chốt audit Customer + inbox hai bên cùng official assignment; fence outbox/retire offer khác/release capacity. P122 RFQ+inspection100replays, old-Edge effect dedup và participant/foreign-customer RLS PASS; P96 auto-quote và P121/P119/P100/P117/P118 regression PASS. HTTP P123 đã tái hiện receipt sai vẫn200/unknown outcome trả500 hoặc404; sửa typed exact receipt thành503/reconcile_required, bad price409 riêng, giữ capacity409 và transition guard thực.

Final API1106PASS/0FAIL/2hostedSKIP (74files), type-checkAPI và narrow gatesPASS. Schema379/379,5SQLbodies khớp;393/393file accounting nhưng6OPEN. [Bằng chứng, hash, fixture corrections và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-official-match-commit-và-receipt-recovery).

**GoalACTIVE; không Production-ready.** Current hosted Staging release9685feba khác candidate468c7fdc, deployment-driftRED. Brief/push hậu xử lý và Mobile relaunch cần đóng; exact-source E2E, effective Admin audit-mutation grants, CI, native, real accounts/supply và Production proof vẫn mở. Không commit/push/merge/Production mutation hoặc xóa file.

## Cập nhật 2026-09-08: push dispatch, brief recovery và access projection

Migration08011000 trên Staging thêm push intent/lease vào existing notifications; P124 SQL và P125/P126 runtime fixtures chứng minh role/source/cohort/lease fencing, unknown-outcome recovery và maintainer không bỏ rơi push khi matching lỗi. Maintainer environment resolver được sửa sau actual-handler RED. Provider submitted không phải device delivered; Edge này chưa deploy. [Evidence push](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-official-match-push-bền-vững).

P127 tiếp tục tái hiện missing/stale guidance và old-worker/cancelled unit disclosure. Read-time brief projection thống nhất Worker list/detail/assistant loader; frozen commission, RFQ unpriced, current-worker access và Customer isolation. Bỏ post-confirm brief write. P127+P12333PASS sau mutation RED→restore; full API1146PASS/0FAIL/2hostedSKIP, API type-check và narrow quality gatesPASS. Staging380migrations/179resolvableRPCs,10dynamic sites ngoài scanner. [Evidence brief và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-worker-brief-recovery-và-quyền-địa-chỉ).

**BUILT_NOT_DEPLOYED / GoalACTIVE.**406files accounted nhưng6OPEN. New lead cần chốt: apartment-access authorization còn snapshot→unfenced UPDATE race và early already-authorized receipt; không coi read-projection fix là toàn bộ authorization đã atomic. Mobile candidate receipt/relaunch, exact-source hosted suite, physical native, credentials/supply và Production proof chưa xong. Không publication, không Production mutation, không xóa file.

## Cập nhật 2026-09-08: Customer apartment authorization atomic

P128 HTTP tái hiện Admin/unbound request được grant; chuyển sang Customer-only intent theo Worker + check-in, atomic RPC và validated receipt. P129 Staging chứng minh replay100lần không duplicate audit/inbox, stale intent và reassignment không kế thừa quyền; P130 fault injection chứng minh inbox lỗi rollback grant/audit. Mutation bỏ binding/nuốt inbox đều RED; rollback xác minh RPC hash không đổi,381migrations,0fixture/probe residue. P122/P96 regression PASS. [Bằng chứng và hash](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-quyền-vào-căn-hộ-atomic-và-receipt-đối-soát).

Final API1166PASS/0FAIL/2hostedSKIP, API/shared type-check và shared115testsPASS; narrow quality gatesPASS.410files accounted,6OPEN.180resolvableRPCs hiện diện;10dynamic sites ngoài scanner. Hosted Staging vẫn khác candidate, driftRED.

**BUILT_NOT_DEPLOYED / GoalACTIVE.** Mobile còn phải gửi/persist intent và reconcile receipt theo actor khi relaunch; old-binary compatibility phải chứng minh trước promotion. Không đưa migration guard một mình lên Production khi mobile/Edge còn dùng legacy command. Native, exact-source public E2E, real accounts/supply, CI và Production proof vẫn mở. Không xóa file, không commit/push/merge/Production mutation.

### Mobile apartment consent và recovery — 2026-09-08

Đã nối Customer action, captured token, journal trước POST, exact Worker/visit receipt và foreground/relaunch reconcile. UI khóa outcome unknown, không dùng callback/render/flight của phiên hoặc lượt cũ để thay consent. Journal bounded20, không evict pending, chặn stale storage writes. Snapshot receipt phải khớp job/Worker/visit và release flags; một POST receipt không đủ để báo current access khi read mâu thuẫn. Không client DB writes hoặc server subsystem song song.

P131/P13226cases PASS, có RED thực cho bodyless transport, retired account callback, stale render, contradictory follow-up read và cross-visit flight join. Final mobile180suites/1771PASS/0FAIL/0SKIP; shared125PASS; API1166PASS/2hostedSKIP; cả3type-check PASS. React Doctor40changedfiles/0issue. [Evidence, hashes và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-mobile-xác-nhận-vào-căn-hộ-và-phục-hồi-theo-tài-khoản).

**BUILT_NOT_DEPLOYED**, không thay cho native/Production proof. Workplan418/418,6OPEN. Next verified source gap: `use-worker-candidate-actions` chưa có captured token/persisted decision/session fence; Edge đã có atomic confirm/reject nhưng latest-candidate GET không thể chứng minh một reject cũ. Cần receipt theo candidate và mobile recovery trước release. Giữ old-binary/exact-source rollout gate, real supply/accounts và physical proof mở; không Production mutation hoặc publication.

## Quyết định đúng ứng viên và điều kiện giá bất biến

Đã thêm marker quyết định từ audit trong cùng transaction, khóa identity/terminal decision/RFQ terms và khóa cả price slot null. Hai migration13000/14000 được áp dụng riêng Staging; Production không đổi. GET exact candidate decision đã wire qua HTTP/domain/contracts/capability; không phụ thuộc latest candidate hoặc Worker profile, không nhầm cancellation/expiry với explicit rejection.

P133/P135 SQL Staging PASS với fault rollback, RLS,100sequential rejection replays và price receipt hợp lệ; P96/P122 regressions PASS. P13419HTTPcases PASS; mutation bỏ exact-ID check làm2case RED rồi restore GREEN. Full API1186PASS/2hostedSKIP (79files), shared125PASS, API/shared type-check PASS. [Lệnh, hashes, audit và giới hạn](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-bằng-chứng-quyết-định-đúng-ứng-viên).

**BUILT_NOT_DEPLOYED** cho Production. Staging DB383 migrations nhưng hosted Edge vẫn Git9685feba/release cũ: drift RED, không coi schema deploy là endpoint hosted proof. Mobile journal/session fence/reconcile chọn-từ chối thợ chưa nối. Workplan424/424,6OPEN; Docker/Deno/native/real-user/CI/Production gates vẫn mở. Không commit/push/merge; GoalACTIVE.

## Mobile quyết định ứng viên và recovery — 2026-09-08

Đã nối existing candidate hook/provider/service với captured token, journal trước POST và exact-candidate receipt. Không dùng latest-candidate-null hay POST success để suy kết quả. Historical decision chỉ giải quyết consent cũ; current job phải được đọc/validate lại trước hydrate. Journal không đổi intent hoặc evict pending; session/view/flight guards chặn stale actor, old candidate, double/opposite press và favorite race.

UI VI/EN cho phép kiểm tra lại trạng thái khi chọn/từ chối đang khóa; poll bounded20, hết lượt thì yêu cầu recovery trung thực, không spinner hồ sơ giả. Test đã tái hiện missing retry, infinite-reconciling copy, exhausted-context recovery, immediate favorite race và mutable local consent; actual session-fence mutation RED rồi restore. [Commands, test matrix và trạng thái verification](../test-logs/2026-09-05_production-transaction-readiness.md#tiếp-tục-2026-09-08-mobile-quyết-định-ứng-viên-và-đối-soát-bền-vững).

**Implementation còn mở:** final mobile suite phải chạy lại sau sửa cuối; một full run có Worker chat timeout, không được tính xanh. Type-check, Doctor0issues và narrow quality gates đã PASS theo evidence.427files/6OPEN. Không có native physical, exact-source hosted E2E hoặc Production proof mới; API/shared/SQL không rerun trong lượt mobile này. Không publish/Production mutation. GoalACTIVE.

Checkpoint tiếp: full run đầu1799PASS/1timeout đã terminal; rerun cả Worker home + candidate30cases + transport3cases:169PASS, không nới test. Final type-check/Doctor0issues/quality gates PASS; full final rerun đang chạy, chưa được tính xanh. Manifest Staging local đã gắn source hash hiện tại nhưng provider readiness chỉ là local defaults, chưa registration/deploy/native build; không dùng làm hosted proof.

Checkpoint đã xác minh sau interruption: final mobile report181suites/1802tests PASS,0fail/skip; P136 đủ30cases. Report SHA và giới hạn mất terminal handle được ghi trong test log, không còn gọi run này đang chạy. EAS CLI đã khôi phục login qua official browser flow và xác minh đúng project NestScout; workflow qua official schema với Ajv union-type support. Native/hosted/Production vẫn chưa được chứng minh. Preview inventory chưa thấy credential Maestro; archive thực tế đang được kiểm tra vì ignore rules có thể loại source mà identity job cần. Không Production mutation, commit/push/merge; Goal ACTIVE.

EAS archive gap đã sửa và có RED/GREEN:1402tracked source inputs trước đó bị loại; sau sửa `.easignore`, actual archive và source snapshot khớp full-source/mobile/Edge/policy hash.11release/receipt/binding checks PASS. Full Maestro workflow bị Expo từ chối vì paid plan; Preview cũng thiếu normal-account credentials/FCM file. Giữ canonical test gate; không mua gói hoặc giả credential. Candidate chỉ được đăng ký ledger Staging, chưa deploy/promotion; diagnostic build-only run`01a08162-6e4d-7d84-8fe1-004493b85c6a` đã được EAS tạo, chưa được dùng như account/full transaction proof. [Evidence và giới hạn snapshot](../test-logs/2026-09-05_production-transaction-readiness.md#eas-source-archive-và-giới-hạn-native-runner).

Read-only refresh2026-09-08: EAS UI xác nhận diagnostic vẫn chờ Free Tier worker, chưa chạy script; queue estimate không phải deadline. Production app vẫn degraded/unreleased;294hosted migrations so với376canonical source migrations,82canonical còn thiếu. Staging383rows lại có cảhaiID trong7alias groups; strict history verifier thực sự RED, không được coi count match là release parity PASS. iOS44EASmetadata không có runtime; Android4runtime0.2.0 nhưng artifact đã expired. Không tạo compatibility receipt bằng suy luận, không xóa/sửa migration ledger. [Bằng chứng và các lần sửa input/projection của audit](../test-logs/2026-09-05_production-transaction-readiness.md#đối-chiếu-hàng-đợi-eas-compatibility-và-production-chỉ-đọc).
