# NekiTrail AI — Accountable Community Giving Platform

**Your contribution. Clearly accounted for.**

NekiTrail AI (inspired by *“neki”*, meaning an act of goodness) is a transparent community fundraising, expenditure accountability, and audit platform. It bridges the gap between grassroots community initiatives, donors, and independent auditors with itemized budget clarity, bilingual AI explanations, secure PayPal Sandbox checkout, live multimodal receipt extraction, server-side auditor authentication, and a data-grounded Campaign Impact Timeline.

---

## Table of Contents

1. [Problem Statement & Purpose](#problem-statement--purpose)
2. [Key Features & System Architecture](#key-features--system-architecture)
3. [Core Concept Distinctions](#core-concept-distinctions)
4. [Technology Stack](#technology-stack)
5. [Prerequisites & Safe Local Setup](#prerequisites--safe-local-setup)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Running the Application](#running-the-application)
8. [Automated Testing & Test Suite](#automated-testing--test-suite)
9. [PayPal Sandbox Setup Guide](#paypal-sandbox-setup-guide)
10. [Google Gemini Setup Guide](#google-gemini-setup-guide)
11. [MongoDB Setup Guide](#mongodb-setup-guide)
12. [API Route Reference](#api-route-reference)
13. [3-Minute Demo Video Walkthrough Script](#3-minute-demo-video-walkthrough-script)
14. [Troubleshooting & Diagnostics](#troubleshooting--diagnostics)
15. [Prototype Limitations & Security Disclaimers](#prototype-limitations--security-disclaimers)
16. [License](#license)

---

## Problem Statement & Purpose

Grassroots fundraising and charitable giving suffer from three major trust hurdles:
1. **Opaque Budgets:** Everyday donors are presented with lump-sum fundraising goals without understanding how their money is divided into specific goods, services, unit costs, or delivery expenses.
2. **Missing Expenditure Proof:** After funds are collected, contributors rarely see verifiable invoices, physical receipts, or on-the-ground proof that money was spent on the agreed budget lines.
3. **Unverified Claims of Completion:** Campaigns frequently declare "100% finished" without independent verification, inspection certificates, or transparent audit trails.

**NekiTrail AI** provides transparency by design:
- **Itemized Budget Allocation:** Every campaign defines specific, itemized cost categories summing strictly to its funding goal.
- **Bilingual Plain-Language Clarity:** Translates technical proposals into accessible English and Hindi summaries with clear budget risk flags and clarifying questions.
- **Isolated PayPal Sandbox Checkout:** Collects simulated donor contributions with server-side capture verification, duplicate prevention, and strict separation from baseline totals.
- **Multimodal AI Receipt Extraction:** Extracts vendor names, dates, currencies, itemized costs, and totals from uploaded receipt images (JPEG, PNG, WebP) using **Google Gemini 3.8-Flash**, preserving missing fields without hallucinating.
- **Advisory Budget Comparison:** Compares submitted expenses against budgeted allocations, highlighting remaining balances or discrepancies while strictly enforcing human review.
- **Server-Side Auditor Security:** Restricts sensitive actions (receipt approval, timeline audit notes, completion sign-off) to authenticated auditors via `HttpOnly` session cookies with zero token exposure in browser responses.
- **Grounded Campaign Impact Timeline:** Tracks progress across 5 distinct milestones (`Planned` → `In Progress` → `Evidence Submitted` → `Human Review Completed` → `Completed`). Campaign completion is rejected unless linked to a verified, persisted evidence record or approved receipt review.

---

## Key Features & System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEKITRAIL AI PLATFORM                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│    DONOR     │             │  ORGANIZER   │             │   AUDITOR    │
│  EXPERIENCE  │             │  EXPERIENCE  │             │  EXPERIENCE  │
└──────────────┘             └──────────────┘             └──────────────┘
      │                            │                            │
      │ 1. Browse Itemized Budget  │ 1. Upload Receipt Image    │ 1. Passphrase Login
      │ 2. Bilingual AI Summary    │ 2. Multimodal Gemini OCR   │ 2. Inspect Invoices
      │ 3. PayPal Sandbox Checkout │ 3. Match Budget Allocations│ 3. Approve/Reject Proof
      │ 4. Track Impact Timeline   │ 4. Submit Physical Evidence│ 4. Sign-Off Completion
      ▼                            ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS SECURE BACKEND API                        │
│  - HttpOnly Cookie Auth (Zero Token Leakage to Client)                  │
│  - Server-Side PayPal Orders Capture & Re-Verification                  │
│  - Gemini 3.8-Flash Multimodal OCR & Budget Discrepancy Engine          │
│  - Grounded Timeline Milestone Progression & Evidence Validation        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┴────────────────────────────┐
      ▼                                                         ▼
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│          MONGODB ATLAS / LOCAL       │       │       IN-MEMORY FALLBACK STORE       │
│  - PaymentRecords (Sandbox Ledger)   │  ──►  │  Resilient zero-configuration mode   │
│  - ReceiptReviews (OCR Metadata)     │       │  ensures tests and dev run even if   │
│  - CampaignEvidence & TimelineEvents │       │  database connection is unavailable  │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

---

## Core Concept Distinctions

To ensure financial accuracy and transparent communication, NekiTrail AI strictly distinguishes the following operational concepts:

| Concept | What It Represents in NekiTrail AI | What It Does NOT Mean |
|---|---|---|
| **Allocated Campaign Budget** | Pre-approved, itemized expenditure targets defined during campaign planning (e.g. $650 for water filtration unit, $150 for testing). | It does NOT mean money has already been spent or released. |
| **Approved Expenses** | The dollar sum of physical receipts that have been uploaded, analyzed, and formally **APPROVED** by an authenticated human auditor. | It does NOT equal the total funds raised, nor does it automatically complete a campaign. |
| **Supporting Evidence (`evidenceRef`)** | A registered physical document (e.g., inspection certificate, vendor invoice, lab test report, or approved receipt record) stored in the database. | An arbitrary string or unverifiable claim is rejected by the server. |
| **Campaign Completion** | An authorized sign-off decision recorded by an authenticated auditor that cites a verified supporting evidence record. | A campaign is **NEVER** marked completed simply because its budget was raised or receipt reviews were submitted. |
| **PayPal Sandbox Test Payments** | Simulated transactions processed through PayPal Developer Sandbox using mock buyer accounts for hackathon demonstration. | They are **NEVER** presented as real public donations, tax-deductible charitable gifts, or live funds. |
| **Gemini AI Receipt Analysis** | An automated OCR and mathematical comparison tool that organizes receipt details and flags potential discrepancies. | It is **NEVER** treated as proof of legal authenticity, vendor legitimacy, or physical delivery. |

---

## Technology Stack

### Frontend
- **Framework**: React 18 with Vite 6.
- **Design System**: Custom Vanilla CSS editorial design system built upon the exact 65% / 28% / 7% brand color palette:
  - **Warm Ivory (`#F9EBD7`) [65%]**: Backgrounds, spacious cards, and section containers.
  - **Emerald Green (`#046A38`) [28%]**: Brand identity, primary CTAs, active navigation, and achieved milestones.
  - **Vermilion (`#E34222`) [7%]**: Selected indicators, live status indicators, over-budget warnings, and error alerts.
- **Typography**: Editorial font pairing combining **Newsreader** (high-contrast serif) and **Plus Jakarta Sans** (modern interface sans).
- **Icons**: Lucide React.
- **Payments**: `@paypal/react-paypal-js` (PayPal JavaScript SDK).

### Backend
- **Runtime**: Node.js 20+ / 22+ (ECMAScript Modules).
- **Web Framework**: Express.js 4 with CORS and secure cookie parsing.
- **Database & ODM**: Mongoose 9 / MongoDB with automatic resilient in-memory fallback.
- **HTTP Client**: Native `fetch` with Undici and IPv4-first DNS prioritization.

### AI & Payments
- **AI OCR & Translation**: Google Gemini API (`gemini-3.8-flash` via REST `generateContent`).
- **Payment Verification**: PayPal Orders v2 REST API (Sandbox environment).

---

## Prerequisites & Safe Local Setup

### Prerequisites
- **Node.js**: `v20.0.0` or newer (`node -v`).
- **npm**: `v10.0.0` or newer (`npm -v`).
- **MongoDB** (Optional): Local MongoDB on `mongodb://localhost:27017` or MongoDB Atlas. If absent, the backend automatically runs in in-memory fallback mode.

### Safe Local Setup
1. Clone or extract the project repository:
   ```bash
   cd nekitrail-ai-starter
   ```
2. Install dependencies across workspaces:
   ```bash
   npm install
   ```
3. Initialize the backend environment file from the template:
   ```bash
   cp backend/.env.example backend/.env
   ```
4. Generate a secure, random auditor passphrase (never share or commit this key):
   ```bash
   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
   ```
5. Populate `backend/.env` with your sandbox and API credentials using the placeholder guide below.

---

## Environment Variables Reference

### Backend Configuration (`backend/.env`)

All environment files containing actual secrets are strictly excluded by `.gitignore`. Keep your credentials confidential.

```ini
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TIMEOUT_MS=180000

# PayPal Sandbox Credentials (server-side only; never expose in frontend)
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret_here
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_CURRENCY=USD

# MongoDB Storage (defaults to in-memory fallback if omitted or unreachable)
MONGODB_URI=mongodb://localhost:27017/nekitrail

# Auditor Authentication Passphrase (for human reviews & timeline sign-offs)
AUDITOR_SECRET_KEY=your_secure_auditor_secret_key_here

# Cookie Security (set to true in production over HTTPS)
COOKIE_SECURE=false
```

### Frontend Configuration (`frontend/.env`)
```ini
# Optional: only required if hosting backend and frontend on different domains
VITE_API_URL=http://localhost:4000
```

---

## Running the Application

### 1. Run Concurrently (Recommended)
From the project root:
```bash
npm run dev
```
- **Backend API**: `http://localhost:4000` (Health check: `http://localhost:4000/api/health`)
- **Frontend App**: `http://localhost:5173`

### 2. Run Independently
**Backend only:**
```bash
npm run dev --workspace backend
# or: cd backend && npm run dev
```

**Frontend only:**
```bash
npm run dev --workspace frontend
# or: cd frontend && npm run dev
```

### 3. Production Build Validation
To test and create the frontend production distribution bundle:
```bash
npm run build
```

---

## Automated Testing & Test Suite

The backend features an automated **45-test suite** across **14 test suites** validating all critical data-integrity, security, and AI behavior.

Run the test suite from the root:
```bash
npm test
```
Or directly from `backend/`:
```bash
cd backend && npm test
```

### Test Coverage Highlights
- **Storage Resilience & Ledger Integrity (10 tests)**: Graceful in-memory fallback when MongoDB is unavailable, payment record validation, duplicate prevention, demo baseline preservation, and restart resilience.
- **Image Validation & Safety (5 tests)**: Enforces 5 MB limit, binary magic-byte verification (JPEG, PNG, WebP), empty buffer rejection, and MIME-type integrity.
- **Gemini 3.8-Flash OCR Behavior (7 tests)**: Handles missing credentials gracefully, parses structured line items, normalizes line totals, and handles provider status codes (HTTP 404, HTTP 429, and `UND_ERR_CONNECT_TIMEOUT` returning 504).
- **Budget Comparison & Advisory Rules (6 tests)**: Item allocation matching, over-budget detection, currency mismatch warnings, missing field alerts, and duplicate receipt flagging.
- **Campaign Impact Timeline (8 tests)**: Baseline campaign starts in `PLANNED`; proves PayPal sandbox payments create isolated test events and cannot falsely advance real progress; receipt submission triggers `EVIDENCE_SUBMITTED`; authorized review triggers `HUMAN_REVIEW_COMPLETED`; proves budget reach alone cannot complete a campaign; and strictly rejects arbitrary or unlinked `evidenceRef` values with HTTP 400.
- **Server-Side Auditor Security (9 tests)**: Rejects unauthorized review/timeline submissions with HTTP 401; verifies browser login does not disclose session tokens in JSON; validates `HttpOnly` session cookies; ensures both `/api/auth/auditor-logout` and `/api/auth/logout` terminate sessions; and proves valid linked evidence unlocks authorized campaign completion.

---

## PayPal Sandbox Setup Guide

1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Under **Testing Tools > Sandbox Accounts**, confirm you have:
   - A **Business (Merchant)** account.
   - A **Personal (Buyer)** account with a simulated balance.
3. Under **Apps & Credentials > Sandbox**, create or open a REST API App.
4. Copy the **Client ID** and **Secret** into `backend/.env`.
5. Restart the backend. In the frontend donation section, the PayPal button renders in Sandbox mode.
6. When the PayPal popup appears, log in using your **Sandbox Personal Buyer** credentials to complete test payments.
7. The payment is verified server-side and recorded in the Community Ledger under **Sandbox Test Payments**.

---

## Google Gemini Setup Guide

1. Generate a free API key in [Google AI Studio](https://aistudio.google.com/).
2. Add your key and model to `backend/.env`:
   ```ini
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_TIMEOUT_MS=180000
   ```
3. **Model Selection**: Use `gemini-3.8-flash`. Obsolete model identifiers (such as `gemini-2.5-flash`) return HTTP 404.
4. **Offline / Fallback Mode**: If `GEMINI_API_KEY` is not configured, the backend automatically serves rule-based demo explanations and clear advisory fallback messages.

---

## MongoDB Setup Guide

1. **Local MongoDB**:
   Start your local MongoDB service:
   ```bash
   mongod --dbpath /path/to/data
   ```
   Set `MONGODB_URI=mongodb://localhost:27017/nekitrail` in `backend/.env`.
2. **MongoDB Atlas**:
   Set your cloud connection string in `backend/.env`:
   ```ini
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/nekitrail?retryWrites=true&w=majority
   ```
3. **Automatic Fallback**:
   If MongoDB is not reachable, NekiTrail AI logs a storage notice and operates smoothly in an in-memory data store.

---

## API Route Reference

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Service health, uptime, and active storage engine (`mongodb` or `memory`). |
| `GET` | `/api/campaigns` | None | Returns active campaigns with baseline and captured totals. |
| `GET` | `/api/campaigns/:campaignId` | None | Detailed campaign data with itemized budget allocations. |
| `GET` | `/api/campaigns/:campaignId/timeline` | None | Returns verified 5-stage milestone status and chronological audit events. |
| `POST` | `/api/campaigns/:campaignId/evidence` | Auditor (`HttpOnly`) | Registers a verifiable supporting evidence record (e.g. audit certificate). |
| `POST` | `/api/campaigns/:campaignId/timeline` | Auditor (`HttpOnly`) | Records an audit note or authorized completion sign-off with linked evidence. |
| `POST` | `/api/ai/campaign-summary` | None | Generates bilingual plain-language campaign explanation (EN/HI). |
| `POST` | `/api/ai/receipt-image-review`| None | Uploads receipt image (JPEG/PNG/WebP, ≤5 MB) for Gemini multimodal extraction. |
| `POST` | `/api/ai/receipt-review` | None | Submits manual receipt text for advisory budget comparison. |
| `GET` | `/api/receipt-reviews` | None | Retrieves persistent receipt review records. |
| `POST` | `/api/receipt-reviews/:id/human-review` | Auditor (`HttpOnly`) | Records human auditor decision (`APPROVED` / `REJECTED`) with audit notes. |
| `POST` | `/api/paypal/orders` | None | Creates a PayPal Sandbox order linked to a campaign. |
| `POST` | `/api/paypal/orders/:orderId/capture` | None | Captures PayPal payment server-side and logs an isolated test payment. |
| `GET` | `/api/payments` | None | Retrieves captured test payment records. |
| `POST` | `/api/auth/auditor-login` | None | Authenticates auditor via passphrase; sets `HttpOnly` session cookie (no token in body). |
| `GET` | `/api/auth/session` | None | Validates active session via `HttpOnly` cookie. |
| `POST` | `/api/auth/auditor-logout` | None | Terminates auditor session and clears session cookie. |
| `POST` | `/api/auth/logout` | None | Alias endpoint for `/api/auth/auditor-logout`. |

---

## 3-Minute Demo Video Walkthrough Script

Use this timing script for video recordings or live presentations:

| Time | Stage | Screen Action | Voiceover Narration |
|---|---|---|---|
| **0:00 – 0:30** | **1. The Problem & Solution** | Open homepage (`http://localhost:5173`). Highlight the editorial Warm Ivory & Emerald Green aesthetic. Point to the top trust strip and value proposition: *"Your contribution. Clearly accounted for."* | *"Traditional charity platforms ask donors to give money into a black box without knowing where each dollar goes. NekiTrail AI transforms community fundraising by combining itemized budget clarity, AI receipt verification, and an auditor-backed impact timeline."* |
| **0:30 – 0:55** | **2. Itemized Budget & Bilingual AI** | Scroll to **"Clean Water for the Community"**. Point out the $1,200 goal broken down into 4 itemized items: $650 filtration unit, $250 installation, $150 water testing, and $150 maintenance. Click into the AI builder and toggle between English and Hindi. | *"Every campaign is broken into specific budget line items. Our Gemini 3.8-Flash integration translates technical briefs into plain-language bilingual explanations in English and Hindi, flagging budget risks and asking vital clarifying questions."* |
| **0:55 – 1:30** | **3. PayPal Sandbox Checkout** | Select $10 USD for checkout. Click the PayPal Sandbox button, complete the transaction with a sandbox buyer account, and observe the confirmation banner and updated Community Ledger. | *"Donors contribute securely through PayPal. The backend verifies and captures the payment server-side, preventing duplicate captures. Notice that sandbox test payments are strictly isolated from illustrative demo baselines so users never confuse test data with real donations."* |
| **1:30 – 2:05** | **4. Gemini Multimodal Receipt Analysis** | Scroll to the receipt upload area (`#receipts`). Drag and drop `sample_receipt.jpg` ($135.00 for water testing). Click **"Review receipt image with AI"**. View the extracted vendor, date, line items, and budget match. | *"When organizers spend funds, they upload physical receipts. Gemini 3.8-Flash extracts the vendor, line items, and total amount, matching it against the 'Water quality testing' budget allocation. The platform flags that $15 remains in this budget line and marks the receipt as 'Pending Human Review'—because AI assists, but never auto-approves."* |
| **2:05 – 2:35** | **5. Server-Side Auditor Review** | Click **"Auditor Sign-In"** in the top strip. Enter the auditor passphrase. Click **"Approve"** on the receipt with the note *"Inspected water testing lab report on site"*. | *"Auditors authenticate securely using server-side HttpOnly session cookies with zero token exposure. The auditor inspects the physical proof and approves the expense. The decision is permanently logged in MongoDB."* |
| **2:35 – 3:00** | **6. Grounded Campaign Impact Timeline** | Navigate to the **Campaign Impact Timeline** (`#timeline`). Observe the 5-stage stepper advancing through `Planned`, `Evidence Submitted`, and `Human Review Completed`. Demonstrate that attempting completion with an arbitrary string is rejected, while providing the verified evidence reference completes the milestone. | *"Here is NekiTrail's crown jewel: the Campaign Impact Timeline. Milestones unlock only when grounded in real stored records and authorized sign-offs. Reaching a budget goal never auto-completes a campaign without verified physical evidence. That is transparency by design."* |

---

## Troubleshooting & Diagnostics

- **`UND_ERR_CONNECT_TIMEOUT` on Windows / IPv6**:
  - The backend startup script invokes `dns.setDefaultResultOrder("ipv4first")` to ensure rapid connection negotiation with Google APIs.
  - Multimodal OCR inference across slower uplinks is granted up to 180 seconds via `GEMINI_TIMEOUT_MS=180000`.
- **Model Returned HTTP 404 (`AI_MODEL_NOT_FOUND`)**:
  - Ensure `GEMINI_MODEL=gemini-3.8-flash` in `backend/.env`. Deprecated models (e.g. `gemini-2.5-flash`) return HTTP 404 from Google's endpoint.
- **Port Conflict (`EADDRINUSE: :::4000`)**:
  - Terminate any orphaned node processes listening on port 4000:
    ```powershell
    Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
    ```
- **Auditor Login Fails (HTTP 401)**:
  - Verify that `AUDITOR_SECRET_KEY` in `backend/.env` matches the passphrase entered in the login modal.

---

## Prototype Limitations & Security Disclaimers

1. **Demonstration & Hackathon Context**: All campaigns, budgets, volunteer personas, and receipts in this prototype are demonstration data created for hackathon evaluation.
2. **PayPal Sandbox Only**: Payments are strictly processed in PayPal Sandbox test mode. No real money is collected, held in escrow, or disbursed.
3. **No 501(c)(3) or Charity Certification**: The platform does not verify nonprofit tax-exempt status or provide tax receipts.
4. **Advisory AI Boundaries**: Google Gemini OCR is an assistive extraction tool. It cannot legally verify whether a vendor is legitimate, whether an invoice was altered, or whether goods were physically delivered. All expenditure releases require authorized human inspection.
5. **Storage Hygiene**: Raw receipt image buffers are analyzed in memory and discarded; only structured metadata and extracted JSON fields are stored to protect privacy.

---

## License

This project is licensed under the [MIT License](LICENSE).
