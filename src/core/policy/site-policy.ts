export type SitePolicyStatus = "blocked" | "unverified" | "verified";
export type SiteOverride = "allow" | "block";
export type SiteOverrides = Readonly<Record<string, SiteOverride>>;

const LINKEDIN_DOMAIN = "linkedin.com";
const VERIFIED_DOMAINS = ["gupy.io", "vagas.com.br"] as const;

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
}

function getOverride(hostname: string, overrides: SiteOverrides): SiteOverride | undefined {
  let matchingDomain: string | undefined;
  let matchingOverride: SiteOverride | undefined;

  for (const [rawDomain, override] of Object.entries(overrides)) {
    if (override !== "allow" && override !== "block") {
      continue;
    }

    const domain = normalizeDomain(rawDomain);
    if (
      domain.length > 0 &&
      isDomainOrSubdomain(hostname, domain) &&
      (matchingDomain === undefined || domain.length > matchingDomain.length)
    ) {
      matchingDomain = domain;
      matchingOverride = override;
    }
  }

  return matchingOverride;
}

export function getSitePolicy(url: string, siteOverrides: SiteOverrides = {}): SitePolicyStatus {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "unverified";
  }

  if (hostname.length === 0) {
    return "unverified";
  }

  if (isDomainOrSubdomain(hostname, LINKEDIN_DOMAIN)) {
    return "blocked";
  }

  const override = getOverride(hostname, siteOverrides);
  if (override === "block") {
    return "blocked";
  }
  if (override === "allow") {
    return "verified";
  }

  return VERIFIED_DOMAINS.some((domain) => isDomainOrSubdomain(hostname, domain))
    ? "verified"
    : "unverified";
}
