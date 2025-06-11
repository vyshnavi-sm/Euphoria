const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const { CategoryOffer } = require('../../models/offerSchema');

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

const applyCategoryOffer = async (req, res) => {
    try {
        const { categoryId, discountPercentage, startDate, endDate } = req.body;

        // Validate input
        if (!categoryId || !discountPercentage || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        // Validate discount percentage
        const discount = parseFloat(discountPercentage);
        if (isNaN(discount) || discount < 0 || discount > 100) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 0 and 100' });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date format' });
        }
        if (start >= end) {
            return res.status(400).json({ success: false, message: 'Start date must be before end date' });
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Create new category offer
        const newOffer = new CategoryOffer({
            category: categoryId,
            discountPercentage: discount,
            startDate: start,
            endDate: end,
            isActive: true
        });

        await newOffer.save();

        // Update all products in this category
        const products = await Product.find({ category: categoryId });
        for (const product of products) {
            // Calculate new sale price based on discount
            const discountedPrice = product.regularPrice * (1 - discount/100);
            product.salePrice = Math.round(discountedPrice * 100) / 100; // Round to 2 decimal places
            await product.save();
        }

        res.json({ 
            success: true, 
            message: 'Category offer applied successfully',
            updatedProducts: products.length
        });
    } catch (error) {
        console.error('Error applying category offer:', error);
        res.status(500).json({ success: false, message: 'Failed to apply category offer' });
    }
};

const removeCategoryOffer = async (req, res) => {
    try {
        const { categoryId } = req.body;

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Find and deactivate the active category offer
        const activeOffer = await CategoryOffer.findOne({
            category: categoryId,
            isActive: true
        });

        if (activeOffer) {
            activeOffer.isActive = false;
            await activeOffer.save();
        }

        // Update all products in this category to remove the discount
        const products = await Product.find({ category: categoryId });
        for (const product of products) {
            product.salePrice = product.regularPrice;
            await product.save();
        }

        res.json({ 
            success: true, 
            message: 'Category offer removed successfully',
            updatedProducts: products.length
        });
    } catch (error) {
        console.error('Error removing category offer:', error);
        res.status(500).json({ success: false, message: 'Failed to remove category offer' });
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
    applyCategoryOffer,
    removeCategoryOffer
};
