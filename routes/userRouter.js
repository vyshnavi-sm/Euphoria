const express = require("express")
const router= express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const profileController = require("../controllers/user/profileController")

router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)

// OTP Verification Routes
router.get("/verify-otp", userController.loadVerifyOtp);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.post("/clear-otp-session", (req, res) => {
    delete req.session.userOtp;
    delete req.session.userData;
    res.json({ success: true });
});

// Google Auth Routes
router.get("/auth/google",passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    res.redirect("/")
});

// Login/Logout Routes
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)

// Profile Management Routes
router.get('/forgot-password',profileController.getForgotPassPage);
router.post("/forgotPass-otp",profileController.forgotEmailValid);
router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);

module.exports=router;