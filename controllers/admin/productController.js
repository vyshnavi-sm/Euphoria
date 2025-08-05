const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const { ProductOffer, CategoryOffer } = require('../../models/offerSchema');
const fs = require("fs");
const path = require("path");
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const getProductPage = async (req, res) => {
    try {
        const [cat, brand] = await Promise.all([
            Category.find({ isListed: true }),
            Brand.find({ isBlocked: false })
        ]);
        res.render("addProducts", { cat, brand, errorMessage: req.query.error, successMessage: req.query.success });
    } catch (error) {
        console.error("Error loading product page:", error);
        res.redirect("/pageerror");
    }
};


const addProducts = async (req, res) => {
    try {
        const { productName, description, category, brand, regularPrice, salePrice, quantity, color } = req.body;
        const files = req.files;

        if (!productName?.trim() || !description?.trim() || !category || !brand)
            return res.redirect("/admin/addProducts?error=All fields are required");
         if (!/^[A-Za-z\s]+$/.test(productName.trim())) {
            return res.redirect("/admin/addProducts?error=" + encodeURIComponent("Product name must only contain letters and spaces."));
        }
         const regPrice = parseFloat(regularPrice);
        const sPrice = parseFloat(salePrice);
        const qty = parseInt(quantity);

            if (
                isNaN(regPrice) || regPrice < 0 ||
                isNaN(sPrice) || sPrice < 0 || sPrice > regPrice ||  
                isNaN(qty) || qty < 0
            )
            return res.redirect("/admin/addProducts?error=Invalid price or quantity");

        if (!files || files.length < 4)
            return res.redirect("/admin/addProducts?error=" + encodeURIComponent(`Minimum 4 images required. You uploaded ${files?.length || 0}.`));

        const exists = await Product.findOne({ productName: productName.trim() });
        if (exists) return res.redirect("/admin/addProducts?error=" + encodeURIComponent("Product name already exists."));

        const [catDoc, brandDoc] = await Promise.all([
            Category.findOne({ name: category }),
            Brand.findOne({ brandName: brand })
        ]);
        if (!catDoc || !brandDoc) return res.redirect("/admin/addProducts?error=Invalid category or brand");

        await Product.create({
            productName: productName.trim(),
            description: description.trim(),
            category: catDoc._id,
            brand: brandDoc._id,
            regularPrice: regPrice,
            salePrice: sPrice,
            quantity: qty,
            color: color?.trim() || '',
            productImage: files.map(f => f.path),
            status: 'Available',
            isBlocked: false
        });

        res.redirect("/admin/products?success=Product added successfully");
    } catch (error) {
        console.error("Error saving product:", error);
        res.redirect("/admin/addProducts?error=" + encodeURIComponent(error.message));
    }
};

const getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const matchStage = search
            ? {
                $or: [
                    { productName: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { 'category.name': { $regex: search, $options: 'i' } },
                    { 'brand.brandName': { $regex: search, $options: 'i' } }
                ]
            }
            : {};

        const aggregatePipeline = [
            { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
            { $unwind: '$category' },
            { $lookup: { from: 'brands', localField: 'brand', foreignField: '_id', as: 'brand' } },
            { $unwind: '$brand' },
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ];

        const countPipeline = [
            { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
            { $unwind: '$category' },
            { $lookup: { from: 'brands', localField: 'brand', foreignField: '_id', as: 'brand' } },
            { $unwind: '$brand' },
            { $match: matchStage },
            { $count: 'total' }
        ];

        const [products, countResult] = await Promise.all([
            Product.aggregate(aggregatePipeline),
            Product.aggregate(countPipeline)
        ]);
        const totalProducts = countResult[0]?.total || 0;

        const currentDate = new Date();
        await Promise.all(products.map(async (product) => {
            const [productOffer, categoryOffer] = await Promise.all([
                ProductOffer.findOne({ product: product._id, isActive: true, startDate: { $lte: currentDate }, endDate: { $gte: currentDate } }),
                CategoryOffer.findOne({ category: product.category._id, isActive: true, startDate: { $lte: currentDate }, endDate: { $gte: currentDate } })
            ]);
            product.appliedDiscount = Math.max(productOffer?.discountPercentage || 0, categoryOffer?.discountPercentage || 0);
        }));

        res.render('product', {
            pro: products,
            currentPage: page,
            totalPages: Math.ceil(totalProducts / limit),
            search,
            successMessage: req.query.success || '',
            errorMessage: req.query.error || ''
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.redirect('/pageerror');
    }
};

const blockProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.body.productId);
        if (!product) return res.json({ success: false, message: "Product not found" });

        product.isBlocked = true;
        await product.save();

        await require('../../models/cartSchema').updateMany({ 'items.productId': req.body.productId }, { $pull: { items: { productId: req.body.productId } } });
        res.json({ success: true, message: "Product blocked and removed from all carts" });
    } catch (error) {
        console.error("Error blocking product:", error);
        res.json({ success: false, message: "Error blocking product" });
    }
};

const unblockProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.body.productId);
        if (!product) return res.json({ success: false, message: "Product not found" });

        product.isBlocked = false;
        await product.save();
        res.json({ success: true, message: "Product unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.json({ success: false, message: "Error unblocking product" });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const [product, category, brand] = await Promise.all([
            Product.findById(req.query.id).populate('brand category'),
            Category.find({}),
            Brand.find({})
        ]);
        res.render("edit-product", {
            product,
            cat: category,
            brand,
            errorMessage: req.query.error,
            successMessage: req.query.success
        });
    } catch (error) {
        console.error("Error loading edit product page:", error);
        res.redirect("/pageerror");
    }
};

const editProduct = async (req, res) => {
    const id = req.params.id;
    try {
        const data = req.body;
        const quantity = parseInt(data.quantity);
        const isBlocked = data.isBlocked === 'on';
        const newStatus = quantity === 0 ? "out of stock" : "Available";

        if (isNaN(quantity) || quantity !== 4) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Quantity must be exactly 4.`);
        }
         if (isNaN(regPrice) || isNaN(sPrice) || sPrice > regPrice) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Sale price must be less than or equal to the regular price.`);
        }

        const [existingProduct, category, brand, product] = await Promise.all([
            Product.findOne({ productName: data.productName.trim(), _id: { $ne: id } }),
            Category.findOne({ name: data.category }),
            Brand.findOne({ brandName: data.brand }),
            Product.findById(id)
        ]);
        if (existingProduct) return res.redirect(`/admin/editProduct?id=${id}&error=Product with this name already exists.`);
        if (!category || !brand || !product) return res.redirect(`/admin/editProduct?id=${id}&error=Invalid category, brand, or product.`);

        let images = [...product.productImage];
        if (req.files?.length) {
            const newImages = req.files.map(f => f.path);
            if (images.length + newImages.length > 4)
                return res.redirect(`/admin/editProduct?id=${id}&error=Max 4 product images allowed. Currently: ${images.length}, Adding: ${newImages.length}`);
            images.push(...newImages);
        }

        Object.assign(product, {
            productName: data.productName.trim(),
            description: data.description.trim(),
            category: category._id,
            brand: brand._id,
            regularPrice: parseFloat(data.regularPrice),
            salePrice: parseFloat(data.salePrice),
            quantity,
            status: newStatus,
            color: data.color.trim(),
            isBlocked,
            productImage: images
        });

        await product.save();

        if (isBlocked || quantity === 0) {
            await require('../../models/cartSchema').updateMany(
                { 'items.productId': id },
                { $pull: { items: { productId: id } } }
            );
        }

        res.redirect('/admin/products?success=Product updated successfully');
    } catch (error) {
        console.error('Error updating product:', error);
        res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent(error.message)}`);
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const { imageNameToServer, productIdToServer } = req.body;
        if (!imageNameToServer || !productIdToServer)
            return res.status(STATUS_CODE.BAD_REQUEST).json({ status: false, message: 'Missing parameters' });

        const product = await Product.findByIdAndUpdate(productIdToServer, { $pull: { productImage: imageNameToServer } }, { new: true });
        if (!product) return res.status(STATUS_CODE.NOT_FOUND).json({ status: false, message: 'Product not found' });

        const imagePath = path.join(process.cwd(), 'public', 'uploads', 'product-images', imageNameToServer);
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

        res.json({ status: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ status: false, message: 'Error deleting image', error: error.message });
    }
};

const checkDuplicateProductName = async (req, res) => {
    try {
        const { productName, productId } = req.query;
        const query = { productName: productName.trim() };
        if (productId) query._id = { $ne: productId };

        const exists = await Product.findOne(query);
        res.json(exists ? { isDuplicate: true, message: 'Product with this name already exists.' } : { isDuplicate: false });
    } catch (error) {
        console.error('Error checking product name:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ isDuplicate: false, message: 'Error checking duplicate name.' });
    }
};

module.exports = {
    getProductPage,
    addProducts,
    getAllProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage,
    checkDuplicateProductName,
};
