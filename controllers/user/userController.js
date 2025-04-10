const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")
const loadSignup = async(req,res)=>{
    try {
        res.render("signup")
    } catch (error) {
       
        console.log("Home page not loading:",error)
        res.status(500).send("Server Error")
    }
}

function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email,otp){
    try {
        
        const transporter = nodemailer.createTransport({

            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Verify your account",
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP: ${otp}</b>`,


        })

        return info.accepted.length >0

    } catch (error) {
        console.error("Error sending email",error);
        return false;
        
    }
}

const signup = async(req,res)=>{
    try {
        const{name,phone,email,password,cPassword} = req.body;

        if(password !== cPassword){
            return res.json({ status: "error", message: "Passwords do not match" });
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.json({ status: "error", message: "User with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        const otp = generateOtp();

        // Store user data and OTP in session first
        req.session.userData = {
            name,
            phone,
            email,
            hashedPassword
        };
        
        // Store OTP in session immediately
        req.session.userOtp = otp;
        
        // Send response immediately to reduce lag
        res.json({ status: "success", message: "Please check your email for OTP" });
        
        // Send email in the background
        setTimeout(async () => {
            const emailSent = await sendVerificationEmail(email, otp);
            if(emailSent) {
                console.log("OTP sent:", otp);
            } else {
                console.error("Failed to send verification email");
            }
        }, 0);

    } catch (error) {
        console.error("signup error", error);
        res.json({ status: "error", message: "Server error occurred" });
    }
}


const pageNotFound = async(req,res) => {
    try {
        
        res.render("page.404")
    } catch (error) {
        res.render("pageNotFound")
    }
}




const loadHomepage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        });

        // Sort products by creation date and get the latest 4
        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if (req.session.user) {
            return res.render("home", { 
                user: req.session.user,
                products: productData,
                categories: categories
            });
        } else {
            return res.render("home", { 
                user: null,
                products: productData,
                categories: categories
            });
        }
    } catch (error) {
        console.log("Home page not found:", error);
        res.status(500).send("Server error");
    }
};


const securePassword = async(password)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10)

        return passwordHash;

    } catch (error) {
        console.error("Error hashing password:", error);
        throw error;
    }
}


    const verifyOtp = async(req,res)=>{
        try {
            
            const {otp} =req.body;

            console.log(otp);

            if(otp===req.session.userOtp){
                const user = req.session.userData
                // const passwordHash = await securePassword(user.password);

                const saveUserData = new User({
                    name:user.name,
                    email:user.email,
                    phone:user.phone,
                    password:user.hashedPassword,
                })
                await saveUserData.save();
                // Remove the automatic login
                // req.session.user = saveUserData._id;
                res.json({success:true,redirectUrl:"/login"})
            }else{
                res.status(400).json({success:false,message:"Invalid OTP,Please try again"})
            }

        } catch (error) {
            console.error("Error Verifying OTP",error)
            res.status(500).json({success:false,message:"An error occured"})
        }
    }



    const resendOtp = async(req,res)=>{
        try {
            
            const {email} = req.session.userData;

            if(!email){
                return res.status(400).json({success:false,message:"Email not found in session"})

            }

            const otp = generateOtp();
            req.session.userOtp = otp;

            const emailSent = await sendVerificationEmail(email,otp);

            if(emailSent){
                console.log("Resend OTP:",otp);
                res.status(200).json({success:true,message:"OTP Resend Successfully"});

            }else{
                res.status(500).json({success:false,message:"Failed to resend OTP.Please try again"});
            }

        } catch (error) {
            console.error("Error resending OTP",error)
            res.status(500).json({success:false,message:"Internal Server Error .PLease try again"})            
        }
    }

    const loadLogin = async(req,res)=>{
        try {
            // Set cache control headers to prevent caching
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
        }
    }



    const login = async (req, res) => {
        try {
            const { email, password } = req.body;
    
            const findUser = await User.findOne({ isAdmin: 0, email: email });
            if (!findUser) {
                return res.status(400).json({ success: false, errorMessage: "User not found" });
            }
    
            if (findUser.isBlocked) {
                return res.status(403).json({ success: false, errorMessage: "User is blocked by admin" });
            }
    
            const passwordMatch = await bcrypt.compare(password, findUser.password);
            if (!passwordMatch) {
                return res.status(401).json({ success: false, errorMessage: "Incorrect Password" });
            }
    
            
            req.session.user = findUser;
    
            return res.json({ success: true, message: "Login successful", redirectUrl: "/" });
    
        } catch (error) {
            console.error("Login error", error);
            return res.status(500).json({ success: false, errorMessage: "Login failed. Please try again later" });
        }
    };
    




    const logout = async (req, res) => {
        try {
            req.session.destroy((err) => {
                if (err) {
                    console.log("Session destruction error:", err.message);
                    return res.redirect("/");
                }
                res.clearCookie("connect.sid"); 
                // Set cache control headers to prevent caching
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
                return res.redirect("/login");
            });
        } catch (error) {
            console.log("Logout error", error);
            res.redirect("/pageNotFound");
        }
    };

    const loadVerifyOtp = async (req, res) => {
        try {
            if (!req.session.userOtp || !req.session.userData) {
                return res.redirect('/signup');
            }
            res.render('verify-otp');
        } catch (error) {
            console.error("Error loading verify OTP page:", error);
            res.redirect('/pageNotFound');
        }
    };


const loadShoppingPage = async (req, res)=>{
    try {
        
        res.render("shop");

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadVerifyOtp,
    loadShoppingPage
}