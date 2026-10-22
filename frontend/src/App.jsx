import React, { useEffect, useMemo, useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  ArrowDownRight, ArrowRight, AudioLines, BookOpenCheck, CheckCheck, CheckCircle2, ChevronDown, CircleHelp,
  Clock, FileCheck, FileText, Heart, History, Info, KeyRound, Languages, Leaf, LoaderCircle, LockKeyhole,
  LogOut, Menu, Milestone, RefreshCw, ShieldCheck, Sparkles, TriangleAlert, Upload, UserCheck, Wallet, Waves, X
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const money = (value, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

const HINDI_FALLBACK_STRINGS = {
  "All figures are illustrative demo estimates; unit prices, quantities and quotations require human verification.":
    "सभी आंकड़े सांकेतिक डेमो अनुमान हैं; प्रति यूनिट मूल्य, मात्रा और कोटेशन का मानवीय सत्यापन आवश्यक है।",
  "All figures are illustrative demo estimates; unit prices, quantities and quotations must be verified by human reviewers.":
    "सभी आंकड़े सांकेतिक डेमो अनुमान हैं; प्रति यूनिट मूल्य, मात्रा और कोटेशन का मानवीय सत्यापन आवश्यक है।",
  "This demo fallback does not verify prices, vendors, receipts, or whether a campaign is legitimate.":
    "यह डेमो सिस्टम कीमतों, विक्रेताओं, रसीदों या अभियान की प्रामाणिकता की पुष्टि नहीं करता है।",
  "This fallback does not verify prices, vendors, receipts, or whether a campaign is legitimate.":
    "यह डेमो सिस्टम कीमतों, विक्रेताओं, रसीदों या अभियान की प्रामाणिकता की पुष्टि नहीं करता है।",
  "No budget items were provided.":
    "कोई बजट आइटम प्रदान नहीं किया गया है।",
  "At least one budget item has no name.":
    "कम से कम एक बजट आइटम का नाम खाली है।",
  "The total budget is zero; add positive item amounts.":
    "कुल बजट शून्य है; सकारात्मक राशि जोड़ें।",
  "Can you provide vendor quotations, invoices, or supporting price evidence for the listed items?":
    "क्या आप सूचीबद्ध वस्तुओं के लिए विक्रेता कोटेशन, इनवॉइस या मूल्य साक्ष्य प्रदान कर सकते हैं?",
  "Who will inspect and approve delivery proofs before funds are released?":
    "धन जारी करने से पहले वितरण और खर्च के साक्ष्यों का निरीक्षण और अनुमोदन कौन करेगा?",
  "Are delivery, distribution, and maintenance costs calculated from real vendor estimates?":
    "क्या वितरण, डिलीवरी और रखरखाव की लागत वास्तविक विक्रेता अनुमानों पर आधारित है?",
  "Can you provide quotations or other evidence for the listed costs?":
    "क्या आप सूचीबद्ध लागतों के लिए कोटेशन या अन्य साक्ष्य प्रदान कर सकते हैं?",
  "Who will review and approve spending evidence?":
    "खर्च के साक्ष्यों की समीक्षा और स्वीकृति कौन करेगा?"
};

function getLocalizedRisks(summary, lang) {
  if (!summary) return [];
  if (lang === "hi") {
    if (Array.isArray(summary.budgetRisksHi) && summary.budgetRisksHi.length > 0) {
      return summary.budgetRisksHi;
    }
    return (summary.budgetRisks || []).map((r) => HINDI_FALLBACK_STRINGS[r] || r);
  }
  return summary.budgetRisks || [];
}

function getLocalizedQuestions(summary, lang) {
  if (!summary) return [];
  if (lang === "hi") {
    if (Array.isArray(summary.clarifyingQuestionsHi) && summary.clarifyingQuestionsHi.length > 0) {
      return summary.clarifyingQuestionsHi;
    }
    return (summary.clarifyingQuestions || []).map((q) => HINDI_FALLBACK_STRINGS[q] || q);
  }
  return summary.clarifyingQuestions || [];
}

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [paypalConfig, setPaypalConfig] = useState({ clientId: "", currency: "USD", sandboxReady: false });
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [donationAmount, setDonationAmount] = useState("10");
  const [brief, setBrief] = useState(
    "We want to provide safe drinking water by installing a shared water filtration unit and testing the water quality."
  );
  const [budgetLines, setBudgetLines] = useState(
    "Water filtration unit: 650\nInstallation materials: 250\nWater quality testing: 150\nMaintenance reserve: 150"
  );
  const [summary, setSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [language, setLanguage] = useState("en");
  const [receiptText, setReceiptText] = useState("Water testing service - 135 USD");
  const [receiptResult, setReceiptResult] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptQuotaError, setReceiptQuotaError] = useState(null);
  const [payments, setPayments] = useState([]);
  const [storageMode, setStorageMode] = useState("mongodb");

  // Receipt image upload and review state
  const [receiptMode, setReceiptMode] = useState("image"); // "image" | "text"
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [receiptFileError, setReceiptFileError] = useState("");
  const [receiptImageResult, setReceiptImageResult] = useState(null);
  const [receiptReviews, setReceiptReviews] = useState([]);
  const [proofTab, setProofTab] = useState("payments"); // "payments" | "reviews"
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Campaign Impact Timeline & Human Review state
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [activeReviewActionId, setActiveReviewActionId] = useState(null);
  const [reviewerName, setReviewerName] = useState("Authorized Human Auditor");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [auditFormOpen, setAuditFormOpen] = useState(false);
  const [auditEventType, setAuditEventType] = useState("AUDIT_NOTE");
  const [auditDescription, setAuditDescription] = useState("");
  const [auditEvidenceRef, setAuditEvidenceRef] = useState("");
  const [auditSubmitting, setAuditSubmitting] = useState(false);

  // Server-side Auditor Authentication State
  const [isAuditorAuthenticated, setIsAuditorAuthenticated] = useState(false);
  const [auditorInfo, setAuditorInfo] = useState(null);
  const [auditorModalOpen, setAuditorModalOpen] = useState(false);
  const [auditorPassphrase, setAuditorPassphrase] = useState("");
  const [auditorAuthLoading, setAuditorAuthLoading] = useState(false);
  const [auditorAuthError, setAuditorAuthError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("campaigns");

  const checkAuditorSession = async () => {
    try {
      const res = await fetch(`${API}/api/auth/session`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.auditor) {
          setIsAuditorAuthenticated(true);
          setAuditorInfo(data.auditor);
          return;
        }
      }
      setIsAuditorAuthenticated(false);
      setAuditorInfo(null);
    } catch {
      setIsAuditorAuthenticated(false);
      setAuditorInfo(null);
    }
  };

  const handleAuditorLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!auditorPassphrase.trim()) {
      setAuditorAuthError("Please enter the auditor secret key / passphrase.");
      return;
    }
    setAuditorAuthLoading(true);
    setAuditorAuthError("");
    try {
      const res = await fetch(`${API}/api/auth/auditor-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passphrase: auditorPassphrase.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Invalid auditor secret key.");
      }
      setIsAuditorAuthenticated(true);
      setAuditorInfo(data.auditor);
      setAuditorModalOpen(false);
      setAuditorPassphrase("");
      setNotice(language === "hi" ? "ऑडिटर प्रमाणीकरण सफल: सत्र सक्रिय।" : "Auditor authenticated: Session active.");
    } catch (err) {
      setAuditorAuthError(err.message);
    } finally {
      setAuditorAuthLoading(false);
    }
  };

  const handleAuditorLogout = async () => {
    try {
      await fetch(`${API}/api/auth/auditor-logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch {
      // ignore
    } finally {
      setIsAuditorAuthenticated(false);
      setAuditorInfo(null);
      setNotice(language === "hi" ? "ऑडिटर सत्र समाप्त।" : "Auditor session terminated.");
    }
  };

  const fetchTimeline = (campaignId) => {
    if (!campaignId) return;
    setTimelineLoading(true);
    fetch(`${API}/api/campaigns/${encodeURIComponent(campaignId)}/timeline`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load campaign timeline.");
        return r.json();
      })
      .then((data) => {
        setTimelineData(data);
      })
      .catch((err) => {
        console.warn("Could not load timeline:", err.message);
      })
      .finally(() => {
        setTimelineLoading(false);
      });
  };

  useEffect(() => {
    checkAuditorSession();
    Promise.all([
      fetch(`${API}/api/campaigns`).then((r) => r.json()),
      fetch(`${API}/api/paypal/config`).then((r) => r.json()),
      fetch(`${API}/api/payments`).then((r) => r.json()),
      fetch(`${API}/api/receipt-reviews`).then((r) => r.json())
    ])
      .then(([campaignData, config, paymentData, reviewData]) => {
        const items = Array.isArray(campaignData.campaigns) ? campaignData.campaigns : [];
        setCampaigns(items);
        const firstId = items[0]?.id || "";
        setSelectedCampaign(firstId);
        if (firstId) fetchTimeline(firstId);
        setPaypalConfig(config);
        setPayments(paymentData.payments || []);
        if (paymentData.storage) setStorageMode(paymentData.storage);
        setReceiptReviews(reviewData?.reviews || []);
      })
      .catch(() => setError("Cannot reach the API. Start the backend and refresh this page."));

    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) setActiveNav(hash);
    };
    window.addEventListener("hashchange", handleHash);
    if (window.location.hash) handleHash();
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchTimeline(selectedCampaign);
    }
  }, [selectedCampaign]);

  const currentCampaign = campaigns.find((campaign) => campaign.id === selectedCampaign);
  const parsedBudget = useMemo(
    () =>
      budgetLines
        .split("\n")
        .map((line) => {
          const [name, amount] = line.split(":");
          return { item: (name || "").trim(), amount: Number((amount || "").trim()) || 0 };
        })
        .filter((line) => line.item || line.amount),
    [budgetLines]
  );

  function loadCampaignIntoBuilder(campaign) {
    if (!campaign) return;
    setBrief(campaign.shortDescription || "");
    const lines = (campaign.budget || []).map((b) => `${b.item}: ${b.amount}`).join("\n");
    setBudgetLines(lines);
    setNotice(`Loaded budget items from “${campaign.title}” into the AI workspace.`);
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFileError("");
    setError("");
    setReceiptResult(null);
    setReceiptImageResult(null);

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setReceiptFileError(
        language === "hi"
          ? "असमर्थित फ़ाइल प्रकार। केवल JPEG, PNG और WebP समर्थित हैं।"
          : "Unsupported file type. Please upload a JPEG, PNG, or WebP image."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setReceiptFileError(
        language === "hi"
          ? "फ़ाइल का आकार 5 MB से अधिक है। कृपया 5 MB से कम की छवि चुनें।"
          : `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 5 MB limit. Please select a smaller file.`
      );
      return;
    }

    setReceiptFile(file);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveFile() {
    setReceiptFile(null);
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
      setReceiptPreviewUrl("");
    }
    setReceiptFileError("");
    setReceiptResult(null);
    setReceiptImageResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function generateSummary(event) {
    event.preventDefault();
    setAiLoading(true);
    setError("");
    setNotice("");
    setSummary(null);
    try {
      const response = await fetch(`${API}/api/ai/campaign-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, budgetItems: parsedBudget })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI summary failed.");
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function reviewReceipt(event) {
    event.preventDefault();
    if (!currentCampaign) return;
    setReceiptLoading(true);
    setReceiptResult(null);
    setReceiptImageResult(null);
    setReceiptQuotaError(null);
    setError("");
    try {
      const response = await fetch(`${API}/api/ai/receipt-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: currentCampaign.id, receiptText })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.code === "AI_QUOTA_EXHAUSTED") {
          setReceiptQuotaError({
            message: data.error || "Gemini API quota is currently exhausted.",
            code: data.code || "AI_QUOTA_EXHAUSTED"
          });
          return;
        }
        throw new Error(data.error || "Receipt review failed.");
      }
      setReceiptResult(data.review);
      if (data.storage) setStorageMode(data.storage);

      // Refresh persisted reviews list
      fetch(`${API}/api/receipt-reviews`)
        .then((r) => r.json())
        .then((res) => setReceiptReviews(res.reviews || []))
        .catch(() => {});
      if (currentCampaign) fetchTimeline(currentCampaign.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setReceiptLoading(false);
    }
  }

  async function loadSampleDemoReceipt() {
    if (!currentCampaign) return;
    setReceiptLoading(true);
    setReceiptQuotaError(null);
    setReceiptFileError("");
    setError("");
    try {
      const response = await fetch(`${API}/api/ai/sample-receipt-demo?campaignId=${encodeURIComponent(currentCampaign.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load presentation sample receipt.");
      setReceiptImageResult(data);
      setReceiptResult(data.review);
      setNotice(
        language === "hi"
          ? "नमूना प्रस्तुति रसीद लोड की गई (यह लाइव AI विश्लेषण नहीं है)"
          : "Loaded presentation sample demo receipt (illustrative data · not a live AI analysis)"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setReceiptLoading(false);
    }
  }

  async function reviewReceiptImage(event) {
    event.preventDefault();
    if (!currentCampaign) return;
    if (!receiptFile) {
      setReceiptFileError(language === "hi" ? "कृपया एक रसीद छवि चुनें।" : "Please select a receipt image to upload.");
      return;
    }

    setReceiptLoading(true);
    setReceiptResult(null);
    setReceiptImageResult(null);
    setReceiptQuotaError(null);
    setError("");
    setReceiptFileError("");

    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read the selected image file."));
      });
      reader.readAsDataURL(receiptFile);
      const dataUrl = await base64Promise;

      const response = await fetch(`${API}/api/ai/receipt-image-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: currentCampaign.id,
          image: dataUrl,
          mimeType: receiptFile.type,
          filename: receiptFile.name
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.code === "AI_QUOTA_EXHAUSTED") {
          setReceiptQuotaError({
            message: data.error || "Google Gemini multimodal API quota is temporarily exhausted.",
            code: data.code || "AI_QUOTA_EXHAUSTED"
          });
          return;
        }
        throw new Error(data.error || "Receipt image extraction failed.");
      }

      setReceiptImageResult(data);
      setReceiptResult(data.review);
      if (data.storage) setStorageMode(data.storage);
      setNotice(
        language === "hi"
          ? `रसीद विश्लेषण पूर्ण: ${data.review.status === "POSSIBLE_MATCH" ? "संभावित मिलान मिला" : "समीक्षा आवश्यक"}`
          : `Receipt review complete: ${data.review.status === "POSSIBLE_MATCH" ? "Possible match identified" : "Needs human review"}`
      );

      // Refresh reviews list
      fetch(`${API}/api/receipt-reviews`)
        .then((r) => r.json())
        .then((res) => setReceiptReviews(res.reviews || []))
        .catch(() => {});
      if (currentCampaign) fetchTimeline(currentCampaign.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setReceiptLoading(false);
    }
  }

  async function createOrder() {
    if (!currentCampaign) throw new Error("Select a campaign first.");
    const response = await fetch(`${API}/api/paypal/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: currentCampaign.id, amount: Number(donationAmount) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to create PayPal order.");
    return data.id;
  }

  async function captureOrder(data) {
    const response = await fetch(`${API}/api/paypal/orders/${encodeURIComponent(data.orderID)}/capture`, {
      method: "POST"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to capture PayPal order.");
    setNotice(`Sandbox test payment confirmed: ${result.captureId || result.status}. No real money was collected.`);
    const [campaignData, paymentData] = await Promise.all([
      fetch(`${API}/api/campaigns`).then((r) => r.json()),
      fetch(`${API}/api/payments`).then((r) => r.json())
    ]);
    setCampaigns(campaignData.campaigns || []);
    setPayments(paymentData.payments || []);
    if (currentCampaign) fetchTimeline(currentCampaign.id);
  }

  async function handleAuthorizeReview(reviewId, decision) {
    if (!reviewId) return;
    if (typeof reviewId === "string" && reviewId.startsWith("sample-demo-")) {
      setError(language === "hi"
        ? "नमूना प्रस्तुति रसीदें केवल अभ्यास के लिए हैं और इन्हें अनुमोदित या लेजर में दर्ज नहीं किया जा सकता।"
        : "Sample demo receipts are for presentation practice only and cannot be submitted for human review or expense approval.");
      return;
    }
    if (!isAuditorAuthenticated) {
      setAuditorAuthError("Auditor authentication required to record review decisions.");
      setAuditorModalOpen(true);
      return;
    }
    setReviewSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/receipt-reviews/${encodeURIComponent(reviewId)}/human-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          decision,
          reviewerNotes: reviewerNotes.trim() || (decision === "APPROVED" ? "Inspected physical evidence and verified itemized delivery." : "Discrepancy noted during inspection."),
          reviewerName: auditorInfo?.name || "Authorized Human Auditor"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAuditorAuthenticated(false);
          setAuditorAuthError("Auditor session expired. Please sign in again.");
          setAuditorModalOpen(true);
        }
        throw new Error(data.error || "Failed to submit human review.");
      }

      setNotice(
        decision === "APPROVED"
          ? (language === "hi" ? "मानवीय समीक्षा स्वीकृत: व्यय साक्ष्य को अधिकृत किया गया।" : "Human review authorized: Expense evidence approved.")
          : (language === "hi" ? "मानवीय समीक्षा दर्ज: साक्ष्य अस्वीकृत किया गया।" : "Human review recorded: Evidence rejected.")
      );

      // Refresh reviews list
      const revRes = await fetch(`${API}/api/receipt-reviews`).then((r) => r.json());
      setReceiptReviews(revRes.reviews || []);

      // Refresh timeline
      if (selectedCampaign) {
        fetchTimeline(selectedCampaign);
      }

      setActiveReviewActionId(null);
      setReviewerNotes("");
    } catch (err) {
      setError(err.message);
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleAddAuditNote(e) {
    e.preventDefault();
    if (!selectedCampaign || auditDescription.trim().length < 3) return;
    if (!isAuditorAuthenticated) {
      setAuditorAuthError("Auditor authentication required to record audit events or completion decisions.");
      setAuditorModalOpen(true);
      return;
    }
    const isComplete = auditEventType === "CAMPAIGN_COMPLETED";
    if (isComplete && !auditEvidenceRef.trim()) {
      setError("Campaign completion requires a supporting evidence reference (e.g. final inspection certificate or report).");
      return;
    }

    setAuditSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/campaigns/${encodeURIComponent(selectedCampaign)}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventType: isComplete ? "CAMPAIGN_COMPLETED" : "AUDIT_NOTE",
          status: isComplete ? "COMPLETED" : "IN_PROGRESS",
          description: auditDescription.trim(),
          evidenceRef: auditEvidenceRef.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAuditorAuthenticated(false);
          setAuditorAuthError("Auditor session expired. Please sign in again.");
          setAuditorModalOpen(true);
        }
        throw new Error(data.error || "Failed to add audit note.");
      }

      setNotice(
        isComplete
          ? "Authorized campaign completion decision and evidence recorded."
          : "Auditor observation recorded and saved to campaign timeline."
      );
      setAuditDescription("");
      setAuditEvidenceRef("");
      setAuditEventType("AUDIT_NOTE");
      setAuditFormOpen(false);
      fetchTimeline(selectedCampaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditSubmitting(false);
    }
  }

  const totalRaised = campaigns.reduce((sum, campaign) => sum + Number(campaign.raised || 0), 0);
  const sessionCapturedTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const donorCopy =
    language === "hi"
      ? "Pehle samjhein ki aapke paise kis kaam ke liye use honge. Har budget item aur spending proof review ke liye dikhaya jaata hai."
      : "Understand exactly what your contribution supports. Each budget item and spending proof is transparently displayed for human review.";

  return (
    <div className="app-shell">
      {/* Top Trust Banner */}
      <div className="top-strip">
        <span>
          <ShieldCheck size={14} /> Transparency by design
        </span>
        <div className="top-strip-right">
          {isAuditorAuthenticated ? (
            <span className="auditor-session-pill active">
              <ShieldCheck size={12} />
              <span>{auditorInfo?.name || "Auditor Active"}</span>
              <button
                type="button"
                className="auditor-inline-logout"
                onClick={handleAuditorLogout}
                title="Log out of auditor session"
              >
                <LogOut size={11} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="auditor-session-pill login-btn"
              onClick={() => {
                setAuditorAuthError("");
                setAuditorModalOpen(true);
              }}
            >
              <KeyRound size={12} />
              <span>Auditor Sign-In</span>
            </button>
          )}
          <span className="sandbox-label">
            <span className="pulse" /> HACKATHON SANDBOX DEMO
          </span>
        </div>
      </div>

      {/* Navigation */}
      <header className="navbar wrap">
        <a className="brand" href="#top" aria-label="NekiTrail AI home">
          <span className="brand-icon">
            <Heart size={20} fill="currentColor" />
          </span>
          <span className="brand-text">
            NekiTrail<span className="brand-ai">AI</span>
          </span>
        </a>
        <nav className={`nav-links ${mobileNavOpen ? "open" : ""}`} aria-label="Main Navigation">
          <a
            href="#campaigns"
            className={activeNav === "campaigns" ? "active" : ""}
            onClick={() => {
              setActiveNav("campaigns");
              setMobileNavOpen(false);
            }}
          >
            Explore campaigns
          </a>
          <a
            href="#timeline"
            className={activeNav === "timeline" ? "active" : ""}
            onClick={() => {
              setActiveNav("timeline");
              setMobileNavOpen(false);
            }}
          >
            Impact timeline
          </a>
          <a
            href="#builder"
            className={activeNav === "builder" ? "active" : ""}
            onClick={() => {
              setActiveNav("builder");
              setMobileNavOpen(false);
            }}
          >
            AI campaign builder
          </a>
          <a
            href="#how-it-works"
            className={activeNav === "how-it-works" ? "active" : ""}
            onClick={() => {
              setActiveNav("how-it-works");
              setMobileNavOpen(false);
            }}
          >
            How it works
          </a>
          <a
            href="#proof"
            className={activeNav === "proof" ? "active" : ""}
            onClick={() => {
              setActiveNav("proof");
              setMobileNavOpen(false);
            }}
          >
            Audit ledger
          </a>
        </nav>
        <div className="nav-actions">
          <a className="nav-cta" href="#campaigns" onClick={() => setMobileNavOpen(false)}>
            Explore campaigns <ArrowRight size={15} />
          </a>
          <button
            type="button"
            className="mobile-toggle-btn"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={14} /> TRANSPARENT COMMUNITY BUDGETING
            </div>
            <h1>
              Your contribution.<br />
              <span>Clearly accounted for.</span>
            </h1>
            <p className="hero-description">
              A transparent community giving platform prototype where every contribution is matched to an itemized budget,
              explained in plain language, and reviewed against spending evidence.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#campaigns">
                Explore campaigns <ArrowRight size={17} />
              </a>
              <a className="text-action" href="#how-it-works">
                How it works <ArrowDownRight size={16} />
              </a>
            </div>
            <div className="hero-proof">
              <span>
                <CheckCircle2 size={15} /> Itemized budget breakdowns
              </span>
              <span>
                <Languages size={15} /> Plain-language summaries (EN · HI)
              </span>
              <span>
                <LockKeyhole size={15} /> PayPal Sandbox integration
              </span>
            </div>
          </div>

          <div className="hero-art">
            <div className="impact-card">
              <div className="impact-top">
                <span className="pill">COMMUNITY LEDGER</span>
                <Waves size={18} />
              </div>
              <div className="impact-number">{money(totalRaised)}</div>
              <div className="impact-caption">Illustrative demo contributions</div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      (totalRaised / Math.max(1, campaigns.reduce((sum, c) => sum + c.goal, 0))) * 100
                    )}%`
                  }}
                />
              </div>
              <div className="impact-foot">
                <span>Starter baseline: $555.00</span>
                <span>
                  {payments.length === 0
                    ? "0 captured test payments"
                    : `${payments.length} captured sandbox test payments (${money(sessionCapturedTotal)})`}
                </span>
              </div>
            </div>

            <div className="floating-card">
              <div className="mini-icon">
                <Leaf size={18} />
              </div>
              <div>
                <b>Itemized Budget Accountability</b>
                <span>Every dollar mapped to specific cost items</span>
              </div>
              <CheckCircle2 className="check" size={17} />
            </div>
          </div>
        </section>

        {/* Trust Pillars */}
        <section className="trust-row">
          <div className="wrap trust-inner">
            <span>
              <LockKeyhole size={16} /> PayPal Sandbox integration (test mode)
            </span>
            <span>
              <BookOpenCheck size={16} /> Itemized budget & receipt comparison
            </span>
            <span>
              <Languages size={16} /> Accessible bilingual explanations
            </span>
            <span>
              <CircleHelp size={16} /> Human-reviewed expenditure decisions
            </span>
          </div>
        </section>

        {/* Campaigns Section */}
        <section className="section wrap" id="campaigns">
          <div className="section-heading">
            <div>
              <div className="eyebrow">DEMO CAMPAIGNS</div>
              <h2>Explore campaigns</h2>
              <p>
                Illustrative sample community budgets for prototype demonstration. Unit prices, quantities and supporting quotations require human verification.
              </p>
            </div>
            <button className="ghost-button" onClick={() => window.location.reload()}>
              Refresh demo data <ArrowRight size={15} />
            </button>
          </div>

          <div className="campaign-grid">
            {campaigns.map((campaign, index) => {
              const percent = Math.min(100, Math.round((campaign.raised / campaign.goal) * 100));
              const budgetTotal = (campaign.budget || []).reduce((sum, b) => sum + Number(b.amount || 0), 0);

              return (
                <article
                  className={`campaign-card ${selectedCampaign === campaign.id ? "selected" : ""}`}
                  key={campaign.id}
                >
                  <div className="campaign-visual">
                    <img
                      src={index === 0 ? "/images/water-filtration.jpg" : "/images/school-kits.jpg"}
                      alt={campaign.title}
                      loading="lazy"
                    />
                    <span className="category-tag">{campaign.category}</span>
                    <span className="demo-tag">DEMO / SAMPLE</span>
                    {selectedCampaign === campaign.id && (
                      <span className="selected-indicator-tag">
                        <CheckCircle2 size={11} /> Selected cause
                      </span>
                    )}
                  </div>

                  <div className="campaign-content">
                    <div className="cause-location">
                      <span className="status-dot" /> {campaign.location}
                    </div>
                    <h3>{campaign.title}</h3>
                    <p>{campaign.shortDescription}</p>

                    <div className="budget-list">
                      {campaign.budget.map((item) => {
                        const isEstimate =
                          item.item.toLowerCase().includes("estimate") ||
                          item.item.toLowerCase().includes("illustrative");
                        return (
                          <div
                            key={item.item}
                            className={isEstimate ? "gap-item" : ""}
                          >
                            <span>{item.item}</span>
                            <b>{money(item.amount)}</b>
                          </div>
                        );
                      })}
                    </div>

                    <div className="funding-row">
                      <span>
                        <b>{money(campaign.raised)}</b> raised (demo baseline)
                      </span>
                      <span>Goal: {money(campaign.goal)}</span>
                    </div>

                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${percent}%` }} />
                    </div>

                    <button
                      className={`button ${
                        selectedCampaign === campaign.id ? "primary active-selected" : "secondary"
                      } full-button`}
                      onClick={() => {
                        setSelectedCampaign(campaign.id);
                        setNotice("");
                      }}
                    >
                      {selectedCampaign === campaign.id ? "Selected for checkout" : "Select this campaign"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Campaign Impact Timeline Section */}
        <section className="section wrap timeline-section" id="timeline">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <Milestone size={14} /> DATA-BACKED IMPACT VERIFICATION
              </div>
              <h2>Campaign Impact Timeline</h2>
              <p>
                Track every stage of delivery against stored transaction records, submitted receipts, and authorized human audits. Milestones unlock only with authentic evidence.
              </p>
            </div>

            {/* Campaign Switcher Pills */}
            <div className="timeline-switcher">
              <span className="switcher-caption">
                <Leaf size={14} /> {language === "hi" ? "सक्रिय अभियान:" : "Active Campaign:"}
              </span>
              <div className="campaign-pills">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`campaign-pill-btn ${selectedCampaign === c.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCampaign(c.id);
                      fetchTimeline(c.id);
                    }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Milestone Stepper Bar */}
          <div className="milestones-card">
            <div className="milestones-card-header">
              <div className="milestone-status-summary">
                <span className="small-label">CURRENT AUDIT MILESTONE</span>
                <div className="current-milestone-title">
                  <span className={`milestone-pill-current ${(timelineData?.currentMilestone || "planned").toLowerCase().replace(/_/g, "-")}`}>
                    {timelineData?.currentMilestone?.replace(/_/g, " ") || "PLANNED"}
                  </span>
                  <span className="milestone-subtext">
                    {timelineData?.currentMilestone === "COMPLETED"
                      ? "Campaign formally completed with authorized audit sign-off and recorded evidence."
                      : timelineData?.currentMilestone === "HUMAN_REVIEW_COMPLETED"
                      ? "Physical receipt evidence inspected & approved by authorized human auditor."
                      : timelineData?.currentMilestone === "EVIDENCE_SUBMITTED"
                      ? "Vendor receipt submitted; pending physical document inspection."
                      : timelineData?.currentMilestone === "IN_PROGRESS"
                      ? "Real-world project execution underway or verified by on-site audit."
                      : "Campaign planned with community budget. (PayPal Sandbox test transactions are simulated and do not advance real progress.)"}
                  </span>
                </div>
              </div>

              <div className="milestone-metrics">
                <div className="metric-box">
                  <span className="metric-label">Allocated Budget</span>
                  <b className="metric-value">
                    {money(timelineData?.budgetGoal || currentCampaign?.goal || 0)}
                  </b>
                  <span className="metric-caption">target goal</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Approved Expenses</span>
                  <b className="metric-value">
                    {money(timelineData?.totalApprovedExpenses || 0)}
                  </b>
                  <span className="metric-caption">auditor approved</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Sandbox Test Payments</span>
                  <b className="metric-value">
                    {money(payments.filter((p) => p.campaignId === selectedCampaign).reduce((s, p) => s + Number(p.amount || 0), 0))}
                  </b>
                  <span className="metric-caption">simulated checkout</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Grounded Records</span>
                  <b className="metric-value">
                    {timelineData?.timeline?.length || 0}
                  </b>
                  <span className="metric-caption">stored audit entries</span>
                </div>
              </div>
            </div>

            {/* Honest Milestone Status Callout */}
            {timelineData?.completionPendingReason && (
              <div className="completion-pending-callout">
                <Info size={15} />
                <span>
                  <strong>Milestone Status:</strong> {timelineData.completionPendingReason}
                </span>
              </div>
            )}

            {/* 5 Milestone Step Visualizer */}
            <div className="milestone-stepper">
              {[
                {
                  id: "PLANNED",
                  label: "Planned",
                  desc: "Approved budget line items",
                  isDone: timelineData?.milestoneSummary?.planned,
                  isCurrent: timelineData?.currentMilestone === "PLANNED",
                  icon: BookOpenCheck
                },
                {
                  id: "IN_PROGRESS",
                  label: "In Progress",
                  desc: "Real-world operations initiated",
                  isDone: timelineData?.milestoneSummary?.inProgress,
                  isCurrent: timelineData?.currentMilestone === "IN_PROGRESS",
                  icon: Wallet
                },
                {
                  id: "EVIDENCE_SUBMITTED",
                  label: "Evidence Submitted",
                  desc: "Receipts uploaded & analyzed",
                  isDone: timelineData?.milestoneSummary?.evidenceSubmitted,
                  isCurrent: timelineData?.currentMilestone === "EVIDENCE_SUBMITTED",
                  icon: FileText
                },
                {
                  id: "HUMAN_REVIEW_COMPLETED",
                  label: "Human Review",
                  desc: "Authorized auditor sign-off",
                  isDone: timelineData?.milestoneSummary?.humanReviewCompleted,
                  isCurrent: timelineData?.currentMilestone === "HUMAN_REVIEW_COMPLETED",
                  icon: UserCheck
                },
                {
                  id: "COMPLETED",
                  label: "Completed",
                  desc: timelineData?.completionAuthorized
                    ? "Verified with evidence & signed off"
                    : "Requires authorized completion decision",
                  isDone: timelineData?.milestoneSummary?.completed,
                  isCurrent: timelineData?.currentMilestone === "COMPLETED",
                  icon: CheckCheck
                }
              ].map((step, idx) => {
                const IconComponent = step.icon;
                const isCompletedPending =
                  step.id === "COMPLETED" &&
                  !timelineData?.completionAuthorized &&
                  (timelineData?.totalApprovedExpenses || 0) >= (timelineData?.budgetGoal || 1);
                const stepState = step.isCurrent ? "current" : step.isDone ? "done" : "pending";
                return (
                  <div key={step.id} className={`milestone-step-card ${stepState}`}>
                    <div className="step-card-top">
                      <span className="step-idx">0{idx + 1}</span>
                      <span className={`step-badge ${stepState}`}>
                        {stepState === "done" ? (
                          <>
                            <CheckCircle2 size={11} /> Achieved
                          </>
                        ) : stepState === "current" ? (
                          <>
                            <Clock size={11} /> Current
                          </>
                        ) : isCompletedPending ? (
                          "Pending Sign-off"
                        ) : (
                          "Pending"
                        )}
                      </span>
                    </div>
                    <div className="step-icon-wrap">
                      <IconComponent size={20} />
                    </div>
                    <b className="step-label">{step.label}</b>
                    <span className="step-desc">{step.desc}</span>
                  </div>
                );
              })}
            </div>

            <div className="milestones-integrity-notice">
              <ShieldCheck size={15} />
              <span>
                <strong>Grounding Principle:</strong> Milestones reflect only stored records and authorized sign-offs. NekiTrail never synthesizes progress or marks campaigns verified without evidence.
              </span>
            </div>
          </div>

          {/* Timeline Event Stream & Optional Auditor Note */}
          <div className="timeline-stream-container">
            <div className="stream-header-row">
              <div className="stream-title">
                <History size={18} />
                <h3>Audit Trail & Event Log ({timelineData?.timeline?.length || 0})</h3>
              </div>
              <div className="stream-actions">
                <button
                  type="button"
                  className="ghost-button add-note-toggle"
                  onClick={() => {
                    if (!isAuditorAuthenticated) {
                      setAuditorAuthError("Auditor authentication required to record audit decisions.");
                      setAuditorModalOpen(true);
                      return;
                    }
                    setAuditFormOpen(!auditFormOpen);
                  }}
                >
                  <FileText size={14} />
                  {auditFormOpen ? "Cancel Audit Entry" : "+ Record Auditor Decision"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => fetchTimeline(selectedCampaign)}
                  title="Refresh Timeline"
                >
                  <RefreshCw size={14} className={timelineLoading ? "spin" : ""} />
                </button>
              </div>
            </div>

            {/* Collapsible Record Auditor Decision Form */}
            {auditFormOpen && (
              <form className="audit-note-form" onSubmit={handleAddAuditNote}>
                <div className="form-subheading">
                  <UserCheck size={15} />
                  <b>Add Verified Auditor Decision & Grounded Note</b>
                  <span className="auditor-authenticated-tag">
                    <CheckCircle2 size={11} /> {auditorInfo?.name || "Authorized Auditor"}
                  </span>
                </div>

                <div className="audit-event-type-selector">
                  <label className={`audit-type-radio-label ${auditEventType === "AUDIT_NOTE" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="auditEventType"
                      value="AUDIT_NOTE"
                      checked={auditEventType === "AUDIT_NOTE"}
                      onChange={() => setAuditEventType("AUDIT_NOTE")}
                    />
                    <span>General Audit Observation</span>
                  </label>
                  <label className={`audit-type-radio-label ${auditEventType === "CAMPAIGN_COMPLETED" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="auditEventType"
                      value="CAMPAIGN_COMPLETED"
                      checked={auditEventType === "CAMPAIGN_COMPLETED"}
                      onChange={() => setAuditEventType("CAMPAIGN_COMPLETED")}
                    />
                    <span>Authorized Campaign Completion Sign-Off</span>
                  </label>
                </div>

                <div className="audit-note-fields">
                  <label>
                    <span>
                      {auditEventType === "CAMPAIGN_COMPLETED"
                        ? "Campaign completion audit findings & sign-off statement (3-1,000 chars)"
                        : "Auditor note / Milestone observation (3-1,000 characters)"}
                    </span>
                    <input
                      type="text"
                      value={auditDescription}
                      onChange={(e) => setAuditDescription(e.target.value)}
                      placeholder={
                        auditEventType === "CAMPAIGN_COMPLETED"
                          ? "e.g. All project deliverables inspected on site; 100% budget verified against physical delivery receipts."
                          : "e.g. On-site community inspection completed; equipment installed."
                      }
                      required
                      minLength={3}
                      maxLength={1000}
                    />
                  </label>
                  <label>
                    <span>
                      Supporting Evidence Reference{" "}
                      {auditEventType === "CAMPAIGN_COMPLETED"
                        ? "(MANDATORY for campaign completion sign-off)"
                        : "(Optional invoice, report, or inspection ref)"}
                    </span>
                    <input
                      type="text"
                      value={auditEvidenceRef}
                      onChange={(e) => setAuditEvidenceRef(e.target.value)}
                      placeholder={
                        auditEventType === "CAMPAIGN_COMPLETED"
                          ? "e.g. FINAL-COMPLETION-CERTIFICATE-2026-001 or approved receipt ID"
                          : "e.g. SITE-INSPECT-2026-10"
                      }
                      required={auditEventType === "CAMPAIGN_COMPLETED"}
                      maxLength={200}
                    />
                    {auditEventType === "CAMPAIGN_COMPLETED" && (
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        Reference must point to a persisted evidence record or approved receipt review associated with this campaign. Arbitrary references are rejected.
                      </span>
                    )}
                    {auditEventType === "CAMPAIGN_COMPLETED" &&
                      receiptReviews.filter((r) => r.campaignId === selectedCampaign && r.humanReviewStatus === "APPROVED").length > 0 && (
                        <div style={{ marginTop: "6px", fontSize: "0.78rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>Approved campaign receipts: </span>
                          {receiptReviews
                            .filter((r) => r.campaignId === selectedCampaign && r.humanReviewStatus === "APPROVED")
                            .map((r) => (
                              <button
                                key={r.id || r._id}
                                type="button"
                                style={{
                                  background: "none",
                                  border: "1px dashed #059669",
                                  borderRadius: "4px",
                                  padding: "2px 6px",
                                  margin: "2px 4px 2px 0",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  color: "#059669"
                                }}
                                onClick={() => setAuditEvidenceRef(r.id || r._id)}
                                title={`Use approved receipt "${r.filename}" as evidence`}
                              >
                                {r.filename || r.id || r._id}
                              </button>
                            ))}
                        </div>
                      )}
                  </label>
                </div>
                <div className="audit-form-buttons">
                  <button
                    type="submit"
                    className="button primary small-btn"
                    disabled={
                      auditSubmitting ||
                      auditDescription.trim().length < 3 ||
                      (auditEventType === "CAMPAIGN_COMPLETED" && !auditEvidenceRef.trim())
                    }
                  >
                    {auditSubmitting ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}
                    {auditEventType === "CAMPAIGN_COMPLETED" ? "Authorize Campaign Completion" : "Record Grounded Note"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button small-btn"
                    onClick={() => {
                      setAuditFormOpen(false);
                      setAuditDescription("");
                      setAuditEvidenceRef("");
                      setAuditEventType("AUDIT_NOTE");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {timelineLoading && !timelineData ? (
              <div className="timeline-empty-state">
                <LoaderCircle size={28} className="spin" />
                <p>Loading verified timeline data...</p>
              </div>
            ) : !timelineData?.timeline?.length ? (
              <div className="timeline-empty-state">
                <History size={28} />
                <p>No verified timeline events recorded for this campaign yet.</p>
              </div>
            ) : (
              <div className="timeline-events-list">
                {timelineData.timeline.map((entry) => {
                  const isPlan = entry.eventType === "CAMPAIGN_PLANNED";
                  const isSandboxTestPayment = entry.eventType === "TEST_PAYMENT_CAPTURED";
                  const isPayment = entry.eventType === "DONATION_CAPTURED" || isSandboxTestPayment;
                  const isEvidence = entry.eventType === "EVIDENCE_SUBMITTED";
                  const isHuman = entry.eventType === "HUMAN_REVIEW_COMPLETED";
                  const isComplete = entry.eventType === "CAMPAIGN_COMPLETED";

                  const EventIcon = isPlan
                    ? BookOpenCheck
                    : isSandboxTestPayment
                    ? ShieldCheck
                    : isPayment
                    ? Wallet
                    : isEvidence
                    ? FileText
                    : isHuman
                    ? UserCheck
                    : isComplete
                    ? CheckCheck
                    : History;

                  return (
                    <div
                      className={`timeline-event-row ${isSandboxTestPayment ? "sandbox-event-row" : ""}`}
                      key={entry.id || entry.timestamp}
                    >
                      <div className="event-timeline-track">
                        <div
                          className={`event-node-icon ${
                            isSandboxTestPayment
                              ? "test-payment"
                              : (entry.status || "planned").toLowerCase().replace(/_/g, "-")
                          }`}
                        >
                          <EventIcon size={14} />
                        </div>
                        <div className="event-track-line" />
                      </div>

                      <div className={`event-content-card ${isSandboxTestPayment ? "sandbox-test-card" : ""}`}>
                        <div className="event-card-header">
                          <div className="event-pills-row">
                            <span
                              className={`event-type-badge ${
                                isSandboxTestPayment
                                  ? "test-payment"
                                  : (entry.eventType || "note").toLowerCase().replace(/_/g, "-")
                              }`}
                            >
                              {isSandboxTestPayment ? "SANDBOX TEST PAYMENT" : entry.eventType?.replace(/_/g, " ")}
                            </span>
                            <span
                              className={`event-status-badge ${
                                isSandboxTestPayment
                                  ? "test-payment"
                                  : (entry.status || "planned").toLowerCase().replace(/_/g, "-")
                              }`}
                            >
                              {isSandboxTestPayment ? "TEST ONLY — SIMULATED" : entry.status?.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span className="event-time">
                            <Clock size={12} />
                            {new Date(entry.timestamp).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </span>
                        </div>

                        <p className="event-description-text">{entry.description}</p>

                        {isSandboxTestPayment && (
                          <div className="sandbox-isolation-note">
                            <TriangleAlert size={12} />
                            <span>PayPal Sandbox simulation: does not represent a real public donation and does not advance real campaign execution.</span>
                          </div>
                        )}

                        <div className="event-card-footer">
                          {entry.evidenceRef && (
                            <span className="evidence-ref-tag" title="Supporting Evidence Reference">
                              <LockKeyhole size={11} /> Evidence Ref: <code>{entry.evidenceRef}</code>
                            </span>
                          )}
                          <span className="campaign-tag-pill">{entry.campaignId}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* AI Campaign Builder */}
        <section className="section builder-section" id="builder">
          <div className="wrap builder-grid">
            <div className="builder-intro">
              <div className="eyebrow">
                <Sparkles size={14} /> AI CAMPAIGN CLARITY
              </div>
              <h2>
                Make every budget<br />
                easier to understand.
              </h2>
              <p>
                Enter a plain-language project brief and itemized costs. AI will help explain the proposal, calculate totals,
                and highlight items that need clarification or supporting evidence.
              </p>

              <div className="builder-points">
                <span>
                  <CheckCircle2 size={17} /> Plain-language bilingual explanations (EN · HI)
                </span>
                <span>
                  <CheckCircle2 size={17} /> Transparent budget discrepancy & risk detection
                </span>
                <span>
                  <CheckCircle2 size={17} /> Human approval retains full editorial control
                </span>
              </div>

              <div className="note-box">
                <TriangleAlert size={17} />
                <span>
                  AI can organize information and check math, but it cannot certify a charity or prove that a cost is genuine. Human verification of all physical receipts is always required.
                </span>
              </div>
            </div>

            <div className="builder-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">CAMPAIGN WORKSPACE</div>
                  <h3>Explain a campaign proposal</h3>
                </div>
                {currentCampaign && (
                  <button
                    type="button"
                    className="sync-budget-btn"
                    onClick={() => loadCampaignIntoBuilder(currentCampaign)}
                    title="Load active campaign budget"
                  >
                    <BookOpenCheck size={14} />
                    Load "{currentCampaign.title}" budget
                  </button>
                )}
              </div>

              <form onSubmit={generateSummary} className="builder-form">
                <label>
                  Campaign brief
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows="3"
                    maxLength={4000}
                    required
                    placeholder="What community initiative are you raising funds for?"
                  />
                </label>

                <label>
                  Budget items{" "}
                  <span className="label-hint">One item per line format: Item name: Amount</span>
                  <textarea
                    className="budget-textarea"
                    value={budgetLines}
                    onChange={(e) => setBudgetLines(e.target.value)}
                    rows="4"
                    placeholder={"Water filtration unit: 650\nInstallation materials: 250"}
                  />
                </label>

                <div className="form-bottom">
                  <span className="form-helper">
                    {parsedBudget.length} budget items detected · USD sample
                  </span>
                  <button className="button primary" type="submit" disabled={aiLoading}>
                    {aiLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                    {aiLoading ? "Reviewing with AI..." : "Generate AI explanation"}
                  </button>
                </div>
              </form>

              {summary && (
                <div className="result-panel">
                  <div className="result-heading">
                    <div>
                      <span className="result-eyebrow">
                        {summary.mode === "live-ai"
                          ? language === "hi"
                            ? "लाइव जेमिनी AI विश्लेषण"
                            : "LIVE GEMINI AI ANALYSIS"
                          : language === "hi"
                            ? "डेमो नियम-आधारित परिणाम"
                            : "DEMO RULE-BASED FALLBACK"}
                      </span>
                      <h4>{language === "hi" ? summary.titleHi || summary.title : summary.title}</h4>
                    </div>
                    <span className="result-mark">
                      <CheckCircle2 size={18} />
                    </span>
                  </div>

                  <p>
                    {language === "hi"
                      ? summary.simpleExplanationHi || summary.simpleExplanationEn
                      : summary.simpleExplanationEn}
                  </p>

                  <div className="result-language">
                    <span>{language === "hi" ? "प्रदर्शन भाषा:" : "Display language:"}</span>
                    <div className="language-switch">
                      <button
                        className={language === "en" ? "active" : ""}
                        onClick={() => setLanguage("en")}
                        type="button"
                      >
                        English
                      </button>
                      <button
                        className={language === "hi" ? "active" : ""}
                        onClick={() => setLanguage("hi")}
                        type="button"
                      >
                        हिन्दी (Hindi)
                      </button>
                    </div>
                  </div>

                  <div className="risk-list">
                    <b>
                      {language === "hi"
                        ? "पहचाने गए प्रश्न और समीक्षा बिंदु:"
                        : "Identified questions & review points:"}
                    </b>
                    {getLocalizedRisks(summary, language).map((risk, i) => (
                      <div className="risk-item" key={`${risk}-${i}`}>
                        <TriangleAlert size={14} />
                        <span>{risk}</span>
                      </div>
                    ))}
                    {getLocalizedQuestions(summary, language).map((q, i) => (
                      <div className="risk-item question" key={`${q}-${i}`}>
                        <CircleHelp size={14} />
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section className="section wrap workflow-section" id="how-it-works">
          <div className="section-heading centered">
            <div className="eyebrow">HOW NEKITRAIL WORKS</div>
            <h2>From a clear budget to reviewed evidence.</h2>
            <p>
              A transparent, accountable workflow designed around donor understanding, itemized budgets, and human-verified spending receipts.
            </p>
          </div>

          <div className="workflow-grid">
            <div className="workflow-step">
              <span className="step-number">01</span>
              <div className="step-icon">
                <BookOpenCheck size={24} />
              </div>
              <h3>Understand</h3>
              <p>
                Read the clear purpose, itemized cost breakdown, and AI plain-language summary in English or Hindi.
              </p>
            </div>

            <div className="workflow-step">
              <span className="step-number">02</span>
              <div className="step-icon">
                <Wallet size={24} />
              </div>
              <h3>Choose & approve</h3>
              <p>
                Select your preferred campaign and donation amount before opening the secure PayPal Sandbox checkout.
              </p>
            </div>

            <div className="workflow-step">
              <span className="step-number">03</span>
              <div className="step-icon">
                <ShieldCheck size={24} />
              </div>
              <h3>Review evidence</h3>
              <p>
                Organizers enter receipt evidence, compared against the approved budget to highlight discrepancies for human auditor review.
              </p>
            </div>
          </div>
        </section>

        {/* Checkout Section */}
        <section className="checkout-section" id="donate">
          <div className="wrap checkout-grid">
            <div className="checkout-copy">
              <div className="eyebrow">
                <Heart size={14} /> SUPPORT A DEMO CAUSE
              </div>
              <h2>
                Make a contribution.<br />
                <span>Know what it supports.</span>
              </h2>
              <p>{donorCopy}</p>

              <div className="checkout-features">
                <span>
                  <CheckCircle2 size={16} /> Transparent itemized allocation
                </span>
                <span>
                  <CheckCircle2 size={16} /> Server-side verified PayPal Sandbox checkout
                </span>
                <span>
                  <CheckCircle2 size={16} /> Real-time in-memory audit ledger update
                </span>
              </div>
            </div>

            <div className="checkout-card">
              <div className="checkout-card-top">
                <div>
                  <span className="small-label">YOUR SELECTED CAUSE</span>
                  <h3>{currentCampaign?.title || "Loading campaign..."}</h3>
                </div>
                <span className="checkout-shield">
                  <ShieldCheck size={22} />
                </span>
              </div>

              <label className="select-label">
                Choose campaign
                <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)}>
                  {campaigns.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="select-chevron" size={16} />
              </label>

              <div className="amount-label">Choose demo contribution</div>
              <div className="amount-choices">
                {[5, 10, 25, 50].map((amount) => (
                  <button
                    type="button"
                    key={amount}
                    className={Number(donationAmount) === amount ? "amount-choice active" : "amount-choice"}
                    onClick={() => setDonationAmount(String(amount))}
                  >
                    {money(amount)}
                  </button>
                ))}
              </div>

              <label className="custom-amount">
                Custom amount (USD)
                <input
                  value={donationAmount}
                  inputMode="decimal"
                  type="number"
                  min="1"
                  max="5000"
                  step="0.01"
                  onChange={(e) => setDonationAmount(e.target.value)}
                />
              </label>

              <div className="checkout-summary">
                <span>Demo contribution</span>
                <b>{money(Number(donationAmount) || 0, paypalConfig.currency || "USD")}</b>
              </div>

              {paypalConfig.clientId && paypalConfig.sandboxReady ? (
                <PayPalScriptProvider
                  options={{
                    clientId: paypalConfig.clientId,
                    currency: paypalConfig.currency || "USD",
                    intent: "capture",
                    environment: "sandbox"
                  }}
                >
                  <div className="paypal-button-wrap">
                    <PayPalButtons
                      style={{ layout: "vertical", shape: "rect", label: "paypal", tagline: false }}
                      disabled={
                        !currentCampaign ||
                        !Number(donationAmount) ||
                        Number(donationAmount) < 1 ||
                        Number(donationAmount) > 5000
                      }
                      createOrder={createOrder}
                      onApprove={captureOrder}
                      onError={(err) =>
                        setError(
                          err?.message || "PayPal Sandbox checkout failed. Check the backend log and credentials."
                        )
                      }
                    />
                  </div>
                </PayPalScriptProvider>
              ) : (
                <div className="paypal-not-ready">
                  <div className="paypal-faux-logo">
                    Pay<span>Pal</span>
                  </div>
                  <h4 style={{ margin: "6px 0", fontSize: "0.95rem", color: "var(--deep-forest)" }}>
                    Sandbox checkout requires configuration
                  </h4>
                  <p>Configure PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env to activate live demo checkout.</p>
                  <span>
                    <LockKeyhole size={14} /> Safe sandbox environment · No real money collected
                  </span>
                </div>
              )}

              <div className="sandbox-notice">
                <ShieldCheck size={16} />
                <span>
                  PayPal Sandbox prototype. Test transactions only. Sample campaigns are for demonstration purposes and are not registered charities. Live payments are disabled.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Proof & Receipt Review */}
        <section className="section wrap" id="proof">
          <div className="section-heading">
            <div>
              <div className="eyebrow">EVIDENCE & ACCOUNTABILITY</div>
              <h2>Make the follow-through visible.</h2>
              <p>
                Receipt review compares extracted expense evidence against approved campaign budgets to flag discrepancies for human review. AI analysis cannot certify real-world impact or verify receipt authenticity.
              </p>
            </div>
            <span className="evidence-count">
              <BookOpenCheck size={16} /> {payments.length} captured Sandbox payments · {receiptReviews.length} receipt reviews
            </span>
          </div>

          <div className="proof-grid">
            <div className="proof-copy">
              <div className="proof-icon">
                <AudioLines size={24} />
              </div>
              <h3>{language === "hi" ? "खर्च के साक्ष्यों की समीक्षा करें" : "Review spending evidence"}</h3>
              <p>
                {language === "hi"
                  ? "सत्यापित खरीद रसीद अपलोड करें। AI विवरण निकालेगा और स्वीकृत बजट आवंटन से तुलना करेगा। अंतिम अनुमोदन के लिए मानवीय सत्यापन हमेशा आवश्यक है।"
                  : "Upload verified receipt evidence. AI extracts legible details and compares them against approved campaign budget allocations. Human auditor inspection is always required."}
              </p>

              {/* Mode Selector Tabs */}
              <div className="proof-mode-tabs" role="tablist">
                <button
                  type="button"
                  className={`proof-mode-tab ${receiptMode === "image" ? "active" : ""}`}
                  onClick={() => {
                    setReceiptMode("image");
                    setError("");
                  }}
                  role="tab"
                  aria-selected={receiptMode === "image"}
                >
                  <Upload size={14} />
                  {language === "hi" ? "रसीद छवि अपलोड (AI OCR)" : "Receipt image upload (AI OCR)"}
                </button>
                <button
                  type="button"
                  className={`proof-mode-tab ${receiptMode === "text" ? "active" : ""}`}
                  onClick={() => {
                    setReceiptMode("text");
                    setError("");
                  }}
                  role="tab"
                  aria-selected={receiptMode === "text"}
                >
                  <FileText size={14} />
                  {language === "hi" ? "मैन्युअल टेक्स्ट इनपुट" : "Manual text input"}
                </button>
              </div>

              {/* Gemini Quota Alert Banner */}
              {receiptQuotaError && (
                <div className="receipt-quota-alert" role="alert">
                  <div className="quota-alert-header">
                    <TriangleAlert size={18} className="quota-alert-icon" />
                    <div className="quota-alert-title-wrap">
                      <h4 className="quota-alert-title">
                        {language === "hi"
                          ? "Gemini AI API कोटा अस्थायी रूप से समाप्त हो गया है"
                          : "Gemini AI API Quota Temporarily Exhausted"}
                      </h4>
                      <span className="quota-alert-badge">HTTP 429 · AI_QUOTA_EXHAUSTED</span>
                    </div>
                  </div>
                  <p className="quota-alert-desc">
                    {language === "hi"
                      ? "Google Gemini API के इस मॉडल के लिए निःशुल्क अनुरोध सीमा (rate limit) समाप्त हो गई है। शेष एप्लिकेशन (PayPal सैंडबॉक्स, ऑडिट लेजर, टाइमलाइन) पूरी तरह काम कर रहा है। कोटा रीसेट होने पर (साधारणतः 1 मिनट में) आप पुनः प्रयास कर सकते हैं, या प्रस्तुति अभ्यास के लिए नमूना डेमो रसीद लोड कर सकते हैं।"
                      : "The Google Gemini multimodal AI rate limit for this account has been reached. The rest of the application (PayPal Sandbox, audit ledger, impact timeline) remains fully operational. You can retry after the quota window resets (typically 1 minute), switch to manual text input, or load a presentation sample demo receipt."}
                  </p>
                  <div className="quota-alert-actions">
                    <button
                      type="button"
                      className="button secondary sm"
                      onClick={loadSampleDemoReceipt}
                      disabled={receiptLoading}
                    >
                      <Sparkles size={14} />
                      {language === "hi" ? "प्रस्तुति नमूना रसीद लोड करें" : "Load sample demo receipt"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button sm"
                      onClick={() => {
                        setReceiptMode("text");
                        setReceiptQuotaError(null);
                      }}
                    >
                      <FileText size={14} />
                      {language === "hi" ? "मैन्युअल टेक्स्ट मोड" : "Switch to manual text input"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button sm"
                      onClick={(e) => {
                        setReceiptQuotaError(null);
                        if (receiptMode === "image") reviewReceiptImage(e);
                        else reviewReceipt(e);
                      }}
                      disabled={receiptLoading}
                    >
                      <RefreshCw size={14} />
                      {language === "hi" ? "पुनः प्रयास करें" : "Retry analysis"}
                    </button>
                  </div>
                </div>
              )}

              {receiptMode === "image" ? (
                /* Image Upload Form */
                <form className="receipt-image-form" onSubmit={reviewReceiptImage}>
                  {!receiptFile ? (
                    <div
                      className={`receipt-dropzone ${isDragging ? "dragging" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          handleFileSelect({ target: { files: e.dataTransfer.files } });
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                        style={{ display: "none" }}
                        onChange={handleFileSelect}
                      />
                      <div className="dropzone-icon">
                        <Upload size={28} />
                      </div>
                      <b>
                        {language === "hi"
                          ? "रसीद की छवि चुनें या यहाँ खींचें"
                          : "Choose a receipt image or drag it here"}
                      </b>
                      <span>JPEG, PNG, WebP · Max 5 MB</span>
                    </div>
                  ) : (
                    <div className="selected-file-card">
                      <div className="file-preview-wrap">
                        {receiptPreviewUrl && (
                          <img src={receiptPreviewUrl} alt="Receipt preview" className="file-thumbnail" />
                        )}
                        <div className="file-details">
                          <b className="file-name">{receiptFile.name}</b>
                          <span className="file-size">
                            {(receiptFile.size / 1024).toFixed(1)} KB · {receiptFile.type || "image"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="remove-file-btn"
                        onClick={handleRemoveFile}
                        title={language === "hi" ? "फ़ाइल हटाएं" : "Remove file"}
                        aria-label="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {receiptFileError && (
                    <div className="receipt-error-inline" role="alert">
                      <TriangleAlert size={14} />
                      <span>{receiptFileError}</span>
                    </div>
                  )}

                  <div className="receipt-actions-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={receiptLoading || !currentCampaign || !receiptFile}
                    >
                      {receiptLoading ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                      {receiptLoading
                        ? language === "hi"
                          ? "रसीद का विश्लेषण जारी..."
                          : "Analyzing receipt image..."
                        : language === "hi"
                          ? "रसीद का विश्लेषण और बजट मिलान"
                          : "Analyze receipt & compare with budget"}
                    </button>
                    <button
                      type="button"
                      className="sample-demo-pill-btn"
                      onClick={loadSampleDemoReceipt}
                      disabled={receiptLoading || !currentCampaign}
                      title={language === "hi" ? "प्रस्तुति अभ्यास के लिए नमूना रसीद परिणाम" : "Try sample demo receipt for presentation practice"}
                    >
                      <Sparkles size={13} />
                      {language === "hi" ? "प्रस्तुति नमूना रसीद" : "Try sample demo"}
                    </button>
                    {receiptFile && !receiptLoading && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCw size={14} />
                        {language === "hi" ? "छवि बदलें" : "Replace image"}
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                /* Manual Text Form */
                <form className="receipt-form" onSubmit={reviewReceipt}>
                  <label>
                    {language === "hi" ? "रसीद विवरण टेक्स्ट" : "Demo receipt details"}
                    <textarea
                      value={receiptText}
                      onChange={(e) => setReceiptText(e.target.value)}
                      rows="3"
                      required
                      placeholder="Vendor, item, amount, date..."
                    />
                  </label>
                  <div className="receipt-actions-row">
                    <button className="button primary" type="submit" disabled={receiptLoading || !currentCampaign}>
                      {receiptLoading ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                      {receiptLoading
                        ? language === "hi"
                          ? "समीक्षा जारी..."
                          : "Reviewing receipt..."
                        : language === "hi"
                          ? "चयनित बजट से तुलना करें"
                          : "Compare with selected budget"}
                    </button>
                    <button
                      type="button"
                      className="sample-demo-pill-btn"
                      onClick={loadSampleDemoReceipt}
                      disabled={receiptLoading || !currentCampaign}
                      title={language === "hi" ? "प्रस्तुति अभ्यास के लिए नमूना रसीद परिणाम" : "Try sample demo receipt for presentation practice"}
                    >
                      <Sparkles size={13} />
                      {language === "hi" ? "प्रस्तुति नमूना रसीद" : "Try sample demo"}
                    </button>
                  </div>
                </form>
              )}

              {/* Structured Extracted Receipt Details Table */}
              {receiptImageResult?.extractedData && (
                <div className="extracted-data-card">
                  <div className="extracted-heading">
                    <Sparkles size={15} />
                    <b>
                      {language === "hi"
                        ? "निष्कर्षित रसीद विवरण (AI OCR)"
                        : "Extracted receipt details (AI OCR)"}
                    </b>
                  </div>
                  <div className="extracted-grid">
                    <div className="extracted-cell">
                      <span className="cell-label">{language === "hi" ? "विक्रेता / मर्चेंट:" : "Vendor / Merchant:"}</span>
                      <b>{receiptImageResult.extractedData.vendor || (language === "hi" ? "पहचाना नहीं गया" : "Not detected")}</b>
                    </div>
                    <div className="extracted-cell">
                      <span className="cell-label">{language === "hi" ? "रसीद दिनांक:" : "Receipt date:"}</span>
                      <b>{receiptImageResult.extractedData.date || (language === "hi" ? "पहचाना नहीं गया" : "Not detected")}</b>
                    </div>
                    <div className="extracted-cell">
                      <span className="cell-label">{language === "hi" ? "कुल राशि:" : "Total amount:"}</span>
                      <b>
                        {receiptImageResult.extractedData.totalAmount !== null
                          ? money(receiptImageResult.extractedData.totalAmount, receiptImageResult.extractedData.currency || "USD")
                          : (language === "hi" ? "पहचाना नहीं गया" : "Not detected")}
                      </b>
                    </div>
                    <div className="extracted-cell">
                      <span className="cell-label">{language === "hi" ? "मुद्रा:" : "Currency:"}</span>
                      <b>{receiptImageResult.extractedData.currency || "USD"}</b>
                    </div>
                    {receiptImageResult.extractedData.tax !== null && (
                      <div className="extracted-cell">
                        <span className="cell-label">{language === "hi" ? "कर (Tax):" : "Tax:"}</span>
                        <b>{money(receiptImageResult.extractedData.tax, receiptImageResult.extractedData.currency || "USD")}</b>
                      </div>
                    )}
                  </div>

                  {receiptImageResult.extractedData.lineItems?.length > 0 && (
                    <div className="line-items-section">
                      <span className="cell-label">{language === "hi" ? "पहचाने गए लाइन आइटम्स:" : "Detected line items:"}</span>
                      <table className="line-items-table">
                        <thead>
                          <tr>
                            <th>{language === "hi" ? "विवरण" : "Description"}</th>
                            <th>{language === "hi" ? "मात्रा" : "Qty"}</th>
                            <th>{language === "hi" ? "प्रति इकाई" : "Unit price"}</th>
                            <th>{language === "hi" ? "राशि" : "Amount"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiptImageResult.extractedData.lineItems.map((li, idx) => (
                            <tr key={idx}>
                              <td>{li.description}</td>
                              <td>{li.quantity ?? "-"}</td>
                              <td>{li.unitPrice !== null ? money(li.unitPrice, receiptImageResult.extractedData.currency) : "-"}</td>
                              <td><b>{li.amount !== null ? money(li.amount, receiptImageResult.extractedData.currency) : "-"}</b></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Comparison Result Card */}
              {receiptResult && (
                <div className={`receipt-result ${receiptResult.status === "POSSIBLE_MATCH" ? "" : "review"} ${receiptResult.isSampleDemo ? "sample-demo-card" : ""}`}>
                  {receiptResult.isSampleDemo && (
                    <div className="sample-demo-notice-banner" role="alert">
                      <div className="sample-demo-badge">
                        <Sparkles size={14} />
                        <span>SAMPLE DEMO RESULT — NOT A LIVE AI ANALYSIS</span>
                      </div>
                      <p>
                        {language === "hi"
                          ? "यह प्रस्तुति अभ्यास के लिए एक पूर्व-निर्धारित स्थिर नमूना परिणाम है। यह लाइव AI विश्लेषण नहीं है, ऑडिट लेजर या डेटाबेस में संग्रहीत नहीं किया जाता है, खर्चों को स्वीकृत नहीं करता है, और अभियान की पूर्णता को आगे नहीं बढ़ाता है।"
                          : "Fixed sample data for demonstration and presentation practice only. This is not a live AI analysis, is not saved to the audit ledger or database, cannot approve expenses, and does not advance campaign completion."}
                      </p>
                    </div>
                  )}

                  <div className="result-status-badge">
                    {receiptResult.status === "POSSIBLE_MATCH" ? (
                      <span className="status-badge success">
                        <CheckCircle2 size={16} />
                        {language === "hi" ? "संभावित मिलान — मानवीय समीक्षा आवश्यक" : "Possible match — needs human review"}
                      </span>
                    ) : receiptResult.status === "NO_MATCH" ? (
                      <span className="status-badge neutral">
                        <TriangleAlert size={16} />
                        {language === "hi" ? "बजट से कोई स्पष्ट मिलान नहीं" : "No clear budget match"}
                      </span>
                    ) : (
                      <span className="status-badge warning">
                        <TriangleAlert size={16} />
                        {language === "hi" ? "मानवीय समीक्षा आवश्यक" : "Needs human review"}
                      </span>
                    )}
                  </div>

                  {receiptResult.matchedBudgetItem && (
                    <div className="receipt-breakdown">
                      <div className="receipt-breakdown-row">
                        <span>{language === "hi" ? "निष्कर्षित रसीद राशि:" : "Extracted receipt amount:"}</span>
                        <b>{receiptResult.receiptAmount !== null ? money(receiptResult.receiptAmount) : (language === "hi" ? "पहचाना नहीं गया" : "Not detected")}</b>
                      </div>
                      <div className="receipt-breakdown-row">
                        <span>{language === "hi" ? "अभियान का बजट आइटम:" : "Candidate budget item:"}</span>
                        <b>{receiptResult.matchedBudgetItem}</b>
                      </div>
                      <div className="receipt-breakdown-row">
                        <span>{language === "hi" ? "स्वीकृत बजट आवंटन:" : "Budgeted allocation:"}</span>
                        <b>{receiptResult.budgetAmount !== null ? money(receiptResult.budgetAmount) : "N/A"}</b>
                      </div>
                      {receiptResult.remainingBudget !== null && (
                        <div className="receipt-breakdown-row highlight">
                          <span>
                            {receiptResult.remainingBudget >= 0
                              ? language === "hi" ? "शेष बजट आवंटन:" : "Remaining allocation:"
                              : language === "hi" ? "बजट से अधिक (Discrepancy):" : "Over budget by:"}
                          </span>
                          <b>{money(Math.abs(receiptResult.remainingBudget))}</b>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="receipt-explanation">{receiptResult.explanation}</p>

                  <div className="receipt-flags-list">
                    {receiptResult.flags?.map((flag, idx) => (
                      <span key={idx} className="receipt-flag">
                        <TriangleAlert size={14} />
                        {flag}
                      </span>
                    ))}
                  </div>

                  <div className="human-review-callout">
                    <ShieldCheck size={16} />
                    <span>
                      {language === "hi"
                        ? "सलाहकारी सत्यापन: AI निष्कर्षण या टेक्स्ट मिलान रसीद की प्रामाणिकता, विक्रेता की वैधता या वास्तविक खरीद को प्रमाणित नहीं करता है। धन जारी करने से पहले अधिकृत मानव समीक्षक द्वारा भौतिक रसीद का निरीक्षण आवश्यक है।"
                        : "Advisory comparison only: AI extraction or text matching does not prove receipt authenticity, vendor validity, or that payment occurred. Physical document inspection and approval by an authorized human reviewer is required before funds are disbursed."}
                    </span>
                  </div>

                  <div className="storage-status-note">
                    {receiptResult.isSampleDemo ? (
                      <span className="persisted-sample">
                        <Sparkles size={13} /> {language === "hi" ? "प्रस्तुति नमूना मोड: यह परिणाम सहेजा नहीं गया है और खर्च स्वीकृत नहीं करता है।" : "Presentation demo mode: record is unpersisted and isolated from milestones."}
                      </span>
                    ) : storageMode === "mongodb" ? (
                      <span className="persisted-ok">
                        <CheckCircle2 size={13} /> {language === "hi" ? "समीक्षा रिकॉर्ड MongoDB लेजर में स्थायी रूप से सहेजा गया।" : "Review record permanently saved to MongoDB ledger."}
                      </span>
                    ) : (
                      <span className="persisted-fallback">
                        <LockKeyhole size={13} /> {language === "hi" ? "डेवलपमेंट फ़ॉलबैक मोड: समीक्षा रिकॉर्ड अस्थायी है।" : "Development fallback mode: review record is non-persistent."}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Proof Side: Dual Ledger for Payments & Receipt Reviews */}
            <div className="proof-side">
              <div className="proof-side-heading">
                <div>
                  <span className="small-label">DEMO AUDIT TRAIL</span>
                  <h3>{language === "hi" ? "सत्यापित ऑडिट लेजर" : "Verified audit ledger"}</h3>
                </div>
                <span className="live-dot" />
              </div>

              {/* Side Tabs: Payments vs Receipt Reviews */}
              <div className="proof-side-tabs" role="tablist">
                <button
                  type="button"
                  className={`proof-side-tab ${proofTab === "payments" ? "active" : ""}`}
                  onClick={() => setProofTab("payments")}
                  role="tab"
                  aria-selected={proofTab === "payments"}
                >
                  <Wallet size={14} />
                  {language === "hi" ? `भुगतान लेजर (${payments.length})` : `Payments (${payments.length})`}
                </button>
                <button
                  type="button"
                  className={`proof-side-tab ${proofTab === "reviews" ? "active" : ""}`}
                  onClick={() => setProofTab("reviews")}
                  role="tab"
                  aria-selected={proofTab === "reviews"}
                >
                  <FileCheck size={14} />
                  {language === "hi" ? `रसीद समीक्षाएं (${receiptReviews.length})` : `Receipt reviews (${receiptReviews.length})`}
                </button>
              </div>

              {proofTab === "payments" ? (
                /* Payments List */
                payments.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Wallet size={24} />
                    </div>
                    <b>{language === "hi" ? "अभी कोई सैंडबॉक्स लेनदेन नहीं है" : "No sandbox transactions yet"}</b>
                    <span>
                      {language === "hi"
                        ? "सत्यापित भुगतान देखने के लिए ऊपर एक टेस्ट डोनेशन पूरा करें।"
                        : "Complete a test donation checkout above to view verified payment activity."}
                    </span>
                  </div>
                ) : (
                  <div className="payments-list">
                    {payments
                      .slice()
                      .reverse()
                      .map((payment) => (
                        <div className="payment-row" key={payment.orderId}>
                          <span className="payment-check">
                            <CheckCircle2 size={18} />
                          </span>
                          <div className="payment-info">
                            <b>
                              {campaigns.find((c) => c.id === payment.campaignId)?.title || "Demo campaign"}
                            </b>
                            <span>
                              {payment.captureId} · {new Date(payment.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="payment-amount">
                            <b>{money(payment.amount, payment.currency)}</b>
                            <span>COMPLETED</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : (
                /* Receipt Reviews List */
                receiptReviews.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <FileCheck size={24} />
                    </div>
                    <b>{language === "hi" ? "अभी कोई रसीद समीक्षा नहीं है" : "No receipt reviews yet"}</b>
                    <span>
                      {language === "hi"
                        ? "ऑडिट रिकॉर्ड बनाने के लिए बाईं ओर एक रसीद छवि अपलोड करें।"
                        : "Upload a receipt image on the left to generate verified audit records."}
                    </span>
                  </div>
                ) : (
                  <div className="payments-list">
                    {receiptReviews.map((rev) => {
                      const reviewId = rev.id || rev._id;
                      const isPendingReview = rev.humanReviewStatus === "PENDING_HUMAN_REVIEW" || !rev.humanReviewStatus;
                      const isApproved = rev.humanReviewStatus === "APPROVED";
                      const isRejected = rev.humanReviewStatus === "REJECTED";
                      const isActionOpen = activeReviewActionId === reviewId;

                      return (
                        <div className="payment-row review-row" key={reviewId || rev.createdAt}>
                          <div className="review-main-row">
                            <span className="payment-check">
                              <FileText size={18} />
                            </span>
                            <div className="payment-info">
                              <b>{rev.filename || "Receipt"}</b>
                              <span>
                                {campaigns.find((c) => c.id === rev.campaignId)?.title || rev.campaignId} ·{" "}
                                {rev.matchedBudgetItem ? `Matched: ${rev.matchedBudgetItem}` : "No budget match"} ·{" "}
                                {new Date(rev.createdAt).toLocaleDateString()}
                              </span>
                              {rev.reviewedBy && (
                                <div className="reviewer-attribution">
                                  <UserCheck size={13} />
                                  <span>
                                    Audited by <strong>{rev.reviewedBy}</strong> on{" "}
                                    {new Date(rev.reviewedAt || rev.createdAt).toLocaleDateString()}:{" "}
                                    <em>"{rev.reviewerNotes || (isApproved ? 'Approved' : 'Rejected')}"</em>
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="payment-amount">
                              <b>
                                {rev.extractedData?.totalAmount !== null && rev.extractedData?.totalAmount !== undefined
                                  ? money(rev.extractedData.totalAmount, rev.extractedData.currency || "USD")
                                  : rev.budgetAmount !== null
                                  ? money(rev.budgetAmount)
                                  : "N/A"}
                              </b>
                              <div className="review-badges-stack">
                                <span className={`review-badge ${rev.status === "POSSIBLE_MATCH" ? "possible" : "review"}`}>
                                  {rev.status === "POSSIBLE_MATCH" ? "AI MATCH" : "AI REVIEW"}
                                </span>
                                <span className={`human-status-badge ${isApproved ? "approved" : isRejected ? "rejected" : "pending"}`}>
                                  {isApproved ? "HUMAN APPROVED" : isRejected ? "HUMAN REJECTED" : "PENDING AUDIT"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Inline Human Review Authorization Controls */}
                          {isPendingReview && (
                            <div className="review-action-container">
                              {!isActionOpen ? (
                                <button
                                  type="button"
                                  className="authorize-trigger-btn"
                                  onClick={() => {
                                    if (!isAuditorAuthenticated) {
                                      setAuditorAuthError("Auditor authentication required to record review decisions.");
                                      setAuditorModalOpen(true);
                                      return;
                                    }
                                    setActiveReviewActionId(reviewId);
                                    setReviewerNotes("");
                                  }}
                                >
                                  <UserCheck size={13} />
                                  {language === "hi" ? "मानवीय समीक्षा अधिकृत करें" : "Authorize human review"}
                                </button>
                              ) : !isAuditorAuthenticated ? (
                                <div className="inline-review-auth-prompt">
                                  <div>
                                    <strong>Auditor Authentication Required</strong>
                                    <p>Server-side authentication is required to approve or reject expenditure evidence.</p>
                                  </div>
                                  <button
                                    type="button"
                                    className="button primary small-btn"
                                    onClick={() => {
                                      setAuditorAuthError("");
                                      setAuditorModalOpen(true);
                                    }}
                                  >
                                    <KeyRound size={13} /> Sign In
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-review-form">
                                  <div className="form-subheading">
                                    <ShieldCheck size={14} />
                                    <span>Authorized Human Auditor Decision (Server-Side Enforced)</span>
                                    <span className="auditor-authenticated-tag">
                                      <CheckCircle2 size={11} /> {auditorInfo?.name || "Authorized Auditor"}
                                    </span>
                                  </div>
                                  <div className="review-form-fields">
                                    <label>
                                      <span>Inspection & Verification Notes (3-500 characters)</span>
                                      <input
                                        type="text"
                                        value={reviewerNotes}
                                        onChange={(e) => setReviewerNotes(e.target.value)}
                                        placeholder="Physical invoice verified on site; items received in good order."
                                      />
                                    </label>
                                  </div>
                                  <div className="review-form-actions">
                                    <button
                                      type="button"
                                      className="button primary small-btn"
                                      disabled={reviewSubmitting}
                                      onClick={() => handleAuthorizeReview(reviewId, "APPROVED")}
                                    >
                                      <CheckCircle2 size={13} />
                                      {reviewSubmitting ? "Saving..." : language === "hi" ? "स्वीकृत करें (Approve)" : "Approve Expense"}
                                    </button>
                                    <button
                                      type="button"
                                      className="button secondary-danger small-btn"
                                      disabled={reviewSubmitting}
                                      onClick={() => handleAuthorizeReview(reviewId, "REJECTED")}
                                    >
                                      <X size={13} />
                                      {reviewSubmitting ? "Saving..." : language === "hi" ? "अस्वीकृत करें (Reject)" : "Reject"}
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button small-btn"
                                      disabled={reviewSubmitting}
                                      onClick={() => setActiveReviewActionId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              <div className="audit-foot">
                <LockKeyhole size={14} />{" "}
                {storageMode === "mongodb"
                  ? language === "hi"
                    ? "ऑडिट रिकॉर्ड्स MongoDB डेटाबेस में स्थायी रूप से संग्रहीत हैं।"
                    : "Verified audit records permanently stored in MongoDB."
                  : language === "hi"
                    ? "इन-मेमोरी डेमो लेजर (सर्वर रीस्टार्ट होने पर रीसेट हो जाता है)।"
                    : "In-memory demo fallback; configure MONGODB_URI for persistence."}
              </div>
            </div>
          </div>
        </section>

        {/* Floating Toasts */}
        {error && (
          <div className="toast error-toast" role="alert">
            <TriangleAlert size={18} />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="toast success-toast" role="status">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss notice">
              ×
            </button>
          </div>
        )}

        {/* Auditor Authentication Modal */}
        {auditorModalOpen && (
          <div className="auditor-modal-backdrop" onClick={() => setAuditorModalOpen(false)}>
            <div className="auditor-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="auditor-modal-header">
                <div className="modal-title-row">
                  <KeyRound size={20} className="modal-icon" />
                  <h3>Auditor Authentication</h3>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setAuditorModalOpen(false)}
                  aria-label="Close modal"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="auditor-modal-desc">
                Server-side authentication enforces that only authorized human auditors may record review decisions, verify expenses, or approve campaign completion. Enter your server-side secret key to begin a secure session.
              </p>
              <form onSubmit={handleAuditorLogin}>
                <label className="auditor-passphrase-label">
                  <span>Auditor Secret Key / Passphrase</span>
                  <input
                    type="password"
                    value={auditorPassphrase}
                    onChange={(e) => {
                      setAuditorPassphrase(e.target.value);
                      setAuditorAuthError("");
                    }}
                    placeholder="Enter server-configured auditor secret key..."
                    autoFocus
                    required
                  />
                </label>
                {auditorAuthError && (
                  <div className="auditor-auth-error">
                    <TriangleAlert size={14} />
                    <span>{auditorAuthError}</span>
                  </div>
                )}
                <div className="auditor-modal-actions">
                  <button
                    type="submit"
                    className="button primary small-btn"
                    disabled={auditorAuthLoading || !auditorPassphrase.trim()}
                  >
                    {auditorAuthLoading ? <LoaderCircle size={14} className="spin" /> : <LockKeyhole size={14} />}
                    Authenticate Auditor
                  </button>
                  <button
                    type="button"
                    className="ghost-button small-btn"
                    onClick={() => setAuditorModalOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="wrap footer-inner">
          <a className="brand" href="#top">
            <span className="brand-icon">
              <Heart size={18} fill="currentColor" />
            </span>
            <span>
              NekiTrail<span className="brand-ai">AI</span>
            </span>
          </a>
          <span>Your contribution. Clearly accounted for. · Hackathon Prototype</span>
          <a href="#top">Back to top ↑</a>
        </div>
        <div className="wrap disclaimer">
          All campaigns, budget figures, contributions, and receipts in this starter are demonstration data for hackathon evaluation. The platform does not verify 501(c)(3) status or guarantee how funds are used. Do not use this prototype to solicit or process real donations without appropriate regulatory compliance and production security audits.
        </div>
      </footer>
    </div>
  );
}

export default App;
