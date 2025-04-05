const express = require("express")
const router= express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const profileController = require("../controllers/user/profileController")

router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)
router.post("/verify-otp",userController.verifyOtp)
router.post("/resend-otp",userController.resendOtp)


router.get("/auth/google",passport.authenticate('google',{scope:['profile','email']}))

router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    res.redirect("/")
});


router.get("/login",userController.loadLogin)
router.post("/login",userController.login)

router.get("/logout",userController.logout)


// Profile Management

router.get('/forgot-password',profileController.getForgotPassPage);

router.post("/forgotPass-otp",profileController.forgotEmailValid);
router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);
router.post("/reset-password",profileController.getResetPassPage);

module.exports=router;