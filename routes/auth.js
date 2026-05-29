const express = require('express');
const router = express.Router();
const controller = require('../controllers/authController');

router.post('/auth/register', controller.register);
router.post('/auth/login', controller.login);
router.post('/auth/logout', controller.logout);
router.post('/auth/forgot-password', controller.forgotPassword);
router.post('/auth/reset-password', controller.resetPassword);
router.post('/auth/refresh', controller.refresh);
router.get('/users/current-user', controller.fetchMe);

module.exports = router;
