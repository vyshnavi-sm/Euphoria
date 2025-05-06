const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema")
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require('dotenv').config();
const session = require("express-session");
const Order = require("../../models/orderSchema");

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
        res.render("forgot-password", { message: '' });
    } catch (error) {
        console.error("Error rendering forgot password page:", error);
        res.redirect("/pageNotFound");
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
                res.render("forgotPass-otp", { message: '' });
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
        console.error("Error validating email:", error);
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
        // Always pass the message variable, even if empty
        res.render("reset-password", { message: '' });
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
        console.log("Resend OTP to email:",email);
        
        if (!email) {
            return res.status(400).json({
                success: false, 
                message: "Session expired. Please start over."
            });
        }
        
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true, message: "New OTP has been sent to your email"});
        } else {
            res.status(500).json({success:false, message: "Failed to send OTP"});
        }
    } catch (error) {
        console.error("Error in resend otp",error);
        res.status(500).json({success:false, message:"Internal Server Error"});
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

const userProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId: userId});
        
        // Fetch user's orders with pagination
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Number of orders per page
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalOrders = await Order.countDocuments({ userId });
        const totalPages = Math.ceil(totalOrders / limit);

        // Get orders for the current page with populated product details
        const orders = await Order.find({ userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'  // Select only needed fields
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);
        
        // Ensure addressData is properly structured
        const formattedAddressData = addressData || { address: [] };
        
        res.render("profile", {
            user: userData,
            userAddress: formattedAddressData,
            orders,
            currentPage: page,
            totalPages,
            searchQuery: req.query.query || ''
        });
        
    } catch (error) {
        console.error("Error retrieving profile data:", error);
        res.redirect("/pageNotFound");
    }
}

const changeEmail = async(req,res)=>{
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
}

const changeEmailValid = async(req,res)=>{
    try {
        const {email}=req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const userExists = await User.findOne({email});
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-email-otp", {
                    user: userData,
                    message: ''
                });
                console.log("Email sent:",email)
                console.log("OTP:",otp)
            }else{
                res.json("email-error");
            }
        }else{
            res.render("change-email",{
                user: userData,
                message : "User with this email not exist"
            })
        }
    } catch (error) {
        console.error("Error in change email validation:", error);
        res.redirect("/pageNotFound")
    }
}


const verifyEmailOtp = async(req,res)=>{
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

        if(enteredOtp === req.session.userOtp){
            res.render("new-email", {
                user: userData,
                userData: req.session.userData
            });
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
}


const updateEmail = async(req,res)=>{
    try {

        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect("userProfile")
        
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}

const changePassword = async(req,res)=>{
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
}

const changePasswordValid = async(req,res)=>{
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect('/login');
        }

        const {email} = req.body;
        const userExists = await User.findOne({email});
        
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-password-otp", {
                    user: userData,
                    message: ''
                });
                console.log("OTP:",otp)
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
}

const verifyChangePassOtp = async(req,res)=>{
    try {
        
        const enteredOtp = req.body.otp;
        if(enteredOtp===req.session.userOtp){

            res.json({
                success:true,
                redirectUrl:"/reset-password"
            })
        }else{
            res.json({
                success:false,
                message:"OTP not matching"
            })
        }


    } catch (error) {

        res.status(500).json({success:false, message : "An error occured. Please try again later"})
        
    }
}


const addAddress = async(req,res)=>{
    try {
        
        const user = req.session.user;
        res.render("add-address",{user: user})



    } catch (error) {
        res.redirect("/pageNotFound")
    }
}

const viewAddresses = async(req,res)=>{
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const userData = await User.findById(userId);
        const addressDoc = await Address.findOne({ userId: userId });

        res.render("addresses", {
            user: userData,
            userAddress: addressDoc ? addressDoc.address : []
        });
    } catch (error) {
        console.error("Error loading addresses:", error);
        res.redirect("/pageNotFound");
    }
}

const postAddAddress = async(req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {name, mobile, addressType, addressLine1, addressLine2, city, state, pincode} = req.body;

        // Find existing address document for the user
        let userAddress = await Address.findOne({userId: userData._id});

        const newAddress = {
            addressType,
            name,
            city,
            landMark: addressLine1,
            state,
            pincode,
            phone: mobile,
            altPhone: mobile // Using same number as alternate phone since it's required
        };

        if (!userAddress) {
            // Create new address document if none exists
            userAddress = new Address({
                userId: userData._id,
                address: [newAddress]
            });
        } else {
            // Add new address to existing document
            userAddress.address.push(newAddress);
        }

        await userAddress.save();
        // Redirect to profile page with address tab active
        res.redirect("/userProfile#address");

    } catch (error) {
        console.error("Error adding address:", error);
        res.redirect("/pageNotFound");
    }
}


const editAddress = async(req,res)=>{
    try {
        const addressId = req.params.id;
        const user = req.session.user;
        const redirect = req.query.redirect || 'profile';
        const currAddress = await Address.findOne({
            "address._id": addressId
        });

        if(!currAddress){
            return res.redirect("/pageNotFound");
        }

        const addressData = currAddress.address.find((item)=>{
            return item._id.toString() === addressId.toString();
        });

        if(!addressData){
            return res.redirect("/pageNotFound");
        }

        res.render("edit-address", {
            address: addressData,
            user: user,
            redirect: redirect
        });

    } catch (error) {
        console.error("Error in edit address:", error);
        res.redirect("/pageNotFound");
    }
}

const updateAddress = async(req,res)=>{
    try {
        const addressId = req.params.id;
        const userId = req.session.user;
        const redirect = req.query.redirect || 'profile';
        const {name, mobile, addressType, addressLine1, city, state, pincode} = req.body;

        // Find the address document
        const result = await Address.updateOne(
            {
                userId: userId,
                "address._id": addressId
            },
            {
                $set: {
                    "address.$.name": name,
                    "address.$.phone": mobile,
                    "address.$.addressType": addressType,
                    "address.$.landMark": addressLine1,
                    "address.$.city": city,
                    "address.$.state": state,
                    "address.$.pincode": pincode,
                    "address.$.altPhone": mobile
                }
            }
        );

        if (result.modifiedCount === 0) {
            throw new Error('Address not found or not modified');
        }

        // Redirect based on the redirect parameter
        if (redirect === 'checkout') {
            res.redirect("/user/checkout");
        } else {
            res.redirect("/userProfile#address");
        }

    } catch (error) {
        console.error("Error updating address:", error);
        res.redirect("/pageNotFound");
    }
}

const deleteAddress = async(req,res)=>{
    try {
        const addressId = req.query.id;
        const userId = req.session.user;

        if (!addressId) {
            return res.status(400).json({ success: false, message: "Address ID is required" });
        }

        // Find address document for the specific user
        const findAddress = await Address.findOne({
            userId: userId,
            "address._id": addressId
        });

        if(!findAddress){
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        // Verify the address belongs to the user
        const addressBelongsToUser = findAddress.address.some(addr => addr._id.toString() === addressId);
        if (!addressBelongsToUser) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this address" });
        }

        const result = await Address.updateOne(
            {
                userId: userId,
                "address._id": addressId
            },
            {
                $pull: {
                    address: {
                        _id: addressId
                    }
                }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ success: false, message: "Address not found or already deleted" });
        }

        res.redirect("/userProfile#address");

    } catch (error) {
        console.error("Error in delete address:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}











module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    addAddress,
    viewAddresses,
    postAddAddress,
    editAddress,
    updateAddress,
    deleteAddress,
    
};