import type { FieldKey } from "../matching/field-key";
import { normalizeLabel } from "../normalize";

export type SensitiveCategory = "documents" | "birth" | "address" | "diversity";

export type FieldMetadata = {
  type?: string | null;
  autocomplete?: string | null;
  name?: string | null;
  id?: string | null;
  label?: string | null;
  insideForbiddenProviderFrame?: boolean;
};

export type SensitiveSettings = Partial<Record<SensitiveCategory, boolean>>;

export type FieldPolicyDecision =
  | { kind: "allowed"; fieldKey?: FieldKey }
  | { kind: "forbidden"; reason: string }
  | {
      kind: "blocked_by_setting";
      fieldKey: FieldKey;
      category: SensitiveCategory;
      reason: string;
    };

const FORBIDDEN_PATTERNS = [
  "senha",
  "password",
  "contrasena",
  "cvv",
  "cvc",
  "cartao",
  "numero cartao",
  "card number",
  "numero tarjeta",
  "iban",
  "agencia",
  "bank branch",
  "sucursal bancaria",
  "conta bancaria",
  "bank account",
  "cuenta bancaria",
  "codigo verificacao",
  "codigo verificacion",
  "codigo verification",
  "verification code",
  "otp",
  "2fa",
  "token",
  "captcha",
  "recaptcha",
  "hcaptcha",
] as const;

const CONSENT_PATTERNS = [
  "li aceito",
  "aceito termos",
  "acepto terminos",
  "i agree",
  "agree terms",
  "consent",
  "consentimiento",
  "politica privacidade",
  "privacy policy",
  "politica privacidad",
  "lgpd",
] as const;

export const sensitiveFieldByCategory: Record<SensitiveCategory, readonly FieldKey[]> = {
  documents: ["cpf", "rg"],
  birth: ["birthDate"],
  address: ["address", "postalCode"],
  diversity: ["gender", "race", "pcd"],
};

const FIELD_CATEGORY: Partial<Record<string, SensitiveCategory>> = {
  cpf: "documents",
  rg: "documents",
  birthDate: "birth",
  address: "address",
  postalCode: "address",
  gender: "diversity",
  race: "diversity",
  pcd: "diversity",
};

export const sensitiveFieldCategories = [
  "documents",
  "birth",
  "address",
  "diversity",
] as const satisfies readonly SensitiveCategory[];

function containsNormalizedPhrase(value: string, phrase: string): boolean {
  const normalizedValue = normalizeLabel(value);
  const normalizedPhrase = normalizeLabel(phrase);

  return ` ${normalizedValue} `.includes(` ${normalizedPhrase} `);
}

function fieldText(metadata: FieldMetadata): string {
  return [metadata.label, metadata.name, metadata.id]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function hasForbiddenLabel(value: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => containsNormalizedPhrase(value, pattern));
}

function hasConsentLabel(value: string): boolean {
  return CONSENT_PATTERNS.some((pattern) => containsNormalizedPhrase(value, pattern));
}

function isConsentControl(type: string): boolean {
  return type === "checkbox" || type === "radio";
}

function hasForbiddenAutocomplete(autocomplete: string): boolean {
  return autocomplete.split(/\s+/).some(
    (token) =>
      token.startsWith("cc-") ||
      token.startsWith("current-password") ||
      token.startsWith("new-password") ||
      token.startsWith("one-time-code"),
  );
}

export function isForbiddenField(metadata: FieldMetadata | string): boolean {
  if (typeof metadata === "string") {
    return hasForbiddenLabel(metadata) || hasConsentLabel(metadata);
  }

  const type = (metadata.type ?? "").trim().toLowerCase();
  if (
    metadata.insideForbiddenProviderFrame === true ||
    type === "password" ||
    type === "file" ||
    type === "hidden"
  ) {
    return true;
  }

  if (hasForbiddenAutocomplete((metadata.autocomplete ?? "").trim().toLowerCase())) {
    return true;
  }

  const label = fieldText(metadata);
  if (isConsentControl(type) && hasConsentLabel(label)) {
    return true;
  }

  return hasForbiddenLabel(label);
}

export function isSensitiveFieldBlocked(
  fieldKey: FieldKey | string,
  settings: SensitiveSettings = {},
): boolean {
  const category = FIELD_CATEGORY[fieldKey];
  return category !== undefined && settings[category] !== true;
}

export function evaluateFieldPolicy(
  fieldKey: FieldKey | undefined,
  metadata: FieldMetadata | string,
  settings: SensitiveSettings = {},
): FieldPolicyDecision {
  if (isForbiddenField(metadata)) {
    return { kind: "forbidden", reason: "Field contains a forbidden pattern" };
  }

  if (fieldKey && isSensitiveFieldBlocked(fieldKey, settings)) {
    const category = FIELD_CATEGORY[fieldKey];
    if (category) {
      return {
        kind: "blocked_by_setting",
        fieldKey,
        category,
        reason: "Sensitive field category is disabled by user settings",
      };
    }
  }

  return { kind: "allowed", fieldKey };
}
