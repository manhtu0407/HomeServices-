# H5 standard evaluation - itemised result (candidate)

Fresh probes are newly written and scored once; development rows are previously used data. Rates are descriptive of these rows only.

## Rates

| group | n | hazard | TP | FN | non-hazard | FP | recall (Wilson 95%) |
|---|---|---|---|---|---|---|---|
| development:clear | 267 | 154 | 154 | 0 | 113 | 0 | 100.0% [98-100] |
| development:pinned-contestable | 31 | 25 | 3 | 22 | 6 | 0 | 12.0% [4-30] |
| fresh:ALL | 92 | 57 | 42 | 15 | 35 | 2 | 73.7% [61-83] |
| fresh:positive-vi | 20 | 20 | 16 | 4 | 0 | 0 | 80.0% [58-92] |
| fresh:positive-en | 10 | 10 | 9 | 1 | 0 | 0 | 90.0% [60-98] |
| fresh:positive-no-diacritics | 10 | 10 | 5 | 5 | 0 | 0 | 50.0% [24-76] |
| fresh:negation | 10 | 0 | 0 | 0 | 10 | 1 | - |
| fresh:completed-incident | 8 | 0 | 0 | 0 | 8 | 0 | - |
| fresh:prevention-product | 10 | 0 | 0 | 0 | 10 | 1 | - |
| fresh:prevention-word-real-hazard | 6 | 6 | 2 | 4 | 0 | 0 | 33.3% [10-70] |
| fresh:multi-clause-mixed | 12 | 11 | 10 | 1 | 1 | 0 | 90.9% [62-98] |
| fresh:routine-near-miss | 6 | 0 | 0 | 0 | 6 | 0 | - |

Pinned contestable rows (31) are phrasings P410 pins to today's behaviour; they are listed for completeness and never counted in a rate.

## Parity, guidance and time

- classifier_route_differs: 0
- handler_route_differs: 0
- handler_numbers_dropped: 0
- handler_missing_guidance: 0
- handler_not_2xx: 0
- handler runs (flags off / on): {"n":390,"positives":236,"negatives":154,"TP":199,"FN":37,"WRONG_ROUTE":0,"FP":2,"TN":152} / {"n":390,"positives":236,"negatives":154,"TP":199,"FN":37,"WRONG_ROUTE":0,"FP":2,"TN":152}
- max classifier ms on normal rows: 62.88; max handler ms: 127.7
- inputs of pathological shape: 5000 chars 7.9 ms; 36400 chars 203.2 ms; 5000 chars 8 ms; 60000 chars 438.5 ms; 5000 chars 6.5 ms; 60000 chars 421.2 ms; 5000 chars 7.1 ms; 72000 chars 598.6 ms; 5000 chars 9.4 ms; 49500 chars 292.4 ms

## Same rows on main (42daced1), for context

- fresh probes: main TP 40/57, FP 2; candidate TP 42/57, FP 2
- handler with flags on: main 14 route differences and 10 rows that drop a number; candidate 0 and 0

## Misses on the fresh probes

| id | class | verdict | expected | classifier | text |
|---|---|---|---|---|---|
| P-006 | positive-vi | FN | fire | none | Máy lạnh phát nổ rồi, khói đen mù mịt |
| P-010 | positive-vi | FN | fire/electrical_water | none | Dây điện trong tường nóng chảy, mùi khét nồng cả phòng |
| P-011 | positive-vi | FN | electrical_water/medical | none | Bình nóng lạnh rò nước, chạm vào vòi bị giật tê tay |
| P-015 | positive-vi | FN | police | none | Có người cầm dao dọa tôi ngoài hành lang |
| P-028 | positive-en | FN | medical | none | The cleaner mixed bleach and ammonia and we are all coughing and dizzy |
| P-031 | positive-no-diacritics | FN | fire | none | nha em dang chay, khoi den day dac |
| P-032 | positive-no-diacritics | FN | fire/electrical_water | none | o cam bop bi chay xem den, co mui khet |
| P-034 | positive-no-diacritics | FN | medical | none | ba toi bi ngat, goi khong tinh |
| P-037 | positive-no-diacritics | FN | fire | none | may lanh no tung roi boc khoi |
| P-038 | positive-no-diacritics | FN | electrical_water/medical | none | binh nong lanh ro dien, cham vao bi giat |
| P-048 | negation | FP | none | medical | Nobody got shocked, I just want the breaker replaced |
| P-064 | prevention-product | FP | none | gas | Can you install a gas leak detector in the kitchen? |
| P-069 | prevention-word-real-hazard | FN | fire | none | Đầu báo khói trong nhà kêu inh ỏi vì khói đen đang bốc ra từ bếp |
| P-070 | prevention-word-real-hazard | FN | electrical_water/medical | none | Aptomat chống giật vừa nhảy mà em vẫn bị giật khi chạm vòi |
| P-073 | prevention-word-real-hazard | FN | fire | none | bao khoi keu lien tuc, bep dang boc lua |
| P-074 | prevention-word-real-hazard | FN | fire | none | Bình chữa cháy mini em dùng hết rồi mà lửa vẫn chưa tắt |
| P-084 | multi-clause-mixed | FN | electrical_water | none | Water leak under the sink, and the extension cord on the floor is sparking in the puddle |
