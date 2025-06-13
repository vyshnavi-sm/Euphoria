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

        // Get current date for comparison
        const currentDate = new Date();

        // Get categories with their active offers - FIXED AGGREGATION
        const categoryData = await Category.aggregate([
            { $match: query },
            {
                $lookup: {
                    from: 'categoryoffers',
                    let: { categoryId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$category', '$$categoryId'] },
                                        { $eq: ['$isActive', true] },
                                        { $lte: ['$startDate', currentDate] },
                                        { $gte: ['$endDate', currentDate] }
                                    ]
                                }
                            }
                        },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'offers'
                }
            },
            {
                $addFields: {
                    activeOffer: { 
                        $cond: {
                            if: { $gt: [{ $size: '$offers' }, 0] },
                            then: { $arrayElemAt: ['$offers', 0] },
                            else: null
                        }
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        console.log(`Found ${categoryData.length} categories, ${categoryData.filter(c => c.activeOffer).length} with active offers`);

        res.render("category", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            search: search
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
            return res.status(400).json({ error: "All fields are required" });
        }

        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp("^" + categoryName.trim() + "$", "i") } 
        });
        
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        const newCategory = new Category({
            name: categoryName.trim(),
            description: description.trim(),
            isListed: true
        });

        await newCategory.save();
        res.redirect("/admin/category");

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
        console.error("Error editing category:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
// Enhanced version of your second route
const getAllActiveOffers = async (req, res) => {
    try {
        console.log('🔍 Fetching all active offers (ignoring time)...');
        
        const now = new Date();
        console.log('📅 Current time:', now);
        
        // Find all offers marked as active
        const activeOffers = await CategoryOffer.find({
            isActive: true
        }).populate('category', 'name');
        
        console.log('📊 Found active offers (all):', activeOffers.length);
        console.log('📋 All active offers:', activeOffers.map(offer => ({
            id: offer._id,
            categoryId: offer.category._id,
            categoryName: offer.category.name,
            discountPercentage: offer.discountPercentage,
            startDate: offer.startDate,
            endDate: offer.endDate,
            isActive: offer.isActive,
            // Added: Status indicators
            isCurrentlyActive: offer.startDate <= now && offer.endDate >= now,
            isExpired: offer.endDate < now,
            isUpcoming: offer.startDate > now
        })));
        
        // Separate offers by status for better organization
        const currentlyActive = activeOffers.filter(offer => 
            offer.startDate <= now && offer.endDate >= now
        );
        const expired = activeOffers.filter(offer => offer.endDate < now);
        const upcoming = activeOffers.filter(offer => offer.startDate > now);
        
        res.json({
            success: true,
            offers: activeOffers,
            count: activeOffers.length,
            timestamp: now,
            // Added: Breakdown by status
            breakdown: {
                currentlyActive: {
                    offers: currentlyActive,
                    count: currentlyActive.length
                },
                expired: {
                    offers: expired,
                    count: expired.length
                },
                upcoming: {
                    offers: upcoming,
                    count: upcoming.length
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching all active offers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active offers',
            error: error.message
        });
    }
};

const getActiveOffers = async (req, res) => {
    try {
        console.log('🔍 Fetching active category offers...');
        
        const now = new Date();
        console.log('📅 Current time:', now);
        
        // Find all active offers that are currently valid
        const activeOffers = await CategoryOffer.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).populate('category', 'name');
        
        console.log('📊 Found active offers:', activeOffers.length);
        
        res.json({
            success: true,
            offers: activeOffers
        });
        
    } catch (error) {
        console.error('❌ Error fetching active offers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching active offers',
            error: error.message
        });
    }
};

const applyCategoryOffer = async (req, res) => {
    try {
        console.log("Apply category offer request:", req.body);
        
        const { categoryId, discountPercentage, startDate, endDate } = req.body;

        // Validation
        if (!categoryId || !discountPercentage || !startDate || !endDate) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        const discount = parseFloat(discountPercentage);
        if (isNaN(discount) || discount <= 0 || discount > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Discount must be between 1 and 100' 
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid date format' 
            });
        }

        if (start >= end) {
            return res.status(400).json({ 
                success: false, 
                message: 'End date must be after start date' 
            });
        }

        if (end <= now) {
            return res.status(400).json({ 
                success: false, 
                message: 'End date must be in the future' 
            });
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        // Deactivate existing active offers for this category
        const deactivatedResult = await CategoryOffer.updateMany(
            { category: categoryId, isActive: true },
            { $set: { isActive: false } }
        );
        console.log(`Deactivated ${deactivatedResult.modifiedCount} existing offers`);

        // Create new offer
        const newOffer = new CategoryOffer({
            category: categoryId,
            discountPercentage: discount,
            startDate: start,
            endDate: end,
            isActive: true
        });

        await newOffer.save();
        console.log("New offer created:", newOffer);

        // Update products in this category - FIXED PRODUCT UPDATE
        const products = await Product.find({ category: categoryId });
        console.log(`Found ${products.length} products in category`);

        let updatedCount = 0;
        for (let product of products) {
            try {
                // Set category offer discount
                product.categoryOfferDiscount = discount;
                
                // Calculate effective discount (max of category and product offers)
                const productOfferDiscount = product.productOfferDiscount || 0;
                const effectiveDiscount = Math.max(discount, productOfferDiscount);
                
                // Calculate new sale price
                const discountAmount = product.regularPrice * (effectiveDiscount / 100);
                const newSalePrice = product.regularPrice - discountAmount;
                product.salePrice = Math.max(0, Math.round(newSalePrice * 100) / 100);
                
                // Save the product
                const savedProduct = await product.save();
                console.log(`Updated product ${product.name}: regularPrice=${product.regularPrice}, salePrice=${product.salePrice}, categoryDiscount=${discount}%`);
                updatedCount++;
            } catch (productError) {
                console.error(`Error updating product ${product._id}:`, productError);
            }
        }

        console.log(`Successfully updated ${updatedCount} products with category offer`);

        res.json({
            success: true,
            message: `Category offer applied successfully! Updated ${updatedCount} products with ${discount}% discount.`,
            updatedProducts: updatedCount,
            offerDetails: {
                discount: discount,
                startDate: start,
                endDate: end
            }
        });

    } catch (error) {
        console.error('Error applying category offer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to apply category offer: ' + error.message 
        });
    }
};

const removeCategoryOffer = async (req, res) => {
    try {
        console.log("Remove category offer request:", req.body);
        
        const { categoryId } = req.body;

        if (!categoryId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Category ID is required' 
            });
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        // Deactivate all active offers for this category
        const deactivatedOffers = await CategoryOffer.updateMany(
            { category: categoryId, isActive: true },
            { $set: { isActive: false } }
        );

        console.log(`Deactivated ${deactivatedOffers.modifiedCount} offers`);

        // Update products in this category - FIXED PRODUCT UPDATE
        const products = await Product.find({ category: categoryId });
        console.log(`Found ${products.length} products in category`);

        let updatedCount = 0;
        for (let product of products) {
            try {
                // Remove category offer discount
                product.categoryOfferDiscount = 0;
                
                // Recalculate sale price with only product offer (if any)
                const productOfferDiscount = product.productOfferDiscount || 0;
                
                if (productOfferDiscount > 0) {
                    const discountAmount = product.regularPrice * (productOfferDiscount / 100);
                    const newSalePrice = product.regularPrice - discountAmount;
                    product.salePrice = Math.max(0, Math.round(newSalePrice * 100) / 100);
                } else {
                    product.salePrice = product.regularPrice;
                }
                
                const savedProduct = await product.save();
                console.log(`Updated product ${product.name}: regularPrice=${product.regularPrice}, salePrice=${product.salePrice}, categoryDiscount=0%`);
                updatedCount++;
            } catch (productError) {
                console.error(`Error updating product ${product._id}:`, productError);
            }
        }

        console.log(`Successfully updated ${updatedCount} products after removing category offer`);

        res.json({
            success: true,
            message: `Category offer removed successfully! Updated ${updatedCount} products.`,
            updatedProducts: updatedCount
        });

    } catch (error) {
        console.error('Error removing category offer:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to remove category offer: ' + error.message 
        });
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
    getAllActiveOffers,
    getActiveOffers,
    applyCategoryOffer,
    removeCategoryOffer
};