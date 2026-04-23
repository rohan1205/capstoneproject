const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/mail');

const GOOGLE_PLACEHOLDER_ID = 'your-google-client-id';
// ──── Middleware ────
function ensureGuest(req, res, next) {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  next();
}

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

function redirectWithError(req, res, path, message) {
  if (typeof req.flash === 'function') {
    req.flash('error', message);
    return res.redirect(path);
  }
  return res.redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function validateSignupInput({ name, email, password, confirmPassword }) {
  if (!name || !email || !password || !confirmPassword) {
    return 'Please fill in all fields.';
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return 'Please provide a valid email address.';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasUpper || !hasLower || !hasNumber) {
    return 'Password must include uppercase, lowercase, and a number.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CALLBACK_URL &&
    process.env.GOOGLE_CLIENT_ID !== GOOGLE_PLACEHOLDER_ID
  );
}

function isGoogleStrategyRegistered() {
  return typeof passport._strategy === 'function' && Boolean(passport._strategy('google'));
}

// ──── Pages ────
router.get('/', (req, res) => res.redirect('/login'));

router.get('/login', ensureGuest, (req, res) => {
  const flashedError = typeof req.flash === 'function' ? req.flash('error') : [];
  const queryError = req.query.error ? [req.query.error] : [];
  const googleConfigured = isGoogleOAuthConfigured();
  res.render('login', { error: flashedError.length ? flashedError : queryError, googleConfigured });
});

router.get('/signup', ensureGuest, (req, res) => {
  const flashedError = typeof req.flash === 'function' ? req.flash('error') : [];
  const queryError = req.query.error ? [req.query.error] : [];
  const googleConfigured = isGoogleOAuthConfigured();
  res.render('signup', { error: flashedError.length ? flashedError : queryError, googleConfigured });
});

router.get('/dashboard', ensureAuth, (req, res) => {
  res.render('dashboard', { user: req.user });
});

router.get('/profile', ensureAuth, (req, res) => {
  const success = req.query.success ? decodeURIComponent(req.query.success) : null;
  const error   = req.query.error   ? decodeURIComponent(req.query.error)   : null;
  res.render('profile', { user: req.user, success, error });
});

router.get('/settings', ensureAuth, (req, res) => {
  const success = req.query.success ? decodeURIComponent(req.query.success) : null;
  res.render('settings', { user: req.user, success });
});

router.get('/history', ensureAuth, (req, res) => {
  res.render('history', { user: req.user });
});

router.get('/analytics', ensureAuth, (req, res) => {
  res.render('analytics', { user: req.user });
});

// ──── Profile update ────
router.post('/profile/update', ensureAuth, async (req, res) => {
  try {
    const User = require('../models/User');
    const { name, email } = req.body || {};
    if (!name || !email) return res.redirect('/profile?error=' + encodeURIComponent('Name and email are required.'));
    const norm = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(norm)) return res.redirect('/profile?error=' + encodeURIComponent('Invalid email address.'));
    // Check email not taken by another user
    const existing = await User.findOne({ email: norm, _id: { $ne: req.user._id } });
    if (existing) return res.redirect('/profile?error=' + encodeURIComponent('Email already in use by another account.'));
    await User.findByIdAndUpdate(req.user._id, { name: String(name).trim(), email: norm });
    // Update session user
    req.user.name  = String(name).trim();
    req.user.email = norm;
    res.redirect('/profile?success=' + encodeURIComponent('Profile updated successfully.'));
  } catch (err) {
    console.error('[POST /profile/update]', err);
    res.redirect('/profile?error=' + encodeURIComponent('Something went wrong.'));
  }
});

// ──── Password change ────
router.post('/profile/change-password', ensureAuth, async (req, res) => {
  try {
    const User   = require('../models/User');
    const bcrypt = require('bcryptjs');
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword || !confirmPassword)
      return res.redirect('/profile?error=' + encodeURIComponent('All password fields are required.'));
    if (newPassword !== confirmPassword)
      return res.redirect('/profile?error=' + encodeURIComponent('New passwords do not match.'));
    if (newPassword.length < 8)
      return res.redirect('/profile?error=' + encodeURIComponent('New password must be at least 8 characters.'));
    const user = await User.findById(req.user._id);
    if (!user.password) return res.redirect('/profile?error=' + encodeURIComponent('Cannot set password for Google accounts.'));
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.redirect('/profile?error=' + encodeURIComponent('Current password is incorrect.'));
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save({ validateBeforeSave: false });
    res.redirect('/profile?success=' + encodeURIComponent('Password changed successfully.'));
  } catch (err) {
    console.error('[POST /profile/change-password]', err);
    res.redirect('/profile?error=' + encodeURIComponent('Something went wrong.'));
  }
});

// ──── Local Auth ────
router.post('/login', ensureGuest, passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));

router.post('/signup', ensureGuest, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};
    const validationError = validateSignupInput({ name, email, password, confirmPassword });
    if (validationError) {
      return redirectWithError(req, res, '/signup', validationError);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return redirectWithError(req, res, '/signup', 'Email already registered.');
    }

    await User.create({ name: String(name).trim(), email: normalizedEmail, password });
    return redirectWithError(req, res, '/login', 'Account created! Please log in.');
  } catch (err) {
    console.error(err);
    return redirectWithError(req, res, '/signup', 'Something went wrong.');
  }
});

// ──── Google Auth ────
router.get('/auth/google',
  (req, res, next) => {
    if (!isGoogleOAuthConfigured() || !isGoogleStrategyRegistered()) {
      return redirectWithError(req, res, '/login', 'Google sign-in is not configured. Please contact the administrator.');
    }
    return next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  (req, res, next) => {
    if (!isGoogleOAuthConfigured() || !isGoogleStrategyRegistered()) {
      return redirectWithError(req, res, '/login', 'Google sign-in is not configured. Please contact the administrator.');
    }
    return next();
  },
  passport.authenticate('google', {
    successRedirect: '/dashboard',
    failureRedirect: '/login',
    failureFlash: true
  })
);

// ──── Logout ────
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// ──── Forgot Password ────
router.get('/forgot-password', ensureGuest, (req, res) => {
  const flashedError = typeof req.flash === 'function' ? req.flash('error') : [];
  const queryError = req.query.error ? [req.query.error] : [];
  res.render('forgot-password', { error: flashedError.length ? flashedError : queryError });
});

router.post('/forgot-password', ensureGuest, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return redirectWithError(req, res, '/forgot-password', 'Email is required.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      // For security, don't reveal if email exists
      return redirectWithError(req, res, '/login', 'If that email address is in our system, you will receive a password reset link shortly.');
    }

    const token = user.generatePasswordReset();
    await user.save({ validateBeforeSave: false });

    // Send reset email
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password/${token}`;
    const emailSent = await sendPasswordResetEmail(user.email, resetUrl);

    return redirectWithError(req, res, '/login', 'Password reset link sent to your email!');
  } catch (err) {
    console.error('[POST /forgot-password]', err);
    return redirectWithError(req, res, '/forgot-password', 'Something went wrong.');
  }
});

// ──── Reset Password ────
router.get('/reset-password/:token', ensureGuest, async (req, res) => {
  try {
    const { token } = req.params;
    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return redirectWithError(req, res, '/forgot-password', 'Password reset token is invalid or has expired.');
    }

    const flashedError = typeof req.flash === 'function' ? req.flash('error') : [];
    const queryError = req.query.error ? [req.query.error] : [];
    res.render('reset-password', { token, error: flashedError.length ? flashedError : queryError });
  } catch (err) {
    console.error('[GET /reset-password/:token]', err);
    return redirectWithError(req, res, '/forgot-password', 'Something went wrong.');
  }
});

router.post('/reset-password/:token', ensureGuest, async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body || {};

    if (!newPassword || !confirmPassword) {
      return redirectWithError(req, res, `/reset-password/${token}`, 'All password fields are required.');
    }

    if (newPassword !== confirmPassword) {
      return redirectWithError(req, res, `/reset-password/${token}`, 'Passwords do not match.');
    }

    if (newPassword.length < 8) {
      return redirectWithError(req, res, `/reset-password/${token}`, 'Password must be at least 8 characters.');
    }

    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    if (!hasUpper || !hasLower || !hasNumber) {
      return redirectWithError(req, res, `/reset-password/${token}`, 'Password must include uppercase, lowercase, and a number.');
    }

    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return redirectWithError(req, res, '/forgot-password', 'Password reset token is invalid or has expired.');
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return redirectWithError(req, res, '/login', 'Password reset successfully! Please log in with your new password.');
  } catch (err) {
    console.error('[POST /reset-password/:token]', err);
    return redirectWithError(req, res, '/forgot-password', 'Something went wrong.');
  }
});

module.exports = router;
module.exports.ensureGuest = ensureGuest;
module.exports.ensureAuth = ensureAuth;
module.exports.validateSignupInput = validateSignupInput;
module.exports.isGoogleOAuthConfigured = isGoogleOAuthConfigured;
module.exports.isGoogleStrategyRegistered = isGoogleStrategyRegistered;
