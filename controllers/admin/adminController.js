const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");



const pageerror = async (req, res) => {
    res.render("pageerror");
};

//  Load Admin Login Page
const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("adminLogin", { message: null });
};

//  Admin Login Authentication
const login = async (req, res) => {
    try {
        console.log(" Login Request Body:", req.body); 

        const { email, password } = req.body;

        if (!email || !password) {
            console.log(" Missing email or password");
            return res.redirect("/admin/login");
        }

        console.log(" Admin Login Attempt for:", email);
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            console.log(" Admin not found or not an admin.");
            return res.redirect("/admin/login");
        }

        //  Compare Password
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            console.log(" Incorrect password");
            return res.redirect("/admin/login");
        }

        // Set admin session with more details
        req.session.admin = {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            lastActivity: Date.now()
        };

        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.redirect("/pageerror");
            }
            console.log(" Admin Logged In:", req.session.admin);
            return res.redirect("/admin/dashboard");
        });

    } catch (error) {
        console.error(" Login Error:", error);
        return res.redirect("/pageerror");
    }
};




//  Load Admin Dashboard
const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            console.log(" No Admin Session. Redirecting to login.");
            return res.redirect("/admin/login");
        }

        // Update last activity
        req.session.lastActivity = Date.now();
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.redirect("/pageerror");
            }
            res.render("adminDashboard");
        });
    } catch (error) {
        console.error(" Error Rendering Dashboard:", error);
        return res.redirect("/pageerror");
    }
};

const logout = async (req, res) => {
    try {
        if (req.session) {
            // Clear only admin session data
            delete req.session.admin;
            req.session.save((err) => {
                if (err) {
                    console.error("Error saving session:", err);
                    return res.redirect("/pageerror");
                }
                res.redirect("/admin/login");
            });
        } else {
            res.redirect("/admin/login");
        }
    } catch (error) {
        console.error("Unexpected error during logout:", error);
        res.redirect("/pageerror");
    }
};


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
};
