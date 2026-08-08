// Retired: this process-memory limiter reset on every Edge cold start and had no
// production caller. Durable DB-backed chat guards and the spend reservation ledger
// are the only supported runtime controls. The file remains as a non-destructive
// tombstone so old imports fail during type-check instead of silently reactivating it.
export {};
