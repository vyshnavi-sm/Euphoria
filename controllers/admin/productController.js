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
        } else {
            console.log("No files were uploaded");
        }

        // Find category by name
        const category = await Category.findOne({name: products.category});
        if(!category) {
            return res.redirect("/admin/addProducts?error=Invalid category");
        }

        // Find brand by name
        const brand = await Brand.findOne({brandName: products.brand});
        if(!brand) {
            return res.redirect("/admin/addProducts?error=Invalid brand");
        }

        // Create and save the new product
            const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            brand: brand._id,
            category: category._id,
            regularPrice: parseFloat(products.regularPrice) || 0,
            salePrice: parseFloat(products.salePrice) || 0,
            quantity: parseInt(products.quantity) || 1,
            color: products.color,
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
            return res.redirect(`/admin/getEditProduct?id=${id}&error=Product with this name already exists`);
        }

        // Find category and brand by name and get their IDs
        const category = await Category.findOne({name: data.category});
        const brand = await Brand.findOne({brandName: data.brand});

        if (!category || !brand) {
            return res.redirect(`/admin/getEditProduct?id=${id}&error=Invalid category or brand`);
        }

        // Process new images if uploaded
        if (req.files && req.files.length > 0) {
            const uploadDir = path.join('public', 'uploads', 'product-images');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            for (let i = 0; i < req.files.length; i++) {
                const originalImagePath = req.files[i].path;
                const resizedImagePath = path.join(uploadDir, req.files[i].filename);

                try {
                    await sharp(originalImagePath)
                        .resize(440, 440, {
                            fit: 'cover',
                            position: 'center'
                        })
                        .toFile(resizedImagePath);
                    
                    // Delete the original file after resizing
                    fs.unlinkSync(originalImagePath);
                } catch (error) {
                    console.error("Error processing image:", error);
                    return res.redirect(`/admin/getEditProduct?id=${id}&error=Error processing image`);
                }
            }
        }

        // Update product fields
        const updateFields = {
            productName: data.productName,
            description: data.descriptionData,
            brand: brand._id,
            category: category._id,
            regularPrice: parseInt(data.regularPrice),
            salePrice: parseInt(data.salePrice),
            quantity: parseInt(data.quantity),
            color: data.color
        };

        // Add new images if any were uploaded
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => file.filename);
            updateFields.$push = { productImage: { $each: newImages } };
        }

        // Update the product
        await Product.findByIdAndUpdate(id, updateFields, { new: true });
        res.redirect("/admin/products?success=Product updated successfully");
} catch (error) {
        console.error("Error updating product:", error);
    res.redirect("/pageerror");
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const {imageNameToServer, productIdToServer} = req.body;
        await Product.findByIdAndUpdate(productIdToServer, {$pull: {productImage: imageNameToServer}});
        
        const imagePath = path.resolve(process.cwd(), 'public', 'uploads', 'product-images', imageNameToServer);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        } else {
            console.log(`Image ${imageNameToServer} not found at path: ${imagePath}`);
        }
        
        res.send({status: true});
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).send({status: false, error: "Failed to delete image"});
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