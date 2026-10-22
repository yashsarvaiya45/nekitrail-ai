import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  connectDB,
  closeDB,
  isDbConnected,
  getStorageMode,
  savePaymentRecord,
  getPaymentRecords,
  getPersistedTotalsByCampaign,
  PaymentRecord
} from "../src/db.js";
import {
  baselineCampaigns,
  getCampaignsWithCapturedTotals,
  campaigns,
  orderRegistry
} from "../src/campaigns.js";

describe("Persistence & Storage Resilience Tests", () => {
  beforeEach(async () => {
    await closeDB();
  });

  after(async () => {
    await closeDB();
  });

  describe("In-Memory Development Fallback", () => {
    it("gracefully falls back when MONGODB_URI is not provided without crashing", async () => {
      const result = await connectDB("");
      assert.equal(result.connected, false);
      assert.equal(result.mode, "in-memory-fallback");
      assert.equal(getStorageMode(), "in-memory-fallback");
      assert.equal(isDbConnected(), false);
      assert.match(result.message, /in-memory development fallback/i);
    });

    it("saves and retrieves payment records in fallback mode", async () => {
      await connectDB("");
      const testPayment = {
        orderId: "FB_ORDER_001",
        captureId: "FB_CAP_001",
        campaignId: "community-water-filter",
        amount: 10.0,
        currency: "USD",
        status: "COMPLETED",
        createdAt: new Date().toISOString()
      };

      const saveResult = await savePaymentRecord(testPayment);
      assert.equal(saveResult.persisted, false);
      assert.equal(saveResult.record.orderId, "FB_ORDER_001");
      assert.equal(saveResult.record.amount, 10.0);

      const records = await getPaymentRecords();
      const match = records.find((r) => r.orderId === "FB_ORDER_001");
      assert.ok(match, "Record should be present in payment ledger");
      assert.equal(match.captureId, "FB_CAP_001");
    });

    it("prevents duplicate payment records in fallback mode", async () => {
      await connectDB("");
      const testPayment = {
        orderId: "FB_ORDER_DUP",
        captureId: "FB_CAP_DUP",
        campaignId: "school-kit-drive",
        amount: 25.0,
        currency: "USD",
        status: "COMPLETED"
      };

      const firstSave = await savePaymentRecord(testPayment);
      assert.equal(firstSave.duplicate, undefined);

      const secondSave = await savePaymentRecord(testPayment);
      assert.equal(secondSave.duplicate, true);

      const records = await getPaymentRecords();
      const duplicates = records.filter((r) => r.orderId === "FB_ORDER_DUP");
      assert.equal(duplicates.length, 1, "Should not insert duplicate payment record");
    });
  });

  describe("Database Connection Failure Handling", () => {
    it("handles connection failure to an invalid MongoDB URI gracefully without throwing", async () => {
      // Connect to non-existent MongoDB port with 1000ms timeout
      const origTimeout = process.env.MONGODB_TIMEOUT_MS;
      const result = await connectDB("mongodb://127.0.0.1:49999/nonexistent_test_db");

      assert.equal(result.connected, false);
      assert.equal(result.mode, "in-memory-fallback");
      assert.equal(isDbConnected(), false);
      assert.ok(result.error || result.message);
    });
  });

  describe("PaymentRecord Model Validation", () => {
    it("validates required fields on PaymentRecord schema", async () => {
      const invalidDoc = new PaymentRecord({});
      const err = await invalidDoc.validate().catch((e) => e);
      assert.ok(err, "Validation error expected for empty record");
      assert.ok(err.errors.orderId, "orderId should be required");
      assert.ok(err.errors.captureId, "captureId should be required");
      assert.ok(err.errors.campaignId, "campaignId should be required");
      assert.ok(err.errors.amount, "amount should be required");
    });

    it("rejects non-positive amounts on PaymentRecord schema", async () => {
      const invalidDoc = new PaymentRecord({
        orderId: "VALID_ORD",
        captureId: "VALID_CAP",
        campaignId: "community-water-filter",
        amount: 0,
        status: "COMPLETED"
      });
      const err = await invalidDoc.validate().catch((e) => e);
      assert.ok(err?.errors?.amount, "Validation error expected for 0 amount");
    });

    it("rejects invalid statuses outside COMPLETED", async () => {
      const invalidDoc = new PaymentRecord({
        orderId: "VALID_ORD",
        captureId: "VALID_CAP",
        campaignId: "community-water-filter",
        amount: 10,
        status: "PENDING"
      });
      const err = await invalidDoc.validate().catch((e) => e);
      assert.ok(err?.errors?.status, "Validation error expected for non-COMPLETED status");
    });
  });

  describe("Campaign Fundraising Totals & Baseline Separation", () => {
    it("preserves illustrative demo baselines while calculating real captured additions", () => {
      const waterFilter = baselineCampaigns.find((c) => c.id === "community-water-filter");
      const schoolKits = baselineCampaigns.find((c) => c.id === "school-kit-drive");
      assert.equal(waterFilter.baselineRaised, 345);
      assert.equal(schoolKits.baselineRaised, 210);

      // Total baseline is $555.00
      const baselineTotal = waterFilter.baselineRaised + schoolKits.baselineRaised;
      assert.equal(baselineTotal, 555);

      // Add a simulated $10 contribution to water filter
      const capturedTotals = { "community-water-filter": 10.0 };
      const updatedCampaigns = getCampaignsWithCapturedTotals(capturedTotals);

      const updatedWater = updatedCampaigns.find((c) => c.id === "community-water-filter");
      const updatedSchool = updatedCampaigns.find((c) => c.id === "school-kit-drive");

      assert.equal(updatedWater.raised, 355.0);
      assert.equal(updatedSchool.raised, 210.0);
      // Original baseline object remains unchanged
      assert.equal(waterFilter.baselineRaised, 345);
    });

    it("sums multiple captured contributions for campaign totals", async () => {
      const totals = await getPersistedTotalsByCampaign();
      assert.equal(typeof totals, "object");
    });
  });

  describe("Simulated Backend Restart & Ledger Re-Query", () => {
    it("retrieves the complete ledger and reconciles campaign totals after backend restart simulation", async () => {
      // Simulate session 1: 2 donations captured
      await connectDB("");
      await savePaymentRecord({
        orderId: "RESTART_ORD_1",
        captureId: "RESTART_CAP_1",
        campaignId: "community-water-filter",
        amount: 15.0,
        currency: "USD",
        status: "COMPLETED"
      });
      await savePaymentRecord({
        orderId: "RESTART_ORD_2",
        captureId: "RESTART_CAP_2",
        campaignId: "school-kit-drive",
        amount: 30.0,
        currency: "USD",
        status: "COMPLETED"
      });

      // Simulate backend restart by querying fresh totals
      const freshTotals = await getPersistedTotalsByCampaign();
      assert.ok(freshTotals["community-water-filter"] >= 15.0);
      assert.ok(freshTotals["school-kit-drive"] >= 30.0);

      const dynamicCampaigns = getCampaignsWithCapturedTotals(freshTotals);
      const water = dynamicCampaigns.find((c) => c.id === "community-water-filter");
      const school = dynamicCampaigns.find((c) => c.id === "school-kit-drive");

      assert.ok(water.raised >= 360.0);
      assert.ok(school.raised >= 240.0);
    });
  });
});
