const getPayPalBaseUrl = () => (process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com").replace(/\/$/, "");

export function getPayPalConfig() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    currency: process.env.PAYPAL_CURRENCY || "USD",
    sandboxReady: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
  };
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error("PayPal Sandbox credentials are missing. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to backend/.env.");
    error.status = 503;
    throw error;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(`PayPal authentication failed (${response.status}). Check the Sandbox app credentials.`);
    error.status = 502;
    throw error;
  }
  return data.access_token;
}

async function paypalJson(path, token, body) {
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID()
    },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`PayPal API request failed (${response.status}). Check server logs and Sandbox configuration.`);
    error.status = 502;
    error.providerDetails = data;
    throw error;
  }
  return data;
}

export async function createDonationOrder({ campaign, amount }) {
  const token = await getAccessToken();
  const currency = process.env.PAYPAL_CURRENCY || "USD";
  const value = Number(amount).toFixed(2);
  const order = await paypalJson("/v2/checkout/orders", token, {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: campaign.id,
      custom_id: campaign.id,
      description: `NekiTrail demo contribution: ${campaign.title}`.slice(0, 127),
      amount: { currency_code: currency, value }
    }],
    application_context: {
      brand_name: "NekiTrail AI Demo",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING"
    }
  });
  return { id: order.id, status: order.status, currency, value };
}

export async function captureDonationOrder(orderId) {
  const token = await getAccessToken();
  return paypalJson(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, token, {});
}
