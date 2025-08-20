const Category = require("../../models/categorySchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const fixOldCategories = async (req, res) => {
  try {
    const result = await Category.updateMany(
      { createdAt: { $exists: false } },
      { $set: { createdAt: new Date() } }
    );
    res.send(
      `Patched ${result.modifiedCount} categories with missing createdAt.`
    );
  } catch (error) {
    console.error("Error fixing categories:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .send("Failed to fix categories.");
  }
};

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const currentDate = new Date();

    const categoryData = await Category.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "categoryoffers",
          let: { categoryId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$category", "$$categoryId"] },
                    { $eq: ["$isActive", true] },
                    { $lte: ["$startDate", currentDate] },
                    { $gte: ["$endDate", currentDate] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "offers",
        },
      },
      {
        $addFields: {
          activeOffer: {
            $cond: {
              if: { $gt: [{ $size: "$offers" }, 0] },
              then: { $arrayElemAt: ["$offers", 0] },
              else: null,
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages,
      totalCategories,
      search,
    });
  } catch (error) {
    console.error("Error in categoryInfo:", error);
    res.redirect("/pageerror");
  }
};

const addCategory = async (req, res) => {
  try {
    const { categoryName, description } = req.body;

    if (!categoryName || !description) {
      return res
        .status(STATUS_CODE.BAD_REQUEST)
        .json({ error: "All fields are required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp("^" + categoryName.trim() + "$", "i") },
    });

    if (existingCategory) {
      return res
        .status(STATUS_CODE.BAD_REQUEST)
        .json({ error: "Category already exists" });
    }

    const newCategory = new Category({
      name: categoryName.trim(),
      description: description.trim(),
      isListed: true,
    });

    await newCategory.save();
    return res
      .status(STATUS_CODE.SUCCESS)
      .json({ success: true, message: "Category added" });
  } catch (error) {
    console.error("Error adding category:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .json({ error: "Server error" });
  }
};

const getListCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });

    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error listing category:", error);
    res.redirect("/pageerror");
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error unlisting category:", error);
    res.redirect("/pageerror");
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findOne({ _id: id });
    res.render("editCategory", { category: category });
  } catch (error) {
    console.error("Error getting edit category:", error);
    res.redirect("/pageerror");
  }
};

const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description } = req.body;

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
      _id: { $ne: id },
    });
    if (existingCategory) {
      return res
        .status(STATUS_CODE.BAD_REQUEST)
        .json({ error: "Category exists, please choose another name" });
    }

    const updateCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description.trim(),
      },
      { new: true }
    );

    if (updateCategory) {
      res.redirect("/admin/category");
    } else {
      res.status(STATUS_CODE.NOT_FOUND).json({ error: "Category not found" });
    }
  } catch (error) {
    console.error("Error editing category:", error);
    res
      .status(STATUS_CODE.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal server error" });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  fixOldCategories,
};
