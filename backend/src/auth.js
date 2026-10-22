import crypto from "node:crypto";

export function getAuditorSecret() {
  return process.env.AUDITOR_SECRET_KEY || null;
}

export function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return list;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    try {
      list[key] = decodeURIComponent(val);
    } catch {
      list[key] = val;
    }
  }
  return list;
}

export function createAuditorSessionToken(data = {}) {
  const secret = getAuditorSecret();
  if (!secret) {
    throw new Error("Server misconfiguration: AUDITOR_SECRET_KEY is not configured.");
  }
  const payload = {
    id: data.id || "auditor_primary",
    name: data.name || "Authorized Human Auditor",
    role: "AUDITOR",
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadBase64);
  const signature = hmac.digest("hex");

  return `${payloadBase64}.${signature}`;
}

export function verifyAuditorSessionToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, providedSignature] = parts;
  const secret = getAuditorSecret();
  if (!secret) return null;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadBase64);
  const expectedSignature = hmac.digest("hex");

  // Timing safe comparison of signatures
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }

  const sigA = Buffer.from(providedSignature);
  const sigB = Buffer.from(expectedSignature);
  if (!crypto.timingSafeEqual(sigA, sigB)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr);

    if (!payload || typeof payload !== "object") return null;
    if (payload.role !== "AUDITOR") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

export function verifyAuditorSecretKey(candidateKey) {
  if (!candidateKey || typeof candidateKey !== "string") return false;

  const secret = getAuditorSecret();
  if (!secret) return false;

  const candBuf = Buffer.from(String(candidateKey).trim());
  const secretBuf = Buffer.from(secret);

  if (candBuf.length !== secretBuf.length) {
    // Constant time dummy comparison
    crypto.timingSafeEqual(secretBuf, secretBuf);
    return false;
  }

  return crypto.timingSafeEqual(candBuf, secretBuf);
}

export function requireAuditorAuth(req, res, next) {
  // 1. Direct header authorization (for programmatic scripts / tests)
  const directKey = req.headers["x-auditor-key"];
  if (directKey && verifyAuditorSecretKey(directKey)) {
    req.auditor = {
      id: "auditor_api_key",
      name: "Authorized Human Auditor",
      role: "AUDITOR",
      authType: "api-key"
    };
    return next();
  }

  // 2. Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    const verified = verifyAuditorSessionToken(bearerToken);
    if (verified) {
      req.auditor = { ...verified, authType: "bearer-token" };
      return next();
    }
  }

  // 3. HTTP-only session cookie
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.nekitrail_auditor_session;
  if (sessionCookie) {
    const verified = verifyAuditorSessionToken(sessionCookie);
    if (verified) {
      req.auditor = { ...verified, authType: "session-cookie" };
      return next();
    }
  }

  return res.status(401).json({
    error: "Unauthorized: Valid auditor authentication credentials or session required.",
    requiresAuth: true
  });
}

export function auditorLoginHandler(req, res) {
  const { passphrase } = req.body || {};
  if (!passphrase || !verifyAuditorSecretKey(passphrase)) {
    return res.status(401).json({
      error: "Authentication failed. Invalid auditor secret key or passphrase.",
      authenticated: false
    });
  }

  const auditorData = {
    id: `auditor_${Date.now()}`,
    name: "Authorized Human Auditor",
    role: "AUDITOR"
  };

  const sessionToken = createAuditorSessionToken(auditorData);

  const isSecure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";

  // Set HTTP-only session cookie
  res.cookie("nekitrail_auditor_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  });

  return res.json({
    success: true,
    authenticated: true,
    auditor: auditorData
  });
}

export function auditorSessionHandler(req, res) {
  // Check header or cookie
  const directKey = req.headers["x-auditor-key"];
  if (directKey && verifyAuditorSecretKey(directKey)) {
    return res.json({
      authenticated: true,
      auditor: { id: "auditor_api_key", name: "Authorized Human Auditor", role: "AUDITOR" }
    });
  }

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    const verified = verifyAuditorSessionToken(bearerToken);
    if (verified) {
      return res.json({ authenticated: true, auditor: verified });
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.nekitrail_auditor_session;
  if (sessionCookie) {
    const verified = verifyAuditorSessionToken(sessionCookie);
    if (verified) {
      return res.json({ authenticated: true, auditor: verified });
    }
  }

  return res.json({ authenticated: false, auditor: null });
}

export function auditorLogoutHandler(req, res) {
  const isSecure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
  res.clearCookie("nekitrail_auditor_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/"
  });
  return res.json({ success: true, authenticated: false, message: "Auditor session terminated." });
}
