import { describe, expect, it } from "vitest";
import {
  capabilitiesForRole,
  hasCollectionsCapability,
  normalizeCollectionsRole,
} from "../src/authorization.js";
import { requireCapability } from "../src/authorization.js";

describe("Collections authorization catalogue", () => {
  it("preserves current legacy role names while normalizing them", () => {
    expect(normalizeCollectionsRole("admin")).toBe("tenant_administrator");
    expect(normalizeCollectionsRole("staff")).toBe("platform_staff");
  });

  it("gives operators ordinary payment access without approval powers", () => {
    expect(hasCollectionsCapability("finance_operator", "payments.record")).toBe(true);
    expect(hasCollectionsCapability("finance_operator", "payments.reverse")).toBe(false);
    expect(hasCollectionsCapability("finance_operator", "payments.approve")).toBe(false);
  });

  it("keeps read-only access read-only", () => {
    const capabilities = capabilitiesForRole("read_only");
    expect(capabilities.has("customers.read")).toBe(true);
    expect(capabilities.has("customers.edit")).toBe(false);
    expect(capabilities.has("payments.record")).toBe(false);
    expect(capabilities.has("users.manage")).toBe(false);
  });

  it("does not grant capabilities to an unknown role", () => {
    expect(capabilitiesForRole("unknown-role").size).toBe(0);
    expect(hasCollectionsCapability("unknown-role", "customers.read")).toBe(false);
  });

  it("returns 403 when a request lacks a route capability", async () => {
    const send = (body: unknown) => body;
    const reply = {
      code: (status: number) => ({
        send: (body: unknown) => ({ status, body: send(body) }),
      }),
    };
    const result = await requireCapability("payments.reverse")(
      { tenantContext: { capabilities: capabilitiesForRole("finance_operator") } } as never,
      reply as never
    );
    expect(result).toEqual({
      status: 403,
      body: { error: "This account does not have the payments.reverse capability." },
    });
  });

  it("preserves full existing access for the staff identity boundary", () => {
    expect(hasCollectionsCapability("platform_staff", "reports.read")).toBe(true);
    expect(hasCollectionsCapability("platform_staff", "users.manage")).toBe(true);
  });
});
