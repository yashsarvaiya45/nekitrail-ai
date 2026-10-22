process.env.NODE_ENV = "test";
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { app, validateImageFile } from "../src/server.js";
import {
  calculateMatchScore,
  compareReceiptWithBudget,
  extractReceiptFromImage,
  getSampleDemoReceiptReview,
  normalizedWords
} from "../src/ai.js";
import {
  clearFallbackReviews,
  closeDB,
  connectDB,
  getCampaignTimeline,
  getReceiptReviews,
  getStorageMode,
  isDbConnected,
  ReceiptReview,
  saveReceiptReview,
  validateCampaignEvidenceRef
} from "../src/db.js";
import { baselineCampaigns } from "../src/campaigns.js";

describe("Receipt Image Review & Budget Verification Tests", () => {
  beforeEach(async () => {
    clearFallbackReviews();
    await closeDB();
  });

  after(async () => {
    await closeDB();
  });

  const waterCampaign = baselineCampaigns.find((c) => c.id === "community-water-filter");

  // Valid image fixture buffers
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
  ]);
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
  ]);
  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38
  ]);

  describe("Phase 2: Image File Validation & Constraints", () => {
    it("accepts valid JPEG, PNG, and WebP buffers", () => {
      const jpegResult = validateImageFile({
        buffer: validJpegBuffer,
        mimeType: "image/jpeg",
        filename: "receipt.jpg"
      });
      assert.equal(jpegResult.valid, true);

      const pngResult = validateImageFile({
        buffer: validPngBuffer,
        mimeType: "image/png",
        filename: "receipt.png"
      });
      assert.equal(pngResult.valid, true);

      const webpResult = validateImageFile({
        buffer: validWebpBuffer,
        mimeType: "image/webp",
        filename: "receipt.webp"
      });
      assert.equal(webpResult.valid, true);
    });

    it("rejects unsupported media types (e.g. PDF, GIF, text)", () => {
      const pdfResult = validateImageFile({
        buffer: Buffer.from("%PDF-1.4..."),
        mimeType: "application/pdf",
        filename: "doc.pdf"
      });
      assert.equal(pdfResult.valid, false);
      assert.match(pdfResult.error, /unsupported file type/i);

      const gifResult = validateImageFile({
        buffer: Buffer.from("GIF89a..."),
        mimeType: "image/gif",
        filename: "receipt.gif"
      });
      assert.equal(gifResult.valid, false);
      assert.match(gifResult.error, /unsupported file type/i);
    });

    it("rejects files that exceed the 5 MB limit", () => {
      const oversizedBytes = 5 * 1024 * 1024 + 1024; // 5MB + 1KB
      const oversizedBuffer = Buffer.alloc(oversizedBytes);
      oversizedBuffer[0] = 0xff;
      oversizedBuffer[1] = 0xd8;
      oversizedBuffer[2] = 0xff;

      const result = validateImageFile({
        buffer: oversizedBuffer,
        mimeType: "image/jpeg",
        filename: "huge.jpg"
      });
      assert.equal(result.valid, false);
      assert.match(result.error, /exceeds the 5 MB limit/i);
    });

    it("rejects invalid or corrupted image contents with mismatched magic bytes", () => {
      // Fake JPEG: mime is image/jpeg, but payload is plain text
      const fakeJpeg = Buffer.from("Not a real JPEG image, just plain text payload.");
      const result = validateImageFile({
        buffer: fakeJpeg,
        mimeType: "image/jpeg",
        filename: "fake.jpg"
      });
      assert.equal(result.valid, false);
      assert.match(result.error, /does not match a valid JPEG signature/i);

      // Fake PNG
      const fakePng = Buffer.from("Not a PNG file.");
      const pngCheck = validateImageFile({
        buffer: fakePng,
        mimeType: "image/png",
        filename: "fake.png"
      });
      assert.equal(pngCheck.valid, false);
      assert.match(pngCheck.error, /does not match a valid PNG signature/i);
    });

    it("rejects empty buffers", () => {
      const emptyResult = validateImageFile({
        buffer: Buffer.alloc(0),
        mimeType: "image/jpeg",
        filename: "empty.jpg"
      });
      assert.equal(emptyResult.valid, false);
      assert.match(emptyResult.error, /empty/i);
    });
  });

  describe("Phase 3: Gemini Receipt Extraction Behavior", () => {
    it("reports missing Gemini credentials gracefully without crashing or faking success", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.code, "AI_NOT_CONFIGURED");
            assert.equal(err.status, 503);
            assert.match(err.message, /GEMINI_API_KEY is not configured/i);
            return true;
          }
        );
      } finally {
        if (origKey) process.env.GEMINI_API_KEY = origKey;
      }
    });

    it("handles unreadable / invalid JSON from AI provider safely", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      // Mock global fetch returning invalid non-JSON text
      const origFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "MALFORMED_NON_JSON_OUTPUT" }] } }]
        })
      });

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.status, 502);
            assert.match(err.message, /unreadable extraction response/i);
            return true;
          }
        );
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("parses valid mocked Gemini extraction into normalized fields without inventing data", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      const mockPayload = {
        vendor: "City Lab Services",
        date: "2026-10-15",
        currency: "USD",
        totalAmount: 135.0,
        tax: 5.0,
        lineItems: [
          { description: "Water quality testing service", quantity: 1, unitPrice: 130.0, amount: 130.0 }
        ],
        isLegible: true,
        notes: "Official receipt stamp present"
      };

      const origFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }]
        })
      });

      try {
        const result = await extractReceiptFromImage({
          imageBuffer: validJpegBuffer,
          mimeType: "image/jpeg",
          filename: "receipt.jpg"
        });

        assert.equal(result.vendor, "City Lab Services");
        assert.equal(result.totalAmount, 135.0);
        assert.equal(result.currency, "USD");
        assert.equal(result.tax, 5.0);
        assert.equal(result.lineItems.length, 1);
        assert.equal(result.lineItems[0].description, "Water quality testing service");
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("distinguishes network connection timeouts (UND_ERR_CONNECT_TIMEOUT) with status 504", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      const origFetch = global.fetch;
      global.fetch = async () => {
        const timeoutErr = new TypeError("fetch failed");
        timeoutErr.cause = { code: "UND_ERR_CONNECT_TIMEOUT", name: "ConnectTimeoutError" };
        throw timeoutErr;
      };

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.status, 504);
            assert.equal(err.code, "AI_CONNECT_TIMEOUT");
            assert.match(err.message, /timed out/i);
            assert.match(err.message, /UND_ERR_CONNECT_TIMEOUT/i);
            return true;
          }
        );
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("distinguishes HTTP 404 model errors and suggests gemini-3.8-flash", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      const origFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { message: "models/gemini-2.5-flash is not found" } })
      });

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.status, 502);
            assert.equal(err.code, "AI_MODEL_NOT_FOUND");
            assert.match(err.message, /404/);
            assert.match(err.message, /gemini-3\.8-flash/i);
            return true;
          }
        );
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("distinguishes HTTP 429 rate limit / quota exceeded errors returning AI_QUOTA_EXHAUSTED", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      const origFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Resource has been exhausted" } })
      });

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.status, 429);
            assert.equal(err.code, "AI_QUOTA_EXHAUSTED");
            assert.match(err.message, /quota/i);
            assert.match(err.message, /RESOURCE_EXHAUSTED/i);
            return true;
          }
        );
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("handles quota exhaustion immediately without entering a retry storm", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      let fetchCallCount = 0;
      const origFetch = global.fetch;
      global.fetch = async () => {
        fetchCallCount++;
        return {
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })
        };
      };

      try {
        await assert.rejects(
          async () => {
            await extractReceiptFromImage({
              imageBuffer: validJpegBuffer,
              mimeType: "image/jpeg",
              filename: "test.jpg"
            });
          },
          (err) => {
            assert.equal(err.status, 429);
            assert.equal(err.code, "AI_QUOTA_EXHAUSTED");
            return true;
          }
        );
        // CRITICAL: Must abort immediately without looping or retrying
        assert.equal(fetchCallCount, 1, "Must not retry quota-exhausted requests in a loop");
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("correctly normalizes line items with totalPrice instead of amount", async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "dummy-test-key";

      const mockPayload = {
        vendor: "City Lab Services",
        date: "2026-10-15",
        currency: "USD",
        totalAmount: 135.0,
        tax: 0.0,
        lineItems: [
          { description: "Water quality testing service", quantity: 1, unitPrice: 135.0, totalPrice: 135.0 }
        ],
        isLegible: true,
        notes: null
      };

      const origFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockPayload) }] } }]
        })
      });

      try {
        const result = await extractReceiptFromImage({
          imageBuffer: validJpegBuffer,
          mimeType: "image/jpeg",
          filename: "receipt.jpg"
        });

        assert.equal(result.lineItems.length, 1);
        assert.equal(result.lineItems[0].amount, 135.0);
      } finally {
        global.fetch = origFetch;
        if (origKey) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });
  });

  describe("Phase 4: Campaign Budget Comparison & Advisory Logic", () => {
    it("successfully matches a candidate budget item within allocation", () => {
      const extractedData = {
        vendor: "Clean Waters Lab",
        date: "2026-10-18",
        currency: "USD",
        totalAmount: 135.0,
        lineItems: [{ description: "Water quality testing", amount: 135.0 }],
        tax: null
      };

      const result = compareReceiptWithBudget({
        extractedData,
        campaign: waterCampaign
      });

      assert.equal(result.status, "POSSIBLE_MATCH");
      assert.equal(result.matchedBudgetItem, "Water quality testing");
      assert.equal(result.receiptAmount, 135.0);
      assert.equal(result.budgetAmount, 150.0);
      assert.equal(result.remainingBudget, 15.0);
      assert.ok(result.flags.some((f) => f.includes("Possible match")));
      assert.ok(result.flags.some((f) => f.includes("Physical document inspection")));
    });

    it("flags over-budget expenses and requires human review", () => {
      const extractedData = {
        vendor: "Clean Waters Lab",
        date: "2026-10-18",
        currency: "USD",
        totalAmount: 195.0, // Exceeds $150 allocation
        lineItems: [{ description: "Water quality testing", amount: 195.0 }]
      };

      const result = compareReceiptWithBudget({
        extractedData,
        campaign: waterCampaign
      });

      assert.equal(result.status, "REVIEW");
      assert.equal(result.matchedBudgetItem, "Water quality testing");
      assert.equal(result.remainingBudget, -45.0);
      assert.ok(result.flags.some((f) => f.includes("exceeds the allocated budget line")));
    });

    it("flags currency mismatches and requires human review", () => {
      const extractedData = {
        vendor: "Euro Filters SA",
        date: "2026-10-18",
        currency: "EUR", // Mismatch with USD campaign
        totalAmount: 120.0,
        lineItems: [{ description: "Water quality testing", amount: 120.0 }]
      };

      const result = compareReceiptWithBudget({
        extractedData,
        campaign: waterCampaign
      });

      assert.equal(result.status, "REVIEW");
      assert.ok(result.flags.some((f) => f.includes("Currency mismatch")));
    });

    it("identifies no clear budget match when items are unrelated", () => {
      const extractedData = {
        vendor: "Downtown Catering",
        date: "2026-10-18",
        currency: "USD",
        totalAmount: 90.0,
        lineItems: [{ description: "Staff lunch and beverages", amount: 90.0 }]
      };

      const result = compareReceiptWithBudget({
        extractedData,
        campaign: waterCampaign
      });

      assert.equal(result.status, "NO_MATCH");
      assert.equal(result.matchedBudgetItem, null);
      assert.ok(result.flags.some((f) => f.includes("No clear budget match")));
    });

    it("flags missing or uncertain receipt fields (vendor, date, items, total)", () => {
      const incompleteData = {
        vendor: null,
        date: null,
        currency: "USD",
        totalAmount: null,
        lineItems: []
      };

      const result = compareReceiptWithBudget({
        extractedData: incompleteData,
        campaign: waterCampaign
      });

      assert.equal(result.status, "NO_MATCH");
      assert.ok(result.flags.some((f) => f.includes("Vendor or merchant name was not legibly detected")));
      assert.ok(result.flags.some((f) => f.includes("Receipt transaction date was not clearly detected")));
      assert.ok(result.flags.some((f) => f.includes("Itemized line item breakdown could not be extracted")));
    });

    it("detects possible duplicate receipts from existing reviews", () => {
      const extractedData = {
        vendor: "Clean Waters Lab",
        date: "2026-10-18",
        currency: "USD",
        totalAmount: 135.0,
        lineItems: [{ description: "Water quality testing", amount: 135.0 }]
      };

      const existingReviews = [
        {
          campaignId: "community-water-filter",
          receiptAmount: 135.0,
          extractedData: {
            vendor: "Clean Waters Lab",
            date: "2026-10-18",
            totalAmount: 135.0
          }
        }
      ];

      const result = compareReceiptWithBudget({
        extractedData,
        campaign: waterCampaign,
        existingReviews
      });

      assert.ok(result.flags.some((f) => f.includes("Possible duplicate")));
      assert.equal(result.status, "REVIEW");
    });
  });

  describe("Phase 5: Receipt Review Persistence & Fallback", () => {
    it("saves and retrieves receipt reviews in in-memory fallback without storing raw image bytes", async () => {
      await connectDB(""); // Force fallback mode
      assert.equal(getStorageMode(), "in-memory-fallback");

      const reviewData = {
        campaignId: "community-water-filter",
        filename: "test-water-testing.jpg",
        fileMimeType: "image/jpeg",
        fileSize: 1024,
        source: "image-upload",
        extractedData: {
          vendor: "Clean Waters Lab",
          date: "2026-10-18",
          currency: "USD",
          totalAmount: 135.0,
          lineItems: [{ description: "Water quality testing", amount: 135.0 }],
          tax: 5.0
        },
        matchedBudgetItem: "Water quality testing",
        budgetAmount: 150.0,
        remainingBudget: 15.0,
        status: "POSSIBLE_MATCH",
        humanReviewStatus: "PENDING_HUMAN_REVIEW",
        explanation: "Advisory candidate match.",
        flags: ["Needs human inspection"]
      };

      const saveRes = await saveReceiptReview(reviewData);
      assert.equal(saveRes.persisted, false);
      assert.equal(saveRes.review.campaignId, "community-water-filter");
      assert.equal(saveRes.review.humanReviewStatus, "PENDING_HUMAN_REVIEW");
      assert.equal(saveRes.review.image, undefined, "Raw image bytes must NEVER be stored");

      const retrieved = await getReceiptReviews("community-water-filter");
      assert.equal(retrieved.length, 1);
      assert.equal(retrieved[0].extractedData.vendor, "Clean Waters Lab");
      assert.equal(retrieved[0].matchedBudgetItem, "Water quality testing");
    });

    it("persists receipt reviews to MongoDB and verifies fields across query", async () => {
      const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nekitrail";
      const dbStatus = await connectDB(uri);

      if (!dbStatus.connected) {
        console.warn("MongoDB not running locally; skipping live DB persistence test.");
        return;
      }

      assert.equal(isDbConnected(), true);

      // Clean test reviews
      await ReceiptReview.deleteMany({ filename: "mongo-test-receipt.jpg" });

      const reviewData = {
        campaignId: "school-kit-drive",
        filename: "mongo-test-receipt.jpg",
        fileMimeType: "image/jpeg",
        fileSize: 2048,
        source: "image-upload",
        extractedData: {
          vendor: "Stationery Depot",
          date: "2026-10-19",
          currency: "USD",
          totalAmount: 220.0,
          lineItems: [{ description: "School bags", amount: 220.0 }],
          tax: 0.0
        },
        matchedBudgetItem: "School bags",
        budgetAmount: 220.0,
        remainingBudget: 0.0,
        status: "POSSIBLE_MATCH",
        humanReviewStatus: "PENDING_HUMAN_REVIEW",
        explanation: "Exact allocation candidate match.",
        flags: ["Physical document inspection required."]
      };

      const saveRes = await saveReceiptReview(reviewData);
      assert.equal(saveRes.persisted, true);
      assert.ok(saveRes.review.id);
      assert.equal(saveRes.review.humanReviewStatus, "PENDING_HUMAN_REVIEW");

      const records = await getReceiptReviews("school-kit-drive");
      const found = records.find((r) => r.filename === "mongo-test-receipt.jpg");
      assert.ok(found);
      assert.equal(found.extractedData.vendor, "Stationery Depot");
      assert.equal(found.extractedData.totalAmount, 220.0);
      assert.equal(found.matchedBudgetItem, "School bags");
      assert.equal(found.image, undefined, "Raw image bytes must not exist in MongoDB document");

      // Cleanup
      await ReceiptReview.deleteMany({ filename: "mongo-test-receipt.jpg" });
    });
  });

  describe("Phase 6: Sample Presentation Demo Mode & Timeline Isolation", () => {
    it("provides fixed sample demo receipt with required visual label and un-persisted metadata", () => {
      const demoResult = getSampleDemoReceiptReview("community-water-filter");

      assert.equal(demoResult.isSampleDemo, true);
      assert.equal(demoResult.persisted, false);
      assert.equal(demoResult.storage, "transient-demo-memory");
      assert.ok(demoResult.extractedData);
      assert.equal(demoResult.extractedData.vendor, "Clean Water Supply & Testing Co.");
      assert.equal(demoResult.extractedData.totalAmount, 135.0);
      assert.equal(demoResult.review.matchedBudgetItem, "Water quality testing");
      assert.equal(demoResult.review.status, "POSSIBLE_MATCH");
      assert.equal(demoResult.review.humanReviewStatus, "UNREVIEWED");

      // CRITICAL: Visual label and disclaimers must be present
      assert.ok(demoResult.review.flags.includes("SAMPLE DEMO RESULT — NOT A LIVE AI ANALYSIS"));
      assert.match(demoResult.review.explanation, /SAMPLE DEMO RESULT — NOT A LIVE AI ANALYSIS/);
    });

    it("ensures sample demo receipt is NOT saved in persisted reviews", async () => {
      // Clear fallback reviews
      clearFallbackReviews();

      // Retrieve sample demo data
      const demoResult = getSampleDemoReceiptReview("community-water-filter");
      assert.equal(demoResult.isSampleDemo, true);

      // Verify that getReceiptReviews does NOT contain this sample review
      const reviews = await getReceiptReviews("community-water-filter");
      const foundSample = reviews.find((r) => r.id === demoResult.review.id || r.source === "presentation-demo-sample");
      assert.equal(foundSample, undefined, "Sample demo receipt must not be stored in persistent or fallback reviews");
    });

    it("strictly isolates sample demo receipt from expense approval and campaign completion", async () => {
      clearFallbackReviews();
      const demoResult = getSampleDemoReceiptReview("community-water-filter");

      // Verify validateCampaignEvidenceRef rejects sample demo reference
      const validation = await validateCampaignEvidenceRef("community-water-filter", demoResult.review.id);
      assert.equal(validation.valid, false, "Sample demo receipt ID cannot validate as authentic campaign evidence");
      assert.match(validation.error, /does not point to any registered evidence record/i);

      // Verify timeline does not consider the campaign completed
      const timeline = await getCampaignTimeline("community-water-filter");
      assert.notEqual(timeline.currentMilestone, "COMPLETED");
      assert.equal(timeline.milestoneSummary.completed, false);
      assert.equal(timeline.totalApprovedExpenses, 0, "Sample demo receipt must not increment approved expenses");
    });
  });
});
