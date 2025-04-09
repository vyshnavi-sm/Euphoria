const sessionMiddleware = {
    // Prevent going back to signup after OTP verification started
    preventBackToSignup: (req, res, next) => {
        if (req.session.userOtp && req.session.userData) {
            // If OTP verification is in progress, prevent going back to signup
            res.set('Cache-Control', 'no-store');
            return res.redirect('/verify-otp');
        }
        next();
    },

    // Prevent going back to login after successful login
    preventBackToLogin: (req, res, next) => {
        if (req.session.user) {
            // If user is logged in, prevent going back to login
            res.set('Cache-Control', 'no-store');
            return res.redirect('/');
        }
        next();
    },

    // Prevent going back to OTP page after verification
    preventBackToOtp: (req, res, next) => {
        if (!req.session.userOtp && !req.session.userData) {
            // If OTP verification is complete, prevent going back to OTP page
            res.set('Cache-Control', 'no-store');
            return res.redirect('/login');
        }
        next();
    }
};

module.exports = sessionMiddleware; 