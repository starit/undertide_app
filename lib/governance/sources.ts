export type GovernanceSource = "snapshot" | "tally";

export type SourceScopedId = `${GovernanceSource}:${string}`;

export type GovernanceSourceDescriptor = {
  source: GovernanceSource;
  label: string;
  spaceEntityType: string;
  proposalEntityType: string;
};

export const GOVERNANCE_SOURCES = {
  snapshot: {
    source: "snapshot",
    label: "Snapshot",
    spaceEntityType: "spaces",
    proposalEntityType: "proposals",
  },
  tally: {
    source: "tally",
    label: "Tally",
    spaceEntityType: "tally:organizations",
    proposalEntityType: "tally:proposals",
  },
} satisfies Record<GovernanceSource, GovernanceSourceDescriptor>;

export function makeSourceScopedId(source: GovernanceSource, id: string | number): SourceScopedId {
  return `${source}:${String(id)}` as SourceScopedId;
}
