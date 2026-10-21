# Emergency classifier: why unseen wording fails, and a bounded strategy

Evidence tier: T0 (deterministic rule classifier, synthetic text, no model, no device). The classifier files
(`emergency-guidance.ts`, `emergency-signal-text.ts`) are byte-identical to the pushed baseline `8a03e780`. Nothing in
this document was produced by changing the classifier, and no sealed phrase is copied here: rows are named by id and by
the kind of wording they use.

## 1. What the measurements say

| Set | Author | Rows scored | Detected and routed | False alarms | Independent? |
|---|---|---|---|---|---|
| Development sets H1–H4 | the implementation lineage, one set after each round of cue fixes | 156 emergencies, 113 ordinary | 155 of 156 (99.4 %, 95 % Wilson interval 96.5–99.9 %); the one miss is a disputed row typed without tone marks | 0 of 113 (upper bound 3.3 %; each row read with the service it names) | No: the cues were written to pass them |
| Sealed set H5, reproduction | the implementation lineage, written after the last fix | 29 emergencies, 30 ordinary | 11 of 29 (37.9 %, 95 % interval 22.7–56.0 %), 0 wrong routes | 1 of 30 (3.3 %, 95 % interval 0.6–16.7 %): an ordinary request about a prevention fitting read as a leak, because the prevention wording is listed in one word order only | No: the author is the implementer, and H5 stopped being unseen once it was run and read |
| Independent blind set | not written yet | NOT_RUN | NOT_RUN | NOT_RUN | Required before any recall claim |

The first-run H5 metrics from the re-audit were never recorded (the auditor's log is a run that skipped the set), so
37.9 % is a reproduction by the implementer, not an independent measurement. **No independent measurement of recall on
unseen wording exists.** The gap between 99.4 % on the sets the cues were written against and 37.9 % on the one written
last is the finding.

Reading the intervals: the top of the H5 recall interval (56.0 %) is far below the proposed 0.90 lower bound, so if an
independent set reproduces anything like this result the classifier cannot be the only emergency control. The 140
sentinel cells (14 fixed phrases at 10 entry points, all passing) bound the miss rate of the **wired gate on those
phrases** below 2.7 % (95 % upper bound); they say nothing about other wording, and a gate that routes every sentinel
correctly is compatible with a classifier that misses most unseen reports. Unseen-wording recall and false alarms are
reported separately above and are never pooled with the sentinel result.

### Brittleness to small changes in spelling, measured on the development sets only

The same 156 development emergencies, each changed in one deterministic way (`classifier-perturbation.json`):

| Change | Detected and routed |
|---|---|
| none | 155 / 156 |
| typed without tone marks | 143 / 156 |
| upper case, trailing `!!!`, spoken filler before and after | 155 / 156 each |
| the longest word stretched (`cháyyy`) | 113 / 156 |
| one letter deleted from the longest word | 111 / 156 |
| two neighbouring letters swapped in the longest word | 113 / 156 |
| words in reverse order | 14 / 156 |
| typed with no spaces | 0 / 156 |

The longest word is often a cue word, so these are not all hazard-word typos; they show that the match is on exact
spellings in a fixed order. Panicked typing and speech-to-text output produce exactly these changes.

## 2. Why unseen phrasing fails

The 18 missed H5 emergencies fall into three groups (counts by id; the words are not reproduced):

| Group | Misses | What is going on |
|---|---|---|
| A. A hazard word is present but the sentence is not one of the enumerated frames | 9 (001, 002, 005, 017, 018, 019, 022, 026, 028) | The hazard word is there, but in a word order the cue does not list (a verb–noun pair reversed), with an intensifier the cue does not allow, with a synonym of a calling verb, or in an English sentence whose subject is a place rather than a device. Each cue is a short regular expression over a particular word order and a short allowance for filler words |
| B. A slot that cannot hold what a person writes | 1 (024) | A cue slot accepts letters only, so a quantity written with digits and a unit never matches |
| C. No hazard word at all | 8 (009, 011, 013, 014, 015, 016, 020, 029) | Urgent situations that name none of the words a list would hold (intrusion, ingestion, electrical exposure in a wet room, a medical event of pregnancy). The meaning is clear to a person; no word list contains it |

Four structural causes sit under those groups:

1. **The cue list is a closed enumeration of collocations.** About a hundred expressions, each added after a miss. The
   space of ways to report a fire, a fall or an intruder is open; every set of phrasings written by someone else will find
   gaps, and fixing the gaps found does not shrink the space.
2. **The author of the cues, the development sets and the sealed set is the same.** Every round followed the same
   pattern: write a set, find misses, add cues, write the next set. A rule set tuned this way overfits the author's
   vocabulary, which is why the score on the last set the author wrote (H5) is so far from the earlier ones.
3. **There is no recall-oriented step behind the precise one.** The precise rules decide; if they are silent the turn
   continues as an ordinary request. Only explicit uncertainty wording ever reaches the 112 prompt. A report that is plainly
   about danger but matches no frame gets no safety answer.
4. **Matching is on exact spelling and order** (section 1), so noise that is normal in an emergency defeats it.

## 3. Is a rule-only strategy fundamentally insufficient?

For what the rules are good at, no: they are deterministic, auditable, free, immune to a provider outage, and precise
(no false alarm on 113 ordinary development requests, each read with the service it names). They are the right floor.

As the only mechanism behind a recall claim on open wording, yes. The evidence does not point at a few more expressions to
add; it points at the method. More cues, tested on sets the same people write, will keep raising the development score and
will not make the unseen score knowable. Adding expressions to chase the 18 H5 misses would be tuning on a set that is no
longer a holdout and would produce a number with no meaning.

## 4. Options

| # | Option | What it buys | Cost and risk | Needs owner approval |
|---|---|---|---|---|
| A | Keep the rules, add cues, re-test on new sets written by the same people | Cheap, deterministic | Repeats the pattern that produced the gap; the next score is unknowable | No, but it should not be the plan |
| B | Deterministic fail-safe behind the rules: text that names a high-risk root (fire, smoke, gas, shock, collapse, intruder, weapon, poison) and is not cleared by the existing negation, past, hypothetical, prevention and maintenance guards gets the 112 prompt instead of silence | Raises recall for group A and part of group B without a model; no provider, no latency | More stops of ordinary requests; cannot reach group C at all (no hazard word); a change to protected safety behaviour | **Yes** (classifier behaviour, user-visible stops) |
| C | Second opinion from a model when the rules are silent and the text names a hazard root: strict JSON, can only add an emergency, never remove a deterministic one, fails open to the rules | The only option that reaches group C and paraphrase in general | Paid calls, latency, its own false negatives and false positives, a new dependency on provider availability for the improved part | **Yes** (paid-model fallback) |
| D | A fixed emergency affordance in the chat, independent of understanding: always-visible 112 / 113 / 114 / 115 control and a one-line first-use notice that Kael is not an emergency service | Covers every case the classifier misses, today, with no language model | A UI element and a copy decision; changes the flow | **Yes** (flow change) |
| E | Independent evaluation as a gate, not a one-off (`blind-evaluation-protocol.md`) | Makes any of the above measurable | Needs a reviewer and a corpus | Reviewer nomination and thresholds |

## 5. Recommended strategy (bounded)

1. **Now, no classifier change:** treat the classifier as best-effort assistance in all copy and review; do not claim
   emergency detection. Decide on D, which protects the customer whatever the classifier does.
2. **Before any further cue work:** commission the independent blind set (E). Until a reviewer-controlled result exists
   there is no basis for a recall claim, and no further cue should be added "because H5 missed it".
3. **Decide B and C on the result, not before:** if the independent lower bound is below the proposed thresholds,
   choose between B alone, B then C, or D alone for launch scope. Each of those is a separate approved change with its own
   fresh blind set; none is implemented here.
4. **Stop rule:** a poor independent result is a safety release blocker. It is not a reason to edit, reselect or reweight
   the data.

The proposed numeric thresholds in the harness (overall recall lower bound 0.90, per-route 0.80, false-positive upper
bound 0.05, at least 30 positives per route and 100 negatives) are a recommendation. They have no authority until the
owner approves them, and the report says so.

## 6. What this document does not claim

- It does not claim the classifier is reliable on wording nobody has tried.
- It does not claim options B or C would reach any particular recall; that can only be measured on an independent set.
- The group counts above are by one reader and use a fixed, broad hazard word list to separate group C; they describe
  causes and are not a score.
