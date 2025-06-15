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
      return res.json({
        success: false,
        message: "Please provide both email and password",
      });
    }

    console.log("Admin Login Attempt for:", email);
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      console.log("Admin not found or not an admin account.");
      return res.json({
        success: false,
        message: "Invalid email or not an admin account",
      });
    }

    if (admin.isBlocked) {
      console.log("Admin account is blocked");
      return res.json({
        success: false,
        message: "This admin account has been blocked",
      });
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
      lastActivity: Date.now(),
    };

    // Save session explicitly and wait for it to complete
    await new Promise((resolve) => req.session.save(resolve));
    console.log("Admin Logged In:", req.session.admin);

    return res.json({ success: true, redirect: "/admin/dashboard" });
  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "An error occurred. Please try again.",
      });
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
    const [totalOrders, totalRevenueAgg, activeCustomers, productsSoldAgg] =
      await Promise.all([
        Order.countDocuments(),
        Order.aggregate([
          { $match: { status: { $in: ["Delivered", "Returned"] } } },
          {
            $group: {
              _id: null,
              sum: { $sum: { $ifNull: ["$totalPrice", 0] } },
            },
          },
        ]),
        User.countDocuments({
        isAdmin: false,
        isBlocked: false
        }),
        Order.aggregate([
          { $match: { status: { $in: ["Delivered", "Returned"] } } },
          { $unwind: "$orderedItems" },
          {
            $group: {
              _id: null,
              count: { $sum: { $ifNull: ["$orderedItems.quantity", 0] } },
            },
          },
        ]),
      ]);

    const totalRevenue = totalRevenueAgg[0]?.sum || 0;
    const productsSold = productsSoldAgg[0]?.count || 0;
     
      
    res.render("adminDashboard", {
      totalRevenue,
      totalOrders,
      activeCustomers,
      productsSold,
    });
  } catch (error) {
    console.error("Error Rendering Dashboard:", error);
    return res.redirect("/pageerror");
  }
};

// Enhanced Dashboard Data API - FIXED VERSION
const getDashboardData = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log("Fetching dashboard data...");

    // Basic Statistics with Promise.all for better performance
    const [totalOrders, totalRevenueAgg, activeCustomers, productsSoldAgg] =
      await Promise.all([
        Order.countDocuments(),
        Order.aggregate([
          { $match: { status: { $in: ["Delivered", "Returned"] } } },
          {
            $group: {
              _id: null,
              sum: { $sum: { $ifNull: ["$totalPrice", 0] } },
            },
          },
        ]),
        User.countDocuments({
          isAdmin: false,
          isBlocked: false
        }),
        Order.aggregate([
          { $match: { status: { $in: ["Delivered", "Returned"] } } },
          { $unwind: "$orderedItems" },
          {
            $group: {
              _id: null,
              count: { $sum: { $ifNull: ["$orderedItems.quantity", 0] } },
            },
          },
        ]),
      ]);

    const totalRevenue = totalRevenueAgg[0]?.sum || 0;
    const productsSold = productsSoldAgg[0]?.count || 0;

    // FIXED: Daily Sales Chart Data - Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const salesChartData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: thirtyDaysAgo },
          status: { $in: ["Delivered", "Returned"] },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdOn" },
          },
          dailyTotal: { $sum: "$totalPrice" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing dates with zero values for daily chart
    const filledSalesData = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0); // Start of day
      const dateStr = date.toISOString().split('T')[0];

      const existingData = salesChartData.find(item => item._id === dateStr);
      filledSalesData.push({
        x: dateStr,
        y: existingData ? existingData.dailyTotal : 0,
        orderCount: existingData ? existingData.orderCount : 0,
      });
    }

    // FIXED: Weekly Data (Last 12 weeks)
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    twelveWeeksAgo.setHours(0, 0, 0, 0);

    const weeklyData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: twelveWeeksAgo },
          status: { $in: ["Delivered", "Returned"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdOn" },
            week: { $week: "$createdOn" },
          },
          y: { $sum: "$totalPrice" },
          orderCount: { $sum: 1 },
        },
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
                  else: { $toString: "$_id.week" },
                },
              },
            ],
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.week": 1 } },
      {
        $project: {
          x: 1,
          y: 1,
          orderCount: 1,
          _id: 0,
        },
      },
    ]);

    // Fill in missing weeks with zero values
    const filledWeeklyData = [];
    const currentWeek = getWeekNumber(today);
    const weekYear = today.getFullYear();

    for (let i = 11; i >= 0; i--) {
      const weekDate = new Date(today);
      weekDate.setDate(weekDate.getDate() - (i * 7));
      const weekNum = getWeekNumber(weekDate);
      const year = weekDate.getFullYear();
      const weekKey = `${year}-W${weekNum.toString().padStart(2, '0')}`;

      const existingData = weeklyData.find(item => item.x === weekKey);
      filledWeeklyData.push({
        x: weekKey,
        y: existingData ? existingData.y : 0,
        orderCount: existingData ? existingData.orderCount : 0,
      });
    }

    // FIXED: Monthly Data (Last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: twelveMonthsAgo },
          status: { $in: ["Delivered", "Returned"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdOn" },
            month: { $month: "$createdOn" },
          },
          y: { $sum: "$totalPrice" },
          orderCount: { $sum: 1 },
        },
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
                  else: { $toString: "$_id.month" },
                },
              },
            ],
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      {
        $project: {
          x: 1,
          y: 1,
          orderCount: 1,
          _id: 0,
        },
      },
    ]);

    // Fill in missing months with zero values
    const filledMonthlyData = [];
    const currentMonth = today.getMonth() + 1;
    const monthYear = today.getFullYear();

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(today);
      monthDate.setMonth(monthDate.getMonth() - i);
      const month = monthDate.getMonth() + 1;
      const year = monthDate.getFullYear();
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

      const existingData = monthlyData.find(item => item.x === monthKey);
      filledMonthlyData.push({
        x: monthKey,
        y: existingData ? existingData.y : 0,
        orderCount: existingData ? existingData.orderCount : 0,
      });
    }

    // FIXED: Yearly Data (Last 5 years)
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    fiveYearsAgo.setHours(0, 0, 0, 0);

    const yearlyData = await Order.aggregate([
      {
        $match: {
          createdOn: { $gte: fiveYearsAgo },
          status: { $in: ["Delivered", "Returned"] },
        },
      },
      {
        $group: {
          _id: { $year: "$createdOn" },
          y: { $sum: "$totalPrice" },
          orderCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          x: { $toString: "$_id" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          x: 1,
          y: 1,
          orderCount: 1,
          _id: 0,
        },
      },
    ]);

    // Fill in missing years with zero values
    const filledYearlyData = [];
    const yearYear = today.getFullYear();

    for (let i = 4; i >= 0; i--) {
      const year = yearYear - i;
      const yearKey = year.toString();

      const existingData = yearlyData.find(item => item.x === yearKey);
      filledYearlyData.push({
        x: yearKey,
        y: existingData ? existingData.y : 0,
        orderCount: existingData ? existingData.orderCount : 0,
      });
    }

    // Get top products, categories, and brands
    const [topProducts, topCategories, topBrands] = await Promise.all([
      getFallbackProducts(),
      getFallbackCategories(),
      getFallbackBrands()
    ]);

    return res.json({
      success: true,
      totalRevenue,
      totalOrders,
      activeCustomers,
      productsSold,
      salesChartData: filledSalesData,
      weeklyData: filledWeeklyData,
      monthlyData: filledMonthlyData,
      yearlyData: filledYearlyData,
      topProducts,
      topCategories,
      topBrands,
    });
  } catch (error) {
    console.error("getDashboardData error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data",
      error: error.message,
    });
  }
};

// Helper function to get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Get fallback products data
const getFallbackProducts = async () => {
  try {
    const products = await Product.find({ isBlocked: false })
      .sort({ quantity: -1 })
      .limit(10)
      .select('productName quantity regularPrice salePrice')
      .lean();

    return products.map(product => ({
      name: product.productName,
      sold: product.quantity,
      revenue: product.salePrice * product.quantity
    }));
  } catch (error) {
    console.error('Error getting fallback products:', error);
    return [];
  }
};

// Get fallback categories data
const getFallbackCategories = async () => {
  try {
    // First try to get categories with actual sales data
    const categoriesWithSales = await Order.aggregate([
      { $match: { status: { $in: ["Delivered", "Returned"] } } },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category._id",
          name: { $first: "$category.name" },
          sold: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } }
        }
      },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    if (categoriesWithSales.length > 0) {
      return categoriesWithSales;
    }

    // If no sales data, get top categories by product count
    const categories = await Category.aggregate([
      { $match: { isListed: true } },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "category",
          as: "products"
        }
      },
      {
        $project: {
          name: 1,
          sold: { $size: "$products" },
          revenue: 0
        }
      },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    return categories;
  } catch (error) {
    console.error('Error getting fallback categories:', error);
    return [];
  }
};

// Get fallback brands data
const getFallbackBrands = async () => {
  try {
    // First try to get brands with actual sales data
    const brandsWithSales = await Order.aggregate([
      { $match: { status: { $in: ["Delivered", "Returned"] } } },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "brands",
          localField: "product.brand",
          foreignField: "_id",
          as: "brand"
        }
      },
      { $unwind: "$brand" },
      {
        $group: {
          _id: "$brand._id",
          name: { $first: "$brand.brandName" },
          sold: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } }
        }
      },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    if (brandsWithSales.length > 0) {
      return brandsWithSales;
    }

    // If no sales data, get top brands by product count
    const brands = await Brand.aggregate([
      { $match: { isBlocked: false } },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "brand",
          as: "products"
        }
      },
      {
        $project: {
          name: "$brandName",
          sold: { $size: "$products" },
          revenue: 0
        }
      },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    return brands;
  } catch (error) {
    console.error('Error getting fallback brands:', error);
    return [];
  }
};

// Admin Logout
const logout = async (req, res) => {
  try {
    if (req.session) {
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
    if (req.xhr || req.headers.accept.indexOf("json") > -1) {
      return res
        .status(401)
        .json({ success: false, message: "Session expired" });
    }
    return res.redirect("/admin/login");
  }

  req.session.admin.lastActivity = Date.now();
  next();
};

// Get recent orders for dashboard
const getRecentOrders = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const recentOrders = await Order.find()
      .populate("userId", "name email")
      .sort({ orderDate: -1 })
      .limit(10)
      .select("orderId totalAmount status orderDate userId")
      .lean();

    return res.json({
      success: true,
      orders: recentOrders,
    });
  } catch (error) {
    console.error("getRecentOrders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent orders",
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
      quantity: { $lt: 10 },
      isBlocked: false,
    })
      .populate("category", "name")
      .populate("brand", "brandName")
      .select("productName quantity regularPrice salePrice category brand")
      .sort({ quantity: 1 })
      .limit(20)
      .lean();

    return res.json({
      success: true,
      products: lowStockProducts,
    });
  } catch (error) {
    console.error("getLowStockProducts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch low stock products",
    });
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  getDashboardData,
  pageerror,
  logout,
  validateAdminSession,
  getRecentOrders,
  getLowStockProducts,
};