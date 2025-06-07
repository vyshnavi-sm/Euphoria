const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const { ProductOffer, CategoryOffer } = require('../../models/offerSchema');
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const getProductPage = async(req, res) => {
    try {
        const category = await Category.find({isListed: true});
        const brand = await Brand.find({isBlocked: false}); 

        res.render("addProducts", {
            cat: category,
            brand: brand,
            errorMessage: req.query.error,
            successMessage: req.query.success
        });
    } catch (error) {
        console.error("Error loading product page:", error);
        res.redirect("/pageerror");
    }
};

const addProducts = async(req, res) => {
    try {
        console.log("Request received to add product");
        const products = req.body;
        console.log("Product data:", products);
        console.log("Files received:", req.files);
         
        // Validate required fields
        if (!products.productName || !products.productName.trim()) {
            return res.redirect("/admin/addProducts?error=Product name is required");
        }

        if (!products.description || !products.description.trim()) {
            return res.redirect("/admin/addProducts?error=Product description is required");
        }

        if (!products.category) {
            return res.redirect("/admin/addProducts?error=Category is required");
        }

        if (!products.brand) {
            return res.redirect("/admin/addProducts?error=Brand is required");
        }

        // Validate numeric fields
        const regularPrice = parseFloat(products.regularPrice);
        if (isNaN(regularPrice) || regularPrice < 0) {
            return res.redirect("/admin/addProducts?error=Regular price must be a valid positive number");
        }

        const salePrice = parseFloat(products.salePrice);
        if (isNaN(salePrice) || salePrice < 0) {
            return res.redirect("/admin/addProducts?error=Sale price must be a valid positive number");
        }

        if (salePrice > regularPrice) {
            return res.redirect("/admin/addProducts?error=Sale price cannot be greater than regular price");
        }

        const quantity = parseInt(products.quantity);
        if (isNaN(quantity) || quantity < 0) {
            return res.redirect("/admin/addProducts?error=Quantity must be a valid non-negative number");
        }

        // Validate images
        if (!req.files || req.files.length < 4) {
            // If no files or less than 4 files are uploaded, send an error.
            const errorMessage = !req.files || req.files.length === 0 
                ? "At least 4 product images are required." 
                : `Please upload at least 4 product images. You uploaded ${req.files.length}.`;
            return res.redirect("/admin/addProducts?error=" + encodeURIComponent(errorMessage));
        }

        // Check if product exists
        const productExists = await Product.findOne({
            productName: products.productName.trim(),
        });

        if(productExists) {
            return res.redirect("/admin/addProducts?error=" + encodeURIComponent("Product with this name already exists, please try with another name."));
        }

        const images = [];

        // Process image uploads
        if(req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} uploaded files...`);
            
            // Define upload directory - use absolute path
            const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'product-images');
            console.log(`Target upload directory: ${uploadDir}`);
            
            // Ensure directory exists
            if (!fs.existsSync(uploadDir)) {
                console.log(`Creating directory: ${uploadDir}`);
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Process each uploaded file
            for(let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                
                // Skip if no file was uploaded in this position
                if(!file || !file.originalname) {
                    console.log(`Skipping empty file slot at index ${i}`);
                    continue;
                }
                
                // Validate file type
                const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
                if (!allowedTypes.includes(file.mimetype)) {
                    return res.redirect("/admin/addProducts?error=Only JPG, JPEG, and PNG images are allowed");
                }
                
                // Validate file size (max 5MB)
                const maxSize = 5 * 1024 * 1024; // 5MB
                if (file.size > maxSize) {
                    return res.redirect("/admin/addProducts?error=Image size should not exceed 5MB");
                }
                
                console.log(`Processing image ${i+1}/${req.files.length}: ${file.originalname}`);
                
                try {
                    // Generate a unique filename
                    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
                    const outputPath = path.join(uploadDir, filename);
                    
                    console.log(`Reading file from: ${file.path}`);
                    console.log(`Writing resized image to: ${outputPath}`);
                    
                    // Read the buffer directly from the uploaded file
                    const imageBuffer = fs.readFileSync(file.path);
                    
                    // Process the image with Sharp using the buffer
                    await sharp(imageBuffer)
                        .resize(440, 440, {
                            fit: 'cover',
                            withoutEnlargement: true
                        })
                        .toFile(outputPath);
                    
                    // Delete the temporary file
                    if (fs.existsSync(file.path)) {
                        console.log(`Removing temporary file: ${file.path}`);
                        fs.unlinkSync(file.path);
                    }
                    
                    // Add the filename to our images array
                    images.push(filename);
                    console.log(`Successfully processed and saved image as: ${filename}`);
                    
                } catch (error) {
                    console.error(`Error processing image ${file.originalname}:`, error);
                    return res.redirect("/admin/addProducts?error=" + encodeURIComponent(`Error processing image ${file.originalname}: ${error.message}`));
                }
            }
        }

        // Find category by name
        const category = await Category.findOne({name: products.category});
        if(!category) {
            return res.redirect("/admin/addProducts?error=Invalid category selected");
        }

        // Find brand by name
        const brand = await Brand.findOne({brandName: products.brand});
        if(!brand) {
            return res.redirect("/admin/addProducts?error=Invalid brand selected");
        }

        // Create and save the new product
            const newProduct = new Product({
            productName: products.productName.trim(),
            description: products.description.trim(),
            brand: brand._id,
            category: category._id,
            regularPrice: regularPrice,
            salePrice: salePrice,
            quantity: quantity,
            color: products.color ? products.color.trim() : '',
            productImage: images,
            status: 'Available',
            isBlocked: false
        });

        console.log("New product to save:", newProduct);
            await newProduct.save();
        console.log("Product saved successfully");
        
        // Redirect with success message
        return res.redirect("/admin/products?success=Product added successfully");

    } catch (error) {
        console.error("Error saving product:", error);
        return res.redirect("/admin/addProducts?error=" + encodeURIComponent(error.message));
    }
};

const getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const successMessage = req.query.success || '';

        let query = {};
        if (search) {
            query = {
                $or: [
                    { productName: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Fetch products with pagination and search
        const products = await Product.find(query)
            .populate('category brand')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);
        const currentPage = page;

        // --- Offer Calculation --- 
        const currentDate = new Date();

        for (const product of products) {
            // Find active product offer
            const productOffer = await ProductOffer.findOne({
                product: product._id,
                isActive: true,
                startDate: { $lte: currentDate },
                endDate: { $gte: currentDate }
            });

            // Find active category offer
            const categoryOffer = await CategoryOffer.findOne({
                category: product.category._id,
                isActive: true,
                startDate: { $lte: currentDate },
                endDate: { $gte: currentDate }
            });

            // Determine the highest discount
            let appliedDiscount = 0;
            if (productOffer) {
                appliedDiscount = Math.max(appliedDiscount, productOffer.discountPercentage);
            }
            if (categoryOffer) {
                appliedDiscount = Math.max(appliedDiscount, categoryOffer.discountPercentage);
            }

            product.appliedDiscount = appliedDiscount; // Add appliedDiscount to the product object
        }
        // --- End Offer Calculation ---

        res.render("product", {
            pro: products,
            currentPage,
            totalPages,
            search,
            successMessage,
            errorMessage: req.query.error
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/pageerror");
    }
};

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        const product = await Product.findById(id);
        
        if (!product) {
            return res.redirect("/admin/products?error=Product not found");
        }

        product.isBlocked = true;
        await product.save();

        // Remove product from all user carts
        const Cart = require('../../models/cartSchema');
        await Cart.updateMany(
            { 'items.productId': id },
            { $pull: { items: { productId: id } } }
        );

        res.redirect("/admin/products?success=Product blocked successfully and removed from all user carts");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.redirect("/admin/products?error=Error blocking product");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        const product = await Product.findById(id);
        
        if (!product) {
            return res.redirect("/admin/products?error=Product not found");
        }

        product.isBlocked = false;
        await product.save();

        res.redirect("/admin/products?success=Product unblocked successfully");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect("/admin/products?error=Error unblocking product");
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id: id})
            .populate('brand')
            .populate('category');
        const category = await Category.find({});
        const brand = await Brand.find({});
        
        res.render("edit-product", {
            product: product,
            cat: category,
            brand: brand,
            errorMessage: req.query.error,
            successMessage: req.query.success
        });
    } catch (error) {
        console.error("Error loading edit product page:", error);
        res.redirect("/pageerror");
    }
};

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;
        
        // Check if product exists with same name (excluding current product)
        const existingProduct = await Product.findOne({
            productName: data.productName.trim(),
            _id: {$ne: id}
        });

        if (existingProduct) {
            return res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent("Product with this name already exists.")}`);
        }

        // Validate quantity
        const quantity = parseInt(data.quantity);
        if (quantity < 0) {
            return res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent("Product quantity cannot be negative.")}`);
        }

        // Find category and brand by name and get their IDs
        const category = await Category.findOne({name: data.category});
        const brand = await Brand.findOne({brandName: data.brand});

        if (!category || !brand) {
            return res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent("Invalid category or brand.")}`);
        }

        // Get existing product
        const product = await Product.findById(id);
        if (!product) {
            return res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent("Product not found.")}`);
        }

        // Update product status based on quantity
        const newStatus = quantity === 0 ? "out of stock" : "Available";
        const isBlocked = data.isBlocked === 'on';

        // Process new images if any
        let images = [...product.productImage];
        const newImagesCount = req.files ? req.files.length : 0;

        // Validate maximum number of images
        if (images.length + newImagesCount > 4) {
             return res.redirect(`/admin/editProduct?id=${id}&error=${encodeURIComponent(`You can only have a maximum of 4 product images. You currently have ${images.length} and are trying to add ${newImagesCount}.`)}`);
        }

        // Update product fields
        product.productName = data.productName.trim();
        product.description = data.description.trim();
        product.category = category._id;
        product.brand = brand._id;
        product.regularPrice = parseFloat(data.regularPrice);
        product.salePrice = parseFloat(data.salePrice);
        product.quantity = quantity;
        product.status = newStatus;
        product.color = data.color.trim();
        product.isBlocked = isBlocked;

        // Save the updated product
        await product.save();

        // If product is blocked or out of stock, remove it from all user carts
        if (isBlocked || quantity === 0) {
            const Cart = require('../../models/cartSchema');
            await Cart.updateMany(
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

        console.log('Deleting image:', { imageNameToServer, productIdToServer }); // Debug log

        if (!imageNameToServer || !productIdToServer) {
            console.log('Missing parameters:', { imageNameToServer, productIdToServer }); // Debug log
            return res.status(400).json({ status: false, message: 'Missing required parameters' });
        }

        // Update product to remove the image from the array
        const product = await Product.findByIdAndUpdate(
            productIdToServer,
            { $pull: { productImage: imageNameToServer } },
            { new: true }
        );

        if (!product) {
            console.log('Product not found:', productIdToServer); // Debug log
            return res.status(404).json({ status: false, message: 'Product not found' });
        }

        // Delete the image file from the server
        const imagePath = path.join(process.cwd(), 'public', 'uploads', 'product-images', imageNameToServer);
        console.log('Attempting to delete file at:', imagePath); // Debug log

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('File deleted successfully'); // Debug log
        } else {
            console.log('File not found at path:', imagePath); // Debug log
        }

        res.json({ status: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ 
            status: false, 
            message: 'Error deleting image',
            error: error.message 
        });
    }
};

const applyProductOffer = async (req, res) => {
    try {
        const { productId, discountPercentage, startDate, endDate } = req.body;

        // Validate input
        if (!productId || !discountPercentage || !startDate || !endDate) {
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

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Create new product offer
        const newOffer = new ProductOffer({
            product: productId,
            discountPercentage: discount,
            startDate: start,
            endDate: end,
            isActive: true
        });

        await newOffer.save();

        // Update product's offer discount
        product.offerDiscount = discount;
        await product.save();

        res.json({ success: true, message: 'Offer applied successfully' });
    } catch (error) {
        console.error('Error applying offer:', error);
        res.status(500).json({ success: false, message: 'Failed to apply offer' });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const productId = req.body.productId;
        await Product.findByIdAndUpdate(productId, { offerDiscount: 0 });
        res.json({ success: true, message: 'Offer removed successfully' });
    } catch (error) {
        console.error('Error removing offer:', error);
        res.status(500).json({ success: false, message: 'Failed to remove offer' });
    }
};

const checkDuplicateProductName = async (req, res) => {
    try {
        const { productName, productId } = req.query;
        let query = { productName: productName.trim() };

        // If productId is provided (for edit page), exclude the current product
        if (productId) {
            query._id = { $ne: productId };
        }

        const existingProduct = await Product.findOne(query);

        if (existingProduct) {
            res.json({ isDuplicate: true, message: 'Product with this name already exists.' });
        } else {
            res.json({ isDuplicate: false });
        }
    } catch (error) {
        console.error('Error checking duplicate product name:', error);
        res.status(500).json({ isDuplicate: false, message: 'Error checking duplicate name.' });
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
    applyProductOffer,
    removeProductOffer,
    checkDuplicateProductName
};