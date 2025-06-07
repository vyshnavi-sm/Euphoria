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
            // Return JSON response for missing credentials
            return res.json({ success: false, message: "Please provide both email and password" });
        }

        console.log(" Admin Login Attempt for:", email);
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            console.log(" Admin not found or not an admin.");
            // Return JSON response for admin not found
            return res.json({ success: false, message: "Invalid email or not an admin account" });
        }

        if (admin.isBlocked) {
            console.log(" Admin account is blocked");
            // Return JSON response for blocked account
            return res.json({ success: false, message: "This admin account has been blocked" });
        }

        //  Compare Password
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            console.log(" Incorrect password");
            // Return JSON response for incorrect password
            return res.json({ success: false, message: "Incorrect password" });
        }

        // Clear any existing session data
        if (req.session) {
            delete req.session.admin;
        }

        // Set admin session with more details
        req.session.admin = {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            lastActivity: Date.now()
        };

        // Save session explicitly and wait for it to complete
        await new Promise((resolve) => req.session.save(resolve));
        console.log(" Admin Logged In:", req.session.admin);
        
        // Redirect upon successful login
        // return res.redirect("/admin/dashboard"); // This will be handled on the frontend
         return res.json({ success: true, redirect: "/admin/dashboard" });

    } catch (error) {
        console.error(" Login Error:", error);
        // Return JSON response for unexpected errors
        return res.status(500).json({ success: false, message: "An error occurred. Please try again." });
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
        req.session.admin.lastActivity = Date.now();
        await new Promise((resolve) => req.session.save(resolve));
        res.render("adminDashboard");
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
