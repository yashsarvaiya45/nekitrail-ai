import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../src/server.js";
import {
  connectDB,
  closeDB,
  savePaymentRecord,
  saveReceiptReview,
  updateReceiptHumanReview,
  getCampaignTimeline,
  saveTimelineEvent,
  saveCampaignEvidence,
  getCampaignEvidence,
  validateCampaignEvidenceRef,
  clearFallbackReviews,
  clearFallbackTimelineEvents,
  clearFallbackEvidence
} from "../src/db.js";
import {
  createAuditorSessionToken,
  verifyAuditorSessionToken,
  verifyAuditorSecretKey,
  getAuditorSecret
} from "../src/auth.js";

describe("Campaign Impact Timeline Tests", () => {
  beforeEach(async () => {
    await closeDB();
    clearFallbackReviews();
    clearFallbackTimelineEvents();
    clearFallbackEvidence();
  });

  after(async () => {
    await closeDB();
    clearFallbackReviews();
    clearFallbackTimelineEvents();
    clearFallbackEvidence();
  });

  describe("Timeline Milestone Progression & Data Grounding", () => {
    it("returns PLANNED milestone for a campaign with only baseline definition", async () => {
      await connectDB(""); // Force in-memory fallback
      const timelineData = await getCampaignTimeline("school-kit-drive");

      assert.equal(timelineData.campaignId, "school-kit-drive");
      assert.equal(timelineData.currentMilestone, "PLANNED");
      assert.equal(timelineData.milestoneSummary.planned, true);
      assert.equal(timelineData.milestoneSummary.inProgress, false);
      assert.equal(timelineData.milestoneSummary.evidenceSubmitted, false);
      assert.equal(timelineData.milestoneSummary.humanReviewCompleted, false);
      assert.equal(timelineData.milestoneSummary.completed, false);

      assert.ok(timelineData.timeline.length >= 1);
      const planEvent = timelineData.timeline[0];
      assert.equal(planEvent.eventType, "CAMPAIGN_PLANNED");
      assert.equal(planEvent.status, "PLANNED");
      assert.match(planEvent.description, /approved community budget/i);
    });

    it("rejects non-existent campaign IDs with 404", async () => {
      await connectDB("");
      await assert.rejects(
        async () => {
          await getCampaignTimeline("non-existent-campaign-id");
        },
        (err) => {
          assert.equal(err.status, 404);
          assert.match(err.message, /campaign not found/i);
          return true;
        }
      );
    });

    it("proves sandbox payment alone cannot advance real campaign progress and creates a clearly labelled test-payment event only", async () => {
      await connectDB("");
      const payment = {
        orderId: "TL_ORD_001",
        captureId: "TL_CAP_001",
        campaignId: "school-kit-drive",
        amount: 25.0,
        currency: "USD",
        status: "COMPLETED",
        createdAt: new Date().toISOString()
      };
      await savePaymentRecord(payment);

      const timelineData = await getCampaignTimeline("school-kit-drive");

      // Sandbox payments alone must NOT advance real-world progress to IN_PROGRESS
      assert.equal(timelineData.currentMilestone, "PLANNED");
      assert.equal(timelineData.milestoneSummary.inProgress, false);
      assert.equal(timelineData.milestoneSummary.planned, true);

      const payEvent = timelineData.timeline.find(
        (e) => e.eventType === "TEST_PAYMENT_CAPTURED" || e.eventType === "DONATION_CAPTURED"
      );
      assert.ok(payEvent, "Must contain test payment event");
      assert.equal(payEvent.eventType, "TEST_PAYMENT_CAPTURED");
      assert.equal(payEvent.status, "PLANNED");
      assert.equal(payEvent.evidenceRef, "TL_CAP_001");
      assert.match(payEvent.description, /sandbox/i);
      assert.match(payEvent.description, /does not advance real-world campaign progress/i);
    });

    it("transitions to EVIDENCE_SUBMITTED without automatically verifying human review", async () => {
      await connectDB("");
      const reviewData = {
        campaignId: "school-kit-drive",
        filename: "stationery_receipt.jpg",
        fileMimeType: "image/jpeg",
        fileSize: 45000,
        source: "image-upload",
        extractedData: {
          vendor: "City Stationery Store",
          date: "2026-10-10",
          currency: "USD",
          totalAmount: 85.0,
          lineItems: [{ description: "Notebooks and paper", amount: 85.0 }],
          tax: 0.0
        },
        matchedBudgetItem: "Notebooks and paper",
        budgetAmount: 260.0,
        remainingBudget: 175.0,
        status: "POSSIBLE_MATCH",
        explanation: "Matches notebooks item."
      };

      const saveResult = await saveReceiptReview(reviewData);
      assert.equal(saveResult.review.humanReviewStatus, "PENDING_HUMAN_REVIEW");

      const timelineData = await getCampaignTimeline("school-kit-drive");
      assert.equal(timelineData.currentMilestone, "EVIDENCE_SUBMITTED");
      assert.equal(timelineData.milestoneSummary.evidenceSubmitted, true);
      assert.equal(timelineData.milestoneSummary.humanReviewCompleted, false);
      assert.equal(timelineData.milestoneSummary.completed, false);

      const evidenceEvent = timelineData.timeline.find((e) => e.eventType === "EVIDENCE_SUBMITTED");
      assert.ok(evidenceEvent, "Must contain EVIDENCE_SUBMITTED event");
      assert.equal(evidenceEvent.evidenceRef, saveResult.review.id);
      assert.match(evidenceEvent.description, /PENDING_HUMAN_REVIEW/i);
    });

    it("transitions to HUMAN_REVIEW_COMPLETED only when authorized reviewer approves review", async () => {
      await connectDB("");
      const reviewData = {
        campaignId: "school-kit-drive",
        filename: "school_bags.jpg",
        fileMimeType: "image/jpeg",
        fileSize: 52000,
        source: "image-upload",
        extractedData: {
          vendor: "School Bags Co",
          date: "2026-10-12",
          currency: "USD",
          totalAmount: 120.0,
          lineItems: [{ description: "School bags", amount: 120.0 }],
          tax: 0.0
        },
        matchedBudgetItem: "School bags",
        budgetAmount: 220.0,
        remainingBudget: 100.0,
        status: "POSSIBLE_MATCH",
        explanation: "Matches school bags."
      };

      const saveResult = await saveReceiptReview(reviewData);

      // Complete authorized human review
      const reviewId = saveResult.review.id;
      const updateResult = await updateReceiptHumanReview({
        reviewId,
        decision: "APPROVED",
        reviewerNotes: "Verified physical invoice and delivery confirmation.",
        reviewedBy: "Authorized Human Auditor"
      });

      assert.equal(updateResult.review.humanReviewStatus, "APPROVED");
      assert.equal(updateResult.review.reviewedBy, "Authorized Human Auditor");
      assert.ok(updateResult.review.reviewedAt);

      const timelineData = await getCampaignTimeline("school-kit-drive");
      assert.equal(timelineData.currentMilestone, "HUMAN_REVIEW_COMPLETED");
      assert.equal(timelineData.milestoneSummary.humanReviewCompleted, true);

      const humanEvent = timelineData.timeline.find((e) => e.eventType === "HUMAN_REVIEW_COMPLETED");
      assert.ok(humanEvent, "Must contain HUMAN_REVIEW_COMPLETED event");
      assert.equal(humanEvent.status, "HUMAN_REVIEW_COMPLETED");
      assert.match(humanEvent.description, /Authorized Human Auditor/i);
      assert.match(humanEvent.description, /APPROVED/i);
    });

    it("proves approved expenses and budget goal alone cannot complete a campaign without an authorized completion decision", async () => {
      await connectDB("");
      // School kit drive goal is $800:
      // - School bags: $220
      // - Notebooks and paper: $260
      // - Writing supplies: $170
      // - Administration and transport: $150
      const items = [
        { item: "School bags", amount: 220 },
        { item: "Notebooks and paper", amount: 260 },
        { item: "Writing supplies", amount: 170 },
        { item: "Administration and transport", amount: 150 }
      ];

      for (const b of items) {
        const rev = await saveReceiptReview({
          campaignId: "school-kit-drive",
          filename: `${b.item.toLowerCase().replace(/\s+/g, "_")}.jpg`,
          matchedBudgetItem: b.item,
          budgetAmount: b.amount,
          remainingBudget: 0,
          status: "POSSIBLE_MATCH",
          extractedData: { totalAmount: b.amount, currency: "USD" }
        });
        await updateReceiptHumanReview({
          reviewId: rev.review.id,
          decision: "APPROVED",
          reviewerNotes: `Verified ${b.item} delivery.`,
          reviewedBy: "Authorized Human Auditor"
        });
      }

      // Check timeline: budget is 100% matched and approved
      const timelineData = await getCampaignTimeline("school-kit-drive");
      assert.equal(timelineData.totalApprovedExpenses, 800);
      assert.equal(timelineData.budgetGoal, 800);

      // MUST NOT automatically be marked COMPLETED
      assert.notEqual(timelineData.currentMilestone, "COMPLETED");
      assert.equal(timelineData.currentMilestone, "HUMAN_REVIEW_COMPLETED");
      assert.equal(timelineData.milestoneSummary.completed, false);
      assert.equal(timelineData.completionAuthorized, false);
      assert.match(timelineData.completionPendingReason, /requires an authorized human review decision/i);

      // Register genuine persisted completion evidence record for this campaign:
      await saveCampaignEvidence({
        campaignId: "school-kit-drive",
        evidenceRef: "FINAL-AUDIT-CERTIFICATE-2026-001",
        title: "Official School Kit Delivery and Inspection Certificate",
        description: "Verified all 400 school kits received by students on site.",
        evidenceType: "COMPLETION_CERTIFICATE",
        verifiedBy: "Authorized Human Auditor"
      });

      // Now record a separately authorized campaign-completion decision with the verified supporting evidence:
      await saveTimelineEvent({
        campaignId: "school-kit-drive",
        eventType: "CAMPAIGN_COMPLETED",
        status: "COMPLETED",
        description: "Official authorized project completion sign-off: all 400 school kits delivered.",
        evidenceRef: "FINAL-AUDIT-CERTIFICATE-2026-001"
      });

      const completedTimeline = await getCampaignTimeline("school-kit-drive");
      assert.equal(completedTimeline.currentMilestone, "COMPLETED");
      assert.equal(completedTimeline.milestoneSummary.completed, true);
      assert.equal(completedTimeline.completionAuthorized, true);
      assert.equal(completedTimeline.completionPendingReason, null);
    });

    it("strictly rejects completion when evidenceRef is arbitrary, non-existent, unapproved, or from another campaign, and keeps milestone pending", async () => {
      await connectDB("");

      // 1. Attempt completion with arbitrary / nonexistent evidenceRef
      await assert.rejects(
        async () => {
          await saveTimelineEvent({
            campaignId: "school-kit-drive",
            eventType: "CAMPAIGN_COMPLETED",
            status: "COMPLETED",
            description: "Attempted completion with fabricated non-existent evidence ref.",
            evidenceRef: "FAKE-NONEXISTENT-EVIDENCE-123"
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /does not point to any registered evidence record or approved receipt review/i);
          return true;
        }
      );

      // Verify campaign milestone remains pending
      const timelinePending1 = await getCampaignTimeline("school-kit-drive");
      assert.equal(timelinePending1.milestoneSummary.completed, false);
      assert.equal(timelinePending1.completionAuthorized, false);

      // 2. Attempt completion with evidence belonging to another campaign (cross-campaign injection)
      await saveCampaignEvidence({
        campaignId: "water-filter-project",
        evidenceRef: "WATER-LAB-CERT-999",
        title: "Water Filter Certification",
        evidenceType: "COMPLETION_CERTIFICATE"
      });

      await assert.rejects(
        async () => {
          await saveTimelineEvent({
            campaignId: "school-kit-drive",
            eventType: "CAMPAIGN_COMPLETED",
            status: "COMPLETED",
            description: "Attempted completion using evidence from water filter project.",
            evidenceRef: "WATER-LAB-CERT-999"
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /associated with campaign "water-filter-project", not "school-kit-drive"/i);
          return true;
        }
      );

      // 3. Attempt completion with unapproved receipt review
      const pendingRev = await saveReceiptReview({
        campaignId: "school-kit-drive",
        filename: "unapproved_bill.jpg",
        matchedBudgetItem: "School bags",
        budgetAmount: 100,
        remainingBudget: 0,
        status: "REVIEW"
      });

      await assert.rejects(
        async () => {
          await saveTimelineEvent({
            campaignId: "school-kit-drive",
            eventType: "CAMPAIGN_COMPLETED",
            status: "COMPLETED",
            description: "Attempted completion using unapproved receipt.",
            evidenceRef: pendingRev.review.id
          });
        },
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /Only approved receipts can support campaign completion/i);
          return true;
        }
      );

      // 4. Milestone still strictly pending
      const timelinePending2 = await getCampaignTimeline("school-kit-drive");
      assert.notEqual(timelinePending2.currentMilestone, "COMPLETED");
      assert.equal(timelinePending2.milestoneSummary.completed, false);
      assert.equal(timelinePending2.completionAuthorized, false);

      // 5. Approving the receipt review enables authorized completion
      await updateReceiptHumanReview({
        reviewId: pendingRev.review.id,
        decision: "APPROVED",
        reviewerNotes: "Approved item delivery and inspection.",
        reviewedBy: "Authorized Auditor"
      });

      const validSave = await saveTimelineEvent({
        campaignId: "school-kit-drive",
        eventType: "CAMPAIGN_COMPLETED",
        status: "COMPLETED",
        description: "Official authorized project completion sign-off with approved receipt evidence.",
        evidenceRef: pendingRev.review.id
      });
      assert.ok(validSave.event.id);

      const finalTimeline = await getCampaignTimeline("school-kit-drive");
      assert.equal(finalTimeline.currentMilestone, "COMPLETED");
      assert.equal(finalTimeline.milestoneSummary.completed, true);
      assert.equal(finalTimeline.completionAuthorized, true);
      assert.equal(finalTimeline.completionPendingReason, null);
    });

    it("saves and retrieves custom audit timeline events with validation", async () => {
      await connectDB("");
      const customEvent = {
        campaignId: "school-kit-drive",
        eventType: "AUDIT_NOTE",
        status: "IN_PROGRESS",
        description: "Community inspection scheduled for stationery distribution site.",
        evidenceRef: "SITE-INSPECT-01"
      };

      const saveResult = await saveTimelineEvent(customEvent);
      assert.equal(saveResult.event.campaignId, "school-kit-drive");
      assert.equal(saveResult.event.eventType, "AUDIT_NOTE");

      const timelineData = await getCampaignTimeline("school-kit-drive");
      const found = timelineData.timeline.find((e) => e.evidenceRef === "SITE-INSPECT-01");
      assert.ok(found, "Custom event should be included in timeline");
      assert.equal(found.description, "Community inspection scheduled for stationery distribution site.");
    });
  });

  describe("Server-Side Auditor Authentication & Authorization Security", () => {
    let server;
    let baseUrl;

    before(async () => {
      await new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, "127.0.0.1", () => {
          const port = server.address().port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });
    });

    after(async () => {
      if (server) {
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it("rejects unauthorized submission of human review with HTTP 401", async () => {
      const res = await fetch(`${baseUrl}/api/receipt-reviews/rev_test_123/human-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "APPROVED", reviewerName: "Hacker Bob" })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.requiresAuth, true);
      assert.match(data.error, /unauthorized/i);
    });

    it("rejects unauthorized creation of timeline audit event with HTTP 401", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "CAMPAIGN_COMPLETED",
          status: "COMPLETED",
          description: "Fake completion by unauthenticated user",
          evidenceRef: "FAKE-REF"
        })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.requiresAuth, true);
      assert.match(data.error, /unauthorized/i);
    });

    it("rejects auditor login with invalid passphrase and old auditor secret with HTTP 401", async () => {
      // 1. Random incorrect password
      const res = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: "wrong-password" })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.authenticated, false);
      assert.match(data.error, /invalid auditor secret key/i);

      // 2. Old deprecated secret must also be strictly rejected
      const oldSecretRes = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: "nekitrail-audit-secure-key-2026" })
      });

      assert.equal(oldSecretRes.status, 401);
      const oldSecretData = await oldSecretRes.json();
      assert.equal(oldSecretData.authenticated, false);
      assert.match(oldSecretData.error, /invalid auditor secret key/i);
    });

    it("authenticates valid auditor via HttpOnly cookie and allows authorized human review and audit event recording", async () => {
      const secret = getAuditorSecret();

      // 1. Browser Login with valid passphrase
      const loginRes = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: secret })
      });

      assert.equal(loginRes.status, 200);
      const loginData = await loginRes.json();
      assert.equal(loginData.authenticated, true);
      assert.equal(loginData.auditor.role, "AUDITOR");

      // Verify ZERO token disclosure in JSON response (Security requirement 1 & 3)
      assert.strictEqual(loginData.token, undefined, "Browser login must NOT disclose session token in JSON response");
      assert.strictEqual(loginData.sessionToken, undefined, "Session token must not be in JSON");

      // Verify HttpOnly session cookie was set
      const cookieHeader = loginRes.headers.get("set-cookie");
      assert.ok(cookieHeader, "Must set session cookie");
      assert.match(cookieHeader, /nekitrail_auditor_session=/);
      assert.match(cookieHeader, /HttpOnly/i);
      const cookieValue = cookieHeader.split(";")[0];

      // 2. Setup a review record to approve
      await connectDB("");
      const rev = await saveReceiptReview({
        campaignId: "school-kit-drive",
        filename: "school_kits.jpg",
        matchedBudgetItem: "School bags",
        budgetAmount: 220,
        remainingBudget: 0,
        status: "POSSIBLE_MATCH"
      });

      // 3. Submit authorized human review using HttpOnly cookie (browser flow)
      const reviewRes = await fetch(`${baseUrl}/api/receipt-reviews/${rev.review.id}/human-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieValue
        },
        body: JSON.stringify({
          decision: "APPROVED",
          reviewerNotes: "Physical delivery verified on site."
        })
      });

      assert.equal(reviewRes.status, 200);
      const reviewResult = await reviewRes.json();
      assert.equal(reviewResult.review.humanReviewStatus, "APPROVED");
      assert.equal(reviewResult.review.reviewedBy, "Authorized Human Auditor");

      // 4. Submit authorized audit timeline event using HttpOnly cookie
      const timelineRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieValue
        },
        body: JSON.stringify({
          eventType: "AUDIT_NOTE",
          status: "IN_PROGRESS",
          description: "Auditor on-site field inspection complete.",
          evidenceRef: "AUDIT-DOC-2026-X"
        })
      });

      assert.equal(timelineRes.status, 201);
      const timelineResult = await timelineRes.json();
      assert.equal(timelineResult.event.eventType, "AUDIT_NOTE");
      assert.equal(timelineResult.event.evidenceRef, "AUDIT-DOC-2026-X");

      // 5. Test session verification endpoint with cookie
      const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: cookieValue }
      });
      assert.equal(sessionRes.status, 200);
      const sessionData = await sessionRes.json();
      assert.equal(sessionData.authenticated, true);
      assert.equal(sessionData.auditor.role, "AUDITOR");
      assert.strictEqual(sessionData.token, undefined, "Session endpoint must not return token in JSON");

      // 6. Verify Bearer-token support remains functional for authorized script / API callers
      const scriptToken = createAuditorSessionToken({ id: "auditor_script", name: "Script Auditor" });
      const bearerRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${scriptToken}`
        },
        body: JSON.stringify({
          eventType: "AUDIT_NOTE",
          status: "IN_PROGRESS",
          description: "Automated script audit record.",
          evidenceRef: "SCRIPT-AUDIT-REF"
        })
      });
      assert.equal(bearerRes.status, 201);
    });

    it("regression test: browser login does not disclose session token in JSON and maintains session via HttpOnly cookie", async () => {
      const secret = getAuditorSecret();

      const loginRes = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: secret })
      });

      assert.equal(loginRes.status, 200);
      const body = await loginRes.json();

      // Explicit verification: no token in JSON
      assert.equal(body.success, true);
      assert.equal(body.authenticated, true);
      assert.ok(body.auditor);
      assert.equal(body.auditor.role, "AUDITOR");
      assert.strictEqual(body.token, undefined);
      assert.strictEqual(body.sessionToken, undefined);
      assert.strictEqual(body.jwt, undefined);
      assert.strictEqual(body.secret, undefined);

      // Verify Set-Cookie header contains HttpOnly and SameSite=Lax
      const cookieHeader = loginRes.headers.get("set-cookie");
      assert.ok(cookieHeader);
      assert.match(cookieHeader, /nekitrail_auditor_session=/);
      assert.match(cookieHeader, /HttpOnly/i);
      assert.match(cookieHeader, /SameSite=Lax/i);

      // Session verification via cookie works without returning token
      const cookieVal = cookieHeader.split(";")[0];
      const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: cookieVal }
      });
      assert.equal(sessionRes.status, 200);
      const sessionBody = await sessionRes.json();
      assert.equal(sessionBody.authenticated, true);
      assert.strictEqual(sessionBody.token, undefined);
    });

    it("regression test: arbitrary/nonexistent evidence references cannot complete a campaign via API and valid linked evidence succeeds", async () => {
      const secret = getAuditorSecret();
      await connectDB("");

      // Authenticate to get session cookie
      const loginRes = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: secret })
      });
      const cookieHeader = loginRes.headers.get("set-cookie");
      const cookieVal = cookieHeader.split(";")[0];

      // 1. Attempt completion with fabricated non-existent evidenceRef
      const fakeCompletionRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieVal
        },
        body: JSON.stringify({
          eventType: "CAMPAIGN_COMPLETED",
          status: "COMPLETED",
          description: "Attempted completion with fabricated evidence ref.",
          evidenceRef: "FABRICATED-PROOF-XYZ-999"
        })
      });

      assert.equal(fakeCompletionRes.status, 400);
      const fakeErr = await fakeCompletionRes.json();
      assert.match(fakeErr.error, /does not point to any registered evidence record or approved receipt review/i);

      // Verify milestone remains pending via GET timeline
      const timelinePendingRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`);
      const timelinePending = await timelinePendingRes.json();
      assert.equal(timelinePending.milestoneSummary.completed, false);
      assert.equal(timelinePending.completionAuthorized, false);
      assert.notEqual(timelinePending.currentMilestone, "COMPLETED");

      // 2. Register authentic evidence record via POST /api/campaigns/:id/evidence
      const registerRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieVal
        },
        body: JSON.stringify({
          evidenceRef: "CERT-INSPECT-2026-FINAL",
          title: "Official Community School Kits Receipt & Field Inspection Certificate",
          description: "On-site verification confirming 400 student packs delivered and accounted for.",
          evidenceType: "COMPLETION_CERTIFICATE"
        })
      });

      assert.equal(registerRes.status, 201);
      const registerData = await registerRes.json();
      assert.equal(registerData.evidence.evidenceRef, "CERT-INSPECT-2026-FINAL");

      // Inspect GET /api/campaigns/:id/evidence
      const getEvidenceRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/evidence`);
      assert.equal(getEvidenceRes.status, 200);
      const evidenceList = await getEvidenceRes.json();
      assert.ok(evidenceList.evidence.some((e) => e.evidenceRef === "CERT-INSPECT-2026-FINAL"));

      // 3. Now submit authorized completion with the registered evidenceRef
      const validCompletionRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieVal
        },
        body: JSON.stringify({
          eventType: "CAMPAIGN_COMPLETED",
          status: "COMPLETED",
          description: "Auditor certified final campaign completion with verified on-site inspection certificate.",
          evidenceRef: "CERT-INSPECT-2026-FINAL"
        })
      });

      assert.equal(validCompletionRes.status, 201);
      const validData = await validCompletionRes.json();
      assert.equal(validData.event.status, "COMPLETED");
      assert.equal(validData.event.evidenceRef, "CERT-INSPECT-2026-FINAL");

      // 4. Verify campaign milestone is now COMPLETED
      const timelineDoneRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`);
      const timelineDone = await timelineDoneRes.json();
      assert.equal(timelineDone.currentMilestone, "COMPLETED");
      assert.equal(timelineDone.milestoneSummary.completed, true);
      assert.equal(timelineDone.completionAuthorized, true);
      assert.equal(timelineDone.completionPendingReason, null);
    });

    it("supports HTTP-only cookie session authentication and terminates on logout", async () => {
      const secret = getAuditorSecret();

      // Login to get Set-Cookie
      const loginRes = await fetch(`${baseUrl}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: secret })
      });
      assert.equal(loginRes.status, 200);
      const cookieHeader = loginRes.headers.get("set-cookie");
      assert.ok(cookieHeader, "Should receive Set-Cookie header");
      assert.match(cookieHeader, /nekitrail_auditor_session=/);
      assert.match(cookieHeader, /HttpOnly/i);

      // Extract cookie value for testing
      const cookieValue = cookieHeader.split(";")[0];

      // Access protected endpoint using cookie
      const timelineRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieValue
        },
        body: JSON.stringify({
          eventType: "AUDIT_NOTE",
          status: "IN_PROGRESS",
          description: "Cookie session authenticated audit note.",
          evidenceRef: "COOKIE-AUTH-REF"
        })
      });
      assert.equal(timelineRes.status, 201);

      // Logout
      const logoutRes = await fetch(`${baseUrl}/api/auth/auditor-logout`, {
        method: "POST"
      });
      assert.equal(logoutRes.status, 200);
      const clearCookie = logoutRes.headers.get("set-cookie");
      assert.ok(clearCookie, "Should clear session cookie on logout");
      assert.match(clearCookie, /nekitrail_auditor_session=;/);

      // Verify session check after logout returns unauthenticated
      const clearedCookieVal = clearCookie.split(";")[0];
      const sessionAfterLogout = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Cookie: clearedCookieVal }
      });
      const sessionData = await sessionAfterLogout.json();
      assert.equal(sessionData.authenticated, false);

      // Verify protected endpoint rejects request after logout with HTTP 401
      const postLogoutRes = await fetch(`${baseUrl}/api/campaigns/school-kit-drive/timeline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: clearedCookieVal
        },
        body: JSON.stringify({
          eventType: "AUDIT_NOTE",
          status: "IN_PROGRESS",
          description: "Post logout attempt.",
          evidenceRef: "LOGOUT-REF"
        })
      });
      // Also verify /api/auth/logout alias route terminates session
      const aliasLogoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST"
      });
      assert.equal(aliasLogoutRes.status, 200);
      const aliasClearCookie = aliasLogoutRes.headers.get("set-cookie");
      assert.ok(aliasClearCookie, "Should clear session cookie on /api/auth/logout");
      assert.match(aliasClearCookie, /nekitrail_auditor_session=;/);
    });
  });
});
