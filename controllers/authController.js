const authService = require('../services/authService');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const PasswordResetToken = require('../models/PasswordResetToken');
const { v4: uuidv4 } = require('uuid');
const { verifyAccessToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');

const RESET_TOKEN_TTL = 60 * 60 * 1000; // 1h

function makeApiResponse(status, message, data) {
  return {
    timestamp: new Date().toISOString(),
    status,
    message,
    data,
  };
}

function makeApiError(status, message, errors) {
  const res = { timestamp: new Date().toISOString(), status, message };
  if (errors) res.errors = errors;
  return res;
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt ? user.createdAt.toISOString() : undefined,
  };
}

exports.register = async (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json(makeApiError(400, 'Validation failed', { general: 'Missing fields' }));
  }
  try {
    const { user, accessToken, refreshToken } = await authService.register({ name, phone, email, password });
    res.cookie('accessToken', accessToken, authService.ACCESS_COOKIE_OPTS);
    res.cookie('refreshToken', refreshToken, authService.REFRESH_COOKIE_OPTS);
    return res.json(makeApiResponse(200, 'Registered', sanitizeUser(user)));
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json(makeApiError(status, err.message || 'Failed to register', err.errors));
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json(makeApiError(400, 'Validation failed', { general: 'Missing fields' }));
  }
  try {
    const { user, accessToken, refreshToken } = await authService.login({ email, password });
    res.cookie('accessToken', accessToken, authService.ACCESS_COOKIE_OPTS);
    res.cookie('refreshToken', refreshToken, authService.REFRESH_COOKIE_OPTS);
    return res.json(makeApiResponse(200, 'Logged in', sanitizeUser(user)));
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json(makeApiError(status, err.message || 'Login failed'));
  }
};

exports.logout = async (req, res) => {
  const token = req.cookies?.refreshToken;
  try {
    await authService.logout(token);
  } catch (e) {
    console.error(e);
  }
  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');
  return res.json({ timestamp: new Date().toISOString(), status: 200, message: 'Logged out' });
};

exports.refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  try {
    const { accessToken, refreshToken } = await authService.refresh(token);
    res.cookie('accessToken', accessToken, authService.ACCESS_COOKIE_OPTS);
    res.cookie('refreshToken', refreshToken, authService.REFRESH_COOKIE_OPTS);
    return res.json({ timestamp: new Date().toISOString(), status: 200, message: 'Refreshed' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 401).json(makeApiError(err.status || 401, err.message || 'Invalid refresh token'));
  }
};

exports.fetchMe = async (req, res) => {
  const accessToken = req.cookies?.accessToken;
  if (!accessToken) return res.status(401).json(makeApiError(401, 'Unauthorized'));
  try {
    const payload = verifyAccessToken(accessToken);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json(makeApiError(404, 'User not found'));
    return res.json(makeApiResponse(200, 'OK', sanitizeUser(user)));
  } catch (err) {
    console.error(err);
    return res.status(401).json(makeApiError(401, 'Unauthorized'));
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json(makeApiError(400, 'Validation failed'));
  try {
    const user = await User.findOne({ email });
    // For security, respond with 200 whether or not the account exists.
    if (!user) {
      return res.status(200).json({ timestamp: new Date().toISOString(), status: 200, message: 'If an account exists, an email was sent' });
    }
    const token = uuidv4();
    await PasswordResetToken.create({ token, userId: user._id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL) });
    // In a real app the token would be emailed as a link. Returned here for dev convenience.
    return res.json({ timestamp: new Date().toISOString(), status: 200, message: 'Reset token generated', data: { token } });
  } catch (err) {
    console.error(err);
    return res.status(500).json(makeApiError(500, 'Failed to process request'));
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json(makeApiError(400, 'Validation failed'));
  try {
    const record = await PasswordResetToken.findOne({ token });
    if (!record || (record.expiresAt && record.expiresAt.getTime() < Date.now())) {
      if (record) await PasswordResetToken.deleteOne({ _id: record._id });
      return res.status(400).json(makeApiError(400, 'Invalid or expired token'));
    }
    const user = await User.findById(record.userId);
    if (!user) return res.status(404).json(makeApiError(404, 'User not found'));
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await PasswordResetToken.deleteOne({ _id: record._id });
    // Invalidate existing sessions after a password change.
    await RefreshToken.deleteMany({ userId: user._id });
    return res.json({ timestamp: new Date().toISOString(), status: 200, message: 'Password reset' });
  } catch (err) {
    console.error(err);
    return res.status(500).json(makeApiError(500, 'Failed to reset password'));
  }
};
