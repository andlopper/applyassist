import { describe, expect, it } from "vitest";
import type { FieldKey } from "../matching/field-key";
import {
  evaluateFieldPolicy,
  isForbiddenField,
  isSensitiveFieldBlocked,
  type SensitiveCategory,
} from "./index";

describe("R-06 forbidden field policy", () => {
  it.each([
    ["password", "PT", "senha"],
    ["password", "EN", "password"],
    ["password", "ES", "contraseña"],
    ["CVV/CVC", "PT", "código CVV"],
    ["CVV/CVC", "EN", "CVV"],
    ["CVV/CVC", "ES", "código CVC"],
    ["card number", "PT", "número do cartão"],
    ["card number", "EN", "card number"],
    ["card number", "ES", "número de tarjeta"],
    ["IBAN", "PT", "IBAN"],
    ["IBAN", "EN", "IBAN"],
    ["IBAN", "ES", "IBAN"],
    ["bank account", "PT", "conta bancária"],
    ["bank account", "EN", "bank account"],
    ["bank account", "ES", "cuenta bancaria"],
    ["verification code", "PT", "código de verificação"],
    ["verification code", "EN", "verification code"],
    ["verification code", "ES", "código de verificación"],
    ["OTP", "PT", "código OTP"],
    ["OTP", "EN", "OTP code"],
    ["OTP", "ES", "código OTP"],
    ["2FA", "PT", "código 2FA"],
    ["2FA", "EN", "2FA code"],
    ["2FA", "ES", "código 2FA"],
    ["token", "PT", "token de acesso"],
    ["token", "EN", "access token"],
    ["token", "ES", "token de acceso"],
    ["CAPTCHA", "PT", "CAPTCHA"],
    ["CAPTCHA", "EN", "CAPTCHA"],
    ["CAPTCHA", "ES", "CAPTCHA"],
    ["reCAPTCHA", "PT", "reCAPTCHA"],
    ["reCAPTCHA", "EN", "reCAPTCHA"],
    ["reCAPTCHA", "ES", "reCAPTCHA"],
    ["hCAPTCHA", "PT", "hCAPTCHA"],
    ["hCAPTCHA", "EN", "hCAPTCHA"],
    ["hCAPTCHA", "ES", "hCAPTCHA"],
  ])("rejects %s field label in %s: %s", (_rule, _language, label) => {
    expect(isForbiddenField({ label })).toBe(true);
  });

  it.each([
    ["password input", { type: "password" }],
    ["file input", { type: "file" }],
    ["hidden input", { type: "hidden" }],
    ["credit-card autocomplete", { autocomplete: "cc-number" }],
    ["current password autocomplete", { autocomplete: "current-password" }],
    ["new password autocomplete", { autocomplete: "new-password" }],
    ["one-time-code autocomplete", { autocomplete: "one-time-code" }],
    ["CAPTCHA provider frame", { insideForbiddenProviderFrame: true }],
    ["payment provider frame", { insideForbiddenProviderFrame: true }],
  ])("rejects %s controls", (_rule, metadata) => {
    expect(isForbiddenField(metadata)).toBe(true);
  });

  it.each([
    ["Portuguese consent", "Li e aceito os termos", "checkbox"],
    ["English consent", "I agree to the terms", "checkbox"],
    ["Spanish consent", "Acepto los términos", "checkbox"],
    ["Portuguese privacy", "Política de privacidade e LGPD", "radio"],
    ["English privacy", "Privacy policy consent", "radio"],
    ["Spanish privacy", "Política de privacidad", "checkbox"],
  ])("rejects %s controls", (_case, label, type) => {
    expect(isForbiddenField({ label, type })).toBe(true);
  });

  it.each([
    ["email", { type: "email", label: "E-mail" }],
    ["ordinary text", { type: "text", label: "Favorite card game" }],
    ["non-consent checkbox", { type: "checkbox", label: "I prefer remote work" }],
    ["empty metadata", {}],
  ])("allows unrelated %s controls", (_case, metadata) => {
    expect(isForbiddenField(metadata)).toBe(false);
  });

  it("matches normalized labels across accents and spacing without substring false positives", () => {
    expect(isForbiddenField({ label: "Número   do CARTÃO" })).toBe(true);
    expect(isForbiddenField({ name: "codigo_de_verificacao" })).toBe(true);
    expect(isForbiddenField({ label: "discard this field" })).toBe(false);
    expect(isForbiddenField({ label: "x".repeat(500) })).toBe(false);
    expect(isForbiddenField("")).toBe(false);
  });

  it("never allows consent controls through field policy", () => {
    expect(
      evaluateFieldPolicy(undefined, {
        type: "checkbox",
        label: "Li e aceito os termos",
      }),
    ).toMatchObject({ kind: "forbidden" });
  });
});

describe("R-07 sensitive category settings", () => {
  const sensitiveFields: {
    category: SensitiveCategory;
    fieldKey: FieldKey;
  }[] = [
    { category: "documents", fieldKey: "cpf" },
    { category: "documents", fieldKey: "rg" },
    { category: "birth", fieldKey: "birthDate" },
    { category: "address", fieldKey: "address" },
    { category: "address", fieldKey: "postalCode" },
    { category: "diversity", fieldKey: "gender" },
    { category: "diversity", fieldKey: "race" },
    { category: "diversity", fieldKey: "pcd" },
  ];

  it.each(sensitiveFields)(
    "blocks $fieldKey when $category is disabled or unset",
    ({ category, fieldKey }) => {
      expect(isSensitiveFieldBlocked(fieldKey, { [category]: false })).toBe(true);
      expect(isSensitiveFieldBlocked(fieldKey, {})).toBe(true);
      expect(evaluateFieldPolicy(fieldKey, { label: "field" }, { [category]: false })).toMatchObject({
        kind: "blocked_by_setting",
        fieldKey,
        category,
      });
    },
  );

  it.each(sensitiveFields)(
    "allows $fieldKey when $category is enabled",
    ({ category, fieldKey }) => {
      expect(isSensitiveFieldBlocked(fieldKey, { [category]: true })).toBe(false);
      expect(evaluateFieldPolicy(fieldKey, { label: "field" }, { [category]: true })).toMatchObject({
        kind: "allowed",
        fieldKey,
      });
    },
  );

  it.each(["fullName", "email", "phone"] as const)(
    "does not block non-sensitive field %s when settings are disabled",
    (fieldKey) => {
      expect(isSensitiveFieldBlocked(fieldKey, { documents: false })).toBe(false);
    },
  );
});
