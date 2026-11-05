import { FIELD_KEYS, type FieldKey } from "../matching/field-key";
import { normalizeLabel } from "../normalize";

export interface Profile {
  values: Partial<Record<FieldKey, string>>;
  updatedAt: string;
}

const PROFILE_FIELD_LABELS: Record<FieldKey, string> = {
  fullName: "Nome completo",
  firstName: "Nome",
  lastName: "Sobrenome",
  email: "E-mail",
  phone: "Telefone",
  city: "Cidade",
  state: "Estado",
  country: "País",
  linkedinUrl: "LinkedIn",
  githubUrl: "GitHub",
  portfolioUrl: "Portfólio",
  salaryExpectation: "Pretensão salarial",
  availability: "Disponibilidade",
  noticePeriod: "Prazo de aviso",
  workModel: "Modelo de trabalho",
  englishLevel: "Inglês",
  currentCompany: "Empresa atual ou última empresa",
  currentRole: "Cargo atual",
  yearsExperience: "Experiência",
  cpf: "CPF",
  rg: "RG",
  birthDate: "Data de nascimento",
  address: "Endereço",
  postalCode: "CEP",
  gender: "Gênero",
  race: "Raça",
  pcd: "PCD",
};

const SAFE_PROFILE_FIELDS: readonly FieldKey[] = [
  "fullName",
  "firstName",
  "lastName",
  "city",
  "state",
  "country",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
  "salaryExpectation",
  "availability",
  "noticePeriod",
  "workModel",
  "englishLevel",
  "currentCompany",
  "currentRole",
  "yearsExperience",
];

function hasValidUpdatedAt(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanMarkdownText(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-*+]\s+|>\s*)/, "")
    .replace(/\\\s*$/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^__(.*)__$/, "$1")
    .replace(/^[*_`~]+/, "")
    .trim();
}

function cleanNamePart(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
}

function parseLocation(value: string): Partial<Record<FieldKey, string>> {
  const parts = value.split(",").map((part) => cleanMarkdownText(part));
  if (parts.length < 2) {
    return {};
  }

  const location: Partial<Record<FieldKey, string>> = {};
  if (parts[0]) {
    location.city = parts[0];
  }
  if (parts[1]) {
    location.state = parts[1];
  }
  if (parts.length > 2) {
    location.country = parts.slice(2).join(", ");
  }
  return location;
}

function parseRecentExperience(value: string): Partial<Record<FieldKey, string>> {
  const match = value.match(/^(.+?)\s+(?:na|no|em|at)\s+([^,.;]+)(?:[,.;]|$)/i);
  if (!match || !match[1] || !match[2]) {
    return {};
  }

  const role = cleanMarkdownText(match[1]);
  const company = cleanMarkdownText(match[2]);
  return {
    ...(role.length > 0 ? { currentRole: role } : {}),
    ...(company.length > 0 ? { currentCompany: company } : {}),
  };
}

export function validateProfile(input: unknown): Profile {
  const fallbackProfile: Profile = { values: {}, updatedAt: new Date().toISOString() };

  if (typeof input !== "object" || input === null) {
    return fallbackProfile;
  }

  const candidate = input as Partial<Profile>;
  const values = candidate.values;
  const nextValues: Partial<Record<FieldKey, string>> = {};

  if (typeof values === "object" && values !== null) {
    for (const [key, value] of Object.entries(values)) {
      if (!FIELD_KEYS.includes(key as FieldKey) || typeof value !== "string") {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed.length > 0) {
        nextValues[key as FieldKey] = trimmed;
      }
    }
  }

  return {
    values: nextValues,
    updatedAt: hasValidUpdatedAt(candidate.updatedAt)
      ? candidate.updatedAt
      : new Date().toISOString(),
  };
}

export function parseProfileText(raw: string): Profile {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { values: {}, updatedAt: new Date().toISOString() };
  }

  const parsedJson = importProfileJson(raw);
  if (Object.keys(parsedJson.values).length > 0) {
    return parsedJson;
  }

  const values: Partial<Record<FieldKey, string>> = {};
  const fieldAliases: Record<FieldKey, readonly string[]> = {
    fullName: ["nome completo", "nome profissional", "full name"],
    firstName: ["nome", "first name", "given name"],
    lastName: ["sobrenome", "last name", "family name"],
    email: ["email", "e-mail", "mail"],
    phone: ["telefone", "telefone celular", "phone", "celular", "tel"],
    city: ["cidade", "city"],
    state: ["estado", "state", "province"],
    country: ["pais", "país", "country"],
    linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
    githubUrl: ["github", "github url", "github profile"],
    portfolioUrl: ["portfolio", "portifolio", "site", "website", "portfolio url"],
    salaryExpectation: [
      "pretensao salarial",
      "salario pretendido",
      "desired salary",
      "salary expectation",
    ],
    availability: ["disponibilidade", "availability"],
    noticePeriod: ["prazo de aviso", "notice period"],
    workModel: ["modelo de trabalho", "work model"],
    englishLevel: ["ingles", "nivel de ingles", "english level"],
    currentCompany: [
      "empresa atual",
      "ultima empresa",
      "empresa anterior",
      "current company",
      "last company",
    ],
    currentRole: ["cargo atual", "cargo", "current role"],
    yearsExperience: ["anos de experiencia", "tempo de experiencia informado", "years experience"],
    cpf: ["cpf"],
    rg: ["rg"],
    birthDate: ["data de nascimento", "birth date", "nascimento"],
    address: ["endereco", "address"],
    postalCode: ["cep", "postal code", "zip code"],
    gender: ["genero", "gender"],
    race: ["raca", "race"],
    pcd: ["pcd", "deficiencia", "disabled"],
  };
  const locationAliases = ["localizacao profissional", "professional location"];
  const recentExperienceAliases = ["experiencia mais recente", "most recent experience"];

  function detectFieldKey(key: string): FieldKey | undefined {
    const normalizedKey = normalizeLabel(key);
    for (const [fieldKey, aliases] of Object.entries(fieldAliases) as [
      FieldKey,
      readonly string[],
    ][]) {
      if (aliases.some((alias) => normalizeLabel(alias) === normalizedKey)) {
        return fieldKey;
      }
    }
    return undefined;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    const separatorIndex = trimmed.search(/[:=]/);
    if (trimmed.length === 0 || separatorIndex <= 0) {
      continue;
    }

    const label = cleanMarkdownText(trimmed.slice(0, separatorIndex)).replace(/[*_`~]/g, "");
    const value = cleanMarkdownText(trimmed.slice(separatorIndex + 1));
    const normalizedLabel = normalizeLabel(label);

    if (locationAliases.some((alias) => normalizeLabel(alias) === normalizedLabel)) {
      Object.assign(values, parseLocation(value));
      continue;
    }

    if (recentExperienceAliases.some((alias) => normalizeLabel(alias) === normalizedLabel)) {
      Object.assign(values, parseRecentExperience(value));
      continue;
    }

    const fieldKey = detectFieldKey(label);
    if (!fieldKey || value.length === 0) {
      continue;
    }

    if (fieldKey === "fullName") {
      const nameParts = value.split(/\s+/).map(cleanNamePart).filter(Boolean);
      if (nameParts[0]) {
        values.firstName = nameParts[0];
      }
      if (nameParts.length > 1) {
        values.lastName = nameParts.slice(1).join(" ");
      }
      continue;
    }

    if (fieldKey === "firstName") {
      const firstName = cleanNamePart(value.split(/\s+/)[0] ?? "");
      if (firstName.length > 0) {
        values.firstName = firstName;
      }
      continue;
    }

    values[fieldKey] = value;
  }

  return validateProfile({ values, updatedAt: new Date().toISOString() });
}

export function importProfileJson(raw: string): Profile {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { values: {}, updatedAt: new Date().toISOString() };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return validateProfile(parsed);
  } catch {
    return { values: {}, updatedAt: new Date().toISOString() };
  }
}

export function redactSensitive(value: string): string {
  const input = String(value ?? "");
  let redacted = input;

  redacted = redacted.replace(/(?:[A-Z0-9._%+-]+)@(?:[A-Z0-9.-]+\.[A-Z]{2,})/gi, "[REDACTED]");

  redacted = redacted.replace(
    /(?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?(?:linkedin\.com|github\.com)\/[^\s)\]>'\"]+/gi,
    "[REDACTED]",
  );

  redacted = redacted.replace(
    /\b(?:cpf|rg)\s*[:=-]?\s*[0-9]{3}(?:[.\s-]?[0-9]{3}){2}[.-]?[0-9]{1,2}\b/gi,
    "[REDACTED]",
  );

  redacted = redacted.replace(/\b\d{2}\.\d{3}\.\d{3}[-.]?\d{1,2}\b/g, "[REDACTED]");

  redacted = redacted.replace(
    /(?:\+?\d{1,3}[\s().-]?)?(?:\(?\d{2,3}\)?[\s().-]?){2,3}\d{2,5}/g,
    "[REDACTED]",
  );

  redacted = redacted.replace(/\b\d{8,}\b/g, "[REDACTED]");

  return redacted.trim();
}

export function truncateForContext(value: string, maxLength: number): string {
  const safeMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 0;
  const text = String(value ?? "").trim();

  if (safeMax === 0 || text.length <= safeMax) {
    return text;
  }

  const window = text.slice(0, safeMax);
  const boundaryIndex = window.search(/[.!?](?:\s|$)/);

  if (boundaryIndex >= 0) {
    return window.slice(0, boundaryIndex + 1).trim();
  }

  return window.trim();
}

export function buildProfileContext(profile: Profile): string {
  const entries: string[] = [];

  for (const fieldKey of SAFE_PROFILE_FIELDS) {
    const value = profile.values[fieldKey];
    if (typeof value !== "string") {
      continue;
    }

    const sanitized = redactSensitive(value).trim();
    if (sanitized.length === 0 || sanitized === "[REDACTED]") {
      continue;
    }

    entries.push(`${PROFILE_FIELD_LABELS[fieldKey]}: ${sanitized}`);
  }

  return truncateForContext(entries.join("; "), 2000);
}
