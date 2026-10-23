const STOP_WORDS = new Set([
  "a",
  "as",
  "da",
  "de",
  "do",
  "e",
  "el",
  "es",
  "la",
  "las",
  "los",
  "o",
  "of",
  "su",
  "the",
  "to",
  "un",
  "una",
  "um",
  "uma",
  "your",
]);

export function normalizeLabel(value: string): string {
  const input = String(value ?? "");
  if (input.length === 0) {
    return "";
  }

  const withoutDiacritics = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const tokens = withoutDiacritics
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\b(?:required|obrigatorio|obrigatoria|obrigatorios|obrigatorias|optional|opcional|opcionais?)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));

  return tokens.join(" ");
}
