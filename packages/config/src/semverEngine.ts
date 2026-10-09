export type ReleaseBumpType = "MAJOR" | "MINOR" | "PATCH" | "NONE";

export interface ParsedCommit {
  type: string;
  scope?: string;
  isBreaking: boolean;
  subject: string;
  body?: string;
  rawMessage: string;
  category: "Breaking Changes" | "Features" | "Bug Fixes" | "Performance" | "Observability & Ops" | "Security" | "Refactoring" | "Documentation" | "Other";
}

export interface SemVerComponents {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

const SEMVER_REGEX =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parseSemVer(versionStr: string): SemVerComponents {
  const match = versionStr.trim().match(SEMVER_REGEX);
  if (!match) {
    throw new Error(`INVALID_SEMVER: "${versionStr}" is not a valid Semantic Version (MAJOR.MINOR.PATCH).`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || undefined,
    build: match[5] || undefined,
  };
}

export function isValidSemVer(versionStr: string): boolean {
  return SEMVER_REGEX.test(versionStr.trim());
}

export function formatSemVer(components: SemVerComponents): string {
  let str = `${components.major}.${components.minor}.${components.patch}`;
  if (components.prerelease) {
    str += `-${components.prerelease}`;
  }
  if (components.build) {
    str += `+${components.build}`;
  }
  return str;
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    // SemVer numeric identifiers are arbitrary precision. Comparing via Number()
    // loses ordering above Number.MAX_SAFE_INTEGER (and may yield NaN for Infinity - Infinity).
    if (left.length !== right.length) return left.length - right.length;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (leftNumeric && !rightNumeric) return -1;
  if (!leftNumeric && rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrerelease(left?: string, right?: string): number {
  if (!left && !right) return 0;
  if (!left && right) return 1;
  if (left && !right) return -1;

  const leftIds = left!.split(".");
  const rightIds = right!.split(".");
  const length = Math.min(leftIds.length, rightIds.length);

  for (let i = 0; i < length; i++) {
    const comparison = comparePrereleaseIdentifiers(leftIds[i], rightIds[i]);
    if (comparison !== 0) return comparison;
  }

  return leftIds.length - rightIds.length;
}

export function compareSemVer(v1: string, v2: string): number {
  const s1 = parseSemVer(v1);
  const s2 = parseSemVer(v2);

  if (s1.major !== s2.major) return s1.major - s2.major;
  if (s1.minor !== s2.minor) return s1.minor - s2.minor;
  if (s1.patch !== s2.patch) return s1.patch - s2.patch;

  return comparePrerelease(s1.prerelease, s2.prerelease);
}

export function categorizeCommit(type: string, isBreaking: boolean): ParsedCommit["category"] {
  if (isBreaking) return "Breaking Changes";
  switch (type.toLowerCase()) {
    case "feat":
      return "Features";
    case "fix":
      return "Bug Fixes";
    case "perf":
      return "Performance";
    case "security":
      return "Security";
    case "refactor":
      return "Refactoring";
    case "docs":
      return "Documentation";
    case "ci":
    case "build":
    case "ops":
      return "Observability & Ops";
    default:
      return "Other";
  }
}

export function parseConventionalCommit(message: string): ParsedCommit {
  const trimmed = message.trim();
  const firstLine = trimmed.split("\n")[0].trim();
  const rest = trimmed.split("\n").slice(1).join("\n").trim();

  const isBreakingFooter = /BREAKING[ -]CHANGE:\s*(.+)/i.test(trimmed);
  const headerMatch = firstLine.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);

  if (!headerMatch) {
    const isBreaking = isBreakingFooter;
    return {
      type: "other",
      isBreaking,
      subject: firstLine,
      body: rest || undefined,
      rawMessage: trimmed,
      category: categorizeCommit("other", isBreaking),
    };
  }

  const type = headerMatch[1].toLowerCase();
  const scope = headerMatch[2] ? headerMatch[2].toLowerCase() : undefined;
  const isBreakingHeader = Boolean(headerMatch[3]);
  const isBreaking = isBreakingHeader || isBreakingFooter;
  const subject = headerMatch[4].trim();

  return {
    type,
    scope,
    isBreaking,
    subject,
    body: rest || undefined,
    rawMessage: trimmed,
    category: categorizeCommit(type, isBreaking),
  };
}

export function determineBumpFromCommits(commitMessages: string[]): ReleaseBumpType {
  let bump: ReleaseBumpType = "NONE";

  for (const msg of commitMessages) {
    const parsed = parseConventionalCommit(msg);
    if (parsed.isBreaking) {
      return "MAJOR";
    }
    if (parsed.type === "feat") {
      bump = "MINOR";
    } else if (
      bump !== "MINOR" &&
      ["fix", "perf", "refactor", "security", "docs", "revert"].includes(parsed.type)
    ) {
      bump = "PATCH";
    }
  }

  return bump;
}

export function calculateNextVersion(
  currentVersion: string,
  commitMessages: string[],
  options?: {
    forceBump?: ReleaseBumpType;
    prereleaseTag?: string;
  }
): string {
  const current = parseSemVer(currentVersion);
  const bump = options?.forceBump || determineBumpFromCommits(commitMessages);

  let nextMajor = current.major;
  let nextMinor = current.minor;
  let nextPatch = current.patch;

  if (bump === "MAJOR") {
    nextMajor += 1;
    nextMinor = 0;
    nextPatch = 0;
  } else if (bump === "MINOR") {
    nextMinor += 1;
    nextPatch = 0;
  } else if (bump === "PATCH") {
    nextPatch += 1;
  }

  return formatSemVer({
    major: nextMajor,
    minor: nextMinor,
    patch: nextPatch,
    prerelease: options?.prereleaseTag,
  });
}

export function generateFormattedReleaseNotes(
  version: string,
  baselineTag: string,
  commits: ParsedCommit[]
): string {
  const dateStr = new Date().toISOString().split("T")[0];
  let notes = `## [${version}] - ${dateStr}\n\n`;

  const categories: Array<ParsedCommit["category"]> = [
    "Breaking Changes",
    "Features",
    "Bug Fixes",
    "Performance",
    "Observability & Ops",
    "Security",
    "Refactoring",
    "Documentation",
  ];

  for (const cat of categories) {
    const items = commits.filter((c) => c.category === cat);
    if (items.length > 0) {
      notes += `### ${cat}\n`;
      for (const item of items) {
        const scopeStr = item.scope ? `**${item.scope}**: ` : "";
        notes += `- ${scopeStr}${item.subject}\n`;
      }
      notes += "\n";
    }
  }

  notes += `*Baseline Tag*: \`${baselineTag}\`\n`;
  return notes.trim();
}
