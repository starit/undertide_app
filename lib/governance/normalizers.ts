import { makeSourceScopedId } from "@/lib/governance/sources";
import { GovernanceOutcome, GovernanceStatusGroup } from "@/lib/governance/types";

export function normalizeSnapshotStatus(sourceStatus: string): {
  statusGroup: GovernanceStatusGroup;
  status: string;
  outcome: GovernanceOutcome;
} {
  const normalized = sourceStatus.toLowerCase();

  if (normalized === "pending") {
    return { statusGroup: "Upcoming", status: "Pending", outcome: "unknown" };
  }

  if (normalized === "active") {
    return { statusGroup: "Active", status: "Active", outcome: "unknown" };
  }

  if (normalized === "closed") {
    return { statusGroup: "Closed", status: "Closed", outcome: "unknown" };
  }

  return { statusGroup: "Executed", status: toTitleCase(sourceStatus), outcome: "unknown" };
}

export function normalizeTallyStatus(sourceStatus: string): {
  statusGroup: GovernanceStatusGroup;
  status: string;
  outcome: GovernanceOutcome;
} {
  const normalized = sourceStatus.toUpperCase();

  if (normalized === "PENDING") {
    return { statusGroup: "Upcoming", status: "Pending", outcome: "unknown" };
  }

  if (normalized === "ACTIVE") {
    return { statusGroup: "Active", status: "Active", outcome: "unknown" };
  }

  if (normalized === "SUCCEEDED") {
    return { statusGroup: "Closed", status: "Succeeded", outcome: "passed" };
  }

  if (normalized === "QUEUED") {
    return { statusGroup: "Closed", status: "Queued", outcome: "passed" };
  }

  if (normalized === "EXECUTABLE") {
    return { statusGroup: "Closed", status: "Executable", outcome: "passed" };
  }

  if (normalized === "EXECUTED") {
    return { statusGroup: "Executed", status: "Executed", outcome: "passed" };
  }

  if (normalized === "DEFEATED") {
    return { statusGroup: "Closed", status: "Defeated", outcome: "failed" };
  }

  if (normalized === "EXPIRED") {
    return { statusGroup: "Closed", status: "Expired", outcome: "failed" };
  }

  if (normalized === "CANCELED") {
    return { statusGroup: "Closed", status: "Canceled", outcome: "unknown" };
  }

  return { statusGroup: "Closed", status: toTitleCase(sourceStatus), outcome: "unknown" };
}

export function normalizeProtocolCandidate(value: string | null | undefined) {
  const normalized = value
    ?.toLowerCase()
    .replace(/\.(eth|xyz|dao|org|com)$/g, "")
    .replace(/\b(governance|delegate|delegates|snapshot|official|community)\b/g, "")
    .replace(/\b(dao|protocol|foundation|labs|finance)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || undefined;
}

export function normalizeProtocolId(value: string) {
  const normalized = normalizeProtocolCandidate(value);
  return normalized || makeSourceScopedId("snapshot", value).replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

export function excerpt(text: string | null | undefined, length: number) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  return normalized.length <= length ? normalized : `${normalized.slice(0, length - 3).trimEnd()}...`;
}

export function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/[#>*_`~-]/g, " ").replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((entry) => `${entry.slice(0, 1).toUpperCase()}${entry.slice(1)}`)
    .join(" ");
}
