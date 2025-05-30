const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    // Update last activity timestamp
                    req.session.lastActivity = Date.now();
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

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        // Check if session has expired (24 hours timeout)
        const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        if (Date.now() - req.session.lastActivity > sessionTimeout) {
            delete req.session.admin;
            req.session.save((err) => {
                if (err) {
                    console.error("Session save error:", err);
                }
                return res.redirect('/admin/login');
            });
            return;
        }

        // Verify admin still exists and is not blocked
        const admin = await User.findOne({ 
            _id: req.session.admin.id, 
            isAdmin: true 
        });

        if (!admin || admin.isBlocked) {
            delete req.session.admin;
            req.session.save((err) => {
                if (err) {
                    console.error("Session save error:", err);
                }
                return res.redirect('/admin/login');
            });
            return;
        }

        // Update last activity timestamp
        req.session.lastActivity = Date.now();
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
            }
            next();
        });
    } catch (error) {
        console.error("Admin auth error:", error);
        return res.redirect('/admin/login');
    }
}

module.exports = {
    userAuth,
    adminAuth
}