import { describe, expect, it } from "vitest";
import { getSitePolicy, type SitePolicyStatus } from "./site-policy";

describe("R-17/R-18 site policy", () => {
  it.each([
    ["LinkedIn", "https://linkedin.com/jobs", "blocked"],
    ["LinkedIn subdomain", "https://www.linkedin.com/jobs", "blocked"],
    ["nested LinkedIn subdomain", "https://jobs.eu.linkedin.com", "blocked"],
    ["lookalike LinkedIn domain", "https://linkedin.com.example.org", "unverified"],
    ["Gupy", "https://gupy.io/vagas", "verified"],
    ["Gupy subdomain", "https://empresa.gupy.io/vagas", "verified"],
    ["Vagas.com", "https://www.vagas.com.br", "verified"],
    ["InHire", "https://inhire.com.br", "unverified"],
    ["Sólides", "https://solides.com.br", "unverified"],
    ["unknown site", "https://example.org", "unverified"],
  ] as const satisfies readonly [string, string, SitePolicyStatus][])(
    "returns %s status for its domain",
    (_case, url, expected) => {
      expect(getSitePolicy(url)).toBe(expected);
    },
  );

  it.each([
    ["exact domain", "https://jobs.example.org", { "example.org": "block" }, "blocked"],
    [
      "parent domain",
      "https://jobs.eu.example.org",
      { "example.org": "block" },
      "blocked",
    ],
    [
      "more specific override",
      "https://jobs.eu.example.org",
      { "example.org": "allow", "eu.example.org": "block" },
      "blocked",
    ],
    [
      "allow override",
      "https://jobs.example.org",
      { "example.org": "allow" },
      "verified",
    ],
  ] as const satisfies readonly [
    string,
    string,
    Record<string, "allow" | "block">,
    SitePolicyStatus,
  ][])("respects the %s site override", (_case, url, overrides, expected) => {
    expect(getSitePolicy(url, overrides)).toBe(expected);
  });

  it("never allows a LinkedIn override to lift the block", () => {
    expect(
      getSitePolicy("https://jobs.linkedin.com", { "linkedin.com": "allow" }),
    ).toBe("blocked");
  });

  it.each(["", "not a URL", "https://", "x".repeat(5000)])(
    "returns unverified for invalid or unsupported URL input",
    (url) => {
      expect(getSitePolicy(url)).toBe("unverified");
    },
  );
});
