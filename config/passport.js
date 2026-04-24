const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// ==============================
// Serialize / Deserialize
// ==============================
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ==============================
// Local Strategy
// ==============================
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return done(null, false, { message: 'No account with that email.' });
      }

      if (!user.password) {
        return done(null, false, {
          message: 'This account uses Google login. Please sign in with Google.'
        });
      }

      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password.' });
      }

      return done(null, user);

    } catch (err) {
      return done(err);
    }
  }
));

// ==============================
// Google OAuth Strategy
// ==============================

console.log("🔍 GOOGLE ENV CHECK:");
console.log("CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("CALLBACK:", process.env.GOOGLE_CALLBACK_URL);

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log("✅ Google login triggered:", profile.displayName);

      // 1. Check by Google ID
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // 2. Check by email
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        user.googleId = profile.id;
        user.avatar = profile.photos?.[0]?.value || '';
        await user.save();
        return done(null, user);
      }

      // 3. Create new user
      user = await User.create({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        avatar: profile.photos?.[0]?.value || ''
      });

      return done(null, user);

    } catch (err) {
      console.error("❌ Google Auth Error:", err);
      return done(err, null);
    }
  }
));

console.log("✅ Google Strategy Registered");

module.exports = passport;