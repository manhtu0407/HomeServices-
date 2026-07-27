<p align="center">
  <img src="docs/assets/nestscout-aurora-nest-logo.png" alt="NestScout AuroraNest logo" width="180" />
</p>

# NestScout

NestScout is a mobile app that helps **Ho Chi Minh City apartment residents** book home services they can actually trust: **electrical repair, plumbing repair, home cleaning/housekeeping, air conditioning and indoor air service, sofa/mattress/curtain/carpet care, and minor repair/installation**, at a fair, transparent price.

When something breaks at home, most people don't know what's actually wrong, what a fair price looks like, or which worker to trust. That's the gap bad actors exploit: an inflated quote here, a vague repair there, no way to prove what really happened if a dispute comes up. NestScout turns "call someone to fix it" from a leap of faith into a process with a clear price range, a verified worker, and evidence at every step.

## Who it's for

- **Customers**: apartment residents who want to know the price before they commit, get a worker they can trust, and have proof if something goes wrong.
- **Workers**: verified service providers who want clear jobs, fewer misunderstandings, and a transparent record that they did the work right.
- **Operators**: the small internal team that approves workers, watches job status, and steps in when a case needs a human.

## How it works

1. The customer describes the problem to **Kael**, NestScout's AI assistant, with text and photos.
2. Kael asks follow-up questions and estimates a fair price range against the local market.
3. A verified worker is matched and takes the job. The customer can track progress the whole way.
4. If the worker finds something different once on site, the scope change is explained and confirmed, not silently applied.
5. The job closes with evidence: photos, status history, and the chat log, not just a handshake.

Kael can propose and coordinate, but it doesn't have free rein. The decisions that actually matter (starting a search, changing scope, confirming completion, handling payment) are always checked by the backend before they take effect.

## How we plan to make money

The plan is a platform fee on successful jobs, earned by making the transaction safer and clearer for both sides, not by confusing anyone. Home repair and cleaning is recurring demand in a dense city. If NestScout earns real trust job after job, that trust compounds into something much bigger than any single booking. No fake workers, ratings, prices, or wait times, ever: what the app shows has to be real, or clearly marked as not available yet.

## Status

**Pre-revenue, Phase 0**: building toward the first real, honestly-verified transaction. Build history: [`docs/progress-log.md`](docs/progress-log.md).

## Read more

- The full plain-language explainer, covering the problem, the business model, and why this can become a large business: [`DOCUMENT.md`](DOCUMENT.md)
- How the engineering side operates (architecture, rules, how to run the code): [`CLAUDE.md`](CLAUDE.md)
