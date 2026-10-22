export function maskExplicitlyExcludedScopeForIntent(input: string): string {
  return input.replace(
    /(^|[^\p{L}\p{N}])(?:loại trừ|loai tru|không bao gồm|khong bao gom|không gồm|khong gom|excluding|excluded(?! scope\])|not included)[^.;\n]*?(?=[.;\n]|\b(?:but|however|instead|nhưng|nhung|tuy nhiên|tuy nhien)\b|\band (?:(?:now|please) ){0,2}(?:fix|repair|check|inspect|service|install|replace)\b|$)(?:[.;\n]|$)?/giu,
    "$1[excluded scope].",
  );
}
