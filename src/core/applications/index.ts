export type ApplicationStatus = "started" | "submitted_by_user";

export interface ApplicationRecord {
  id: string;
  urlNorm: string;
  host: string;
  title?: string;
  company?: string;
  createdAt: string;
  status: ApplicationStatus;
}

const DROP_QUERY_KEYS = new Set([
  "gclid",
  "fbclid",
  "ref",
  "source",
  "trk",
]);

const KEEP_QUERY_KEYS = new Set(["gh_jid", "jobid", "id", "vaga", "job"]);

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function textSimilarity(left: string, right: string): number {
  const first = normalizeComparableText(left);
  const second = normalizeComparableText(right);

  if (!first && !second) {
    return 1;
  }
  if (!first || !second) {
    return 0;
  }

  const leftTokens = new Set(first.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(second.split(/\s+/).filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));

  const tokenScore = union.size === 0 ? 1 : intersection.length / union.size;
  if (tokenScore >= 0.9) {
    return 1;
  }

  const maxLength = Math.max(first.length, second.length);
  if (maxLength === 0) {
    return 1;
  }

  let previousRow = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= first.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= second.length; rightIndex += 1) {
      const substitutionCost = first[leftIndex - 1] === second[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        (previousRow[rightIndex] ?? 0) + 1,
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previousRow = currentRow;
  }

  return 1 - (previousRow[second.length] ?? maxLength) / maxLength;
}

export function normalizeUrl(value: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const queryParams = new URLSearchParams();

    for (const [key, paramValue] of parsed.searchParams.entries()) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.startsWith("utm_") || DROP_QUERY_KEYS.has(normalizedKey)) {
        continue;
      }
      if (KEEP_QUERY_KEYS.has(normalizedKey)) {
        queryParams.append(key, paramValue);
      }
    }

    const trimmedPath = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
    const search = queryParams.toString();
    const path =
      search && parsed.pathname.length > 1 && parsed.pathname.endsWith("/") && trimmedPath !== "/"
        ? `${trimmedPath}/`
        : trimmedPath;
    const base = `${parsed.protocol}//${host}${path}`;

    return search ? `${base}?${search}` : base;
  } catch {
    const clean = raw.replace(/#.*$/, "");
    return clean.replace(/\/+$/, "");
  }
}

export function isLikelyDuplicate(
  candidate: Pick<ApplicationRecord, "urlNorm" | "title" | "company">,
  records: Array<Pick<ApplicationRecord, "urlNorm" | "title" | "company">>,
): boolean {
  const normalizedCandidateUrl = normalizeUrl(candidate.urlNorm ?? "");
  if (normalizedCandidateUrl) {
    const duplicateUrl = records.some(
      (record) => normalizeUrl(record.urlNorm ?? "") === normalizedCandidateUrl,
    );
    if (duplicateUrl) {
      return true;
    }
  }

  const candidateTitle = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const candidateCompany = typeof candidate.company === "string" ? candidate.company.trim() : "";

  if (!candidateTitle || !candidateCompany) {
    return false;
  }

  const candidateText = `${candidateCompany} ${candidateTitle}`;

  for (const record of records) {
    const recordTitle = typeof record.title === "string" ? record.title.trim() : "";
    const recordCompany = typeof record.company === "string" ? record.company.trim() : "";
    if (!recordTitle || !recordCompany) {
      continue;
    }

    const recordText = `${recordCompany} ${recordTitle}`;
    if (textSimilarity(candidateText, recordText) >= 0.9) {
      return true;
    }
  }

  return false;
}
