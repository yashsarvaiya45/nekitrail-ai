import mongoose from "mongoose";
import { baselineCampaigns } from "./campaigns.js";

let isConnected = false;
let connectionAttempted = false;
const inMemoryFallbackPayments = [];
const inMemoryFallbackReviews = [];
const inMemoryFallbackTimelineEvents = [];
const inMemoryFallbackEvidence = [];

const paymentRecordSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    captureId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    campaignId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
      trim: true
    },
    status: {
      type: String,
      required: true,
      enum: ["COMPLETED"],
      default: "COMPLETED"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

export const PaymentRecord = mongoose.models.PaymentRecord || mongoose.model("PaymentRecord", paymentRecordSchema);

const receiptReviewSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    filename: {
      type: String,
      trim: true,
      default: "receipt"
    },
    fileMimeType: {
      type: String,
      trim: true,
      default: "application/octet-stream"
    },
    fileSize: {
      type: Number,
      default: 0
    },
    source: {
      type: String,
      enum: ["image-upload", "manual-text"],
      default: "image-upload"
    },
    extractedData: {
      vendor: { type: String, default: null },
      date: { type: String, default: null },
      currency: { type: String, default: "USD" },
      totalAmount: { type: Number, default: null },
      lineItems: [
        {
          description: { type: String, default: "" },
          quantity: { type: Number, default: null },
          unitPrice: { type: Number, default: null },
          amount: { type: Number, default: null }
        }
      ],
      tax: { type: Number, default: null }
    },
    matchedBudgetItem: { type: String, default: null },
    budgetAmount: { type: Number, default: null },
    remainingBudget: { type: Number, default: null },
    status: {
      type: String,
      required: true,
      enum: ["POSSIBLE_MATCH", "REVIEW", "NO_MATCH"],
      default: "REVIEW"
    },
    humanReviewStatus: {
      type: String,
      required: true,
      enum: ["PENDING_HUMAN_REVIEW", "APPROVED", "REJECTED"],
      default: "PENDING_HUMAN_REVIEW"
    },
    reviewerNotes: {
      type: String,
      default: null,
      trim: true
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: String,
      default: null,
      trim: true
    },
    explanation: { type: String, default: "" },
    flags: [{ type: String }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

export const ReceiptReview = mongoose.models.ReceiptReview || mongoose.model("ReceiptReview", receiptReviewSchema);

const timelineEventSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "CAMPAIGN_PLANNED",
        "DONATION_CAPTURED",
        "TEST_PAYMENT_CAPTURED",
        "CAMPAIGN_IN_PROGRESS",
        "EVIDENCE_SUBMITTED",
        "HUMAN_REVIEW_COMPLETED",
        "CAMPAIGN_COMPLETED",
        "AUDIT_NOTE"
      ]
    },
    status: {
      type: String,
      required: true,
      trim: true,
      enum: ["PLANNED", "IN_PROGRESS", "EVIDENCE_SUBMITTED", "HUMAN_REVIEW_COMPLETED", "COMPLETED"]
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    evidenceRef: {
      type: String,
      trim: true,
      default: null,
      maxlength: 200
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

export const TimelineEvent = mongoose.models.TimelineEvent || mongoose.model("TimelineEvent", timelineEventSchema);

const campaignEvidenceSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    evidenceRef: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000
    },
    evidenceType: {
      type: String,
      enum: ["COMPLETION_CERTIFICATE", "INSPECTION_REPORT", "DELIVERY_AUDIT", "RECEIPT_BATCH", "OTHER"],
      default: "COMPLETION_CERTIFICATE"
    },
    verifiedBy: {
      type: String,
      trim: true,
      default: "Authorized Human Auditor"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

export const CampaignEvidence =
  mongoose.models.CampaignEvidence || mongoose.model("CampaignEvidence", campaignEvidenceSchema);

export async function connectDB(customUri) {
  connectionAttempted = true;
  const uri = customUri !== undefined ? customUri : process.env.MONGODB_URI;

  if (!uri) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    isConnected = false;
    return {
      connected: false,
      mode: "in-memory-fallback",
      message: "MONGODB_URI not configured. Using in-memory development fallback (non-persistent)."
    };
  }

  try {
    // Avoid re-connecting if already open
    if (mongoose.connection.readyState === 1) {
      isConnected = true;
      return { connected: true, mode: "mongodb", message: "Connected to MongoDB." };
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });
    isConnected = true;
    return { connected: true, mode: "mongodb", message: "Connected to MongoDB." };
  } catch (err) {
    isConnected = false;
    console.warn(`[Storage Warning] MongoDB connection failed: ${err.message}. Operating in in-memory fallback mode.`);
    return {
      connected: false,
      mode: "in-memory-fallback",
      error: err.message,
      message: "MongoDB connection failed. Operating in in-memory fallback mode (non-persistent)."
    };
  }
}

export function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export function getStorageMode() {
  return isDbConnected() ? "mongodb" : "in-memory-fallback";
}

export async function savePaymentRecord(record) {
  const { orderId, captureId, campaignId, amount, currency, status, createdAt } = record;
  const safeAmount = Number(amount);
  const safeCreatedAt = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();

  if (isDbConnected()) {
    try {
      const doc = await PaymentRecord.create({
        orderId,
        captureId,
        campaignId,
        amount: safeAmount,
        currency: currency || "USD",
        status: status || "COMPLETED",
        createdAt: new Date(safeCreatedAt)
      });
      return {
        persisted: true,
        record: {
          orderId: doc.orderId,
          captureId: doc.captureId,
          campaignId: doc.campaignId,
          amount: doc.amount,
          currency: doc.currency,
          status: doc.status,
          createdAt: doc.createdAt.toISOString()
        }
      };
    } catch (err) {
      // E11000 duplicate key error
      if (err.code === 11000) {
        const existing = await PaymentRecord.findOne({
          $or: [{ orderId }, { captureId }]
        }).lean();
        return {
          persisted: true,
          duplicate: true,
          record: existing
            ? {
                orderId: existing.orderId,
                captureId: existing.captureId,
                campaignId: existing.campaignId,
                amount: existing.amount,
                currency: existing.currency,
                status: existing.status,
                createdAt: new Date(existing.createdAt).toISOString()
              }
            : null
        };
      }
      throw err;
    }
  }

  // Fallback in-memory
  const existing = inMemoryFallbackPayments.find((p) => p.orderId === orderId || p.captureId === captureId);
  if (existing) {
    return { persisted: false, duplicate: true, record: existing };
  }

  const newRecord = {
    orderId,
    captureId,
    campaignId,
    amount: safeAmount,
    currency: currency || "USD",
    status: status || "COMPLETED",
    createdAt: safeCreatedAt
  };
  inMemoryFallbackPayments.push(newRecord);
  return { persisted: false, record: newRecord };
}

export async function getPaymentRecords() {
  if (isDbConnected()) {
    const docs = await PaymentRecord.find().sort({ createdAt: 1 }).lean();
    return docs.map((doc) => ({
      orderId: doc.orderId,
      captureId: doc.captureId,
      campaignId: doc.campaignId,
      amount: doc.amount,
      currency: doc.currency,
      status: doc.status,
      createdAt: new Date(doc.createdAt).toISOString()
    }));
  }
  return [...inMemoryFallbackPayments];
}

export async function getPersistedTotalsByCampaign() {
  const records = await getPaymentRecords();
  const totals = {};
  for (const record of records) {
    if (record.status === "COMPLETED") {
      totals[record.campaignId] = Number(((totals[record.campaignId] || 0) + Number(record.amount || 0)).toFixed(2));
    }
  }
  return totals;
}

export async function saveReceiptReview(reviewData) {
  const {
    campaignId,
    filename,
    fileMimeType,
    fileSize,
    source,
    extractedData,
    matchedBudgetItem,
    budgetAmount,
    remainingBudget,
    status,
    humanReviewStatus,
    explanation,
    flags,
    createdAt
  } = reviewData;

  const safeCreatedAt = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  const safeData = {
    campaignId: String(campaignId || "").trim(),
    filename: String(filename || "receipt").slice(0, 200),
    fileMimeType: String(fileMimeType || "application/octet-stream").slice(0, 100),
    fileSize: Math.max(0, Number(fileSize) || 0),
    source: source === "manual-text" ? "manual-text" : "image-upload",
    extractedData: {
      vendor: extractedData?.vendor ? String(extractedData.vendor).slice(0, 200) : null,
      date: extractedData?.date ? String(extractedData.date).slice(0, 50) : null,
      currency: String(extractedData?.currency || "USD").toUpperCase(),
      totalAmount: Number.isFinite(Number(extractedData?.totalAmount)) ? Number(Number(extractedData.totalAmount).toFixed(2)) : null,
      lineItems: Array.isArray(extractedData?.lineItems)
        ? extractedData.lineItems.slice(0, 50).map((item) => ({
            description: String(item.description || item.item || "").slice(0, 200),
            quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
            unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(Number(item.unitPrice).toFixed(2)) : null,
            amount: Number.isFinite(Number(item.amount)) ? Number(Number(item.amount).toFixed(2)) : null
          }))
        : [],
      tax: Number.isFinite(Number(extractedData?.tax)) ? Number(Number(extractedData.tax).toFixed(2)) : null
    },
    matchedBudgetItem: matchedBudgetItem ? String(matchedBudgetItem).slice(0, 200) : null,
    budgetAmount: Number.isFinite(Number(budgetAmount)) ? Number(Number(budgetAmount).toFixed(2)) : null,
    remainingBudget: Number.isFinite(Number(remainingBudget)) ? Number(Number(remainingBudget).toFixed(2)) : null,
    status: ["POSSIBLE_MATCH", "REVIEW", "NO_MATCH"].includes(status) ? status : "REVIEW",
    humanReviewStatus: ["PENDING_HUMAN_REVIEW", "APPROVED", "REJECTED"].includes(humanReviewStatus)
      ? humanReviewStatus
      : "PENDING_HUMAN_REVIEW",
    reviewerNotes: reviewData.reviewerNotes ? String(reviewData.reviewerNotes).slice(0, 500) : null,
    reviewedAt: reviewData.reviewedAt ? new Date(reviewData.reviewedAt).toISOString() : null,
    reviewedBy: reviewData.reviewedBy ? String(reviewData.reviewedBy).slice(0, 100) : null,
    explanation: String(explanation || "").slice(0, 2000),
    flags: Array.isArray(flags) ? flags.map(String).slice(0, 20) : [],
    createdAt: safeCreatedAt
  };

  if (isDbConnected()) {
    const doc = await ReceiptReview.create({
      ...safeData,
      reviewedAt: safeData.reviewedAt ? new Date(safeData.reviewedAt) : null,
      createdAt: new Date(safeCreatedAt)
    });
    return {
      persisted: true,
      review: {
        id: doc._id.toString(),
        campaignId: doc.campaignId,
        filename: doc.filename,
        fileMimeType: doc.fileMimeType,
        fileSize: doc.fileSize,
        source: doc.source,
        extractedData: doc.extractedData,
        matchedBudgetItem: doc.matchedBudgetItem,
        budgetAmount: doc.budgetAmount,
        remainingBudget: doc.remainingBudget,
        status: doc.status,
        humanReviewStatus: doc.humanReviewStatus,
        reviewerNotes: doc.reviewerNotes,
        reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
        reviewedBy: doc.reviewedBy,
        explanation: doc.explanation,
        flags: doc.flags,
        createdAt: doc.createdAt.toISOString()
      }
    };
  }

  // Fallback in-memory
  const fallbackRecord = {
    id: `fb_rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...safeData
  };
  inMemoryFallbackReviews.unshift(fallbackRecord);
  return {
    persisted: false,
    review: fallbackRecord
  };
}

export async function getReceiptReviews(campaignId) {
  if (isDbConnected()) {
    const query = campaignId ? { campaignId } : {};
    const docs = await ReceiptReview.find(query).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      campaignId: doc.campaignId,
      filename: doc.filename,
      fileMimeType: doc.fileMimeType,
      fileSize: doc.fileSize,
      source: doc.source,
      extractedData: doc.extractedData,
      matchedBudgetItem: doc.matchedBudgetItem,
      budgetAmount: doc.budgetAmount,
      remainingBudget: doc.remainingBudget,
      status: doc.status,
      humanReviewStatus: doc.humanReviewStatus,
      reviewerNotes: doc.reviewerNotes || null,
      reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
      reviewedBy: doc.reviewedBy || null,
      explanation: doc.explanation,
      flags: doc.flags,
      createdAt: new Date(doc.createdAt).toISOString()
    }));
  }

  if (campaignId) {
    return inMemoryFallbackReviews.filter((r) => r.campaignId === campaignId);
  }
  return [...inMemoryFallbackReviews];
}

export async function updateReceiptHumanReview({ reviewId, decision, reviewerNotes, reviewedBy }) {
  const safeDecision = decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const safeNotes = reviewerNotes ? String(reviewerNotes).trim().slice(0, 500) : null;
  const safeReviewer = reviewedBy ? String(reviewedBy).trim().slice(0, 100) : "Authorized Auditor";
  const reviewedAt = new Date();

  if (isDbConnected()) {
    const doc = await ReceiptReview.findById(reviewId);
    if (!doc) {
      const err = new Error("Receipt review record not found.");
      err.status = 404;
      throw err;
    }
    doc.humanReviewStatus = safeDecision;
    doc.reviewerNotes = safeNotes;
    doc.reviewedBy = safeReviewer;
    doc.reviewedAt = reviewedAt;
    await doc.save();

    return {
      persisted: true,
      review: {
        id: doc._id.toString(),
        campaignId: doc.campaignId,
        filename: doc.filename,
        fileMimeType: doc.fileMimeType,
        fileSize: doc.fileSize,
        source: doc.source,
        extractedData: doc.extractedData,
        matchedBudgetItem: doc.matchedBudgetItem,
        budgetAmount: doc.budgetAmount,
        remainingBudget: doc.remainingBudget,
        status: doc.status,
        humanReviewStatus: doc.humanReviewStatus,
        reviewerNotes: doc.reviewerNotes,
        reviewedBy: doc.reviewedBy,
        reviewedAt: doc.reviewedAt.toISOString(),
        explanation: doc.explanation,
        flags: doc.flags,
        createdAt: doc.createdAt.toISOString()
      }
    };
  }

  // Fallback in-memory
  const index = inMemoryFallbackReviews.findIndex((r) => r.id === reviewId || r._id === reviewId);
  if (index === -1) {
    const err = new Error("Receipt review record not found.");
    err.status = 404;
    throw err;
  }

  inMemoryFallbackReviews[index].humanReviewStatus = safeDecision;
  inMemoryFallbackReviews[index].reviewerNotes = safeNotes;
  inMemoryFallbackReviews[index].reviewedBy = safeReviewer;
  inMemoryFallbackReviews[index].reviewedAt = reviewedAt.toISOString();

  return {
    persisted: false,
    review: { ...inMemoryFallbackReviews[index] }
  };
}

export async function saveTimelineEvent(eventData) {
  const { campaignId, eventType, status, description, evidenceRef, timestamp } = eventData;
  const safeTimestamp = timestamp ? new Date(timestamp) : new Date();

  const safeData = {
    campaignId: String(campaignId || "").trim(),
    eventType: String(eventType || "AUDIT_NOTE").trim(),
    status: String(status || "PLANNED").trim(),
    description: String(description || "").trim().slice(0, 1000),
    evidenceRef: evidenceRef ? String(evidenceRef).trim().slice(0, 200) : null,
    timestamp: safeTimestamp
  };

  if (safeData.eventType === "CAMPAIGN_COMPLETED" || safeData.status === "COMPLETED") {
    if (!safeData.evidenceRef) {
      const err = new Error("Campaign completion requires a supporting evidence reference.");
      err.status = 400;
      throw err;
    }
    const check = await validateCampaignEvidenceRef(safeData.campaignId, safeData.evidenceRef);
    if (!check.valid) {
      const err = new Error(`Cannot record campaign completion: ${check.error || "evidence reference is not associated with this campaign."}`);
      err.status = 400;
      throw err;
    }
  }

  if (isDbConnected()) {
    const doc = await TimelineEvent.create(safeData);
    return {
      persisted: true,
      event: {
        id: doc._id.toString(),
        campaignId: doc.campaignId,
        eventType: doc.eventType,
        status: doc.status,
        description: doc.description,
        evidenceRef: doc.evidenceRef,
        timestamp: doc.timestamp.toISOString()
      }
    };
  }

  const fallbackEvent = {
    id: `fb_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...safeData,
    timestamp: safeTimestamp.toISOString()
  };
  inMemoryFallbackTimelineEvents.push(fallbackEvent);
  return {
    persisted: false,
    event: fallbackEvent
  };
}

export async function getTimelineEvents(campaignId) {
  if (isDbConnected()) {
    const query = campaignId ? { campaignId } : {};
    const docs = await TimelineEvent.find(query).sort({ timestamp: 1 }).lean();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      campaignId: doc.campaignId,
      eventType: doc.eventType,
      status: doc.status,
      description: doc.description,
      evidenceRef: doc.evidenceRef,
      timestamp: new Date(doc.timestamp).toISOString()
    }));
  }

  if (campaignId) {
    return inMemoryFallbackTimelineEvents.filter((e) => e.campaignId === campaignId);
  }
  return [...inMemoryFallbackTimelineEvents];
}

export async function saveCampaignEvidence(data) {
  const { campaignId, evidenceRef, title, description, evidenceType, verifiedBy, createdAt } = data || {};
  const safeData = {
    campaignId: String(campaignId || "").trim(),
    evidenceRef: String(evidenceRef || "").trim(),
    title: String(title || "Evidence Document").trim().slice(0, 200),
    description: String(description || "").trim().slice(0, 2000),
    evidenceType: ["COMPLETION_CERTIFICATE", "INSPECTION_REPORT", "DELIVERY_AUDIT", "RECEIPT_BATCH", "OTHER"].includes(evidenceType)
      ? evidenceType
      : "COMPLETION_CERTIFICATE",
    verifiedBy: String(verifiedBy || "Authorized Human Auditor").trim().slice(0, 100),
    createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
  };

  if (!safeData.campaignId || !safeData.evidenceRef || !safeData.title) {
    throw new Error("campaignId, evidenceRef, and title are required to register an evidence record.");
  }

  if (isDbConnected()) {
    try {
      const doc = await CampaignEvidence.create({
        ...safeData,
        createdAt: new Date(safeData.createdAt)
      });
      return {
        persisted: true,
        evidence: {
          id: doc._id.toString(),
          campaignId: doc.campaignId,
          evidenceRef: doc.evidenceRef,
          title: doc.title,
          description: doc.description,
          evidenceType: doc.evidenceType,
          verifiedBy: doc.verifiedBy,
          createdAt: doc.createdAt.toISOString()
        }
      };
    } catch (err) {
      if (err.code === 11000) {
        const existing = await CampaignEvidence.findOne({ evidenceRef: safeData.evidenceRef }).lean();
        return {
          persisted: true,
          duplicate: true,
          evidence: existing
            ? {
                id: existing._id.toString(),
                campaignId: existing.campaignId,
                evidenceRef: existing.evidenceRef,
                title: existing.title,
                description: existing.description,
                evidenceType: existing.evidenceType,
                verifiedBy: existing.verifiedBy,
                createdAt: new Date(existing.createdAt).toISOString()
              }
            : null
        };
      }
      throw err;
    }
  }

  const existing = inMemoryFallbackEvidence.find((e) => e.evidenceRef === safeData.evidenceRef);
  if (existing) {
    return { persisted: false, duplicate: true, evidence: existing };
  }
  const item = { id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...safeData };
  inMemoryFallbackEvidence.push(item);
  return { persisted: false, evidence: item };
}

export async function getCampaignEvidence(campaignId) {
  if (isDbConnected()) {
    const query = campaignId ? { campaignId } : {};
    const docs = await CampaignEvidence.find(query).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      campaignId: doc.campaignId,
      evidenceRef: doc.evidenceRef,
      title: doc.title,
      description: doc.description,
      evidenceType: doc.evidenceType,
      verifiedBy: doc.verifiedBy,
      createdAt: new Date(doc.createdAt).toISOString()
    }));
  }

  return inMemoryFallbackEvidence
    .filter((e) => !campaignId || e.campaignId === campaignId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function validateCampaignEvidenceRef(campaignId, evidenceRef) {
  if (!evidenceRef || typeof evidenceRef !== "string") {
    return { valid: false, error: "Evidence reference is missing or invalid." };
  }
  const cleanRef = evidenceRef.trim();
  const cleanCampId = String(campaignId || "").trim();

  // 1. Check CampaignEvidence collection
  if (isDbConnected()) {
    const doc = await CampaignEvidence.findOne({ evidenceRef: cleanRef }).lean();
    if (doc) {
      if (doc.campaignId !== cleanCampId) {
        return {
          valid: false,
          error: `Evidence reference "${cleanRef}" is associated with campaign "${doc.campaignId}", not "${cleanCampId}".`
        };
      }
      return {
        valid: true,
        type: "CAMPAIGN_EVIDENCE",
        evidence: {
          id: doc._id.toString(),
          evidenceRef: doc.evidenceRef,
          title: doc.title,
          campaignId: doc.campaignId
        }
      };
    }
  } else {
    const match = inMemoryFallbackEvidence.find((e) => e.evidenceRef === cleanRef);
    if (match) {
      if (match.campaignId !== cleanCampId) {
        return {
          valid: false,
          error: `Evidence reference "${cleanRef}" is associated with campaign "${match.campaignId}", not "${cleanCampId}".`
        };
      }
      return {
        valid: true,
        type: "CAMPAIGN_EVIDENCE",
        evidence: match
      };
    }
  }

  // 2. Check approved ReceiptReview records for this campaign
  const reviews = await getReceiptReviews(cleanCampId);
  const matchedReview = reviews.find(
    (r) =>
      r.id === cleanRef ||
      r._id === cleanRef ||
      String(r._id) === cleanRef ||
      (r.filename && r.filename === cleanRef)
  );

  if (matchedReview) {
    if (matchedReview.campaignId !== cleanCampId) {
      return {
        valid: false,
        error: `Receipt evidence reference "${cleanRef}" belongs to campaign "${matchedReview.campaignId}", not "${cleanCampId}".`
      };
    }
    if (matchedReview.humanReviewStatus !== "APPROVED") {
      return {
        valid: false,
        error: `Receipt evidence reference "${cleanRef}" is in status "${matchedReview.humanReviewStatus}". Only approved receipts can support campaign completion.`
      };
    }
    return {
      valid: true,
      type: "RECEIPT_REVIEW",
      evidence: {
        id: matchedReview.id || matchedReview._id,
        evidenceRef: cleanRef,
        title: matchedReview.filename || "Receipt",
        campaignId: matchedReview.campaignId
      }
    };
  }

  return {
    valid: false,
    error: `Evidence reference "${cleanRef}" does not point to any registered evidence record or approved receipt review for campaign "${cleanCampId}".`
  };
}

export async function getCampaignTimeline(campaignId) {
  const campaign = baselineCampaigns.find((c) => c.id === campaignId);
  if (!campaign) {
    const err = new Error("Campaign not found.");
    err.status = 404;
    throw err;
  }

  const entries = [];

  // 1. Initial Planned milestone from campaign definition
  const inceptionDate = "2026-10-01T08:00:00.000Z";
  entries.push({
    id: `plan_${campaign.id}`,
    timestamp: inceptionDate,
    campaignId: campaign.id,
    eventType: "CAMPAIGN_PLANNED",
    status: "PLANNED",
    description: `Campaign planned with approved community budget of $${campaign.goal.toFixed(2)} USD across ${campaign.budget.length} itemized cost categories.`,
    evidenceRef: `budget-plan-${campaign.id}`
  });

  // 2. Verified captured test payments (isolated from real donations)
  const allPayments = await getPaymentRecords();
  const campaignPayments = allPayments.filter((p) => p.campaignId === campaignId && p.status === "COMPLETED");

  for (const payment of campaignPayments) {
    entries.push({
      id: `pay_${payment.orderId || payment.captureId}`,
      timestamp: new Date(payment.createdAt).toISOString(),
      campaignId: campaign.id,
      eventType: "TEST_PAYMENT_CAPTURED",
      status: "PLANNED",
      description: `PayPal Sandbox test contribution of $${Number(payment.amount).toFixed(2)} ${payment.currency} captured. (Developer sandbox test transaction; strictly tracked separately from real donations and does not advance real-world campaign progress).`,
      evidenceRef: payment.captureId || payment.orderId
    });
  }

  // 3. Stored Receipt Reviews
  const reviews = await getReceiptReviews(campaignId);
  for (const rev of reviews) {
    const amountStr =
      rev.extractedData?.totalAmount !== null && rev.extractedData?.totalAmount !== undefined
        ? `$${Number(rev.extractedData.totalAmount).toFixed(2)} ${rev.extractedData.currency || "USD"}`
        : rev.budgetAmount !== null
        ? `$${Number(rev.budgetAmount).toFixed(2)} USD`
        : "unspecified amount";

    entries.push({
      id: `rev_${rev.id || rev._id}`,
      timestamp: new Date(rev.createdAt).toISOString(),
      campaignId: campaign.id,
      eventType: "EVIDENCE_SUBMITTED",
      status: "EVIDENCE_SUBMITTED",
      description: `Spending evidence submitted: "${rev.filename || 'receipt'}" for budget allocation "${rev.matchedBudgetItem || 'General'}". Reported expense: ${amountStr}. Current status: ${rev.humanReviewStatus || 'PENDING_HUMAN_REVIEW'}.`,
      evidenceRef: rev.id || rev._id
    });

    if (rev.humanReviewStatus === "APPROVED") {
      entries.push({
        id: `rev_appr_${rev.id || rev._id}`,
        timestamp: rev.reviewedAt ? new Date(rev.reviewedAt).toISOString() : new Date(rev.createdAt).toISOString(),
        campaignId: campaign.id,
        eventType: "HUMAN_REVIEW_COMPLETED",
        status: "HUMAN_REVIEW_COMPLETED",
        description: `Authorized human review completed for receipt "${rev.filename || 'receipt'}" against allocation "${rev.matchedBudgetItem || 'General'}". Reviewer decision: APPROVED.${rev.reviewerNotes ? ` Notes: ${rev.reviewerNotes}.` : ''} Evaluated by: ${rev.reviewedBy || 'Authorized Auditor'}.`,
        evidenceRef: rev.id || rev._id
      });
    }
  }

  // 4. Custom/Explicit Timeline Events (if any stored)
  const explicitEvents = await getTimelineEvents(campaignId);
  for (const evt of explicitEvents) {
    entries.push({
      id: evt.id || `evt_${evt.timestamp}`,
      timestamp: new Date(evt.timestamp).toISOString(),
      campaignId: evt.campaignId,
      eventType: evt.eventType,
      status: evt.status,
      description: evt.description,
      evidenceRef: evt.evidenceRef || null
    });
  }

  // Sort chronological (oldest first)
  entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Determine data-backed milestone progress:
  // Sandbox payments do not by themselves mean real campaign is In Progress
  const hasEvidence = reviews.length > 0;
  const approvedReviews = reviews.filter((r) => r.humanReviewStatus === "APPROVED");
  const hasHumanReview = approvedReviews.length > 0;
  const hasRealProgress =
    hasEvidence ||
    hasHumanReview ||
    explicitEvents.some((e) => e.status === "IN_PROGRESS" || e.eventType === "CAMPAIGN_IN_PROGRESS");

  const totalApprovedExpenses = approvedReviews.reduce((sum, r) => {
    const amt = r.extractedData?.totalAmount ?? r.budgetAmount ?? 0;
    return sum + (Number.isFinite(Number(amt)) ? Number(amt) : 0);
  }, 0);

  // Requirement 2: Approved receipt expenses and reaching a budget goal must NOT automatically mark a campaign COMPLETED.
  // Require a separately recorded, authorized campaign-completion decision with valid supporting evidence.
  let validCompletionEvent = null;
  for (const evt of explicitEvents) {
    if ((evt.eventType === "CAMPAIGN_COMPLETED" || evt.status === "COMPLETED") && evt.evidenceRef) {
      const check = await validateCampaignEvidenceRef(campaign.id, evt.evidenceRef);
      if (check.valid) {
        validCompletionEvent = { ...evt, evidenceRecord: check.evidence };
        break;
      }
    }
  }
  const isCompleted = Boolean(validCompletionEvent);

  let currentMilestone = "PLANNED";
  if (isCompleted) {
    currentMilestone = "COMPLETED";
  } else if (hasHumanReview) {
    currentMilestone = "HUMAN_REVIEW_COMPLETED";
  } else if (hasEvidence) {
    currentMilestone = "EVIDENCE_SUBMITTED";
  } else if (hasRealProgress) {
    currentMilestone = "IN_PROGRESS";
  }

  const hasUnverifiedCompletionAttempt = explicitEvents.some(
    (e) => (e.eventType === "CAMPAIGN_COMPLETED" || e.status === "COMPLETED") && !isCompleted
  );

  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    currentMilestone,
    milestoneSummary: {
      planned: true,
      inProgress: hasRealProgress,
      evidenceSubmitted: hasEvidence,
      humanReviewCompleted: hasHumanReview,
      completed: isCompleted
    },
    completionAuthorized: isCompleted,
    completionPendingReason: isCompleted
      ? null
      : (hasUnverifiedCompletionAttempt
          ? "Campaign completion rejected/pending: evidence reference does not match any persisted evidence record or approved review for this campaign."
          : (totalApprovedExpenses >= campaign.goal
              ? "Approved expenses equal or exceed the budget goal, but final campaign completion requires an authorized human review decision and valid supporting evidence."
              : "Campaign delivery in progress; requires authorized completion sign-off and verified evidence to mark Completed.")),
    totalApprovedExpenses: Number(totalApprovedExpenses.toFixed(2)),
    budgetGoal: campaign.goal,
    timeline: entries
  };
}

export function clearFallbackReviews() {
  inMemoryFallbackReviews.length = 0;
}

export function clearFallbackTimelineEvents() {
  inMemoryFallbackTimelineEvents.length = 0;
}

export function clearFallbackEvidence() {
  inMemoryFallbackEvidence.length = 0;
}

export async function closeDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
}
