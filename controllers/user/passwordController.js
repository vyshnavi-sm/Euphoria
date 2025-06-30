const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
const { generateOtp } = require("../../utils/otpService");
const { sendVerificationEmail } = require("../../utils/emailService");


const postNewPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        
        if (oldPassword) {
            const userId = req.session.user._id;
            
            if (!oldPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required'
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'New passwords do not match'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'The current password you entered is incorrect. Please try again.'
                });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
            await user.save();
            req.session.user = user;

            return res.status(200).json({
                success: true,
                message: 'Password updated successfully',
                redirectUrl: '/userProfile'
            });
        } else {
            const { newPass1, newPass2 } = req.body;
            const email = req.session.email;
            
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Session expired. Please try again."
                });
            }
            
            if (newPass1 !== newPass2) {
                return res.status(400).json({
                    success: false,
                    message: "Passwords do not match"
                });
            }

            const passwordHash = await bcrypt.hash(newPass1, 10);
            await User.updateOne(
                { email: email },
                { $set: { password: passwordHash } }
            );
            
            delete req.session.email;
            delete req.session.userOtp;
            delete req.session.user;
            
            return res.status(200).json({
                success: true,
                message: "Password updated successfully",
                redirectUrl: "/login"
            });
        }
    } catch (error) {
        console.error('Error in postNewPassword:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating password'
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.session.user;
        
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }
        
        res.render("change-password", {
            user: userData
        });
    } catch (error) {
        console.error("Error loading change password page:", error);
        res.redirect("/pageNotFound");
    }
};

const changePasswordValid = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const { email } = req.body;
        const userExists = await User.findOne({ email });
        
        if (userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-password-otp", {
                    user: userData,
                    message: ''
                });
                console.log("OTP:", otp);
            } else {
                res.render("change-password", {
                    user: userData,
                    message: "Failed to send OTP. Please try again"
                });
            }
        } else {
            res.render("change-password", {
                user: userData,
                message: "User with this email does not exist"
            });
        }
    } catch (error) {
        console.error("Error in change password validation:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyChangePassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            res.json({
                success: true,
                redirectUrl: "/reset-password"
            });
        } else {
            res.json({
                success: false,
                message: "OTP not matching"
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred. Please try again later" });
    }
};

module.exports = {
    postNewPassword,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp
};