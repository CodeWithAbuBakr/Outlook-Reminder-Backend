const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const router = express.Router();

// Token Schema (unchanged, but we'll use object ID or mail as userId)
const tokenSchema = new mongoose.Schema({
  userId: {         
    type: String,
    required: true,
    unique: true,
  },
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  scope: String,
  expires_at: { type: Date, required: true },
  last_refreshed: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const Token = mongoose.model("MicrosoftToken", tokenSchema);

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://localhost:3000/assets/redirect.html";

// Helper: refresh logic (unchanged)
async function refreshAccessToken(storedToken) {
  try {
    const response = await axios.post(
      MICROSOFT_AUTH_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: storedToken.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const data = response.data;
    const newRefreshToken = data.refresh_token || storedToken.refresh_token;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    storedToken.access_token = data.access_token;
    storedToken.refresh_token = newRefreshToken;
    storedToken.expires_at = expiresAt;
    storedToken.last_refreshed = new Date();
    await storedToken.save();

    return data.access_token;
  } catch (err) {
    console.error("Refresh failed:", err.response?.data || err.message);
    throw err;
  }
}

// ────────────────────────────────────────────────
//  Initial token exchange + identify user via /me
// ────────────────────────────────────────────────
router.post("/auth/microsoft", async (req, res) => {
  const { auth_code, code_verifier } = req.body;

  if (!auth_code) return res.status(400).json({ msg: "Authorization code missing" });
  if (!code_verifier) return res.status(400).json({ msg: "Code verifier missing" });

  try {
    // 1. Exchange code for tokens
    const tokenResponse = await axios.post(
      MICROSOFT_AUTH_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: auth_code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: code_verifier,
        scope: "User.Read Mail.Send Mail.Read offline_access", // must match or be subset
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const tokens = tokenResponse.data;
    const accessToken = tokens.access_token;

    // 2. Get user identity from Microsoft Graph /me
    const meResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = meResponse.data;

    // Choose identifier — prefer object ID, fallback to mail or userPrincipalName
    let userId = user.id;                            // Azure AD object ID — most stable
    if (!userId && user.mail) userId = user.mail;
    if (!userId && user.userPrincipalName) userId = user.userPrincipalName;

    if (!userId) {
      throw new Error("Could not determine user identifier from /me");
    }

    // 3. Calculate expiration
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // 4. Save / update tokens
    await Token.findOneAndUpdate(
      { userId },
      {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        scope: tokens.scope,
        expires_at: expiresAt,
        last_refreshed: new Date(),
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Return success — frontend now knows login worked
    // You can also return userId if frontend wants to store it (e.g. localStorage)
    return res.status(200).json({
      msg: "Login successful – tokens stored",
      userId: userId,           // ← optional: let frontend remember it
      displayName: user.displayName || null,
      email: user.mail || user.userPrincipalName || null,
    });
  } catch (error) {
    console.error("Login flow error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({
      msg: "Authentication failed",
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// Get valid (refreshed if needed) access token — called by your other backend logic
router.get("/auth/token/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const tokenDoc = await Token.findOne({ userId });
    if (!tokenDoc) {
      return res.status(404).json({ msg: "No tokens found for user" });
    }

    if (new Date() < tokenDoc.expires_at) {
      return res.json({ access_token: tokenDoc.access_token });
    }

    const newAccessToken = await refreshAccessToken(tokenDoc);
    return res.json({ access_token: newAccessToken });
  } catch (err) {
    console.error("Get token error:", err.message);
    return res.status(500).json({ msg: "Cannot obtain valid token" });
  }
});

// Optional manual refresh endpoint (for debugging)
router.post("/auth/refresh", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ msg: "userId required" });

  try {
    const tokenDoc = await Token.findOne({ userId });
    if (!tokenDoc) return res.status(404).json({ msg: "User not found" });

    await refreshAccessToken(tokenDoc);

    return res.json({
      msg: "Token refreshed",
      expires_at: tokenDoc.expires_at.toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ msg: "Refresh failed", error: err.message });
  }
});

module.exports = router;