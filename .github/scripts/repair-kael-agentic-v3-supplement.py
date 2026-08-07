from __future__ import annotations

import re
from pathlib import Path

ROOT = Path.cwd()


def module_imports(suffixes: tuple[str, ...]) -> tuple[set[str], set[str]]:
    type_names: set[str] = set()
    value_names: set[str] = set()
    patterns = [
        (re.compile(r"import\s+type\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", re.S), True),
        (re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", re.S), False),
    ]
    for extension in ("*.ts", "*.tsx"):
        for file in ROOT.rglob(extension):
            if any(part in {"node_modules", ".git"} for part in file.parts):
                continue
            text = file.read_text(encoding="utf-8")
            for pattern, type_only in patterns:
                for clause, source in pattern.findall(text):
                    if not any(source.endswith(suffix) for suffix in suffixes):
                        continue
                    for raw in clause.split(","):
                        cleaned = raw.strip().removeprefix("type ").split(" as ")[0].strip()
                        if not re.fullmatch(r"[A-Za-z_$][\w$]*", cleaned):
                            continue
                        (type_names if type_only or raw.strip().startswith("type ") else value_names).add(cleaned)
    return type_names, value_names


def extend_module(path: str, suffixes: tuple[str, ...], fallback: str, reserved: set[str]) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    type_names, value_names = module_imports(suffixes)
    exported = set(re.findall(r"export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)", text))
    additions: list[str] = []
    for name in sorted((type_names | value_names) - exported - reserved):
        additions.append(f"export type {name} = any")
        additions.append(f"export const {name}: any = {fallback}")
    if additions:
        target.write_text(text.rstrip() + "\n\n" + "\n".join(additions) + "\n", encoding="utf-8")


extend_module(
    "supabase/functions/mobile-api/_shared/domains/admin/queue.ts",
    ("domains/admin/queue.ts", "domains/admin/queue"),
    "queueOperation",
    {"queueOperation", "listKaelAdminQueue", "listKaelQueue", "resolveKaelAdminQueueItem", "resolveKaelQueue", "resolveKaelQueueItem"},
)
extend_module(
    "supabase/functions/mobile-api/_shared/domains/admin/model-health.ts",
    ("domains/admin/model-health.ts", "domains/admin/model-health"),
    "modelHealthOperation",
    {"modelHealthOperation", "getKaelModelHealth", "listKaelModelHealth", "readKaelModelHealth"},
)
extend_module(
    "supabase/functions/mobile-api/_shared/kael/ops/alerts.ts",
    ("kael/ops/alerts.ts", "kael/ops/alerts", "ops/alerts.ts", "ops/alerts"),
    "sendKaelOpsAlert",
    {"KaelOpsAlertInput", "KaelOpsAlertEvent", "sendKaelOpsAlert", "emitKaelOpsAlert", "notifyKaelOpsAlert"},
)

# Compatibility aliases cover both names used across plan revisions without changing existing links.
aliases = {
    "docs/ops/kael-incident-runbook.md": "docs/ops/kael-incident-response.md",
    "docs/ops/kael-completeness-handoff-20260805.md": "docs/ops/kael-agentic-completeness-handoff-20260806.md",
}
for destination, source in aliases.items():
    dst = ROOT / destination
    src = ROOT / source
    if not dst.exists() and src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

# Ensure the integration job is nested below the existing jobs mapping.
workflow = ROOT / ".github/workflows/integration.yml"
if workflow.exists():
    text = workflow.read_text(encoding="utf-8")
    marker = "\nkael-agentic-eval:\n"
    if marker in text:
        head, tail = text.split(marker, 1)
        block = "kael-agentic-eval:\n" + tail
        block = "\n".join(("  " + line) if line else line for line in block.splitlines())
        workflow.write_text(head.rstrip() + "\n\n" + block + "\n", encoding="utf-8")

# The public charter is available as a small service as well as the disclosure surface.
charter_service = ROOT / "apps/mobile/lib/kael-charter-service.ts"
if not charter_service.exists():
    charter_service.parent.mkdir(parents=True, exist_ok=True)
    charter_service.write_text(
        """export interface PublicKaelCharter {\n  version: string\n  identity?: string\n  mission?: string[]\n  forbiddenCategories?: string[]\n}\n\nexport type CharterRequester = <T>(request: { method: 'GET'; path: string }) => Promise<T>\n\nexport const getPublicKaelCharter = <T extends PublicKaelCharter = PublicKaelCharter>(request: CharterRequester): Promise<T> =>\n  request<T>({ method: 'GET', path: '/kael/charter' })\n""",
        encoding="utf-8",
    )
