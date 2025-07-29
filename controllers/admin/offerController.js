const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const { ProductOffer, CategoryOffer } = require('../../models/offerSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const applyProductOffer = async (req, res) => {
    try {
        const { productId, discountPercentage, startDate, endDate } = req.body;

        if (!productId || !discountPercentage || !startDate || !endDate) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'All fields are required' });
        }

        const discount = parseFloat(discountPercentage);
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(discount) || discount < 0 || discount > 100) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Discount percentage must be between 0 and 100' });
        }
        if (isNaN(start) || isNaN(end) || start >= end) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid or mismatched date range' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Product not found' });
        }

        const newOffer = new ProductOffer({ product: productId, discountPercentage: discount, startDate: start, endDate: end, isActive: true });
        await newOffer.save();

        product.offerDiscount = discount;
        product.salePrice = Math.round(product.regularPrice * (1 - discount / 100) * 100) / 100;
        await product.save();

        res.json({ success: true, message: 'Offer applied successfully', newSalePrice: product.salePrice, discountPercentage: discount });
    } catch (error) {
        console.error('Error applying offer:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to apply offer' });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const product = await Product.findById(req.body.productId);
        if (!product) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Product not found' });

        product.offerDiscount = 0;
        product.salePrice = product.regularPrice;
        await product.save();

        res.json({ success: true, message: 'Offer removed successfully', newSalePrice: product.salePrice });
    } catch (error) {
        console.error('Error removing offer:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to remove offer' });
    }
};

const getAllActiveOffers = async (req, res) => {
    try {
        const now = new Date();
        const activeOffers = await CategoryOffer.find({ isActive: true })
            .populate('category', 'name');

        const offersWithStatus = activeOffers.map(offer => ({
            ...offer._doc,
            isCurrentlyActive: offer.startDate <= now && offer.endDate >= now,
            isExpired: offer.endDate < now,
            isUpcoming: offer.startDate > now
        }));

        const currentlyActive = offersWithStatus.filter(o => o.isCurrentlyActive);
        const expired = offersWithStatus.filter(o => o.isExpired);
        const upcoming = offersWithStatus.filter(o => o.isUpcoming);

        res.json({
            success: true,
            offers: offersWithStatus,
            count: offersWithStatus.length,
            timestamp: now,
            breakdown: {
                currentlyActive: { offers: currentlyActive, count: currentlyActive.length },
                expired: { offers: expired, count: expired.length },
                upcoming: { offers: upcoming, count: upcoming.length }
            }
        });
    } catch (error) {
        console.error('Error fetching active offers:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Error fetching active offers',
            error: error.message
        });
    }
};

const getActiveOffers = async (req, res) => {
    try {
        const now = new Date();
        const activeOffers = await CategoryOffer.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).populate('category', 'name');

        res.json({ success: true, offers: activeOffers });
    } catch (error) {
        console.error('Error fetching active offers:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Error fetching active offers',
            error: error.message
        });
    }
};

const applyCategoryOffer = async (req, res) => {
    try {
        const { categoryId, discountPercentage, startDate, endDate } = req.body;

        if (!categoryId || !discountPercentage || !startDate || !endDate) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'All fields are required' });
        }

        const discount = parseFloat(discountPercentage);
        const start = new Date(startDate);
        const end = new Date(endDate);
        const now = new Date();

        if (isNaN(discount) || discount <= 0 || discount > 100)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Discount must be between 1 and 100' });
        if (isNaN(start.getTime()) || isNaN(end.getTime()))
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid date format' });
        if (start >= end)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'End date must be after start date' });
        if (end <= now)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'End date must be in the future' });

        const category = await Category.findById(categoryId);
        if (!category)
            return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Category not found' });

        await CategoryOffer.updateMany({ category: categoryId, isActive: true }, { $set: { isActive: false } });

        const newOffer = await new CategoryOffer({
            category: categoryId,
            discountPercentage: discount,
            startDate: start,
            endDate: end,
            isActive: true,

        }).save();

        const products = await Product.find({ category: categoryId });
        let updatedCount = 0;

        for (let product of products) {
            try {
                product.categoryOfferDiscount = discount;
                const productOfferDiscount = product.productOfferDiscount || 0;
                const effectiveDiscount = Math.max(discount, productOfferDiscount);
                const discountAmount = product.regularPrice * (effectiveDiscount / 100);
                product.salePrice = Math.max(0, Math.round((product.regularPrice - discountAmount) * 100) / 100);
                await product.save();
                updatedCount++;


            } catch (err) {
                console.error(`Error updating product ${product._id}:`, err);
            }
        }
        res.json({
            success: true,
            message: `Category offer applied successfully! Updated ${updatedCount} products with ${discount}% discount.`,
            updatedProducts: updatedCount,
            offerDetails: { discount, startDate: start, endDate: end }
        });

       

    } catch (error) {
        console.error('Error applying category offer:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to apply category offer: ' + error.message });
    }

};


const removeCategoryOffer = async (req, res) => {
    try {
        const { categoryId } = req.body;
        if (!categoryId)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Category ID is required' });

        const category = await Category.findById(categoryId);
        if (!category)
            return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Category not found' });

        await CategoryOffer.updateMany({ category: categoryId, isActive: true }, { $set: { isActive: false } });

        const products = await Product.find({ category: categoryId });
        let updatedCount = 0;

        for (let product of products) {
            try {
                product.categoryOfferDiscount = 0;
                const productOfferDiscount = product.productOfferDiscount || 0;
                const discountAmount = product.regularPrice * (productOfferDiscount / 100);
                product.salePrice = productOfferDiscount > 0
                    ? Math.max(0, Math.round((product.regularPrice - discountAmount) * 100) / 100)
                    : product.regularPrice;
                await product.save();
                updatedCount++;
            } catch (err) {
                console.error(`Error updating product ${product._id}:`, err);
            }
        }

        res.json({
            success: true,
            message: `Category offer removed successfully! Updated ${updatedCount} products.`,
            updatedProducts: updatedCount
        });

    } catch (error) {
        console.error('Error removing category offer:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to remove category offer: ' + error.message });
    }
};

module.exports={
    applyProductOffer,
    removeProductOffer,
    getAllActiveOffers,
    getActiveOffers,
    applyCategoryOffer,
    removeCategoryOffer
}