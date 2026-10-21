# KAWA01 source explanations moved from comments

The exact 167 standalone comment lines reported by latest-main governance are preserved here verbatim. No quality checker is changed. Before/after TypeScript AST token leaves and comment-free printed AST must match for every file.

## apps/mobile/components/customer/kael-chat/customer-kael-emergency-access.tsx

```text
L20: // This local sheet needs no request, classifier, phone permission or business-state change.
```

## packages/shared/src/contracts/emergency-guidance.ts

```text
L1: // Versioned route metadata carries no request text. Clients render only reviewed static copy.
```

## supabase/functions/_shared/contracts/emergency-guidance.ts

```text
L1: // Versioned route metadata carries no request text. Clients render only reviewed static copy.
```

## supabase/functions/mobile-api/_shared/domains/customer/assistant.ts

```text
L109:   // A reported emergency is answered once ownership is established and before the quota, the memory read and every
L110:   // provider call: the deterministic answer costs nothing, and a refusal in its place reaches the customer as generic copy.
L112:   // A Case in a closed job status takes no question, but a reported emergency is answered whatever the status is.
```

## supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-turn.ts

```text
L154:   // A reported emergency is answered from the message alone. The summary, the web search and an image check cost time or
L155:   // money or can refuse, and none of them may stand between the customer and the guidance, so a report that is or may be
L156:   // an emergency skips them and is recorded without images. Only a report that depends on the service ("possible") still
L157:   // reads the stored conversation, which is free and settles it.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts

```text
L87:       // Nothing here is a turn the Case takes, but a reported emergency in a voice transcript or note is still
L88:       // answered (after the ownership check) before the request is ignored or refused for its schedule.
L114:   // A new Case whose schedule is invalid is refused, unless the request reports an emergency: that is answered, as an
L115:   // ordinary reply, with the schedule dropped and the analysis deferred so nothing else of the request is applied.
L206:     // A Case opened with a voice transcript or a booking description and no typed message has no first turn to
L207:     // analyse, but what the customer said is still read for a reported emergency.
L234: // The schedule refusal of a new Case. A reported emergency in the request is answered in the same error, and nothing
L235: // is created: a Case is never opened or scheduled by a refused request.
L286:   // The message, the booking description and every reviewed transcript or note of the first request.
L293:     // The Case parks this first message (a booking confirmation waits for the customer, or analysis is
L294:     // deferred), so a reported emergency is answered now and the confirmation stays pending.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts

```text
L1: // Deterministic emergency handling for Case intake turns. It runs before the boundary guard, the
L2: // intent router and the pipeline, and it does not depend on a playbook flag or on a model.
L32:   // Fire, medical, police and unclear emergencies end the turn. A wiring or water hazard is advice
L33:   // the intake can continue after, so the Case still gets its next question.
L37: // Where in the Case the report was caught; it labels the trace and nothing else.
L41:   // One text, or every customer-authored text the request carries.
L47:   // The request cannot take the turn: its booking confirmation is pending, analysis is deferred, or the
L48:   // price-question chip persists nothing. No flagged path or pipeline step runs, so every reported route is
L49:   // answered here and ends the request.
L53: // Every text a customer wrote into one request, read once each in a fixed order. The gate, the safety signals a
L54: // Case persists and the text a model may see all start from this list, so a hazard cannot be reported in a field
L55: // that only one of them reads.
L82: // Classification for delivery is independent of which successful intake path would answer the danger.
L83: // Callers must first establish customer authorization and ownership of any referenced Case.
L92: // Schema failures never consume evidence or create state. Read bounded text only, and establish ownership
L93: // before classifying anything on an existing Case; all original validation errors stay unchanged.
L129:   // When a service's flagged path already answers a smoke, fire or wiring hazard with its own
L130:   // deterministic guidance, that reply is the only safety message; a second one would repeat it. The flagged path
L131:   // reads the safety signals of every text, so the check reads the same texts.
L153:   // Tracing is observability only: it must never be the reason a customer's emergency goes unanswered.
L172:   // The trace carries route and release codes only. It never gets an actor pseudonym: a stable id beside a fire,
L173:   // health or police code would profile one person.
L181: // What a request that cannot take the turn answers when its customer reported an emergency: the same error code and
L182: // status the contract already gives that refusal, with the deterministic guidance in front of its message. Nothing is
L183: // written, so a closed Case stays closed and an invalid schedule is applied nowhere. With no scope (the caller could
L184: // not establish who owns the Case) the refusal is the plain one, so guidance is never handed to someone else's request.
L215: // The Case when the caller owns it; null for a missing Case, someone else's Case or a failed read. A request already
L216: // bound for a refusal uses it so that looking the Case up never changes which refusal the caller gets.
L235: // A request that carries customer-authored text but no typed message (a create on an existing session) is not a turn
L236: // the Case takes, so nothing about it changes unless the text reports an emergency. Returns true when it was answered.
L237: // `soft` is for a request that is already bound for a refusal: a Case it cannot reach is then simply not answered.
L282: // A reported emergency on an open Case its caller owns, on a request the Case cannot take only because of an unrelated
L283: // field (an invalid schedule). The customer's words and one deterministic reply are recorded and the field is applied
L284: // nowhere, so the guidance arrives as an ordinary answer. A closed Case, or a request that reports nothing, returns false
L285: // and is refused exactly as before.
L313: // A classified emergency whose reply could not be written: the failure is traced (route, entry, gate version and
L314: // correlation only, never a word of the customer's text) and the error the caller already raises keeps its code and
L315: // status but carries the guidance, so the customer is not left with a bare failure while the Case may be in danger.
L350: // Answers a reported emergency on a request the Case cannot take: the customer's words and one deterministic
L351: // reply are recorded, and nothing else about the Case moves. Only the customer decides the booking, so a pending
L352: // confirmation is never touched, and no evidence is consumed or merged.
L353: //
L354: // A write that failed half-way leaves rows the session counter does not know about, and a concurrent duplicate
L355: // races for the same turn index. One bounded retry re-reads the table and finishes what is already there instead
L356: // of repeating it. This is a mitigation inside the existing tables: the guarantee that the exchange is written
L357: // atomically and exactly once needs a database function and is proposed separately.
L406:   // Turns a failed earlier attempt wrote after the last one the counter recorded.
L432:     // The reply never moves the Case: it keeps whatever phase and offer time it had.
L445: // A reply on a turn the Case has already taken: wiring or water advice the intake continues after, or an
L446: // emergency in a first message or booking description that has just been recorded.
L454:     // The session as it stood before this turn: the trace names its service and phase.
L456:     // A Case whose offer is under review stays under review after advice the turn continues from.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/evidence.ts

```text
L67:   // Submitting or skipping evidence is recorded as the customer's own turn, so only the customer can do it.
L100:     // A closed Case takes no evidence and is never written to, but its owner's reported emergency is still answered
L101:     // in the refusal.
L114:   // Every text the customer wrote is read before any validation, media consumption or phase change: a reported
L115:   // emergency is answered even when the same submission would otherwise be refused (a pending booking, or
L116:   // required evidence that cannot be skipped), and the Case keeps waiting exactly as it was.
L215:   // Wiring or water advice the submission continues after; any other emergency was answered before this point.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/intake-confirmation.service.ts

```text
L46:   // The decision is recorded as the customer's own words, so only the customer can make it; an admin may read the Case.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/intake-safety.ts

```text
L29: // The signals a request's customer-authored texts raise together with the ones already on the Case. Each text is
L30: // scanned on its own, so what one field says never changes how another is read.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/session-store.ts

```text
L136:     // The turn this reply follows, when the caller has just written it or found it in the table. Without it the
L137:     // reply follows the session's counter, which a write that failed half-way leaves behind the table.
L139:     // A reply that does not move the Case leaves the time its offer was made untouched.
```

## supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts

```text
L93:     // A reported emergency is not hidden behind that refusal. The owner of an open Case is answered as an ordinary
L94:     // reply that applies no schedule (a 4xx reaches the customer as generic copy); a closed Case keeps the refusal with
L95:     // the guidance in front of its message, and anyone else gets the plain refusal.
L140:     // A closed Case takes no message and is never written to, but its owner's reported emergency is still answered
L141:     // in the refusal.
L155:   // Every text the customer wrote (the message, a reviewed transcript or note, an evidence summary) is read
L156:   // before the Case does anything with the request: a reply, a refusal, a media consumption or a phase change.
L157:   // A turn the Case cannot take yet (its booking confirmation is pending, or the price-question chip persists
L158:   // nothing) still answers a reported emergency before it is refused or ignored; any other emergency that ends
L159:   // the turn is answered without touching evidence or the phase.
L186:   // What is left here is wiring or water advice, which the intake continues after.
```

## supabase/functions/mobile-api/_shared/domains/matching/accept.ts

```text
L16:   // Accepting an offer proposes the caller as the worker, so only a worker can do it.
```

## supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-answer.ts

```text
L74: // The emergency answer for a message, or null. It reads no database, calls no provider and takes no quota, so a
L75: // caller can place it ahead of everything that does.
L82: // What the message alone says, before the earlier conversation is read. "certain" is an emergency whatever the chat was
L83: // about, so nothing else is needed to answer it. "possible" depends on the service: a bare gas leak is refrigerant in an
L84: // air-conditioning chat, so only the stored conversation can settle it, but nothing paid is worth waiting for either way.
```

## supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-turn-context.ts

```text
L11: // The question every assistant check reads: scrubbed of PII, bounded, and never empty when only images were sent.
```

## supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance.ts

```text
L22: // The service the report was made in. "Gas" is the everyday word for HVAC refrigerant, so a bare
L23: // "xi gas" inside the HVAC service is a refrigerant request, not a fuel-gas leak.
L26: // Bumped whenever the cues or the routing rule change what a report is answered with, so a trace can say which
L27: // classifier produced a reply.
L37:   // Context in the same clause that makes the words ordinary (cooking, a candle, a cigarette).
L47: // Words a cue shares letters with: dầy/đầy/dây, ngập/ngáp, tràn/trấn, bốc/bóc, bùng/bụng, bắt/bát, rò/rõ, rỉ/rì,
L48: // nhỏ/nho, hở/họ/hồ, chảy/cháy. The rules apply to that cue only, so no other cue changes meaning.
L74: // A cue with a stretch of free words in it must not be vetoed by a tone rule meant for another cue: "máy giặt" is
L75: // not "giật" (shock), and "khói", "lửa" or "chảy" inside the stretch are not the cue's own words.
L99: // Patterns run on accent-free text; `tone` tells the matcher how strictly the tone marks must
L100: // agree, so "đang chạy" and "đang chảy" never read as "đang cháy".
L173: // Fuel gas (LPG, cooking gas) leaking is an emergency; refrigerant leaking is a service request, and
L174: // Vietnamese calls both "gas". The word alone never decides: a leaking stove, cylinder or pipe, a fuel-gas
L175: // word or a smell of gas reports fuel gas; a bare leak is ambiguous and the surrounding service decides.
L176: // Words a gas cue shares letters with: gà (chicken), họ (they), rõ (clear), dày (thick), ông (grandfather).
L219: // The line between a cylinder and a stove. In the air-conditioning service the same words name the refrigerant line,
L220: // so they say "fuel gas" only outside it.
L223: // Generic urgency says a request is pressing, not that anyone is in danger.
L233: // Fire-safety equipment and training talk names the words without reporting a fire.
L239: // Someone other than the speaker is the one affected: "not me, the person next to me", "not me but my child".
L244: // Words that say the smoke or fire itself has ended; "đã tắt aptomat" says only that a switch was turned off.
L288: // The Case-intake gate acts on a reported danger only; "urgent" alone is an ordinary priority.
L297: // A request carries several customer-authored texts (a message, a transcript, a note). Each is read on its own,
L298: // so a negation or a sentence stop in one never reaches the next, and the hazards found are then routed by the
L299: // same rule as hazards inside one text: the order and the boundaries between fields never change the answer.
L315: // What one text reports, before any rule combines it with other texts.
L346:   // Smoke with sparking or live wiring is one electrical hazard whose guidance already names 114, 115 and 112.
L347:   // Fuel gas with smoke, fire or sparking keeps the gas guidance, which already names 114 and forbids ignition.
L360: // A fuel-gas object or smell is an emergency; a bare leak is refrigerant unless the kitchen, the English
L361: // wording or the service says otherwise, and is asked about (112) only when nothing says which gas it is.
L381:   // "Ống gas máy lạnh" is the refrigerant line of an air conditioner. A refrigerant word inside the object phrase
L382:   // makes it one, and so does a bare pipe, hose or valve in the air-conditioning service; a refrigerant word merely
L383:   // nearby ("a gas cylinder beside the air conditioner is leaking") does not hide a fuel-gas object.
L386:     // The object phrase is the object, the gas word and up to two words after it; what lies between that and the
L387:     // leak word is free text and says nothing about which gas the object holds.
L398:   // In the air-conditioning service a smell named beside refrigerant words, with nothing from a kitchen in the
L399:   // sentence, is the refrigerant the customer is asking about, not an unclear fuel-gas report.
L411: // A negation word whose plain spelling is also another word: "nổ" (explodes) reads as the English "no", "hét"
L412: // (shouts) as "hết" (no more), "chữa" (to cure) as "chưa" (not yet). Only the accented twin can tell them apart, so
L413: // a plain word counts as a negation when the accented twin spells it unmarked or with its own marks.
L432: // Bleeding a radiator, brake line or valve is maintenance; a person bleeding is a medical emergency.
L452:     // A condition ends at its comma: "if that fails, the house is on fire" still reports a fire.
```

## supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-signal-text.ts

```text
L1: // Safety-cue text that keeps Vietnamese tone marks aligned with an accent-free twin. Matching runs
L2: // on the plain text so unaccented typing still works; tone marks decide the words the plain text
L3: // cannot tell apart (cháy / chạy / chảy, khói / khối / khởi, lửa / lừa).
L22: // A tone mark keeps a cue only when it spells the safety word; an unmarked spelling is accepted.
L38:       // A sentence stop typed after a space still ends the sentence.
L88: // Replaces every match with spaces in both twins so indices stay aligned.
L104: // Tone rules a single cue adds for words it shares letters with; they never apply to other cues.
L107: // `plainSlice` and `accentedSlice` cover the same cue match, so their tokens line up one to one.
L128: // True when the index sits inside a quotation that names text rather than reports an event,
L129: // such as: the screen shows the word "fire".
```

## supabase/functions/mobile-api/_shared/platform/emergency-guidance.ts

```text
L1: // Request-local safety metadata is registered only after customer authorization and Case ownership.
```

## supabase/functions/mobile-api/_shared/platform/turn-trace.ts

```text
L64: // Where in the Case a reported emergency was caught: the follow-up turn, the evidence submission, the first
L65: // message of a new Case, or the booking confirmation.
L207:   // Customer turns the gate looked at in the same window; null when the caller could not count them.
L212:   // Classified emergencies that were refused with the guidance in the error (nothing persisted), and ones whose
L213:   // reply could not be written. Neither is an answered turn, and neither is ever counted as one.
L218:   // emergency_turns / evaluated_turns; null, never 0, when there is no sample to divide by.
L222: // Counts the Case emergency answers among persisted reply traces. The denominator is supplied by the caller (the
L223: // customer turns of the same Case sessions in the same window) because every route that advances a Case passes the
L224: // gate, so a customer turn is a gate evaluation. A trace that is not a well-formed Case emergency trace is ignored.
L307:   // A stable pseudonym beside a health, fire or police emergency code would profile one person.
```
