const User = require("../../models/userSchema");
const { generateOtp } = require("../../utils/otpService");
const { sendVerificationEmail } = require("../../utils/emailService");
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const changeEmail = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const userId = req.session.user;
        const userData = await User.findById(userId);
        
        if (!userData) {
            return res.redirect('/login');
        }
        
        res.render("change-email", {
            user: userData,
            message: ''
        });
    } catch (error) {
        console.error("Error loading change email page:", error);
        res.redirect("/pageNotFound");
    }
};

const changeEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const userExists = await User.findOne({ email: email, _id: { $ne: userId } });
        if (userExists) {
            return res.render("change-email", {
                user: userData,
                message: "This email is already registered by another user."
            });
        }

        if (userData.email === email) {
            return res.render("change-email", {
                user: userData,
                message: "New email cannot be the same as the current email."
            });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            req.session.userOtp = otp;
            req.session.emailToUpdate = email;
            res.render("change-email-otp", {
                user: userData,
                message: ''
            });
            console.log("Email sent to:", email);
            console.log("OTP:", otp);
        } else {
            res.render("change-email", {
                user: userData,
                message: "Failed to send OTP. Please try again."
            });
        }
    } catch (error) {
        console.error("Error in change email validation:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        const userId = req.session.user;
        
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        if (enteredOtp === req.session.userOtp) {
            const newEmail = req.session.emailToUpdate;
            if (newEmail) {
                await User.findByIdAndUpdate(userId, { email: newEmail });
                delete req.session.userOtp;
                delete req.session.emailToUpdate;
                res.redirect("/userProfile");
            } else {
                res.render("change-email-otp", {
                    message: "New email not found in session. Please restart the process.",
                    user: userData
                });
            }
        } else {
            res.render("change-email-otp", {
                message: "OTP not matching",
                user: userData
            });
        }
    } catch (error) {
        console.error("Error verifying email OTP:", error);
        res.redirect("/pageNotFound");
    }
};

const updateEmail = async (req, res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId, { email: newEmail });
        res.redirect("userProfile");
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail
};