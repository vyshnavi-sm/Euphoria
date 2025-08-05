const User = require("../../models/userSchema");
const { generateOtp } = require("../../utils/otpService");
const { sendVerificationEmail } = require("../../utils/emailService");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const getForgotPassPage = async (req, res) => {
    try {
        res.render("forgot-password", { message: '' });
    } catch (error) {
        console.error("Error rendering forgot password page:", error);
        res.redirect("/pageNotFound");
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        console.log(req.body);
        const findUser = await User.findOne({ email: email });
        
        if (findUser) {
            const otp = generateOtp();
            console.log(otp);
            const emailSent = await sendVerificationEmail(email, otp);
            
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.user = findUser;
                res.render("forgotPass-otp", { message: '' });
                console.log("OTP:", otp);
            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again" });
            }
        } else {
            res.render("forgot-password", {
                message: "User with this email does not exist"
            });
        }
    } catch (error) {
        console.error("Error validating email:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        
        if (!req.session.userOtp) {
            return res.json({
                success: false,
                message: "OTP session expired. Please try again."
            });
        }
        
        if (enteredOtp === req.session.userOtp) {
            delete req.session.userOtp;
            return res.json({
                success: true,
                message: "OTP verified successfully",
                redirectUrl: "/reset-password"
            });
        } else {
            return res.json({
                success: false,
                message: "Invalid OTP. Please try again."
            });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "An error occurred. Please try again"
        });
    }
};

const getResetPassPage = async (req, res) => {
    try {
        if (!req.session.email) {
            console.log("No email in session, redirecting to forgot password page");
            return res.redirect("/forgot-password");
        }
        
        console.log("Rendering reset password page for email:", req.session.email);
        res.render("reset-password", { message: '' });
    } catch (error) {
        console.error("Error rendering reset password page:", error);
        res.redirect("/pageNotFound");
    }
};

const resendOtp = async (req, res) => {
    try {
        const email = req.session.emailToUpdate || req.session.email;
        
        if (!email) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({
                success: false,
                message: "Session expired. Please start over."
            });
        }
        
        const otp = generateOtp();
        req.session.userOtp = otp;
        
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(STATUS_CODE.SUCCESS).json({ success: true, message: "New OTP has been sent to your email" });
        } else {
            res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to send OTP" });
        }
    } catch (error) {
        console.error("Error in resend otp", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp
};