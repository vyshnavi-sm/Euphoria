
const User = require("../../models/userSchema")
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
            return res.render("signup",{message:"Passwords do not match"})
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("signup",{message:"User with this email is already exists"})
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const otp=generateOtp();

        const emailSent =await sendVerificationEmail(email,otp);

        if(!emailSent){
            return res.json("email-error")
        }

        req.session.userOtp = otp;
        req.session.userData ={name,phone,email,hashedPassword};

        res.render("Verify-otp");
        console.log("OTP sent",otp)

    } catch (error) {
        console.error("signup error",error);
        res.redirect("/pageNotFound")
    }
}


const pageNotFound = async(req,res) => {
    try {
        
        res.render("page.404")
    } catch (error) {
        res.render("pageNotFound")
    }
}


// const loadHomepage = async (req,res)=>{
//     try {
//         const user = req.session.user;
//         if(user){
//             const userData = await User.findOne({_id:user._id})
         
//             return res.render("home",{user:userData});
//         }else{
//            return  res.render("home");
//         }
        
      

//     } catch (error) {
        
//         console.log("Home page not found")
//         res.status(500).Send("Server error ")
//     }
// }

const loadHomepage = async (req, res) => {
    try {
        if (req.session.user) {
            return res.render("home", { user: req.session.user });
        } else {
            return res.render("home", { user: null });
        }
    } catch (error) {
        console.log("Home page not found");
        res.status(500).send("Server error");
    }
};


const securePassword = async(passwors)=>{
    try {
        
        const passwordHash = await bcrypt.hash(password,10)

        return passwordHash;

    } catch (error) {
        
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
                req.session.user = saveUserData._id;
                res.json({success:true,redirectUrl:"/"})
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

            const emailSent = await sendVerificationEmail(email.otp);

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

    // const login = async(req,res)=>{
    //     try {
    //         const{email,password} =req.body;

    //         const findUser = await User.findOne({isAdmin:0,email:email});
    //         if (!findUser) {
    //             return res.status(400).json({ success: false, errorMessage: "User not found" });
    //         }
    
    //         if (findUser.isBlocked) {
    //             return res.status(403).json({ success: false, errorMessage: "User is blocked by admin" });
    //         }
    //         const passwordMatch = await bcrypt.compare(password, findUser.password);
    //         if (!passwordMatch) {
    //             return res.status(401).json({ success: false, errorMessage: "Incorrect Password" });
    //         }
    
    //         req.session.user = findUser._id;
    
    //         return res.json({ success: true, message: "Login successful", redirectUrl: "/" });

    //     } catch (error) {

    //         console.error("login error",error);
    //         return res.status(500).json({ success: false, errorMessage: "Login failed. Please try again later" }); 
          

    //     }
    // }


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
    
            // ✅ Store full user object in session
            req.session.user = findUser;
    
            return res.json({ success: true, message: "Login successful", redirectUrl: "/" });
    
        } catch (error) {
            console.error("Login error", error);
            return res.status(500).json({ success: false, errorMessage: "Login failed. Please try again later" });
        }
    };
    

    // const logout = async (req,res)=>{
    //     try {
            
    //         req.session.destroy((err) => {
    //             if(err){
    //                 console.log("Session destruction error",err.message);
    //                 return res.redirect()
    //             }
    //             return res.redirect("/login")

    //         })
    //     } catch (error) {
    //         console.log("Logout error",error)
    //         res.redirect("/pageNotFound")
            
    //     }
    // }



    const logout = async (req, res) => {
        try {
            req.session.destroy((err) => {
                if (err) {
                    console.log("Session destruction error:", err.message);
                    return res.redirect("/");
                }
                res.clearCookie("connect.sid"); 
                return res.redirect("/login");
            });
        } catch (error) {
            console.log("Logout error", error);
            res.redirect("/pageNotFound");
        }
    };

    const loadProductpage = async(req,res)=>{
            try {
                res.render("product"); // This will render the product.ejs file
            } catch (error) {
                console.error("Error loading product page:", error);
                res.status(500).send("Internal Server Error");
            }
        };
        
    //   const loadPicture = async (req, res) => {
    //     try {
    //       const product = await Product.findById(req.params.id);
    //       if (!product) {
    //         return res.status(404).json({ error: "Product not found" });
    //       }
    //       res.json(product);
    //     } catch (err) {
    //       res.status(500).json({ error: "Server Error" });
    //     }
    //   };  
     
      const oneProducts = async (req,res) =>{
        try {
            res.render("oneProducts");

        } catch (error) {
            console.error("Error loading product page:", error);
            res.status(500).send("Internal Server Error");

            
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
    loadProductpage,
    oneProducts
    
}