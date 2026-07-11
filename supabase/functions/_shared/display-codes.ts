export function buildJobDisplayCode(input: {
  readonly jobId: string;
  readonly customerId?: string | null;
  readonly createdAt?: string | null;
}): string {
  const year = displayCodeYear(input.createdAt);
  const seed = `${input.jobId}:${input.customerId ?? ""}:${input.createdAt ?? ""}`;
  return `#MOH-${year}${displayCodeHash(seed, 4)}`;
}

export function buildWorkerDisplayCode(workerId: string): string {
  return `#CC${displayCodeHash(workerId, 4)}`;
}

function displayCodeYear(createdAt?: string | null): string {
  const parsed = createdAt ? new Date(createdAt) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return String(date.getUTCFullYear() % 100).padStart(2, "0");
}

function displayCodeHash(seed: string, length: number): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(length, "0").slice(-length);
}
