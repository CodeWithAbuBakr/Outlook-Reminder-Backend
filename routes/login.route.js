const express = require("express");
const axios = require("axios");
const router = express.Router();
const Token = require("../config/db.js");
const { set } = require("mongoose");
const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"; // Replace with your tenant ID

// Client credentials (store securely in environment variables)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://localhost:3000/assets/redirect.html"; // Must match the one registered in Azure AD

// Route to handle SSO login and token refresh
router.post('/auth/microsoft', async (req, res) => {
  const { auth_code, code_verifier } = req.body;

  if (!auth_code) {
    return res.status(400).json({ msg: 'Authorization code is missing' });
  }

  if (!code_verifier) {
    return res.status(400).json({ msg: 'Code verifier is missing' });
  }

  try {
    const response = await axios.post(
      MICROSOFT_AUTH_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: auth_code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: code_verifier,   // ⭐ REQUIRED FOR PKCE
        scope: 'User.Read Mail.Send Mail.Read offline_access'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = response.data;
    const accessToken = tokens.access_token;

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
    console.error(error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      msg: 'Failed to exchange authorization code',
      details: error.response?.data || error.message
    });
  }
});

router.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ msg: 'Refresh token is missing' });
  }

  try {
    const response = await axios.post(
      MICROSOFT_AUTH_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
        // ❌ do NOT include scope here
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokens = response.data;
    const access_token = tokens.access_token;
    const new_refresh_token = tokens.refresh_token || refresh_token; // reuse old if none returned

    // Calculate expiration date (Microsoft usually gives 3600s)
    const expiration_date = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    return res.status(200).json({
      access_token,
      refresh_token: new_refresh_token,
      access_token_expiration: expiration_date
    });

  } catch (error) {
    console.error(`Refresh token failed:`, error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      msg: 'Failed to refresh token',
      details: error.response?.data || error.message
    });
  }
});

async function startBackgroundRefreshAndEmail() {
  console.log("Hello every 60 seconds");
    try {
      // For testing: only your user
      const userId = "fefa210b6e0a0dc6";
      const doc = await Token.findOne({ userId });

      if (!doc) {
        console.log('No token found for test user');
        return;
      }

      let accessToken = doc.access_token;

      // Refresh if expired (or close to expiry, e.g. < 5 min left)
      if (new Date() > new Date(doc.expires_at.getTime() - 5 * 60 * 1000)) {
        console.log(`Refreshing token for ${userId}`);
        accessToken = await refreshAccessToken(doc); // your existing function
      }

      // Send test email
      await axios.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        {
          message: {
            subject: 'Hourly Test Reminder',
            body: {
              contentType: 'Text',
              content: `Automated test email\nTime: ${new Date().toISOString()}\nUser: ${userId}`,
            },
            toRecipients: [
              { emailAddress: { address: 'muhammadabubakrattari@outlook.com' } }
            ],
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      console.log('Test email sent successfully');
    } catch (err) {
      console.error('Background job error::', err.message);
    }
}

setInterval(startBackgroundRefreshAndEmail, 60000); // Run every min

module.exports = router;
