const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const pageerror = (req, res) => res.render("pageerror");

const loadLogin = (req, res) => {
  if (req.session.admin) return res.redirect("/admin/dashboard");
  res.render("adminLogin", { message: null });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.json({
        success: false,
        message: "Please provide both email and password",
      });

    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin)
      return res.json({
        success: false,
        message: "Invalid email or not an admin account",
      });
    if (admin.isBlocked)
      return res.json({
        success: false,
        message: "This admin account has been blocked",
      });

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch)
      return res.json({ success: false, message: "Incorrect password" });

    if (req.session) delete req.session.admin;
    req.session.admin = {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      lastActivity: Date.now(),
    };
    await new Promise((resolve) => req.session.save(resolve));
    res.json({ success: true, redirect: "/admin/dashboard" });
  } catch (error) {
    console.error("Login Error:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .json({
        success: false,
        message: "An error occurred. Please try again.",
      });
  }
};

const logout = (req, res) => {
  try {
    if (req.session) {
      delete req.session.admin;
      req.session.save((err) => {
        if (err) return res.redirect("/pageerror");
        res.redirect("/admin/login");
      });
    } else {
      res.redirect("/admin/login");
    }
  } catch (error) {
    console.error("Logout Error:", error);
    res.redirect("/pageerror");
  }
};

const validateAdminSession = (req, res, next) => {
  if (!req.session.admin) {
    return req.xhr || req.headers.accept.includes("json")
      ? res
          .status(STATUS_CODE.UNAUTHORIZED)
          .json({ success: false, message: "Session expired" })
      : res.redirect("/admin/login");
  }
  req.session.admin.lastActivity = Date.now();
  next();
};

module.exports = {
  loadLogin,
  login,
  pageerror,
  logout,
  validateAdminSession,
};
