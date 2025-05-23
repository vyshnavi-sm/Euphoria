const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    if (req.xhr || req.headers.accept.includes('application/json')) {
                        res.status(401).json({ message: 'Please login to continue' });
                    } else {
                        res.redirect("/login");
                    }
                }
            })
            .catch(error => {
                console.log("Error in user auth middleware");
                if (req.xhr || req.headers.accept.includes('application/json')) {
                    res.status(500).json({ message: 'Internal Server error' });
                } else {
                    res.status(500).send("Internal Server error");
                }
            });
    } else {
        if (req.xhr || req.headers.accept.includes('application/json')) {
            res.status(401).json({ message: 'Please login to continue' });
        } else {
            res.redirect("/login");
        }
    }
}

const adminAuth = (req, res, next) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }

    // Check if session has expired (30 minutes timeout)
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
    if (Date.now() - req.session.lastActivity > sessionTimeout) {
        req.session.destroy();
        return res.redirect('/admin/login');
    }

    // Update last activity timestamp
    req.session.lastActivity = Date.now();
    next();
}

module.exports = {
    userAuth,
    adminAuth
}