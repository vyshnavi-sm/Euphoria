const Category = require("../../models/categorySchema");

// 🛠 TEMPORARY FIX ROUTE: Patch old docs missing createdAt
const fixOldCategories = async (req, res) => {
    try {
        const result = await Category.updateMany(
            { createdAt: { $exists: false } },
            { $set: { createdAt: new Date() } }
        );
        res.send(`Patched ${result.modifiedCount} categories with missing createdAt.`);
    } catch (error) {
        console.error("Error fixing categories:", error);
        res.status(500).send("Failed to fix categories.");
    }
};

const categoryInfo = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const categoryData = await Category.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        res.render("category", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            search: search
        });

    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description, isListed, categoryOffer } = req.body;
        const isListedBool = isListed === "true" || isListed === true;

        if (!name || !description || isListed === undefined) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp("^" + name + "$", "i") } });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        let offerDate = null;
        if (categoryOffer) {
            offerDate = new Date(categoryOffer);
            if (isNaN(offerDate.getTime())) {
                return res.status(400).json({ error: "Invalid date format for categoryOffer" });
            }
        }

        const newCategory = new Category({
            name,
            description,
            isListed: isListedBool,
            categoryOffer: offerDate
        });

        await newCategory.save();

        res.status(201).json({ message: "Category added successfully" });
    } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ error: "Server error" });
    }
};

const getListCategory = async (req, res) => {
    try {
        const id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        res.redirect("/admin/category");
    } catch (error) {
        res.redirect("/pageerror");
    }
};

const getUnlistCategory = async (req, res) => {
    try {
        const id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        res.redirect("/admin/category");
    } catch (error) {
        res.redirect("/pageerror");
    }
};

const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id;
        const category = await Category.findOne({ _id: id });
        res.render("editCategory", { category: category });
    } catch (error) {
        res.redirect("/pageerror");
    }
};

const editCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, description } = req.body;

        const existingCategory = await Category.findOne({
            name: name,
            _id: { $ne: id }
        });
        if (existingCategory) {
            return res.status(400).json({ error: "Category exists, please choose another name" });
        }

        const updateCategory = await Category.findByIdAndUpdate(id, {
            name: name,
            description: description
        }, { new: true });

        if (updateCategory) {
            res.redirect("/admin/category");
        } else {
            res.status(404).json({ error: "Category not found" });
        }
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
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
