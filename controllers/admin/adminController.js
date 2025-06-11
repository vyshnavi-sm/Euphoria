const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");

const pageerror = async (req, res) => {
    res.render("pageerror");
};

// Load Admin Login Page
const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("adminLogin", { message: null });
};

// Admin Login Authentication
const login = async (req, res) => {
    try {
        console.log("Login Request Body:", req.body); 

        const { email, password } = req.body;

        if (!email || !password) {
            console.log("Missing email or password");
            return res.json({ success: false, message: "Please provide both email and password" });
        }

        console.log("Admin Login Attempt for:", email);
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            console.log("Admin not found or not an admin account.");
            return res.json({ success: false, message: "Invalid email or not an admin account" });
        }

        if (admin.isBlocked) {
            console.log("Admin account is blocked");
            return res.json({ success: false, message: "This admin account has been blocked" });
        }

        // Compare Password
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            console.log("Incorrect password");
            return res.json({ success: false, message: "Incorrect password" });
        }

        // Clear any existing session data
        if (req.session) {
            delete req.session.admin;
        }

        // Set admin session with more details
        req.session.admin = {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            lastActivity: Date.now()
        };

        // Save session explicitly and wait for it to complete
        await new Promise((resolve) => req.session.save(resolve));
        console.log("Admin Logged In:", req.session.admin);
        
        return res.json({ success: true, redirect: "/admin/dashboard" });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "An error occurred. Please try again." });
    }
};

// Load Admin Dashboard
const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        req.session.admin.lastActivity = Date.now();
        await new Promise((resolve) => req.session.save(resolve));

        // Fetch basic stats for server-side rendering
        const [totalOrders, totalRevenueAgg, activeCustomers, productsSoldAgg] = await Promise.all([
            Order.countDocuments(),
            Order.aggregate([
                { $match: { status: { $in: ['delivered', 'completed'] } } },
                { $group: { _id: null, sum: { $sum: '$totalAmount' } } }
            ]),
            User.countDocuments({
                isActive: true,
                isAdmin: false,
                isBlocked: false
            }),
            Order.aggregate([
                { $match: { status: { $in: ['delivered', 'completed'] } } },
                { $unwind: '$items' },
                { $group: { _id: null, count: { $sum: '$items.quantity' } } }
            ])
        ]);

        const totalRevenue = totalRevenueAgg[0]?.sum || 0;
        const productsSold = productsSoldAgg[0]?.count || 0;

        res.render("adminDashboard", {
            totalRevenue,
            totalOrders,
            activeCustomers,
            productsSold
        });

    } catch (error) {
        console.error("Error Rendering Dashboard:", error);
        return res.redirect("/pageerror");
    }
};

// Enhanced Dashboard Data API
const getDashboardData = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        console.log("Fetching dashboard data...");

        // Basic Statistics with Promise.all for better performance
        const [
            totalOrders,
            totalRevenueAgg,
            activeCustomers,
            productsSoldAgg
        ] = await Promise.all([
            Order.countDocuments(),
            Order.aggregate([
                { $match: { status: { $in: ['delivered', 'completed'] } } },
                { $group: { _id: null, sum: { $sum: '$totalAmount' } } }
            ]),
            User.countDocuments({ 
                isActive: true, 
                isAdmin: false,
                isBlocked: false 
            }),
            Order.aggregate([
                { $match: { status: { $in: ['delivered', 'completed'] } } },
                { $unwind: '$items' },
                { $group: { _id: null, count: { $sum: '$items.quantity' } } }
            ])
        ]);

        const totalRevenue = totalRevenueAgg[0]?.sum || 0;
        const productsSold = productsSoldAgg[0]?.count || 0;

        // Sales Chart Data - Daily (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const salesChartData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: thirtyDaysAgo },
                    status: { $in: ['delivered', 'completed'] }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$orderDate" }
                    },
                    dailyTotal: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Fill in missing dates with zero values
        const filledSalesData = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const existingData = salesChartData.find(item => item._id === dateStr);
            filledSalesData.push({
                _id: dateStr,
                dailyTotal: existingData ? existingData.dailyTotal : 0,
                orderCount: existingData ? existingData.orderCount : 0
            });
        }

        // Weekly Data (Last 12 weeks)
        const twelveWeeksAgo = new Date();
        twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

        const weeklyData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: twelveWeeksAgo },
                    status: { $in: ['delivered', 'completed'] }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$orderDate" },
                        week: { $week: "$orderDate" }
                    },
                    y: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $addFields: {
                    x: {
                        $concat: [
                            { $toString: "$_id.year" },
                            "-W",
                            {
                                $cond: {
                                    if: { $lt: ["$_id.week", 10] },
                                    then: { $concat: ["0", { $toString: "$_id.week" }] },
                                    else: { $toString: "$_id.week" }
                                }
                            }
                        ]
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.week": 1 } }
        ]);

        // Monthly Data (Last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const monthlyData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: twelveMonthsAgo },
                    status: { $in: ['delivered', 'completed'] }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$orderDate" },
                        month: { $month: "$orderDate" }
                    },
                    y: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $addFields: {
                    x: {
                        $concat: [
                            { $toString: "$_id.year" },
                            "-",
                            {
                                $cond: {
                                    if: { $lt: ["$_id.month", 10] },
                                    then: { $concat: ["0", { $toString: "$_id.month" }] },
                                    else: { $toString: "$_id.month" }
                                }
                            }
                        ]
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Yearly Data (Last 5 years)
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

        const yearlyData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: fiveYearsAgo },
                    status: { $in: ['delivered', 'completed'] }
                }
            },
            {
                $group: {
                    _id: { $year: "$orderDate" },
                    y: { $sum: '$totalAmount' },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $addFields: {
                    x: { $toString: "$_id" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Enhanced Top 10 Products with better error handling
        const topProducts = await Order.aggregate([
            { $match: { status: { $in: ['delivered', 'completed'] } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    sold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $match: {
                    'product.0': { $exists: true } // Only include if product exists
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    name: { 
                        $ifNull: ['$product.productName', 'Unknown Product'] 
                    },
                    sold: 1,
                    revenue: 1,
                    isActive: '$product.isBlocked'
                }
            },
            { $sort: { sold: -1 } },
            { $limit: 10 }
        ]);

        // Enhanced Top 10 Categories
        const topCategories = await Order.aggregate([
            { $match: { status: { $in: ['delivered', 'completed'] } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $match: {
                    'product.0': { $exists: true }
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    sold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            {
                $match: {
                    'category.0': { $exists: true }
                }
            },
            { $unwind: '$category' },
            {
                $project: {
                    name: { 
                        $ifNull: ['$category.name', 'Unknown Category'] 
                    },
                    sold: 1,
                    revenue: 1,
                    isListed: '$category.isListed'
                }
            },
            { $sort: { sold: -1 } },
            { $limit: 10 }
        ]);

        // Enhanced Top 10 Brands
        const topBrands = await Order.aggregate([
            { $match: { status: { $in: ['delivered', 'completed'] } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {
                $match: {
                    'product.0': { $exists: true }
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.brand',
                    sold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            {
                $match: {
                    'brand.0': { $exists: true }
                }
            },
            { $unwind: '$brand' },
            {
                $project: {
                    name: { 
                        $ifNull: ['$brand.brandName', 'Unknown Brand'] 
                    },
                    sold: 1,
                    revenue: 1,
                    isBlocked: '$brand.isBlocked'
                }
            },
            { $sort: { sold: -1 } },
            { $limit: 10 }
        ]);

        // Add fallback data if no orders exist
        const fallbackData = {
            topProducts: topProducts.length === 0 ? await getFallbackProducts() : topProducts,
            topCategories: topCategories.length === 0 ? await getFallbackCategories() : topCategories,
            topBrands: topBrands.length === 0 ? await getFallbackBrands() : topBrands
        };

        console.log("Dashboard data compiled successfully");
        console.log(`Found ${topProducts.length} products, ${topCategories.length} categories, ${topBrands.length} brands`);

        return res.json({
            success: true,
            totalRevenue,
            totalOrders,
            activeCustomers,
            productsSold,
            salesChartData: filledSalesData,
            weeklyData,
            monthlyData,
            yearlyData,
            topProducts: fallbackData.topProducts,
            topCategories: fallbackData.topCategories,
            topBrands: fallbackData.topBrands
        });

    } catch (error) {
        console.error('getDashboardData error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to load dashboard data',
            error: error.message 
        });
    }
};

// Fallback functions to get basic data when no orders exist
const getFallbackProducts = async () => {
    try {
        const products = await Product.find({ isBlocked: false })
            .limit(10)
            .select('productName regularPrice salePrice')
            .lean();
        
        return products.map((product, index) => ({
            name: product.productName,
            sold: Math.floor(Math.random() * 50) + 1, // Random for demo
            revenue: (product.salePrice || product.regularPrice) * (Math.floor(Math.random() * 50) + 1)
        }));
    } catch (error) {
        console.error('Error getting fallback products:', error);
        return [];
    }
};

const getFallbackCategories = async () => {
    try {
        const categories = await Category.find({ isListed: true })
            .limit(10)
            .select('name')
            .lean();
        
        return categories.map((category, index) => ({
            name: category.name,
            sold: Math.floor(Math.random() * 100) + 10,
            revenue: Math.floor(Math.random() * 50000) + 5000
        }));
    } catch (error) {
        console.error('Error getting fallback categories:', error);
        return [];
    }
};

const getFallbackBrands = async () => {
    try {
        const brands = await Brand.find({ isBlocked: false })
            .limit(10)
            .select('brandName')
            .lean();
        
        return brands.map((brand, index) => ({
            name: brand.brandName,
            sold: Math.floor(Math.random() * 80) + 5,
            revenue: Math.floor(Math.random() * 40000) + 3000
        }));
    } catch (error) {
        console.error('Error getting fallback brands:', error);
        return [];
    }
};

// Generate Ledger Report
const generateLedger = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { period } = req.body;
        console.log("Generating ledger for period:", period);

        let startDate, endDate;
        const now = new Date();

        // Calculate date range based on period
        switch (period) {
            case 'current_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'quarter':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        // Generate comprehensive ledger data
        const ledgerData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: startDate, $lte: endDate },
                    status: { $in: ['delivered', 'completed'] }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$orderDate" }
                    },
                    totalRevenue: { $sum: '$totalAmount' },
                    totalOrders: { $sum: 1 },
                    averageOrderValue: { $avg: '$totalAmount' },
                    orders: { $push: "$$ROOT" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const summary = {
            totalRevenue: ledgerData.reduce((sum, day) => sum + day.totalRevenue, 0),
            totalOrders: ledgerData.reduce((sum, day) => sum + day.totalOrders, 0),
            totalDays: ledgerData.length,
            period: period.replace('_', ' '),
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };

        summary.averageOrderValue = summary.totalOrders > 0 ? summary.totalRevenue / summary.totalOrders : 0;
        summary.averageDailyRevenue = summary.totalDays > 0 ? summary.totalRevenue / summary.totalDays : 0;

        console.log(`Ledger generated: ${summary.totalOrders} orders, ₹${summary.totalRevenue} revenue`);

        return res.json({
            success: true,
            message: `Ledger generated successfully for ${summary.period}`,
            data: {
                summary,
                dailyBreakdown: ledgerData
            }
        });

    } catch (error) {
        console.error('generateLedger error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate ledger report',
            error: error.message 
        });
    }
};

// Admin Logout
const logout = async (req, res) => {
    try {
        if (req.session) {
            // Clear only admin session data
            delete req.session.admin;
            req.session.save((err) => {
                if (err) {
                    console.error("Error saving session:", err);
                    return res.redirect("/pageerror");
                }
                res.redirect("/admin/login");
            });
        } else {
            res.redirect("/admin/login");
        }
    } catch (error) {
        console.error("Unexpected error during logout:", error);
        res.redirect("/pageerror");
    }
};

// Session validation middleware
const validateAdminSession = (req, res, next) => {
    if (!req.session.admin) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ success: false, message: "Session expired" });
        }
        return res.redirect("/admin/login");
    }
    
    // Update last activity
    req.session.admin.lastActivity = Date.now();
    next();
};

// Additional utility functions for better dashboard management

// Get recent orders for dashboard
const getRecentOrders = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const recentOrders = await Order.find()
            .populate('userId', 'name email')
            .sort({ orderDate: -1 })
            .limit(10)
            .select('orderId totalAmount status orderDate userId')
            .lean();

        return res.json({
            success: true,
            orders: recentOrders
        });

    } catch (error) {
        console.error('getRecentOrders error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch recent orders' 
        });
    }
};

// Get low stock products
const getLowStockProducts = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const lowStockProducts = await Product.find({
            quantity: { $lt: 10 }, // Products with less than 10 in stock
            isBlocked: false
        })
        .populate('category', 'name')
        .populate('brand', 'brandName')
        .select('productName quantity regularPrice salePrice category brand')
        .sort({ quantity: 1 })
        .limit(20)
        .lean();

        return res.json({
            success: true,
            products: lowStockProducts
        });

    } catch (error) {
        console.error('getLowStockProducts error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch low stock products' 
        });
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    getDashboardData,
    generateLedger,
    pageerror,
    logout,
    validateAdminSession,
    getRecentOrders,
    getLowStockProducts
};