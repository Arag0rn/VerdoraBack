const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

/**
 * Authorization codes are single-use. Browsers/extensions sometimes hit the
 * callback twice with the same code (prefetch, antivirus URL scan, double
 * navigation), and the second exchange fails with `invalid_grant`. We dedupe
 * by code so concurrent/repeat requests share one exchange instead of a second
 * (failing) one. Entries are short-lived; a code is useless after ~10 min.
 */
const inflightCodes = new Map();
const CODE_TTL_MS = 60 * 1000;

/**
 * Allowed frontend origins. FRONTEND_ORIGIN is a comma-separated list (it
 * doubles as the CORS allow-list), e.g. "http://localhost:5173,https://app.example".
 */
function allowedOrigins() {
  return (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(o => /^https?:\/\//.test(o));
}

/**
 * Resolve where to send the browser back to. The backend can't guess whether
 * the flow started from localhost or production, so the frontend passes its
 * full return URL (origin + mount path, e.g. http://localhost:5173/Front-end-Verdora/)
 * which is carried through `state`.
 *
 * Security: only the URL's *origin* is validated against the allow-list
 * (prevents open-redirect); the path is preserved so we land where the SPA is
 * actually mounted. Falls back to the first allowed origin, then localhost.
 *
 * Returns a single absolute URL — an undefined/relative/multi-value value
 * yields ERR_INVALID_REDIRECT in the browser.
 */
function resolveReturnUrl(requested) {
  const allowed = allowedOrigins();

  if (requested) {
    try {
      const url = new URL(requested);
      if (allowed.includes(url.origin)) {
        // origin + path only; drop any query/hash the caller tacked on
        return url.origin + url.pathname;
      }
    } catch {
      /* not a valid absolute URL — fall through to defaults */
    }
  }

  if (allowed.length) return allowed[0];

  console.warn(
    'FRONTEND_ORIGIN is missing or invalid; falling back to http://localhost:5173'
  );
  return 'http://localhost:5173';
}

/**
 * Initiate Google OAuth flow
 */
async function googleAuth(req, res) {
  const redirectUri = `${process.env.BASE_URL}/auth/google/callback`;
  console.log('Google Auth - Redirect URI:', redirectUri);

  // Where to return the user after login. Prefer an explicit ?return_to= from
  // the frontend (full URL incl. mount path), fall back to the Referer.
  // Validated against the allow-list in resolveReturnUrl.
  const requested = req.query.return_to || req.get('referer');
  const state = resolveReturnUrl(requested);
  console.log('Google Auth - Return URL:', state);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}

/**
 * Exchange the authorization code for Google tokens and issue our JWT pair.
 * Deduped by code: repeat/concurrent callbacks with the same code reuse the
 * same in-flight result instead of triggering a second (failing) exchange.
 */
function exchangeAndIssue(code, redirectUri) {
  if (inflightCodes.has(code)) {
    return inflightCodes.get(code);
  }

  const promise = (async () => {
    // Exchange code for token
    const tokenData = await axios.post(`https://oauth2.googleapis.com/token`, {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
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

    return { jwtAccessToken, jwtRefreshToken };
  })();

  inflightCodes.set(code, promise);
  setTimeout(() => inflightCodes.delete(code), CODE_TTL_MS).unref?.();
  return promise;
}

/**
 * Google OAuth callback handler
 */
async function googleCallback(req, res) {
  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const urlParams = new URLSearchParams(new URL(fullUrl).search);

  // `state` carries the initiator's return URL (set in googleAuth); its origin
  // is validated against the allow-list so we land where the user started.
  const returnOrigin = resolveReturnUrl(urlParams.get('state'));

  try {
    const code = urlParams.get('code');

    if (!code) {
      return res.redirect(`${returnOrigin}?error=no_code`);
    }

    const redirectUri = `${process.env.BASE_URL}/auth/google/callback`;
    console.log('Google Callback - Redirect URI:', redirectUri);
    console.log('Google Callback - Code:', code.substring(0, 20) + '...');

    const { jwtAccessToken, jwtRefreshToken } = await exchangeAndIssue(
      code,
      redirectUri
    );

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
    res.redirect(returnOrigin);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    if (err.response) {
      console.error('Google API Error Response:', {
        status: err.response.status,
        data: err.response.data,
      });
    }
    res.redirect(`${returnOrigin}?error=server_error`);
  }
}

module.exports = {
  googleAuth,
  googleCallback,
};
