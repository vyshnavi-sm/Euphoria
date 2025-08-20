const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const { CategoryOffer } = require("../../models/offerSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.params.id;
    const product = await Product.findById(productId)
      .populate("category")
      .populate("brand");

    const currentDate = new Date();
    const categoryOffer = await CategoryOffer.findOne({
      category: product.category._id,
      isActive: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    });

    const productOffer = product.offerDiscount || 0;
    const categoryDiscount = categoryOffer
      ? categoryOffer.discountPercentage
      : 0;

    const totalOffer = Math.max(productOffer, categoryDiscount);

    let relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isBlocked: false,
      quantity: { $gt: 0 },
    })
      .populate("brand")
      .limit(4);

    if (relatedProducts.length < 4) {
      const additionalProducts = await Product.find({
        _id: { $ne: productId },
        isBlocked: false,
        quantity: { $gt: 0 },
        category: { $ne: product.category._id },
      })
        .populate("brand")
        .sort({ createdAt: -1 })
        .limit(4 - relatedProducts.length);

      relatedProducts = [...relatedProducts, ...additionalProducts];
    }

    res.render("product-details", {
      user: userData,
      product: product,
      quantity: product.quantity,
      totalOffer: totalOffer,
      category: product.category,
      relatedProducts: relatedProducts,
    });
  } catch (error) {
    console.error("Error for fetching product details", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  productDetails,
};
