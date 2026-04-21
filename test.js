const { describe, it } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const authRoutes = require('./routes/auth');

describe('Authentication validation', () => {
  it('rejects invalid signup payloads', () => {
    const error = authRoutes.validateSignupInput({
      name: 'Test',
      email: 'invalid-email',
      password: 'weakpass',
      confirmPassword: 'weakpass'
    });
    assert.ok(error);
  });

  it('accepts strong and valid signup payloads', () => {
    const error = authRoutes.validateSignupInput({
      name: 'Test User',
      email: 'user@example.com',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1'
    });
    assert.strictEqual(error, null);
  });

  it('detects missing Google OAuth configuration', () => {
    const originalId = process.env.GOOGLE_CLIENT_ID;
    const originalSecret = process.env.GOOGLE_CLIENT_SECRET;
    const originalCallback = process.env.GOOGLE_CALLBACK_URL;

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;

    assert.strictEqual(authRoutes.isGoogleOAuthConfigured(), false);

    process.env.GOOGLE_CLIENT_ID = originalId;
    process.env.GOOGLE_CLIENT_SECRET = originalSecret;
    process.env.GOOGLE_CALLBACK_URL = originalCallback;
  });

  it('detects missing Google strategy registration', () => {
    assert.strictEqual(authRoutes.isGoogleStrategyRegistered(), false);
  });

});

describe('User password helpers', () => {
  it('compares password hashes correctly', async () => {
    const hashed = await bcrypt.hash('StrongPass1', 10);
    const user = new User({
      name: 'Demo User',
      email: 'demo@example.com',
      password: hashed
    });
    const ok = await user.comparePassword('StrongPass1');
    const bad = await user.comparePassword('WrongPass1');
    assert.strictEqual(ok, true);
    assert.strictEqual(bad, false);
  });
});
