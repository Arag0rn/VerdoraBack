const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { signAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production',
  sameSite: (process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production') ? 'none' : 'lax',
  maxAge: 15 * 60 * 1000, // 15m
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production',
  sameSite: (process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production') ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

async function issueRefreshToken(userId) {
  const token = uuidv4();
  await RefreshToken.create({
    token,
    userId,
    expiresAt: new Date(Date.now() + REFRESH_COOKIE_OPTS.maxAge),
  });
  return token;
}

async function register({ name, email, phone, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw { status: 400, errors: { email: 'Email already registered' }, message: 'User already exists' };
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, phone: phone || '', password: hashed });
  const refreshToken = await issueRefreshToken(user._id);
  return { user, accessToken: signAccessToken({ sub: String(user._id) }), refreshToken };
}

async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user) throw { status: 401, message: 'Invalid credentials' };
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw { status: 401, message: 'Invalid credentials' };
  const refreshToken = await issueRefreshToken(user._id);
  return { user, accessToken: signAccessToken({ sub: String(user._id) }), refreshToken };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await RefreshToken.deleteOne({ token: refreshToken });
}

async function refresh(oldToken) {
  if (!oldToken) throw { status: 401, message: 'Invalid refresh token' };
  const rt = await RefreshToken.findOne({ token: oldToken });
  if (!rt) throw { status: 401, message: 'Invalid refresh token' };
  if (rt.expiresAt && rt.expiresAt.getTime() < Date.now()) {
    await RefreshToken.deleteOne({ _id: rt._id });
    throw { status: 401, message: 'Refresh token expired' };
  }
  // Rotate: remove the old token and issue a fresh one.
  await RefreshToken.deleteOne({ _id: rt._id });
  const refreshToken = await issueRefreshToken(rt.userId);
  const accessToken = signAccessToken({ sub: String(rt.userId) });
  return { accessToken, refreshToken, userId: rt.userId };
}

module.exports = { register, login, logout, refresh, ACCESS_COOKIE_OPTS, REFRESH_COOKIE_OPTS };
