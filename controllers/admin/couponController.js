const Coupon = require("../../models/couponSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const loadCouponPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const totalCoupons = await Coupon.countDocuments();
    const totalPages = Math.ceil(totalCoupons / limit);
    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.render("admin/coupons", {
      title: "Coupon Management",
      coupons,
      currentPage: page,
      totalPages,
      success_msg: req.flash("success"),
      error_msg: req.flash("error"),
    });
  } catch (error) {
    console.error("Error loading coupon page:", error);
    req.flash("error", "Failed to load coupons");
    res.redirect("/admin/dashboard");
  }
};

const createCoupon = async (req, res) => {
  try {
    console.log("Received coupon creation request, req.body:", req.body);
    const {
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
    } = req.body;

    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      req.flash("error", "Please fill in all required fields.");
      return res.redirect("/admin/coupons");
    }

    if (
      discountType !== "percentage" ||
      discountValue < 1 ||
      discountValue > 100
    ) {
      req.flash(
        "error",
        "Discount value must be a percentage between 1 and 100."
      );
      return res.redirect("/admin/coupons");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start >= end) {
      req.flash("error", "End date must be after start date.");
      return res.redirect("/admin/coupons");
    }

    const existingCoupon = await Coupon.findOne({ code: code });
    if (existingCoupon) {
      req.flash("error", "Coupon code already exists.");
      return res.redirect("/admin/coupons");
    }

    const couponData = {
      code: code.toUpperCase(),
      discountType,
      discountValue: parseFloat(discountValue),
      minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : 0,
      maxDiscountAmount: maxDiscountAmount
        ? parseFloat(maxDiscountAmount)
        : null,
      startDate: start,
      endDate: end,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
    };

    const newCoupon = new Coupon(couponData);
    await newCoupon.save();

    req.flash("success", "Coupon created successfully!");
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error creating coupon:", error);
    req.flash("error", "Failed to create coupon.");
    res.redirect("/admin/coupons");
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCoupon = await Coupon.findByIdAndDelete(id);

    if (!deletedCoupon) {
      req.flash("error", "Coupon not found.");
      return res.redirect("/admin/coupons");
    }

    req.flash("success", "Coupon deleted successfully!");
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error deleting coupon:", error);
    req.flash("error", "Failed to delete coupon.");
    res.redirect("/admin/coupons");
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      req.flash("error", "Coupon not found.");
      return res.redirect("/admin/coupons");
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    req.flash(
      "success",
      `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully!`
    );
    res.redirect("/admin/coupons");
  } catch (error) {
    console.error("Error toggling coupon status:", error);
    req.flash("error", "Failed to toggle coupon status.");
    res.redirect("/admin/coupons");
  }
};

module.exports = {
  loadCouponPage,
  createCoupon,
  deleteCoupon,
  toggleCouponStatus,
};
