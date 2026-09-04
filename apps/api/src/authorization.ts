// Collections authorization is defined on the server so roles remain a
// controlled bundle of business actions rather than a frontend convention.

export const COLLECTIONS_CAPABILITIES = [
  "customers.read",
  "customers.create",
  "customers.edit",
  "customers.archive",
  "projects.read",
  "inventory.read",
  "milestones.read",
  "payments.read",
  "payments.record",
  "payments.adjust",
  "payments.reverse",
  "payments.approve",
  "reports.read",
  "customers.export",
  "users.manage",
  "tenant.settings.manage",
] as const;

export type CollectionsCapability = (typeof COLLECTIONS_CAPABILITIES)[number];

export const COLLECTIONS_ROLES = [
  "platform_staff",
  "tenant_administrator",
  "collections_manager",
  "collections_operator",
  "finance_operator",
  "read_only",
  "support_staff",
] as const;

export type CollectionsRole = (typeof COLLECTIONS_ROLES)[number];

const allCapabilities = new Set<CollectionsCapability>(COLLECTIONS_CAPABILITIES);

const ROLE_CAPABILITIES: Record<CollectionsRole, ReadonlySet<CollectionsCapability>> = {
  platform_staff: allCapabilities,
  tenant_administrator: new Set([
    "customers.read",
    "customers.create",
    "customers.edit",
    "customers.archive",
    "projects.read",
    "inventory.read",
    "milestones.read",
    "payments.read",
    "payments.record",
    "reports.read",
    "customers.export",
    "users.manage",
    "tenant.settings.manage",
  ]),
  collections_manager: new Set([
    "customers.read",
    "customers.create",
    "customers.edit",
    "customers.archive",
    "projects.read",
    "inventory.read",
    "milestones.read",
    "payments.read",
    "payments.record",
    "reports.read",
    "customers.export",
  ]),
  collections_operator: new Set([
    "customers.read",
    "customers.create",
    "customers.edit",
    "projects.read",
    "inventory.read",
    "milestones.read",
    "payments.read",
    "payments.record",
  ]),
  finance_operator: new Set([
    "customers.read",
    "milestones.read",
    "payments.read",
    "payments.record",
    "reports.read",
  ]),
  read_only: new Set([
    "customers.read",
    "projects.read",
    "inventory.read",
    "milestones.read",
    "payments.read",
    "reports.read",
  ]),
  support_staff: new Set([
    "customers.read",
    "projects.read",
    "inventory.read",
    "milestones.read",
    "payments.read",
    "reports.read",
  ]),
};

// Existing rows use free-text roles. These aliases let the catalogue be
// introduced without changing the current login data or user experience.
const LEGACY_ROLE_ALIASES: Record<string, CollectionsRole> = {
  admin: "tenant_administrator",
  staff: "platform_staff",
};

export function normalizeCollectionsRole(role: string): CollectionsRole | null {
  const normalized = role.trim().toLowerCase();
  if ((COLLECTIONS_ROLES as readonly string[]).includes(normalized)) {
    return normalized as CollectionsRole;
  }
  return LEGACY_ROLE_ALIASES[normalized] ?? null;
}

export function capabilitiesForRole(role: string): ReadonlySet<CollectionsCapability> {
  const normalizedRole = normalizeCollectionsRole(role);
  return normalizedRole ? ROLE_CAPABILITIES[normalizedRole] : new Set<CollectionsCapability>();
}

export function hasCollectionsCapability(role: string, capability: CollectionsCapability): boolean {
  return capabilitiesForRole(role).has(capability);
}
