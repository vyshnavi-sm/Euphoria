const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
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
        const categories = await Category.find({ isListed: true })
            .sort({ createdAt: -1 })
            .limit(5);

        // Fetch the latest product for each category
        const categoryImages = {};
        for (const category of categories) {
            const latestProduct = await Product.findOne({
                category: category._id,
                isBlocked: false,
                quantity: { $gt: 0 }
            })
            .sort({ createdAt: -1 });
            if (latestProduct && latestProduct.productImage && latestProduct.productImage.length > 0) {
                categoryImages[category._id] = latestProduct.productImage[0];
            } else {
                categoryImages[category._id] = null;
            }
        }

        // Fetch 4 products for best seller section
        const bestSellerProducts = await Product.find({
            isBlocked: false,
            quantity: { $gt: 0 }
        })
        .sort({ createdAt: -1 })
        .limit(4);

        if (req.session.user) {
            const userData = await User.findById(req.session.user);
            return res.render("home", {
                user: userData,
                products: bestSellerProducts,
                categories: categories,
                categoryImages: categoryImages
            });
        } else {
            return res.render("home", {
                user: null,
                products: bestSellerProducts,
                categories: categories,
                categoryImages: categoryImages
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


const loadShoppingPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const sort = req.query.sort || '';

        // Build the query
        let query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Build the sort object
        let sortOptions = {};
        switch (sort) {
            case 'price_low_high':
                sortOptions = { salePrice: 1 };
                break;
            case 'price_high_low':
                sortOptions = { salePrice: -1 };
                break;
            case 'name_asc':
                sortOptions = { productName: 1 };
                break;
            case 'name_desc':
                sortOptions = { productName: -1 };
                break;
            case 'popularity':
                sortOptions = { views: -1 };
                break;
            case 'rating':
                sortOptions = { rating: -1 };
                break;
            case 'newest':
                sortOptions = { createdAt: -1 };
                break;
            case 'featured':
                sortOptions = { isFeatured: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 }; // Default sort by newest
        }

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch products with sorting
        const products = await Product.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .populate('category')
            .populate('brand');

        // Fetch categories and brands
        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        // Get user data if logged in
        let user = null;
        if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        res.render('user/shop', {
            products,
            categories,
            brands,
            currentPage: page,
            totalPages,
            search,
            sort,
            user // Pass the user data to the view
        });
    } catch (error) {
        console.error('Error loading shop page:', error);
        res.status(500).render('error', { message: 'Error loading shop page' });
    }
};


const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const categoryId = req.query.category;
        const brandId = req.query.brand;
        
        console.log("Filter request:", { categoryId, brandId }); // Debug log
        
        // Get all categories and brands for sidebar
        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Brand.find({ isBlocked: false }).lean();
        
        // Build the query
        let query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };
        
        // Add category filter if selected
        if (categoryId) {
            query.category = categoryId;
            console.log("Filtering by category:", categoryId); // Debug log
        }
        
        // Add brand filter if selected
        if (brandId) {
            query.brand = brandId;
            console.log("Filtering by brand:", brandId); // Debug log
        }
        
        console.log("Query:", JSON.stringify(query)); // Debug log
        
        // Get products with filters
        const products = await Product.find(query)
            .populate('category')
            .populate('brand')
            .lean();
            
        console.log(`Found ${products.length} products`);

        // If no products found, try to find products in the category or brand
        if (products.length === 0 && (categoryId || brandId)) {
            console.log("No products found with direct ID matching, trying to find products");
            const allProducts = await Product.find({
                isBlocked: false,
                quantity: { $gt: 0 }
            })
            .populate('category')
            .populate('brand')
            .lean();

            const filteredProducts = allProducts.filter(product => {
                if (categoryId && brandId) {
                    return product.category && product.brand && 
                           product.category._id.toString() === categoryId && 
                           product.brand._id.toString() === brandId;
                } else if (categoryId) {
                    return product.category && product.category._id.toString() === categoryId;
                } else if (brandId) {
                    return product.brand && product.brand._id.toString() === brandId;
                }
                return false;
            });

            console.log(`Found ${filteredProducts.length} products after filtering`);

            // Pagination
            const itemsPerPage = 9;
            const currentPage = parseInt(req.query.page) || 1;
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, filteredProducts.length);
            const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
            const currentProducts = filteredProducts.slice(startIndex, endIndex);
            
            return res.render("shop", {
                user: user ? await User.findOne({_id: user}).lean() : null,
                products: currentProducts,
                categories: categories,
                brands: brands,
                totalPages: totalPages,
                currentPage: currentPage,
                selectedCategory: categoryId,
                selectedBrand: brandId,
                search: req.query.search || ''
            });
        }

        // Standard pagination for when products are found
        const itemsPerPage = 9;
        const currentPage = parseInt(req.query.page) || 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, products.length);
        const totalPages = Math.ceil(products.length / itemsPerPage);
        const currentProducts = products.slice(startIndex, endIndex);
        
        res.render("shop", {
            user: user ? await User.findOne({_id: user}).lean() : null,
            products: currentProducts,
            categories: categories,
            brands: brands,
            totalPages: totalPages,
            currentPage: currentPage,
            selectedCategory: categoryId,
            selectedBrand: brandId,
            search: req.query.search || ''
        });
    } catch (error) {
        console.error("Error in filterProduct:", error);
        // Handle errors gracefully
        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Brand.find({ isBlocked: false }).lean();
        
        res.render("shop", {
            user: req.session.user ? await User.findOne({_id: req.session.user}).lean() : null,
            products: [],
            categories: categories,
            brands: brands,
            totalPages: 0,
            currentPage: 1,
            selectedCategory: req.query.category || null,
            selectedBrand: req.query.brand || null,
            search: req.query.search || '',
            errorMessage: "Error loading filtered products. Please try again."
        });
    }
};

const filterByPrice = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = user ? await User.findOne({_id: user}) : null;
        const brands = await Brand.find({isBlocked: false}).lean();
        const categories = await Category.find({isListed: true}).lean();

        let findProducts = await Product.find({
            salePrice: {$gt: req.query.gt, $lt: req.query.lt},
            isBlocked: false,
            quantity: {$gt: 0}
        }).lean();

        findProducts.sort((a, b) => {
            // Use createdAt if available, fallback to createdOn
            const dateA = a.createdAt || a.createdOn;
            const dateB = b.createdAt || b.createdOn;
            return new Date(dateB) - new Date(dateA);
        });

        let itemsPerPage = 9;  // Changed to match other functions
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex, endIndex);
        
        res.render("shop", {
            user: userData,
            products: currentProduct,
            categories: categories,
            brands: brands,
            totalPages,
            currentPage,
            search: req.query.search || '',  // Add this line to fix the error
            selectedCategory: null,
            selectedBrand: null
        });

    } catch (error) {
        console.error("Error in filterByPrice:", error);
        // Handle the error gracefully instead of redirecting
        const categories = await Category.find({isListed: true}).lean();
        const brands = await Brand.find({isBlocked: false}).lean();
        res.render("shop", {
            user: req.session.user ? await User.findOne({_id: req.session.user}) : null,
            products: [],
            categories: categories,
            brands: brands,
            totalPages: 0,
            currentPage: 1,
            search: '',
            selectedCategory: null,
            selectedBrand: null,
            errorMessage: "Error filtering by price. Please try again."
        });
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
    loadShoppingPage,
    filterProduct,
    filterByPrice,
}