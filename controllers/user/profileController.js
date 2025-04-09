const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require('dotenv').config();
const session = require("express-session");

function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

const sendVerificationEmail = async (email,otp)=>{
    try {
        
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
        })

        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for password reset",
            text:`Your OTP is ${otp}`,
            html:`<b><h4>Your OTP: ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:",info.messageId);
        return true;



    } catch (error) {

        console.error("Error sending email",error);
        return false;
        
    }
}

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw error; // Re-throw the error to be caught by the calling function
    }
}



const getForgotPassPage = async(req,res)=>{
    try {

        res.render("forgot-password")
        
    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
};


const forgotEmailValid = async(req,res)=>{  
    try {
        
        const{email} =req.body;
        console.log(req.body)
        const findUser =await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            console.log(otp)
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp =otp;
                req.session.email = email;
                req.session.user = findUser ;
                res.render("forgotPass-otp");
                console.log("OTP:",otp);
            }else{
                res.json({success:false, message:"Failed to send OTP. Please try again"});
            }

        }else{
            res.render("forgot-password",{
                message:"User with this email does not exist"
            })
        }
    } catch (error) {

        res.redirect("/pageNotFound");
        
    }
}


const verifyForgotPassOtp = async(req, res) => {
    try {
        const enteredOtp = req.body.otp;
        
        if (!req.session.userOtp) {
            return res.json({
                success: false, 
                message: "OTP session expired. Please try again."
            });
        }
        
        if (enteredOtp === req.session.userOtp) {
            // Clear the OTP from session after successful verification
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
        return res.status(500).json({
            success: false, 
            message: "An error occurred. Please try again"
        });
    }
}

const getResetPassPage = async (req,res)=>{
    try {
        // Check if email exists in session
        if (!req.session.email) {
            console.log("No email in session, redirecting to forgot password page");
            return res.redirect("/forgot-password");
        }
        
        console.log("Rendering reset password page for email:", req.session.email);
        res.render("reset-password");
    } catch (error) {
        console.error("Error rendering reset password page:", error);
        res.redirect("/pageNotFound");
    }
}


const resendOtp = async (req,res)=>{
    try {
        
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resend OYP to email:",email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true ,message: "Resend OTP Successful"});

        }

    } catch (error) {
        console.error("Error in resend otp",error);
        res.status(500).json({success:false , message:"Internal Server Error"});

    }
}

const postNewPassword = async (req,res)=>{
    try {
        const {newPass1, newPass2} = req.body;
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

        const passwordHash = await securePassword(newPass1);
        await User.updateOne(
            {email: email},
            {$set: {password: passwordHash}}
        );
        
        // Clear session data
        delete req.session.email;
        delete req.session.userOtp;
        delete req.session.user;
        
        return res.status(200).json({
            success: true,
            message: "Password updated successfully",
            redirectUrl: "/login"
        });
    } catch (error) {
        console.error("Error updating password:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while updating the password"
        });
    }
}

module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,

};