const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
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
            console.log("No admin session found");
            return res.redirect('/admin/login');
        }

        const sessionTimeout = 24 * 60 * 60 * 1000; 
        const lastActivity = req.session.admin.lastActivity || 0;
        
        if (Date.now() - lastActivity > sessionTimeout) {
            console.log("Session expired - Last activity:", new Date(lastActivity));
            delete req.session.admin;
            await new Promise((resolve) => req.session.save(resolve));
            return res.redirect('/admin/login');
        }

        const admin = await User.findOne({ 
            _id: req.session.admin.id, 
            isAdmin: true 
        });

        if (!admin || admin.isBlocked) {
            console.log("Admin not found or blocked");
            delete req.session.admin;
            await new Promise((resolve) => req.session.save(resolve));
            return res.redirect('/admin/login');
        }

        req.session.admin.lastActivity = Date.now();
        await new Promise((resolve) => req.session.save(resolve));
        next();
    } catch (error) {
        console.error("Admin auth error:", error);
        return res.redirect('/admin/login');
    }
}

module.exports = {
    userAuth,
    adminAuth
}