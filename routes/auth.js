const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');
const googleController = require('../controllers/googleAuthController');
const passport = require('../config/passport');

// Regular auth routes
router.post('/auth/register', controller.register);
router.post('/auth/login', controller.login);
router.post('/auth/logout', controller.logout);
router.post('/auth/forgot-password', controller.forgotPassword);
router.post('/auth/reset-password', controller.resetPassword);
router.post('/auth/refresh', controller.refresh);
router.get('/users/current-user', controller.fetchMe);

// Google OAuth routes
router.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

router.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_ORIGIN}?error=auth_failed`,
  }),
  googleController.googleCallback
);

module.exports = router;
