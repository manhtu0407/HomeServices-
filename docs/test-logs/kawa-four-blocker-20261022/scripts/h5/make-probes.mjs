import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const FIRE = ['fire'], EW = ['electrical_water'], MED = ['medical'], GAS = ['gas'], POL = ['police'], NONE = ['none']
const rows = []
const add = (cls, lang, expected, text) => rows.push({ id: `P-${String(rows.length + 1).padStart(3, '0')}`, class: cls, lang, expected, text })

for (const [e, t] of [
  [FIRE, 'Nhà em đang cháy ở bếp, lửa lan lên tủ rồi'],
  [MED, 'Có người ngất xỉu trong phòng tắm, gọi không tỉnh'],
  [GAS, 'Phòng em có mùi gas nồng nặc, hình như bình gas bị rò'],
  [FIRE, 'Ổ cắm cạnh giường bốc cháy, khói bay mù mịt'],
  [EW, 'Nước từ trần nhỏ xuống hộp công tắc, nghe tiếng xì xẹt'],
  [FIRE, 'Máy lạnh phát nổ rồi, khói đen mù mịt'],
  [POL, 'Có kẻ lạ cạy cửa căn hộ bên cạnh, tôi nghe rõ tiếng phá khóa'],
  [MED, 'Con tôi uống nhầm nước tẩy toilet, giờ nôn liên tục'],
  [['medical', 'electrical_water'], 'Thợ bị điện giật, ngã xuống không cử động'],
  [['fire', 'electrical_water'], 'Dây điện trong tường nóng chảy, mùi khét nồng cả phòng'],
  [['electrical_water', 'medical'], 'Bình nóng lạnh rò nước, chạm vào vòi bị giật tê tay'],
  [['fire', 'electrical_water'], 'Tủ điện tổng bốc khói trắng, cầu dao nhảy liên tục'],
  [FIRE, 'Bếp ga bùng lửa lớn, em không dập được'],
  [['gas', 'medical'], 'Em ngửi thấy mùi gas ở bếp từ sáng giờ thấy chóng mặt'],
  [POL, 'Có người cầm dao dọa tôi ngoài hành lang'],
  [MED, 'Mẹ tôi khó thở, môi tím tái sau khi hít hóa chất tẩy'],
  [EW, 'Ống nước vỡ, nước tràn vào ổ điện sàn nhà, đèn nháy lung tung'],
  [FIRE, 'Lửa đang cháy ở ban công tầng dưới, khói bốc lên phòng em'],
  [FIRE, 'Máy giặt đang bốc khói và có mùi cháy khét'],
  [GAS, 'Bình gas rò, nghe tiếng xì xì ngay chân bếp'],
]) add('positive-vi', 'vi', e, t)

for (const [e, t] of [
  [FIRE, 'There is a fire in my kitchen and it is spreading'],
  [GAS, 'I can smell gas strongly in the hallway'],
  [MED, 'My husband collapsed and is not breathing'],
  [EW, 'Water is dripping onto the electrical panel and it is buzzing'],
  [POL, 'Someone is trying to break into my apartment right now'],
  [['fire', 'electrical_water'], 'The outlet is smoking and smells like burning plastic'],
  [FIRE, 'The AC unit caught fire'],
  [MED, 'The cleaner mixed bleach and ammonia and we are all coughing and dizzy'],
  [['electrical_water', 'medical'], 'I got an electric shock from the faucet'],
  [['fire', 'electrical_water'], 'The wire inside the wall is melting and sparks are flying'],
]) add('positive-en', 'en', e, t)

for (const [e, t] of [
  [FIRE, 'nha em dang chay, khoi den day dac'],
  [['fire', 'electrical_water'], 'o cam bop bi chay xem den, co mui khet'],
  [GAS, 'co mui gas nong nac trong bep'],
  [MED, 'ba toi bi ngat, goi khong tinh'],
  [EW, 'nuoc tran vao tu dien, nghe tieng xet xet'],
  [POL, 'co trom dot nhap vao nha, toi dang nup trong phong'],
  [FIRE, 'may lanh no tung roi boc khoi'],
  [['electrical_water', 'medical'], 'binh nong lanh ro dien, cham vao bi giat'],
  [GAS, 'tieng xi xi tu binh gas, ngui thay mui gas'],
  [MED, 'be nho nuot nham thuoc tay, non ra'],
]) add('positive-no-diacritics', 'vi', e, t)

for (const [lang, t] of [
  ['vi', 'Không có khói hay mùi khét gì, chỉ cần kiểm tra ổ cắm định kỳ'],
  ['vi', 'Không bị rò gas, chỉ muốn thay ống dẫn bếp ga'],
  ['vi', 'Nhà không cháy, mình chỉ hỏi giá lắp báo khói'],
  ['vi', 'Chưa thấy tia lửa nào, nhưng ổ cắm hơi lỏng'],
  ['vi', 'Không ai bị thương, chỉ là bình nóng lạnh kêu to'],
  ['en', 'No smoke and no burning smell, just a flickering light'],
  ['en', 'There is no gas smell, I only want the stove serviced'],
  ['en', 'Nobody got shocked, I just want the breaker replaced'],
  ['vi', 'khong co khoi, khong co mui khet, chi can doi cong tac'],
  ['vi', 'khong bi giat dien, chi muon kiem tra day dien'],
]) add('negation', lang, NONE, t)

for (const [lang, t] of [
  ['vi', 'Hôm kia ổ cắm có tia lửa nhưng thợ đã sửa xong, giờ nhờ kiểm tra lại'],
  ['vi', 'Tuần trước nhà em từng bị cháy bếp, giờ cần sơn lại tường'],
  ['vi', 'Vụ rò gas tháng trước đã xử lý xong, cần thay van mới'],
  ['en', 'Last week the outlet caught fire but it is fixed now, please inspect the wiring'],
  ['en', 'The smoke last night is gone, I just want the cause found'],
  ['vi', 'hom qua co mui khet nhung da het, nho tho kiem tra'],
  ['vi', 'Mẹ tôi từng ngất tháng trước nhưng đã khỏe, giờ cần lắp tay vịn nhà tắm'],
  ['vi', 'Sự cố chập điện năm ngoái đã khắc phục, nay muốn nâng cấp tủ điện'],
]) add('completed-incident', lang, NONE, t)

for (const [lang, t] of [
  ['vi', 'Mình muốn lắp ổ cắm chống cháy nổ cho phòng bếp'],
  ['vi', 'Nhờ lắp đầu báo khói và bình chữa cháy mini'],
  ['vi', 'Cần thay aptomat chống giật cho phòng tắm'],
  ['vi', 'Lắp thiết bị báo rò gas cho bếp'],
  ['en', 'Please install a smoke detector and a fire extinguisher'],
  ['en', 'Can you install a gas leak detector in the kitchen?'],
  ['vi', 'lap bao khoi va binh chua chay cho can ho'],
  ['vi', 'Mình cần tư vấn thiết bị phòng cháy chữa cháy cho nhà'],
  ['vi', 'Ổ cắm có màn che chống giật cho trẻ em, lắp giúp mình'],
  ['vi', 'Chống thấm nhà tắm để nước không vào ổ điện'],
]) add('prevention-product', lang, NONE, t)

for (const [lang, e, t] of [
  ['vi', FIRE, 'Đầu báo khói trong nhà kêu inh ỏi vì khói đen đang bốc ra từ bếp'],
  ['vi', ['electrical_water', 'medical'], 'Aptomat chống giật vừa nhảy mà em vẫn bị giật khi chạm vòi'],
  ['vi', ['gas', 'medical'], 'Cảm biến gas báo động và em ngửi thấy mùi gas nồng'],
  ['en', FIRE, 'The smoke detector is screaming because the kitchen is on fire'],
  ['vi', FIRE, 'bao khoi keu lien tuc, bep dang boc lua'],
  ['vi', FIRE, 'Bình chữa cháy mini em dùng hết rồi mà lửa vẫn chưa tắt'],
]) add('prevention-word-real-hazard', lang, e, t)

for (const [lang, e, t] of [
  ['vi', ['fire', 'electrical_water'], 'Nhờ thợ sửa vòi nước, à mà ổ cắm gần đó đang bốc khói'],
  ['vi', GAS, 'Cần dọn nhà cuối tuần, nhưng sáng nay hình như có mùi gas ở bếp'],
  ['vi', MED, 'Không có cháy, nhưng bà tôi vừa ngất xỉu'],
  ['vi', FIRE, 'Mình cần thay bóng đèn. Tiện báo luôn là phòng bên cạnh đang cháy'],
  ['vi', ['fire', 'electrical_water'], 'Ổ cắm chập điện hôm qua đã sửa, nhưng bây giờ lại bốc khói'],
  ['en', ['electrical_water', 'fire'], 'Fix the faucet please. Also, there is sparking from the outlet next to it right now'],
  ['vi', FIRE, 'Ban đầu tưởng rò gas nhưng không phải, giờ thì có lửa bốc lên từ bếp'],
  ['vi', ['fire', 'electrical_water'], 'Không có người bị thương nhưng khói đang bốc ra từ tủ điện'],
  ['vi', FIRE, 'Vừa lắp báo khói xong thì nó kêu vì có khói thật từ ổ điện'],
  ['en', EW, 'Water leak under the sink, and the extension cord on the floor is sparking in the puddle'],
  ['vi', POL, 'Mình hỏi giá sơn tường. Còn chuyện này nữa: có kẻ lạ đang đập cửa nhà mình'],
  ['vi', NONE, 'Nghe nói nhà bên bị cháy hôm qua, nhà em ổn, chỉ cần kiểm tra dây điện'],
]) add('multi-clause-mixed', lang, e, t)

for (const [lang, t] of [
  ['vi', 'Bếp ga lửa yếu, nhờ thợ xem'],
  ['vi', 'Bình gas hết, nhờ giao bình mới'],
  ['vi', 'Quạt kêu to, có mùi nhựa mới'],
  ['vi', 'Máy giặt rung mạnh khi vắt'],
  ['en', 'Smoke stains on the ceiling from an old fire, need repainting'],
  ['vi', 'Mùi khét của đồ ăn cháy trong nồi, nhờ vệ sinh bếp'],
]) add('routine-near-miss', lang, NONE, t)

const json = JSON.stringify({ schema: 'nestscout.h5.fresh_probes.v1', written: '2026-10-22', note: 'newly written before any run; not copied from development-h1..h4 or sealed-h5; labels fixed before the first run', rows }, null, 1) + '\n'
writeFileSync('C:/ns-fix/h5/fresh-probes-20261022.json', json)
console.log(rows.length, 'rows;', createHash('sha256').update(json).digest('hex'))
const by = {}
for (const r of rows) by[r.class] = (by[r.class] ?? 0) + 1
console.log(JSON.stringify(by))
