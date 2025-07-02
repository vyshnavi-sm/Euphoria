const sessionMiddleware = {
    preventBackToSignup: (req, res, next) => {
        if (req.session.userOtp && req.session.userData) {
            res.set('Cache-Control', 'no-store');
            return res.redirect('/verify-otp');
        }
        next();
    },

    preventBackToLogin: (req, res, next) => {
        if (req.session.user) {
            res.set('Cache-Control', 'no-store');
            return res.redirect('/');
        }
        next();
    },

    preventBackToOtp: (req, res, next) => {
        if (!req.session.userOtp && !req.session.userData) {
            res.set('Cache-Control', 'no-store');
            return res.redirect('/login');
        }
        next();
    }
};

module.exports = sessionMiddleware; 