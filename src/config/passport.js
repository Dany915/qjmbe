const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (user) return done(null, user);

        // Also check if there's an account with the same email (normal signup)
        user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          user.googleId = profile.id;
          if (!user.avatar) user.avatar = profile.photos[0]?.value;
          await user.save();
          return done(null, user);
        }

        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          avatar: profile.photos[0]?.value,
          authProvider: 'google',
        });

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
