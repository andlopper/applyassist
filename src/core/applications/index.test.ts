import { describe, expect, it } from "vitest";
import { isLikelyDuplicate, normalizeUrl, textSimilarity } from "./index";

describe("normalizeUrl", () => {
  it.each([
    [
      "https://www.Example.com/jobs/42/?utm_source=search&gh_jid=abc#top",
      "https://example.com/jobs/42/?gh_jid=abc",
    ],
    [
      "https://example.com/jobs/42/?gclid=123&jobId=77&ref=foo",
      "https://example.com/jobs/42/?jobId=77",
    ],
    [
      "https://example.com/jobs/42/?source=linkedin&trk=abc&vaga=42",
      "https://example.com/jobs/42/?vaga=42",
    ],
    [
      "https://example.com/jobs/42/",
      "https://example.com/jobs/42",
    ],
    [
      "https://example.com/jobs/42/?source=linkedin&job=123&foo=bar",
      "https://example.com/jobs/42/?job=123",
    ],
    [
      "not a valid url",
      "not a valid url",
    ],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe("textSimilarity", () => {
  it("returns a zero score when only one side has text", () => {
    expect(textSimilarity("Senior Engineer", "")).toBe(0);
  });

  it("returns a one score when the normalized text matches exactly", () => {
    expect(textSimilarity("Senior Engineer", "senior engineer")).toBe(1);
  });
});

describe("isLikelyDuplicate", () => {
  it("reports duplicates when urlNorm is the same", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "https://example.com/jobs/42", title: "Senior Engineer", company: "Acme" },
        [{ urlNorm: "https://example.com/jobs/42", title: "Other", company: "OtherCo" }],
      ),
    ).toBe(true);
  });

  it("detects duplicate company and title with high similarity", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "https://example.com/jobs/99", title: "Senior Software Engineer", company: "Acme Labs" },
        [{ urlNorm: "https://example.com/jobs/100", title: "Senior Software Engineer", company: "Acme Labs" }],
      ),
    ).toBe(true);
  });

  it("ignores similarity when either title or company is missing", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "https://example.com/jobs/55", title: "Senior Engineer", company: undefined },
        [{ urlNorm: "https://example.com/jobs/67", title: "Senior Engineer", company: "Acme" }],
      ),
    ).toBe(false);
  });

  it("ignores similarity when an existing record lacks one of the fields", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "https://example.com/jobs/90", title: "Senior Engineer", company: "Acme" },
        [{ urlNorm: "https://example.com/jobs/91", title: "Senior Engineer", company: undefined }],
      ),
    ).toBe(false);
  });

  it("returns false for unrelated records when the normalized URL is absent", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "", title: "Senior Engineer", company: "Acme" },
        [{ urlNorm: "https://example.com/jobs/88", title: "Frontend Engineer", company: "Atlas" }],
      ),
    ).toBe(false);
  });

  it("returns false for unrelated records", () => {
    expect(
      isLikelyDuplicate(
        { urlNorm: "https://example.com/jobs/77", title: "QA Analyst", company: "Example" },
        [{ urlNorm: "https://example.com/jobs/88", title: "Frontend Engineer", company: "Atlas" }],
      ),
    ).toBe(false);
  });
});
