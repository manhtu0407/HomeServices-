export type KaelEvidencePreview = {
  evidence_index: number;
  evidence_kind: "photo" | "video_frame";
  url: string;
};

export type KaelEvidencePreviewCandidate = {
  evidenceIndex: number;
  evidenceKind: "photo" | "video_frame";
  ref: string;
};

type KaelEvidencePreviewInput = {
  kind?: unknown;
  model_eligible?: unknown;
  ref?: unknown;
};

export function kaelEvidencePreviewCandidates(
  evidence: readonly KaelEvidencePreviewInput[],
): KaelEvidencePreviewCandidate[] {
  const counters = { photo: 0, video_frame: 0 };
  return evidence.flatMap((item) => {
    if (
      (item.kind !== "photo" && item.kind !== "video_frame") ||
      item.model_eligible === false ||
      typeof item.ref !== "string" ||
      !item.ref.trim()
    ) return [];
    const evidenceKind = item.kind;
    const evidenceIndex = ++counters[evidenceKind];
    return [{ evidenceIndex, evidenceKind, ref: item.ref.trim() }];
  });
}

export function pairKaelEvidencePreviewUrls(
  candidates: readonly KaelEvidencePreviewCandidate[],
  urls: readonly string[],
): KaelEvidencePreview[] {
  if (candidates.length !== urls.length) return [];
  return candidates.map((candidate, index) => ({
    evidence_index: candidate.evidenceIndex,
    evidence_kind: candidate.evidenceKind,
    url: urls[index],
  }));
}
