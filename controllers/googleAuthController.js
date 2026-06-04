const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const RefreshToken = require('../models/RefreshToken');

/**
 * Google OAuth callback handler
 * Called after successful Google authentication
 */
async function googleCallback(req, res) {
  try {
    const user = req.user; // Set by passport

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_ORIGIN}?error=auth_failed`);
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshTokenValue = uuidv4();
    const refreshToken = jwt.sign(
      { tokenId: refreshTokenValue },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token in database
    await RefreshToken.create({
      token: refreshTokenValue,
      userId: user._id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction || req.secure, // HTTPS in production or if using HTTPS locally
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    };

    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend
    res.redirect(process.env.FRONTEND_ORIGIN);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${process.env.FRONTEND_ORIGIN}?error=server_error`);
  }
}

module.exports = {
  googleCallback,
};
