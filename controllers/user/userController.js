const User = require("../../models/userSchema")
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const loadSignup = async(req,res)=>{
    try {
        res.render("signup")
    } catch (error) {
       
        console.log("Home page not loading:",error)
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send("Server Error")
    }
}
const emailOTPs = new Map();

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const sendEmailOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Please provide a valid email address' });

        if (await User.findOne({ email }))
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'This email is already registered' });

        const otp = generateOTP();
        emailOTPs.set(email, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Email Verification OTP',
            html: `
                <h1>Email Verification</h1>
                <p>Your OTP for email verification is: <strong>${otp}</strong></p>
                <p>This OTP will expire in 10 minutes.</p>
                <p>If you didn't request this change, please ignore this email.</p>
            `
        });

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Error sending OTP' });
    }
};

const verifyEmailOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const userId = req.session.user_id;
    if (!email || !otp)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Email and OTP are required' });
     const storedData = emailOTPs.get(email);
        if (!storedData)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'OTP expired or not found' });

        if (Date.now() > storedData.expiresAt) {
            emailOTPs.delete(email);
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'OTP has expired' });
        }

        if (otp !== storedData.otp)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Invalid OTP' });

        await User.findByIdAndUpdate(userId, { email });
        emailOTPs.delete(email);

        res.json({ message: 'Email updated successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Error verifying OTP' });
    }
};
    async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cPassword, referralCode } = req.body;

        if(!name || !phone || !email || !password || !cPassword){
            return res.json({status:"error",field:null,message:"All fields are required"})
        }
        
        if(!/^[A-Z][a-zA-Z\s]*$/.test(name)){
            return res.json({status:"error",field:"name",  message:"Name must be start with capital letter and contains only letters"})
        }
        if(!/^[6-9]\d{9}$/.test(phone)){
            return res.json({status:"error", field:"phone",message:"Numbers must be 10 digits Indian number"})
        }
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.json({status:"error",field:"email",message:"Email is not valid"})
        }
          if (!/^[A-Z][a-z]*@.*$/.test(password)) {
            return res.json({ status: "error",field:"password", message: "Password must start with a capital letter, have lowercase letters, and contain '@'" });
}

        if (password !== cPassword) {
            return res.json({ status: "error",field:"cPassword" ,message: "Passwords do not match" });
        }
        
        if (await User.findOne({ email }))
            return res.json({ status: "error", field:"email",message: "User with this email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();

        req.session.userData = { name, phone, email, password: hashedPassword, referralCode };
        req.session.userOtp = otp;

        res.json({ status: "success", message: "Please check your email for OTP" });

        setTimeout(async () => {
            const emailSent = await sendVerificationEmail(email, otp);
            emailSent ? console.log("OTP sent:", otp) : console.error("Failed to send verification email");
        }, 0);
    } catch (error) {
        console.error("signup error", error);
        res.json({ status: "error", message: "Server error occurred" });
    }};
const pageNotFound = async(req,res) => {
    try {
        res.render("page.404")
    } catch (error) {
        res.render("pageNotFound")
    }}
const securePassword = async(password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10)

        return passwordHash;

    } catch (error) {
        console.error("Error hashing password:", error);
        throw error;
    }}

 const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (otp !== req.session.userOtp)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: "Invalid OTP, Please try again" });

        const userData = req.session.userData;
        const newUser = new User({
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            password: userData.password
        });

        if (userData.referralCode) {
            const referrer = await User.findOne({ referalCode: userData.referralCode });
            if (referrer) {
                newUser.referredBy = referrer._id;
                referrer.referralCount += 1;
                referrer.referralRewards.push({ amount: 100, referredUser: newUser._id });
                referrer.wallet += 100;
                await referrer.save();
            }}

        await newUser.save();
        delete req.session.userData;
        delete req.session.userOtp;

        res.json({ success: true, redirectUrl: "/login" });

    } catch (error) {
        console.error("Error Verifying OTP", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "An error occurred" });
    }};
  const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;

        if (!email)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: "Email not found in session" });

        const otp = generateOTP();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(STATUS_CODE.SUCCESS).json({ success: true, message: "OTP Resend Successfully" });
        } else {
            res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal Server Error. Please try again" });
    }};
const loadLogin = async(req,res)=>{
        try {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
            
            if(!req.session.user){
                return res.render("login",{errorMessage : ""})
            }else{
                res.redirect("/")
            }
        } catch (error) {
            console.log(error)
            res.redirect("/pageNotFound")
        }}

  const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const findUser = await User.findOne({ isAdmin: 0, email });
        if (!findUser)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, errorMessage: "User not found" });

        if (findUser.isBlocked)
            return res.status(STATUS_CODE.FORBIDDEN).json({ success: false, errorMessage: "User is blocked by admin" });

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch)
            return res.status(STATUS_CODE.UNAUTHORIZED).json({ success: false, errorMessage: "Incorrect Password" });

        req.session.user = findUser;

        res.json({ success: true, message: "Login successful", redirectUrl: "/" });

    } catch (error) {
        console.error("Login error", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, errorMessage: "Login failed. Please try again later" });
    }};

 const logout = async (req, res) => {
        try {
            req.session.destroy((err) => {
                if (err) {
                    console.log("Session destruction error:", err.message);
                    return res.redirect("/");
                }
                res.clearCookie("connect.sid"); 
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
                return res.redirect("/login");
            });
        } catch (error) {
            console.log("Logout error", error);
            res.redirect("/pageNotFound");
        }};

    const loadVerifyOtp = async (req, res) => {
        try {
            if (!req.session.userOtp || !req.session.userData) {
                return res.redirect('/signup');
            }
            res.render('verify-otp');
        } catch (error) {
            console.error("Error loading verify OTP page:", error);
            res.redirect('/pageNotFound');
        }};

module.exports = { pageNotFound,loadSignup,signup,verifyOtp,resendOtp,loadLogin,login,logout,loadVerifyOtp,sendEmailOTP,verifyEmailOTP}
