import "dotenv/config";
import dns from "node:dns";
import express from "express";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
import cors from "cors";
import { campaigns, getCampaignsWithCapturedTotals, orderRegistry } from "./campaigns.js";
import {
  compareReceiptWithBudget,
  extractReceiptFromImage,
  getSampleDemoReceiptReview,
  reviewReceipt,
  summarizeCampaign
} from "./ai.js";
import { captureDonationOrder, createDonationOrder, getPayPalConfig } from "./paypal.js";
import {
  connectDB,
  getCampaignEvidence,
  getCampaignTimeline,
  getPaymentRecords,
  getPersistedTotalsByCampaign,
  getReceiptReviews,
  getStorageMode,
  saveCampaignEvidence,
  savePaymentRecord,
  saveReceiptReview,
  saveTimelineEvent,
  updateReceiptHumanReview,
  validateCampaignEvidenceRef
} from "./db.js";
import {
  requireAuditorAuth,
  auditorLoginHandler,
  auditorSessionHandler,
  auditorLogoutHandler
} from "./auth.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Auditor Authentication endpoints
app.post("/api/auth/auditor-login", auditorLoginHandler);
app.get("/api/auth/session", auditorSessionHandler);
app.post("/api/auth/auditor-logout", auditorLogoutHandler);
app.post("/api/auth/logout", auditorLogoutHandler);


const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateImageFile({ buffer, mimeType, filename }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, error: "Image data is missing or invalid." };
  }

  if (buffer.length === 0) {
    return { valid: false, error: "The uploaded file is empty." };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image file exceeds the 5 MB limit (size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    };
  }

  const normalizedMime = String(mimeType || "").toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return {
      valid: false,
      error: `Unsupported file type: ${normalizedMime || "unknown"}. Only JPEG, PNG, and WebP images are allowed.`
    };
  }

  // Verify file content using magic byte signatures
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (normalizedMime === "image/jpeg" && !isJpeg) {
    return { valid: false, error: "Invalid image content: file does not match a valid JPEG signature." };
  }
  if (normalizedMime === "image/png" && !isPng) {
    return { valid: false, error: "Invalid image content: file does not match a valid PNG signature." };
  }
  if (normalizedMime === "image/webp" && !isWebp) {
    return { valid: false, error: "Invalid image content: file does not match a valid WebP signature." };
  }

  return { valid: true };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "nekitrail-ai-api",
    mode: "hackathon-prototype",
    storage: getStorageMode()
  });
});

app.get("/api/campaigns", async (_req, res, next) => {
  try {
    const totals = await getPersistedTotalsByCampaign();
    const dynamicCampaigns = getCampaignsWithCapturedTotals(totals);
    dynamicCampaigns.forEach((dc) => {
      const existing = campaigns.find((item) => item.id === dc.id);
      if (existing) existing.raised = dc.raised;
    });
    res.json({ campaigns: dynamicCampaigns });
  } catch (error) {
    next(error);
  }
});

app.get("/api/paypal/config", (_req, res) => {
  res.json(getPayPalConfig());
});

app.post("/api/ai/campaign-summary", async (req, res, next) => {
  try {
    const brief = String(req.body?.brief || "").trim();
    const budgetItems = Array.isArray(req.body?.budgetItems) ? req.body.budgetItems : [];
    if (!brief) return res.status(400).json({ error: "Please enter a short campaign brief." });
    if (brief.length > 4000) return res.status(400).json({ error: "Campaign brief must be 4,000 characters or fewer." });
    if (budgetItems.length > 30) return res.status(400).json({ error: "Provide no more than 30 budget items." });
    const safeItems = budgetItems.map((item) => ({
      item: String(item?.item || "").slice(0, 120),
      amount: Number.isFinite(Number(item?.amount)) ? Number(item.amount) : 0
    }));
    const summary = await summarizeCampaign({ brief, budgetItems: safeItems });
    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/receipt-review", async (req, res, next) => {
  try {
    const campaignId = String(req.body?.campaignId || "");
    const receiptText = String(req.body?.receiptText || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!receiptText) return res.status(400).json({ error: "Please enter the receipt text to review." });
    if (receiptText.length > 4000) return res.status(400).json({ error: "Receipt text must be 4,000 characters or fewer." });
    const review = await reviewReceipt({ receiptText, campaign });

    const saveResult = await saveReceiptReview({
      campaignId: campaign.id,
      filename: "manual-entry.txt",
      fileMimeType: "text/plain",
      fileSize: Buffer.byteLength(receiptText, "utf8"),
      source: "manual-text",
      extractedData: {
        vendor: null,
        date: null,
        currency: "USD",
        totalAmount: review.receiptAmount,
        lineItems: [],
        tax: null
      },
      matchedBudgetItem: review.matchedBudgetItem,
      budgetAmount: review.budgetAmount,
      remainingBudget: review.remainingBudget,
      status: review.status,
      explanation: review.explanation,
      flags: review.flags
    });

    res.json({ review, persisted: saveResult.persisted, storage: getStorageMode() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/receipt-image-review", async (req, res, next) => {
  try {
    const campaignId = String(req.body?.campaignId || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    let rawImage = String(req.body?.image || "").trim();
    if (!rawImage) {
      return res.status(400).json({ error: "Please select a receipt image file (JPEG, PNG, or WebP)." });
    }

    if (rawImage.startsWith("data:")) {
      const commaIndex = rawImage.indexOf(",");
      if (commaIndex !== -1) {
        rawImage = rawImage.slice(commaIndex + 1);
      }
    }

    let buffer;
    try {
      buffer = Buffer.from(rawImage, "base64");
    } catch {
      return res.status(400).json({ error: "The provided image data could not be parsed." });
    }

    const mimeType = String(req.body?.mimeType || "image/jpeg").toLowerCase();
    const filename = String(req.body?.filename || "receipt-image").slice(0, 200);

    const validation = validateImageFile({ buffer, mimeType, filename });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const extractedData = await extractReceiptFromImage({
      imageBuffer: buffer,
      mimeType,
      filename
    });

    const existingReviews = await getReceiptReviews(campaign.id);
    const comparison = compareReceiptWithBudget({
      extractedData,
      campaign,
      existingReviews
    });

    const saveResult = await saveReceiptReview({
      campaignId: campaign.id,
      filename,
      fileMimeType: mimeType,
      fileSize: buffer.length,
      source: "image-upload",
      extractedData,
      matchedBudgetItem: comparison.matchedBudgetItem,
      budgetAmount: comparison.budgetAmount,
      remainingBudget: comparison.remainingBudget,
      status: comparison.status,
      explanation: comparison.explanation,
      flags: comparison.flags
    });

    res.json({
      review: saveResult.review,
      extractedData,
      persisted: saveResult.persisted,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/sample-receipt-demo", (req, res) => {
  const campaignId = String(req.query?.campaignId || "community-water-filter");
  const result = getSampleDemoReceiptReview(campaignId);
  res.json(result);
});

app.get("/api/receipt-reviews", async (req, res, next) => {
  try {
    const campaignId = req.query?.campaignId ? String(req.query.campaignId) : undefined;
    const reviews = await getReceiptReviews(campaignId);
    res.json({ reviews, storage: getStorageMode() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/receipt-reviews/:id/human-review", requireAuditorAuth, async (req, res, next) => {
  try {
    const reviewId = String(req.params.id || "").trim();
    if (!reviewId) {
      return res.status(400).json({ error: "Review ID is required." });
    }

    if (reviewId.startsWith("sample-demo-")) {
      return res.status(400).json({
        error: "Cannot record human review on a sample demo receipt. Sample presentation mode cannot approve expenses or advance campaign milestones."
      });
    }

    const decision = String(req.body?.decision || "").toUpperCase().trim();
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "Decision must be either 'APPROVED' or 'REJECTED'." });
    }

    const reviewerNotes = req.body?.reviewerNotes ? String(req.body.reviewerNotes).trim().slice(0, 500) : null;
    // Server-side authenticated auditor identity - never trust client role or client-supplied name override
    const reviewedBy = req.auditor?.name || "Authorized Human Auditor";

    const result = await updateReceiptHumanReview({
      reviewId,
      decision,
      reviewerNotes,
      reviewedBy
    });

    res.json({
      review: result.review,
      persisted: result.persisted,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns/:campaignId/timeline", async (req, res, next) => {
  try {
    const campaignId = String(req.params.campaignId || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const timelineData = await getCampaignTimeline(campaignId);
    res.json({
      ...timelineData,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/campaigns/:campaignId/timeline", requireAuditorAuth, async (req, res, next) => {
  try {
    const campaignId = String(req.params.campaignId || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const allowedEventTypes = [
      "CAMPAIGN_PLANNED",
      "DONATION_CAPTURED",
      "TEST_PAYMENT_CAPTURED",
      "CAMPAIGN_IN_PROGRESS",
      "EVIDENCE_SUBMITTED",
      "HUMAN_REVIEW_COMPLETED",
      "CAMPAIGN_COMPLETED",
      "AUDIT_NOTE"
    ];
    const allowedStatuses = ["PLANNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED", "HUMAN_REVIEW_COMPLETED", "COMPLETED"];

    const eventType = String(req.body?.eventType || "AUDIT_NOTE").trim();
    if (!allowedEventTypes.includes(eventType)) {
      return res.status(400).json({ error: `Invalid eventType. Allowed types: ${allowedEventTypes.join(", ")}` });
    }

    const status = String(req.body?.status || "IN_PROGRESS").trim();
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed statuses: ${allowedStatuses.join(", ")}` });
    }

    const description = String(req.body?.description || "").trim();
    if (!description || description.length < 3 || description.length > 1000) {
      return res.status(400).json({ error: "Description is required (between 3 and 1,000 characters)." });
    }

    const evidenceRef = req.body?.evidenceRef ? String(req.body.evidenceRef).trim().slice(0, 200) : null;

    if (
      (status === "HUMAN_REVIEW_COMPLETED" || status === "COMPLETED" || eventType === "CAMPAIGN_COMPLETED") &&
      !evidenceRef
    ) {
      return res.status(400).json({
        error: `${status === "COMPLETED" || eventType === "CAMPAIGN_COMPLETED" ? "Campaign completion" : "Human review milestone"} requires a supporting evidence reference.`
      });
    }

    if (status === "COMPLETED" || eventType === "CAMPAIGN_COMPLETED") {
      const check = await validateCampaignEvidenceRef(campaign.id, evidenceRef);
      if (!check.valid) {
        return res.status(400).json({
          error: `Cannot complete campaign: ${check.error || "evidence reference is not associated with this campaign."}`
        });
      }
    }

    const saveResult = await saveTimelineEvent({
      campaignId: campaign.id,
      eventType,
      status,
      description,
      evidenceRef,
      timestamp: req.body?.timestamp
    });

    res.status(201).json({
      event: saveResult.event,
      persisted: saveResult.persisted,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns/:campaignId/evidence", async (req, res, next) => {
  try {
    const campaignId = String(req.params.campaignId || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const evidenceList = await getCampaignEvidence(campaignId);
    const reviews = await getReceiptReviews(campaignId);
    const approvedReviews = reviews.filter((r) => r.humanReviewStatus === "APPROVED");

    res.json({
      campaignId,
      evidence: evidenceList,
      approvedReviews: approvedReviews.map((r) => ({
        id: r.id || r._id,
        filename: r.filename,
        matchedBudgetItem: r.matchedBudgetItem,
        amount: r.extractedData?.totalAmount || r.budgetAmount,
        humanReviewStatus: r.humanReviewStatus,
        reviewedBy: r.reviewedBy
      })),
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/campaigns/:campaignId/evidence", requireAuditorAuth, async (req, res, next) => {
  try {
    const campaignId = String(req.params.campaignId || "").trim();
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const { evidenceRef, title, description, evidenceType } = req.body || {};
    if (!evidenceRef || String(evidenceRef).trim().length < 3) {
      return res.status(400).json({ error: "Evidence reference identifier is required (at least 3 characters)." });
    }
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: "Evidence title is required (at least 3 characters)." });
    }

    const verifiedBy = req.auditor?.name || "Authorized Human Auditor";
    const result = await saveCampaignEvidence({
      campaignId: campaign.id,
      evidenceRef: String(evidenceRef).trim(),
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      evidenceType,
      verifiedBy
    });

    res.status(201).json({
      evidence: result.evidence,
      persisted: result.persisted,
      duplicate: result.duplicate || false,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/paypal/orders", async (req, res, next) => {
  try {
    const campaignId = String(req.body?.campaignId || "");
    const amount = Number(req.body?.amount);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
      return res.status(400).json({ error: "Demo contributions must be between $1 and $5,000." });
    }
    const order = await createDonationOrder({ campaign, amount });
    orderRegistry.set(order.id, { campaignId, amount: Number(amount.toFixed(2)), currency: order.currency, captured: false });
    res.status(201).json({ id: order.id });
  } catch (error) {
    next(error);
  }
});

app.post("/api/paypal/orders/:orderId/capture", async (req, res, next) => {
  try {
    const orderId = String(req.params.orderId || "");
    const registeredOrder = orderRegistry.get(orderId);
    if (!registeredOrder) return res.status(404).json({ error: "This order was not created by this running demo session." });

    if (registeredOrder.captured) {
      return res.json({ status: "COMPLETED", message: "This demo order was already recorded." });
    }

    const result = await captureDonationOrder(orderId);
    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];
    if (result.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
      return res.status(409).json({ error: "PayPal did not confirm a completed capture.", status: result.status || "UNKNOWN" });
    }

    const capturedAmount = Number(capture?.amount?.value);
    if (!Number.isFinite(capturedAmount) || capturedAmount !== registeredOrder.amount || capture?.amount?.currency_code !== registeredOrder.currency) {
      return res.status(409).json({ error: "Captured amount did not match the registered demo order. Manual review required." });
    }

    registeredOrder.captured = true;

    const saveResult = await savePaymentRecord({
      orderId,
      captureId: capture.id,
      campaignId: registeredOrder.campaignId,
      amount: capturedAmount,
      currency: registeredOrder.currency,
      status: "COMPLETED",
      createdAt: new Date().toISOString()
    });

    // Update in-memory campaigns representation to reflect new totals
    const totals = await getPersistedTotalsByCampaign();
    const dynamicCampaigns = getCampaignsWithCapturedTotals(totals);
    dynamicCampaigns.forEach((dc) => {
      const existing = campaigns.find((item) => item.id === dc.id);
      if (existing) existing.raised = dc.raised;
    });

    res.json({
      status: "COMPLETED",
      captureId: capture.id,
      amount: capturedAmount,
      currency: registeredOrder.currency,
      persisted: saveResult.persisted,
      storage: getStorageMode()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/payments", async (_req, res, next) => {
  try {
    const records = await getPaymentRecords();
    res.json({ payments: records, storage: getStorageMode() });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error("API error:", error.message);
  res.status(status).json({
    error: error.message || "Unexpected server error.",
    code: error.code || undefined
  });
});

const isRunningInTest =
  process.env.NODE_ENV === "test" ||
  process.execArgv.includes("--test") ||
  process.argv.some((arg) => arg.includes("test"));

let serverInstance = null;
if (!isRunningInTest) {
  serverInstance = app.listen(port, () => {
    console.log(`NekiTrail API listening on http://localhost:${port}`);
    console.log(`AI mode: ${process.env.GEMINI_API_KEY ? `configured (model: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"})` : "demo fallback; add GEMINI_API_KEY for live AI"}`);
    console.log(`PayPal mode: ${getPayPalConfig().sandboxReady ? "Sandbox credentials configured" : "not configured yet"}`);
    connectDB().then((dbStatus) => {
      console.log(
        `Storage mode: ${
          dbStatus.connected
            ? "MongoDB persistent storage connected"
            : "in-memory development fallback (transient; configure MONGODB_URI for persistence)"
        }`
      );
    });
  });
}

export { app, serverInstance };
export default app;
