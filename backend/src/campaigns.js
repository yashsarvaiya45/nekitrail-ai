// Starter baseline campaigns with illustrative demo budgets and baseline amounts.
// Real Sandbox captured payments are tracked separately and added to the baseline.
export const baselineCampaigns = [
  {
    id: "community-water-filter",
    title: "Clean Water for the Community",
    category: "Community health",
    location: "Demo community",
    shortDescription: "Help fund a shared water filtration unit and installation materials.",
    goal: 1200,
    baselineRaised: 345,
    raised: 345,
    currency: "USD",
    budget: [
      { item: "Water filtration unit", amount: 650 },
      { item: "Installation materials", amount: 250 },
      { item: "Water quality testing", amount: 150 },
      { item: "Maintenance reserve", amount: 150 }
    ],
    disclosure: "Sample campaign created for hackathon testing. It is not a verified charity or a request for real donations."
  },
  {
    id: "school-kit-drive",
    title: "School Kits for Students",
    category: "Education",
    location: "Demo community",
    shortDescription: "Help prepare basic stationery kits for students who need them.",
    goal: 800,
    baselineRaised: 210,
    raised: 210,
    currency: "USD",
    budget: [
      { item: "Notebooks and paper", amount: 260 },
      { item: "Pens, pencils and geometry sets", amount: 240 },
      { item: "School bags", amount: 220 },
      { item: "Delivery and distribution (illustrative estimate)", amount: 80 }
    ],
    disclosure: "Sample campaign created for hackathon testing. It is not a verified charity or a request for real donations."
  }
];

// Active campaigns reference maintained for backward compatibility
export const campaigns = baselineCampaigns.map((c) => ({ ...c }));

export function getCampaignsWithCapturedTotals(capturedTotals = {}) {
  return baselineCampaigns.map((c) => {
    const additional = Number(capturedTotals[c.id] || 0);
    const totalRaised = Number((c.baselineRaised + additional).toFixed(2));
    return {
      ...c,
      raised: totalRaised
    };
  });
}

// In-memory active order session registry
export const orderRegistry = new Map();

// In-memory payment records export maintained for compatibility
export const paymentRecords = [];
