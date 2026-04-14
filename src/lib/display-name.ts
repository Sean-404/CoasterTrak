import { Filter } from "bad-words";

const MIN_DISPLAY_NAME_LENGTH = 3;
const MAX_DISPLAY_NAME_LENGTH = 24;

const profanityFilter = new Filter();

const LEET_SPEAK: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
  "8": "b",
};

function isAsciiLetterOrNumber(ch: string): boolean {
  const code = ch.charCodeAt(0);
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  const isDigit = code >= 48 && code <= 57;
  return isUpper || isLower || isDigit;
}

function isAllowedMiddleChar(ch: string): boolean {
  if (isAsciiLetterOrNumber(ch)) return true;
  return ch === " " || ch === "." || ch === "_" || ch === "-";
}

function normalizeWhitespace(raw: string): string {
  const trimmed = raw.trim();
  let out = "";
  let previousWasSpace = false;

  for (const ch of trimmed) {
    const isWhitespace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    if (isWhitespace) {
      if (!previousWasSpace) {
        out += " ";
      }
      previousWasSpace = true;
      continue;
    }

    out += ch;
    previousWasSpace = false;
  }

  return out;
}

function toModerationMapped(input: string): string {
  let mapped = "";
  for (const rawCh of input.toLowerCase()) {
    mapped += LEET_SPEAK[rawCh] ?? rawCh;
  }
  return mapped;
}

function toCompactAlnum(input: string): string {
  let compact = "";
  let previous = "";

  for (const ch of input) {
    if (!isAsciiLetterOrNumber(ch)) continue;
    if (ch === previous) continue;
    compact += ch;
    previous = ch;
  }

  return compact;
}

function tokenizeAlnum(input: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const ch of input) {
    if (isAsciiLetterOrNumber(ch)) {
      current += ch;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = "";
    }
  }

  if (current) tokens.push(current);
  return tokens;
}

function hasProfanity(input: string): boolean {
  const mapped = toModerationMapped(input);
  const tokens = tokenizeAlnum(mapped);

  if (profanityFilter.isProfane(input) || profanityFilter.isProfane(mapped)) {
    return true;
  }

  for (const token of tokens) {
    if (profanityFilter.isProfane(token)) return true;
  }

  const compact = toCompactAlnum(mapped);
  if (profanityFilter.isProfane(compact)) return true;

  return false;
}

type DisplayNameValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

export function validateDisplayName(input: string): DisplayNameValidationResult {
  const normalized = normalizeWhitespace(input);

  if (normalized.length < MIN_DISPLAY_NAME_LENGTH || normalized.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, reason: `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.` };
  }

  if (!isAsciiLetterOrNumber(normalized[0]) || !isAsciiLetterOrNumber(normalized[normalized.length - 1])) {
    return { ok: false, reason: "Display name must start and end with a letter or number." };
  }

  for (const ch of normalized) {
    if (!isAllowedMiddleChar(ch)) {
      return { ok: false, reason: "Use only letters, numbers, spaces, dots, dashes, or underscores." };
    }
  }

  if (hasProfanity(normalized)) {
    return { ok: false, reason: "Please choose a different display name." };
  }

  return { ok: true, normalized };
}
