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
  currentCompany: "Empresa atual",
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
    fullName: ["nome completo", "nome", "full name"],
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
    salaryExpectation: ["pretensao salarial", "salario pretendido", "desired salary", "salary expectation"],
    availability: ["disponibilidade", "availability"],
    noticePeriod: ["prazo de aviso", "notice period"],
    workModel: ["modelo de trabalho", "work model"],
    englishLevel: ["ingles", "english level"],
    currentCompany: ["empresa atual", "current company"],
    currentRole: ["cargo atual", "cargo", "current role"],
    yearsExperience: ["anos de experiencia", "years experience"],
    cpf: ["cpf"],
    rg: ["rg"],
    birthDate: ["data de nascimento", "birth date", "nascimento"],
    address: ["endereco", "address"],
    postalCode: ["cep", "postal code", "zip code"],
    gender: ["genero", "gender"],
    race: ["raca", "race"],
    pcd: ["pcd", "deficiencia", "disabled"],
  };

  function detectFieldKey(key: string): FieldKey | undefined {
    const normalizedKey = normalizeLabel(key);
    for (const [fieldKey, aliases] of Object.entries(fieldAliases) as [FieldKey, readonly string[]][]) {
      if (
        aliases.some((alias) => {
          const normalizedAlias = normalizeLabel(alias);
          return normalizedAlias === normalizedKey || normalizedKey.includes(normalizedAlias);
        })
      ) {
        return fieldKey;
      }
    }
    return undefined;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separatorIndex = trimmed.search(/\s*[:=-]\s*/);
    if (separatorIndex <= 0) {
      continue;
    }

    const label = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + trimmed.slice(separatorIndex).match(/\s*[:=-]\s*/)![0].length).trim();
    const fieldKey = detectFieldKey(label);
    if (fieldKey && value.length > 0) {
      values[fieldKey] = value;
    }
  }

  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (emailMatch && values.email === undefined) {
    values.email = emailMatch[0];
  }

  const linkedInMatch = raw.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/gi);
  if (linkedInMatch && values.linkedinUrl === undefined) {
    values.linkedinUrl = linkedInMatch[0];
  }

  const githubMatch = raw.match(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/gi);
  if (githubMatch && values.githubUrl === undefined) {
    values.githubUrl = githubMatch[0];
  }

  const phoneMatch = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/g);
  if (phoneMatch && values.phone === undefined) {
    values.phone = phoneMatch[0].replace(/\s+/g, " ").trim();
  }

  const firstMeaningfulLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^(e-mail|email|telefone|phone|linkedin|github|nome|full name|city|cidade)/i.test(line));

  if (firstMeaningfulLine && values.fullName === undefined && !/[:=-]/.test(firstMeaningfulLine)) {
    values.fullName = firstMeaningfulLine;
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

  redacted = redacted.replace(
    /(?:[A-Z0-9._%+-]+)@(?:[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    "[REDACTED]",
  );

  redacted = redacted.replace(
    /(?:https?:\/\/|www\.)?(?:[a-z0-9.-]*\.)?(?:linkedin\.com|github\.com)\/[^\s)\]>'\"]+/gi,
    "[REDACTED]",
  );

  redacted = redacted.replace(
    /\b(?:cpf|rg)\s*[:=-]?\s*[0-9]{3}(?:[.\s-]?[0-9]{3}){2}[.-]?[0-9]{1,2}\b/gi,
    "[REDACTED]",
  );

  redacted = redacted.replace(
    /\b\d{2}\.\d{3}\.\d{3}[-.]?\d{1,2}\b/g,
    "[REDACTED]",
  );

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
