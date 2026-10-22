# NekiTrail AI — MVP Acceptance Criteria

## Must work in the final demo

1. User opens a sample campaign and understands its itemized budget.
2. AI produces a plain-language campaign explanation and flags missing/unclear information. The app identifies whether live AI or fallback logic was used.
3. User selects a donation amount and completes a PayPal Sandbox checkout.
4. Backend verifies the PayPal capture status and matches captured amount/currency to the order created in this demo session.
5. Demo campaign progress and the in-memory payment log update only after a successful capture.
6. Organizer enters receipt text; the review screen compares it with the selected campaign's budget and explicitly warns that human review is required.
7. A clean README and reproducible setup steps allow judges to run the project.

## Must not claim

- That sample campaigns are verified charities.
- That AI proves a receipt or expenditure is genuine.
- That this prototype securely holds money in escrow.
- That Sandbox payments are real donations.
- That a successful UI state alone proves payment completion.

## Next engineering milestones

- [ ] Run `npm install` and `npm run dev` on the team's machine.
- [ ] Configure Gemini key and verify a live response.
- [ ] Configure PayPal Sandbox app credentials and complete a test checkout.
- [ ] Move campaign/payment data to MongoDB and add auth/role checks.
- [ ] Add receipt file upload + OCR with manual review.
- [ ] Add webhook/reconciliation and integration tests.
- [ ] Test failure, cancel and duplicate-capture flows.
- [ ] Deploy or document local demo steps.
- [ ] Record a demo video under 3 minutes.
