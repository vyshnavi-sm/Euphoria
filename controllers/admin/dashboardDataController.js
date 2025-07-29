const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const getDashboardData = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(STATUS_CODE.UNAUTHORIZED).json({ success: false, message: "Unauthorized" });
    }

    console.log("Fetching dashboard data...");

    const fillDataPoints = (data, periods, getKey, getDate) => {
      const filled = [];
      const today = new Date();
      for (let i = periods - 1; i >= 0; i--) {
        const date = getDate(today, i);
        const key = getKey(date);
        const existing = data.find(item => item._id === key || item.x === key);
        filled.push({
          x: key,
          y: existing ? (existing.y || existing.dailyTotal || 0) : 0,
          orderCount: existing ? (existing.orderCount || 0) : 0,
        });
      }
      return filled;
    };

    const createAggregationPipeline = (matchDate, groupBy) => [
      { $match: { createdOn: { $gte: matchDate }, status: { $in: ["Delivered", "Returned"] } } },
      { $group: { _id: groupBy, y: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ];

    const [totalOrders, totalRevenueAgg, activeCustomers, productsSoldAgg] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([{ $match: { status: { $in: ["Delivered", "Returned"] } } }, { $group: { _id: null, sum: { $sum: { $ifNull: ["$totalPrice", 0] } } } }]),
      User.countDocuments({ isAdmin: false, isBlocked: false }),
      Order.aggregate([{ $match: { status: { $in: ["Delivered", "Returned"] } } }, { $unwind: "$orderedItems" }, { $group: { _id: null, count: { $sum: { $ifNull: ["$orderedItems.quantity", 0] } } } }])
    ]);

    const totalRevenue = totalRevenueAgg[0]?.sum || 0;
    const productsSold = productsSoldAgg[0]?.count || 0;

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twelveWeeksAgo = new Date(today.getTime() - 84 * 24 * 60 * 60 * 1000);
    const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    const fiveYearsAgo = new Date(today.getFullYear() - 5, 0, 1);

    const [salesChartData, weeklyData, monthlyData, yearlyData] = await Promise.all([
      Order.aggregate([
        { $match: { createdOn: { $gte: thirtyDaysAgo }, status: { $in: ["Delivered", "Returned"] } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdOn" } }, y: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
        { $addFields: { x: "$_id" } },
        { $sort: { _id: 1 } },
        { $project: { x: 1, y: 1, orderCount: 1, _id: 0 } }
      ]),
      Order.aggregate([
        { $match: { createdOn: { $gte: twelveWeeksAgo }, status: { $in: ["Delivered", "Returned"] } } },
        { $group: { _id: { year: { $year: "$createdOn" }, week: { $week: "$createdOn" } }, y: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
        { $addFields: { x: { $concat: [{ $toString: "$_id.year" }, "-W", { $cond: { if: { $lt: ["$_id.week", 10] }, then: { $concat: ["0", { $toString: "$_id.week" }] }, else: { $toString: "$_id.week" } } }] } } },
        { $sort: { "_id.year": 1, "_id.week": 1 } },
        { $project: { x: 1, y: 1, orderCount: 1, _id: 0 } }
      ]),
      Order.aggregate([
        { $match: { createdOn: { $gte: twelveMonthsAgo }, status: { $in: ["Delivered", "Returned"] } } },
        { $group: { _id: { year: { $year: "$createdOn" }, month: { $month: "$createdOn" } }, y: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
        { $addFields: { x: { $concat: [{ $toString: "$_id.year" }, "-", { $cond: { if: { $lt: ["$_id.month", 10] }, then: { $concat: ["0", { $toString: "$_id.month" }] }, else: { $toString: "$_id.month" } } }] } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $project: { x: 1, y: 1, orderCount: 1, _id: 0 } }
      ]),
      Order.aggregate([
        { $match: { createdOn: { $gte: fiveYearsAgo }, status: { $in: ["Delivered", "Returned"] } } },
        { $group: { _id: { $year: "$createdOn" }, y: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
        { $addFields: { x: { $toString: "$_id" } } },
        { $sort: { _id: 1 } },
        { $project: { x: 1, y: 1, orderCount: 1, _id: 0 } }
      ])
    ]);

    const filledSalesData = fillDataPoints(salesChartData, 30, 
      date => date.toISOString().split('T')[0],
      (today, i) => { const d = new Date(today); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); return d; }
    );

    const filledWeeklyData = fillDataPoints(weeklyData, 12,
      date => `${date.getFullYear()}-W${getWeekNumber(date).toString().padStart(2, '0')}`,
      (today, i) => { const d = new Date(today); d.setDate(d.getDate() - (i * 7)); return d; }
    );

    const filledMonthlyData = fillDataPoints(monthlyData, 12,
      date => `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`,
      (today, i) => { const d = new Date(today); d.setMonth(d.getMonth() - i); return d; }
    );

    const filledYearlyData = fillDataPoints(yearlyData, 5,
      date => date.getFullYear().toString(),
      (today, i) => { const d = new Date(today); d.setFullYear(d.getFullYear() - i); return d; }
    );

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
    res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to load dashboard data",
      error: error.message,
    });
  }
};

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

const getFallbackProducts = async () => {
  try {
    const productsWithSales = await Order.aggregate([
      { $match: { status: { $in: ["Delivered", "Returned"] } } },
      { $unwind: "$orderedItems" },
      { $group: {
          _id: "$orderedItems.product",
          sold: { $sum: "$orderedItems.quantity" },
          revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } }
      }},
      { $sort: { sold: -1 } },
      { $limit: 10 },
      { $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
      }},
      { $unwind: "$product" },
      { $project: {
          name: "$product.productName",
          sold: 1,
          revenue: 1,
          unitPrice: "$product.salePrice"
      }}
    ]);
    return productsWithSales;
  } catch (error) {
    console.error('Error getting fallback products:', error);
    return [];
  }
};

const getFallbackCategories = async () => {
  try {
    const categoriesWithSales = await Order.aggregate([
      { $match: { status: { $in: ["Delivered", "Returned"] } } },
      { $unwind: "$orderedItems" },
      { $lookup: { from: "products", localField: "orderedItems.product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      { $group: { _id: "$category._id", name: { $first: "$category.name" }, sold: { $sum: "$orderedItems.quantity" }, revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } } } },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    if (categoriesWithSales.length > 0) return categoriesWithSales;

    return await Category.aggregate([
      { $match: { isListed: true } },
      { $lookup: { from: "products", localField: "_id", foreignField: "category", as: "products" } },
      { $project: { name: 1, sold: { $size: "$products" }, revenue: 0 } },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);
  } catch (error) {
    console.error('Error getting fallback categories:', error);
    return [];
  }
};

const getFallbackBrands = async () => {
  try {
    const brandsWithSales = await Order.aggregate([
      { $match: { status: { $in: ["Delivered", "Returned"] } } },
      { $unwind: "$orderedItems" },
      { $lookup: { from: "products", localField: "orderedItems.product", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $lookup: { from: "brands", localField: "product.brand", foreignField: "_id", as: "brand" } },
      { $unwind: "$brand" },
      { $group: { _id: "$brand._id", name: { $first: "$brand.brandName" }, sold: { $sum: "$orderedItems.quantity" }, revenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } } } },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);

    if (brandsWithSales.length > 0) return brandsWithSales;

    return await Brand.aggregate([
      { $match: { isBlocked: false } },
      { $lookup: { from: "products", localField: "_id", foreignField: "brand", as: "products" } },
      { $project: { name: "$brandName", sold: { $size: "$products" }, revenue: 0 } },
      { $sort: { sold: -1 } },
      { $limit: 10 }
    ]);
  } catch (error) {
    console.error('Error getting fallback brands:', error);
    return [];
  }
};

module.exports = { getDashboardData };