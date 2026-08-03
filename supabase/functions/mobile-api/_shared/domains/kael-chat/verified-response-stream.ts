const VERIFIED_RESPONSE_MAX_DELTAS = 72;
const VERIFIED_RESPONSE_MAX_BLOCKS = 32;
const VERIFIED_RESPONSE_MIN_DELTA_CHARS = 3;
const VERIFIED_RESPONSE_WORD_CADENCE_MS = 88;
const VERIFIED_RESPONSE_CLAUSE_CADENCE_MS = 150;
const VERIFIED_RESPONSE_SENTENCE_CADENCE_MS = 260;
const VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS = 360;

export type VerifiedResponseBlockKind =
  | "paragraph"
  | "heading"
  | "list"
  | "callout";

export type VerifiedResponseBlock = {
  kind: VerifiedResponseBlockKind;
  separatorAfter: string;
  text: string;
};

export function splitVerifiedResponseBlocks(
  text: string,
): VerifiedResponseBlock[] {
  const normalized = text.replace(/\r\n/gu, "\n");
  const sections = normalized.split(/(\n{2,})/u);
  const blocks: VerifiedResponseBlock[] = [];

  for (let index = 0; index < sections.length; index += 2) {
    const section = sections[index];
    const separatorAfter = sections[index + 1] ?? "";
    if (!section || section.trim().length === 0) {
      if (blocks.length > 0) {
        blocks[blocks.length - 1].separatorAfter += separatorAfter;
      }
      continue;
    }
    blocks.push({
      kind: verifiedResponseBlockKind(section),
      separatorAfter,
      text: section,
    });
  }

  return capVerifiedResponseBlocks(blocks);
}
export function verifiedResponseTargetChars(text: string) {
  return Math.max(
    VERIFIED_RESPONSE_MIN_DELTA_CHARS,
    Math.ceil(text.length / VERIFIED_RESPONSE_MAX_DELTAS),
  );
}

export function splitVerifiedResponseDeltas(
  text: string,
  minimumTargetChars = VERIFIED_RESPONSE_MIN_DELTA_CHARS,
) {
  if (!text) return [];
  const segments = text.match(/\S+\s*|\s+/gu) ?? [text];
  const targetChars = Math.max(
    minimumTargetChars,
    verifiedResponseTargetChars(text),
  );
  const deltas: string[] = [];
  let current = "";

  for (const segment of segments) {
    if (current && current.length + segment.length > targetChars) {
      deltas.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) deltas.push(current);

  while (deltas.length > VERIFIED_RESPONSE_MAX_DELTAS) {
    const tail = deltas.pop() ?? "";
    deltas[deltas.length - 1] = `${deltas[deltas.length - 1] ?? ""}${tail}`;
  }
  return deltas;
}

function capVerifiedResponseBlocks(blocks: VerifiedResponseBlock[]) {
  if (blocks.length <= VERIFIED_RESPONSE_MAX_BLOCKS) return blocks;
  const retained = blocks.slice(0, VERIFIED_RESPONSE_MAX_BLOCKS - 1);
  const overflowText = blocks
    .slice(VERIFIED_RESPONSE_MAX_BLOCKS - 1)
    .map((block) => `${block.text}${block.separatorAfter}`)
    .join("");
  retained.push({ kind: "paragraph", separatorAfter: "", text: overflowText });
  return retained;
}

export function verifiedResponseCadenceMs(delta: string) {
  const trimmed = delta.trimEnd();
  if (delta.includes("\n")) return VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS;
  if (/[.!?\u2026]["')\]\u2019\u201d]*$/u.test(trimmed)) {
    return VERIFIED_RESPONSE_SENTENCE_CADENCE_MS;
  }
  if (/[,;:]["')\]\u2019\u201d]*$/u.test(trimmed)) {
    return VERIFIED_RESPONSE_CLAUSE_CADENCE_MS;
  }
  return VERIFIED_RESPONSE_WORD_CADENCE_MS;
}

function verifiedResponseBlockKind(section: string): VerifiedResponseBlockKind {
  const lines = section.split("\n").filter((line) => line.trim().length > 0);
  if (
    lines.length > 0 && lines.every((line) => /^\s*#{1,3}\s+\S/u.test(line))
  ) return "heading";
  if (
    lines.length > 0 &&
    lines.every((line) => /^\s*(?:[-*\u2022]|\d+[.)])\s+\S/u.test(line))
  ) return "list";
  if (lines.length > 0 && lines.every((line) => /^\s*>\s*\S/u.test(line))) {
    return "callout";
  }
  return "paragraph";
}

export function sleepForKaelChatStream(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function emitCommittedKaelReply(
  baseline: unknown,
  result: unknown,
  emit: (event: string, data: unknown) => void,
  isStopped: () => boolean,
) {
  const reply = findCommittedKaelReply(baseline, result);
  if (!reply) return;
  const startedAt = Date.now();
  const blocks = splitVerifiedResponseBlocks(reply.text);
  const targetChars = verifiedResponseTargetChars(reply.text);
  emit("response.started", {
    response_id: reply.turnId,
    mode: "standard",
  });
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const blockId = `${reply.turnId}:block:${blockIndex}`;
    emit("block.started", {
      block_id: blockId,
      kind: block.kind,
    });
    const deltas = splitVerifiedResponseDeltas(block.text, targetChars);
    for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex += 1) {
      if (isStopped()) return;
      emit("block.text.delta", {
        block_id: blockId,
        delta: deltas[deltaIndex],
      });
      // Keep released clients compatible while new clients suppress this twin
      // after observing response.started for the same turn.
      emit("response_delta", {
        turn_id: reply.turnId,
        delta: deltas[deltaIndex],
      });
      if (deltaIndex < deltas.length - 1) {
        await sleepForKaelChatStream(
          verifiedResponseCadenceMs(deltas[deltaIndex]),
        );
      }
    }
    emit("block.completed", { block_id: blockId });
    if (block.separatorAfter) {
      emit("response_delta", {
        turn_id: reply.turnId,
        delta: block.separatorAfter,
      });
    }
    if (blockIndex < blocks.length - 1) {
      await sleepForKaelChatStream(verifiedResponseCadenceMs("\n"));
    }
  }
  emit("response.completed", {
    response_id: reply.turnId,
    elapsed_ms: Date.now() - startedAt,
  });
}

function findCommittedKaelReply(baseline: unknown, result: unknown) {
  const existingIds = new Set(responseTurns(baseline).map((turn) => turn.id));
  const turns = responseTurns(result);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (
      turn.role === "kael" &&
      !existingIds.has(turn.id) &&
      turn.text_content.trim().length > 0
    ) {
      return { turnId: turn.id, text: turn.text_content };
    }
  }
  return null;
}

function responseTurns(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const turns = (value as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) return [];
  return turns.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as {
      id?: unknown;
      role?: unknown;
      text_content?: unknown;
    };
    return typeof candidate.id === "string" &&
        typeof candidate.role === "string" &&
        typeof candidate.text_content === "string"
      ? [{
        id: candidate.id,
        role: candidate.role,
        text_content: candidate.text_content,
      }]
      : [];
  });
}
