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

        // First regenerate the session
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session regeneration error:", err);
                return res.redirect("/pageerror");
            }
            
            // Then set the admin data in the new session
            req.session.admin = { 
                id: admin._id, 
                email: admin.email,
                lastActivity: Date.now()
            };
            
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
    if (!req.session.admin) {
        console.log(" No Admin Session. Redirecting to login.");
        return res.redirect("/admin/login");
    }
    try {
        res.render("adminDashboard");
    } catch (error) {
        console.error(" Error Rendering Dashboard:", error);
        return res.redirect("/pageerror");
    }
};

const logout = async (req, res) => {
    try {
        if (req.session) {
            // Clear all session data
            req.session.destroy((err) => {
                if (err) {
                    console.error("Error destroying session:", err);
                    return res.redirect("/pageerror");
                }
                // Clear the session cookie
                res.clearCookie('connect.sid');
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
