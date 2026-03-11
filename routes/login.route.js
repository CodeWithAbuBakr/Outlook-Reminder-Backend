const express = require("express");
const axios = require("axios");
const router = express.Router();
const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"; // Replace with your tenant ID

// Client credentials (store securely in environment variables)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://localhost:3000/assets/redirect.html"; // Must match the one registered in Azure AD

// Route to handle SSO login and token refresh
router.post('/auth/microsoft', async (req, res) => {
  const { auth_code, code_verifier } = req.body;   // ← now we take both

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
        code_verifier: code_verifier,          // ← REQUIRED for PKCE
        scope: 'User.Read Mail.Send Mail.Read offline_access'   // ← cleaned up (matches frontend)
      }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = response.data;
    const access_token = tokens.access_token;
    const refresh_token = tokens.refresh_token || null;

    console.log("✅ Tokens received successfully!", { access_token: access_token.substring(0, 20) + '...', refresh_token });

    // Calculate expiration (Microsoft usually gives 3600s = 1 hour)
    const expiration_date = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    return res.status(200).json({
      access_token,
      refresh_token,
      access_token_expiration: expiration_date,
      expires_in: tokens.expires_in
    });

  } catch (error) {
    console.error("Token exchange failed:", error.response?.data || error.message);
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
    const response = await axios.post(MICROSOFT_AUTH_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token, // Use the refresh_token from request body
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'user.read mail.send Mail.ReadBasic Mail.Read Mail.ReadWrite offline_access'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokens = response.data;
    const access_token = tokens.access_token;
    const new_refresh_token = tokens.refresh_token || null; // Avoid naming conflict with request body

    // Calculate expiration date (assuming access_token is valid for 1 hour)
    const expiration_date = new Date(Date.now() + 3600000).toISOString();
    console.log("testing")
    return res.status(200).json({
      access_token,
      refresh_token: new_refresh_token, // Return the new refresh token
      access_token_expiration: expiration_date
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return res.status(error.response?.status || 500).json({
      msg: 'Failed to refresh token',
      details: error.response?.data || error.message
    });
  }
});


module.exports = router;
