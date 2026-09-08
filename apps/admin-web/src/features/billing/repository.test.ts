import { beforeEach, describe, expect, test } from "vitest";
import { resetBillingState } from "@/mocks/phase3-billing-state";
import { ApiError } from "@/core/api/errors";
import { billingRepository } from "./repository";

const CONFIRM_TOKEN = "TOKEN-MOCK-20260728";

describe("billing repository", () => {
  beforeEach(resetBillingState);

  test("reads authoritative subscription overview with separated currencies and non-additive totals", async () => {
    const overview = await billingRepository.getSubscriptionOverview({ period: "30d", platform: "all" });

    expect(overview.currencyGroups.map((group) => group.currency)).toEqual(["AED", "SAR"]);
    const ios = overview.platformBreakdown.find((item) => item.platform === "ios")?.uniqueSubscriptions ?? 0;
    const android = overview.platformBreakdown.find((item) => item.platform === "android")?.uniqueSubscriptions ?? 0;
    const multi = overview.platformBreakdown.find((item) => item.platform === "multi_platform")?.uniqueSubscriptions ?? 0;
    expect(overview.kpis.active).not.toBe(ios + android);
    expect(ios + android + multi).toBeGreaterThan(0);
  });

  test("denies billing data when the simulated role lacks the required permission", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "content-manager");

    await expect(
      billingRepository.getSubscriptionOverview({ period: "30d", platform: "all" }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("maps malformed direct billing queries to a safe validation error", async () => {
    const response = await fetch(
      "/api/v1/admin/billing/subscriptions?page=0&pageSize=999",
      { headers: { "x-admin-simulated-role": "billing-operator" } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation_error" });
  });

  test("maps malformed direct billing mutations to a safe validation error", async () => {
    const response = await fetch(
      "/api/v1/admin/billing/failed-payments/FP-001/action",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-simulated-role": "billing-operator",
        },
        body: "{}",
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation_error" });
  });

  test("lists masked subscriptions and filters by platform", async () => {
    const all = await billingRepository.getSubscriptions({ platform: "all", sort: "renewalDate", order: "asc", page: 1, pageSize: 25 });
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.items.every((item) => item.customer.maskedEmail.endsWith("@example.test"))).toBe(true);

    const ios = await billingRepository.getSubscriptions({ platform: "ios", sort: "renewalDate", order: "asc", page: 1, pageSize: 25 });
    expect(ios.items.every((item) => item.customer.platform === "ios")).toBe(true);
    expect(ios.items.length).toBeLessThan(all.items.length);
  });

  test("reads masked subscription detail with safe provider references only", async () => {
    const detail = await billingRepository.getSubscription({ subscriptionId: "SUB-123" });
    expect(detail.id).toBe("SUB-123");
    expect(detail.safeProviderReferences.every((ref) => ref.startsWith("STRIPE-"))).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/card|cvv|pan|bank-account/i);
  });

  test("rejects unknown subscription and event identifiers with safe not_found", async () => {
    await expect(billingRepository.getSubscription({ subscriptionId: "SUB-MISSING" }))
      .rejects.toMatchObject({ code: "not_found" });
    await expect(billingRepository.getPaymentEvent({ eventId: "EVT-MISSING" }))
      .rejects.toMatchObject({ code: "not_found" });
  });

  test("performs a confirmed subscription action and records a planned audit reference", async () => {
    const result = await billingRepository.actOnSubscription("SUB-123", {
      action: "set_cancel_at_period_end",
      reason: "operator reviewed renewal",
      expectedCurrentState: "active",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(result.outcome).toBe("simulated_success");
    expect(result.plannedAuditReference).toMatch(/^AUD-SUB-123$/);
    expect(result.currentState).toBe("cancel_at_period_end");
  });

  test("reads plans and promotional codes with explicit currencies and safe labels", async () => {
    const plans = await billingRepository.getPlans();
    expect(plans.map((plan) => plan.name)).toEqual(["Free", "Basic", "Premium"]);
    expect(plans.every((plan) => plan.price.currency === "AED")).toBe(true);

    const promos = await billingRepository.getPromotionalCodes({ page: 1, pageSize: 25 });
    expect(promos.items.length).toBeGreaterThan(0);
    expect(promos.items.every((promo) => /^[A-Z0-9_-]+$/.test(promo.code))).toBe(true);
  });

  test("updates a plan through the validated mutation boundary", async () => {
    const updated = await billingRepository.updatePlan("PLAN-Basic", {
      price: { amount: 54.99, currency: "AED" },
      interval: "monthly",
      limits: { accounts: 3, transactions: 200, goals: 20, imports: 10, aiQueries: 200 },
      active: true,
      providerPriceLabel: "PRICE_BASIC_MONTHLY",
      reason: "operator approved price review",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(updated.price.amount).toBe(54.99);
  });

  test("creates and updates promotional codes through the validated mutation boundary", async () => {
    const created = await billingRepository.createPromotionalCode({
      id: "PROMO-SPRING20",
      code: "SPRING20",
      discountKind: "percentage",
      discountValue: 20,
      duration: "once",
      redemptionCount: 0,
      redemptionLimit: 100,
      expiresAt: "2026-12-31T23:59:59+03:00",
      status: "active",
      eligiblePlanIds: ["PLAN-Basic"],
      reason: "operator created seasonal promotion",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(created.id).toBe("PROMO-SPRING20");
    expect(created).not.toHaveProperty("reason");
    expect(created).not.toHaveProperty("confirmationToken");

    const updated = await billingRepository.updatePromotionalCode("PROMO-WELCOME10", {
      id: "PROMO-WELCOME10",
      code: "WELCOME10",
      discountKind: "percentage",
      discountValue: 15,
      duration: "once",
      redemptionCount: 245,
      redemptionLimit: 500,
      expiresAt: "2026-12-31T23:59:59+03:00",
      status: "active",
      eligiblePlanIds: ["PLAN-Basic", "PLAN-Premium"],
      reason: "operator raised seasonal discount",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(updated.discountValue).toBe(15);
    expect(updated).not.toHaveProperty("reason");
  });

  test("reads currency-separated payments overview and masked payment events", async () => {
    const overview = await billingRepository.getPaymentsOverview({ period: "30d", platform: "all" });
    expect(overview.currencyGroups.map((group) => group.currency)).toEqual(["AED", "SAR"]);
    expect(overview.reconciliationCount).toBeGreaterThan(0);

    const events = await billingRepository.getPaymentEvents({ platform: "all", sort: "date", order: "desc", page: 1, pageSize: 25 });
    expect(events.items.length).toBeGreaterThan(0);
    expect(events.items.every((event) => event.customer.maskedEmail.endsWith("@example.test"))).toBe(true);
  });

  test("reads sanitized payment event detail and exposes no forbidden fields", async () => {
    const detail = await billingRepository.getPaymentEvent({ eventId: "EVT-20260728-001" });
    expect(detail.payloadPreview).not.toHaveProperty("card");
    expect(detail.payloadPreview).not.toHaveProperty("token");
    expect(detail.payloadPreview).not.toHaveProperty("signature");
    expect(detail.payloadPreview).not.toHaveProperty("rawPayload");
    expect(detail.payloadPreview.subscriptionReference).toBe("SUB-123");
    expect(JSON.stringify(detail)).not.toMatch(/cvv|pan_|billing_address|webhook_signature/i);
  });

  test("triages failed payments and records a confirmed mock resolution", async () => {
    const failures = await billingRepository.getFailedPayments({ platform: "all", sort: "date", order: "desc", page: 1, pageSize: 25 });
    expect(failures.items.length).toBeGreaterThan(0);

    const result = await billingRepository.actOnFailedPayment("FAIL-001", {
      action: "mark_reviewed",
      reason: "operator reviewed failed renewal",
      scope: "FAIL-001",
      expectedCurrentState: "open",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(result.outcome).toBe("simulated_success");
  });

  test("lists reconciliation issues and records a fresh-provider decision", async () => {
    const issues = await billingRepository.getReconciliationIssues({ platform: "all", sort: "age", order: "desc", page: 1, pageSize: 25 });
    expect(issues.items.length).toBeGreaterThan(0);

    const fresh = issues.items.find((issue) => issue.providerFreshness === "fresh");
    expect(fresh).toBeDefined();
    const result = await billingRepository.actOnReconciliationIssue(fresh!.id, {
      decision: "mark_reviewing",
      reason: "operator reviewing reconciliation difference",
      expectedIssueState: fresh!.expectedState,
      providerFreshness: "fresh",
      confirmationToken: CONFIRM_TOKEN,
    });
    expect(result.outcome).toBe("simulated_success");
  });

  test("blocks reconciliation success when provider freshness is stale", async () => {
    await expect(billingRepository.actOnReconciliationIssue("REC-002", {
      decision: "mark_reviewing",
      reason: "operator reviewing stale reconciliation",
      expectedIssueState: "reviewing",
      providerFreshness: "stale",
      confirmationToken: CONFIRM_TOKEN,
    })).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("classifies unhandled errors as safe ApiError envelopes", async () => {
    try {
      await billingRepository.getSubscription({ subscriptionId: "SUB-MISSING" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("not_found");
    }
  });
});
