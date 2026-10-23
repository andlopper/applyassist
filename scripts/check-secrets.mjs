import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: projectRoot, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const secretPatterns = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "OpenRouter API key", pattern: /\bsk-or-v1-[a-f0-9]{64}\b/ },
  { label: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];
const findings = [];

for (const file of files) {
  const content = await readFile(resolve(projectRoot, file));

  if (content.includes(0)) {
    continue;
  }

  const text = content.toString("utf8");
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(text)) {
      findings.push(`${file}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Potential secrets found:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.length} files checked).`);
}
