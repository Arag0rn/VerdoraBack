const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

/**
 * Initiate Google OAuth flow
 */
async function googleAuth(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/auth/google/callback`,
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
  });

  return res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}

/**
 * Google OAuth callback handler
 */
async function googleCallback(req, res) {
  try {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const urlObj = new URL(fullUrl);
    const urlParams = new URLSearchParams(urlObj.search);
    const code = urlParams.get('code');

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_ORIGIN}?error=no_code`);
    }

    // Exchange code for token
    const tokenData = await axios.post(`https://oauth2.googleapis.com/token`, {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.BASE_URL}/auth/google/callback`,
      grant_type: 'authorization_code',
      code,
    });

    const accessToken = tokenData.data.access_token;

    // Get user info from Google
    const userData = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // Find or create user
    let user = await User.findOne({ email: userData.data.email });

    if (!user) {
      user = await User.create({
        name: userData.data.name || userData.data.email,
        email: userData.data.email,
        phone: '',
        password: 'GOOGLE_OAUTH_USER',
      });
    }

    // Generate JWT tokens
    const jwtAccessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshTokenValue = uuidv4();
    const jwtRefreshToken = jwt.sign(
      { tokenId: refreshTokenValue },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token in database
    await RefreshToken.create({
      token: refreshTokenValue,
      userId: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
    };

    res.cookie('accessToken', jwtAccessToken, cookieOptions);
    res.cookie('refreshToken', jwtRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Redirect to frontend
    res.redirect(process.env.FRONTEND_ORIGIN);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${process.env.FRONTEND_ORIGIN}?error=server_error`);
  }
}

module.exports = {
  googleAuth,
  googleCallback,
};
