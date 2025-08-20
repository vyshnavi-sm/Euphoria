const Brand = require("../../models/brandSchema");
const Coupon = require("../../models/couponSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";
    let query = {};
    if (search) {
      query.brandName = { $regex: search, $options: "i" };
    }
    const brandData = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalBrands = await Brand.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit);

    const error = req.query.error;
    const success = req.query.success;

    res.render("brands", {
      data: brandData,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      error: error,
      success: success,
      search: search,
    });
  } catch (error) {
    console.error("Error in getBrandPage:", error);
    res.redirect("/admin/brands?error=An error occurred while loading brands");
  }
};

const addBrand = async (req, res) => {
  try {
    const brand = req.body.name;
    const image = req.file;
    console.log(image);

    if (!brand || !brand.trim()) {
      return res.redirect("/admin/brands?error=Brand name is required");
    }

    if (!image) {
      return res.redirect("/admin/brands?error=Brand image is required");
    }

    const findBrand = await Brand.findOne({
      brandName: { $regex: new RegExp("^" + brand.trim() + "$", "i") },
    });
    if (findBrand) {
      return res.redirect("/admin/brands?error=Brand already exists");
    }

    const newBrand = new Brand({
      brandName: brand.trim(),
      brandImage: [image.path],
    });

    await newBrand.save();
    res.redirect("/admin/brands?success=Brand added successfully");
  } catch (error) {
    console.error("Error adding brand:", error);
    res.redirect(
      "/admin/brands?error=An error occurred while adding the brand"
    );
  }
};

const blockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/brands");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const unBlockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/brands");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(STATUS_CODE.BAD_REQUEST).redirect("/pageerror");
    }
    await Brand.deleteOne({ _id: id });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).redirect("/pageerror");
  }
};

module.exports = {
  getBrandPage,
  addBrand,
  blockBrand,
  unBlockBrand,
  deleteBrand,
};
