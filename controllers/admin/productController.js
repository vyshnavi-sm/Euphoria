const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
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
        if (!req.files || req.files.length === 0) {
            return res.redirect("/admin/addProducts?error=At least one product image is required");
        }

        // Check if product exists
        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if(productExists) {
            return res.redirect("/admin/addProducts?error=Product already exists, please try with another name");
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

        const products = await Product.find(query)
            .populate('brand')
            .populate('category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        res.render("product", {
            data: products,
            currentPage: page,
            totalPages: totalPages,
            search: search,
            successMessage: successMessage
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/pageerror");
    }
};

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: true}});
        res.redirect("/admin/products?success=Product blocked successfully");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.redirect("/pageerror");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: false}});
        res.redirect("/admin/products?success=Product unblocked successfully");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect("/pageerror");
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
            productName: data.productName,
            _id: {$ne: id}
        });

        if (existingProduct) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Product with this name already exists`);
        }

        // Validate quantity
        const quantity = parseInt(data.quantity);
        if (quantity < 0) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Product quantity cannot be negative`);
        }

        // Find category and brand by name and get their IDs
        const category = await Category.findOne({name: data.category});
        const brand = await Brand.findOne({brandName: data.brand});

        if (!category || !brand) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Invalid category or brand`);
        }

        // Get existing product
        const product = await Product.findById(id);
        if (!product) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Product not found`);
        }

        // Process new images if any
        let images = [...product.productImage];
        if (req.files && req.files.length > 0) {
            const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'product-images');
            
            // Ensure directory exists
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Process each uploaded file
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                if (!file || !file.originalname) continue;

                const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
                const outputPath = path.join(uploadDir, filename);
                
                // Process image with Sharp
                await sharp(file.path)
                    .resize(440, 440, {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .toFile(outputPath);
                
                // Delete temporary file
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
                
                images.push(filename);
            }
        }

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(id, {
            productName: data.productName,
            description: data.description,
            brand: brand._id,
            category: category._id,
            regularPrice: parseFloat(data.regularPrice) || 0,
            salePrice: parseFloat(data.salePrice) || 0,
            quantity: parseInt(data.quantity) || 1,
            color: data.color,
            productImage: images
        }, { new: true });

        if (!updatedProduct) {
            return res.redirect(`/admin/editProduct?id=${id}&error=Failed to update product`);
        }

        return res.redirect("/admin/products?success=Product updated successfully");

} catch (error) {
        console.error("Error updating product:", error);
        return res.redirect(`/admin/editProduct?id=${req.params.id}&error=${encodeURIComponent(error.message)}`);
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

module.exports = {
    getProductPage,
    addProducts,
    getAllProducts,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage
};