const root = process.argv[2];
const m = await import(`file:///${root}`);
const rows = [
 ["en","The socket has stopped sparking."],
 ["en","The outlet stopped sparking after the electrician fixed it."],
 ["en","The outlet no longer sparks."],
 ["en","The outlet ceased sparking yesterday."],
 ["en","The outlet is sparking right now."],
 ["en","The outlet kept sparking until I switched it off."],
 ["en","The outlet sparked earlier but it has stopped."],
 ["vi","Ổ cắm hết tia lửa rồi."],
 ["vi","Ổ cắm đã ngừng bắn tia lửa."],
 ["vi","Ổ cắm vừa bắn tia lửa."],
];
for (const [l,t] of rows) console.log(JSON.stringify(m.resolveReportedEmergencyGuidance(t,l,{serviceType:"electrical"})?.route ?? null), t);
