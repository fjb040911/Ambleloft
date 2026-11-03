/** Design contract only. No live endpoint or installable artifact is defined here. */
export type Locale = "zh-CN" | "en";
export type Localized<T> = Record<Locale, T>;
export type L10n = { resolvedLocale: Locale; fallback: boolean };
export type ReleaseRef = {
  sourceId: string;
  listingId: string;
  version: string;
  packageDigest: string;
  artifactSha256: string;
};
export type RoleContent = {
  name: string;
  summary: string;
  domain: string;
  responsibilities: Array<{ id: string; text: string }>;
  requiredInputs: string[];
  deliverables: Array<{ id: string; name: string; acceptanceCriteria: string[] }>;
  workingMethods: string[];
  boundaries: string[];
};

/** Stored in the signed role shard; all fields are bound to roleVersion. */
export type RoleSkillUsage = {
  mode: "when-relevant";
  when: Localized<string>;
  whenNot: Localized<string>;
};
export type RoleSkillBinding = {
  id: string;
  capabilityId: string;
  responsibilityIds: string[];
  recommendationId: string;
  priority: "core" | "recommended";
  defaultSelected: boolean;
  usage: RoleSkillUsage;
  release: ReleaseRef; // Never null or a source commit substituted for a release.
};
export type PublishedRole = {
  sourceId: string;
  id: string;
  version: string;
  publisher: string;
  status: "published";
  defaultLocale: Locale;
  categoryIds: string[];
  content: Localized<RoleContent>;
  skills: RoleSkillBinding[];
};
export type Recommendation = {
  id: string;
  sourceId: string;
  roleId: string;
  roleVersion: string;
  skill: ReleaseRef;
  rank: number;
  categoryIds: string[];
  reason: Localized<string>;
  reasonSource: "editorial" | "model-assisted-reviewed";
  evidenceRefs: string[];
  reviewedAt: string;
  reviewedBy: string;
};
export type RuntimeRequirement = {
  kind: "binary" | "mcp" | "credential" | "network";
  id: string;
  description: Localized<string>;
  scope: "host" | "task-environment";
  required: boolean;
};
export type SkillListing = {
  sourceId: string;
  listingId: string;
  entityName: string;
  title: Localized<string>;
  summary: Localized<string>;
  description: Localized<string>;
  defaultLocale: Locale;
  contentLanguages: Locale[];
  publisher: string;
  license: string;
  origin: "official" | "third-party";
  author: string; // Upstream author/organization; not the Store publisher.
  categoryIds: string[];
  capabilityIds: string[];
  repository?: {
    url: string;
    directory: string;
    commit: string;
    stars: number | null;
    starsObservedAt: string | null;
    activityObservedAt: string | null;
  };
  release: ReleaseRef & {
    artifactPath: string;
    artifactSize: number;
    platforms: Array<"win32" | "darwin" | "linux">;
    architectures: Array<"x64" | "arm64">;
    minHostVersion: string;
    runtimeRequirements: RuntimeRequirement[];
    validation: SkillValidationSummary;
  };
};

/** Publication evidence, separate from the client's cryptographic verification. */
export type SkillValidationSummary = {
  sourceCheckedAt: string;
  packageVerifiedAt: string;
  hostChecks: Array<{
    platform: "win32" | "darwin" | "linux";
    architecture: "x64" | "arm64";
    environment: "local" | "ssh" | "ssh-docker";
    hostVersion: string;
    status: "passed" | "failed" | "not-tested";
    checkedAt: string | null;
    evidenceId: string | null;
  }>;
  // Role-combination task validation is a separate publisher review record.
};
export type SkillListingProjection = Omit<
  SkillListing,
  "title" | "summary" | "description" | "release"
> & {
  title: string;
  summary: string;
  description: string;
  l10n: L10n;
  release: Omit<SkillListing["release"], "runtimeRequirements"> & {
    runtimeRequirements: Array<Omit<RuntimeRequirement, "description"> & {
      description: string;
      l10n: L10n;
    }>;
  };
};
export type RoleSkillProjection = Omit<RoleSkillBinding, "usage"> & {
  usage: { mode: "when-relevant"; when: string; whenNot: string; l10n: L10n };
  rank: number; // Derived from Recommendation, not a second ordering source.
  listing: SkillListingProjection;
  recommendation: {
    id: string;
    reason: string;
    reasonSource: Recommendation["reasonSource"];
    reviewedAt: string;
    l10n: L10n;
  };
};
export type ResponseContext = {
  snapshotId: string;
  requestedLocale: Locale;
  localeSource: "query" | "header" | "default";
  verification: { documentIds: string[] };
};
export type RoleDetailResponse = ResponseContext & {
  schemaVersion: 2;
  item: Omit<PublishedRole, "content" | "skills"> & {
    content: RoleContent;
    l10n: L10n;
    defaultSkillCount: number; // Derived from skills[].defaultSelected.
    skills: RoleSkillProjection[]; // Complete role binding set, max 20.
  };
};
export type RoleListItem = {
  sourceId: string;
  id: string;
  version: string;
  name: string;
  summary: string;
  domain: string;
  categoryIds: string[];
  skillCount: number;
  defaultSkillCount: number;
  l10n: L10n;
  defaultSkillsPreview: Array<{
    bindingId: string;
    release: ReleaseRef;
    entityName: string;
    title: string;
    l10n: L10n;
  }>; // Up to 3; preview is never the install/selection source.
};
export type Page<T> = ResponseContext & {
  schemaVersion: 1;
  itemSchemaVersion: 2;
  items: T[];
  nextCursor: string | null;
};
export type RoleRecommendationsResponse = Page<RoleSkillProjection> & {
  sourceId: string;
  roleId: string;
  roleVersion: string;
};

/** Persistent employee selection: usage survives a Store outage or template edit. */
export type EmployeeSkillReference = {
  name: string;
  label: string;
  purpose: string;
  source: (ReleaseRef & { kind: "store"; snapshotId: string }) | {
    kind: "import"; importId: string; packageDigest: string;
  };
  // Single-language copy; no live link to the latest role template.
  usage: { mode: "when-relevant"; when: string; whenNot: string };
  selectionOrigin: {
    kind: "template-default" | "user-selected" | "imported" | "legacy";
    templateBindingId?: string;
    recommendationId?: string;
    roleVersion?: string;
  }; // Provenance only, not execution permission or business-dirty state.
};
export type RoleSkillsCapabilities = {
  supportedLocales: Locale[];
  defaultLocale: Locale;
  roleProjectionSchemaVersion: 2;
  roleSkillBindingSchemaVersion: 1;
  roleSkillDefaults: true;
  roleSkillUsage: true;
};
