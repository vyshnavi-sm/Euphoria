const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) return res.redirect("/admin/login");

    req.session.admin.lastActivity = Date.now();
    await new Promise((resolve) => req.session.save(resolve));

    const [totalOrders, revenueAgg, activeCustomers, productsSoldAgg] =
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
        User.countDocuments({ isAdmin: false, isBlocked: false }),
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

    res.render("adminDashboard", {
      totalRevenue: revenueAgg[0]?.sum || 0,
      totalOrders,
      activeCustomers,
      productsSold: productsSoldAgg[0]?.count || 0,
    });
  } catch (error) {
    console.error("Error Rendering Dashboard:", error);
    res.redirect("/pageerror");
  }
};

const getRecentOrders = async (req, res) => {
  try {
    if (!req.session.admin)
      return res
        .status(STATUS_CODE.UNAUTHORIZED)
        .json({ success: false, message: "Unauthorized" });

    const recentOrders = await Order.find()
      .populate("userId", "name email")
      .sort({ orderDate: -1 })
      .limit(10)
      .select("orderId totalAmount status orderDate userId")
      .lean();

    res.json({ success: true, orders: recentOrders });
  } catch (error) {
    console.error("getRecentOrders error:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to fetch recent orders" });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    if (!req.session.admin)
      return res
        .status(STATUS_CODE.UNAUTHORIZED)
        .json({ success: false, message: "Unauthorized" });

    const products = await Product.find({
      quantity: { $lt: 10 },
      isBlocked: false,
    })
      .populate("category", "name")
      .populate("brand", "brandName")
      .select("productName quantity regularPrice salePrice category brand")
      .sort({ quantity: 1 })
      .limit(20)
      .lean();

    res.json({ success: true, products });
  } catch (error) {
    console.error("getLowStockProducts error:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Failed to fetch low stock products" });
  }
};

module.exports = {
  loadDashboard,
  getRecentOrders,
  getLowStockProducts,
};
