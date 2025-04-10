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
            brand: brand 
        });
    } catch (error) {
        console.error("Error loading product page:", error);
        res.redirect("/pageerror");
    }
};

const addProducts = async(req, res) => {
    try {
        const products = req.body;
        console.log("Product data:", products);
        
        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if(!productExists) {
            const images = [];

            if(req.files && req.files.length > 0) {
                for(let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    console.log("Original image path:", originalImagePath);

                    // Create the directory if it doesn't exist
                    const uploadDir = path.join('public', 'uploads', 'product-images');
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    const resizedImagePath = path.join(uploadDir, req.files[i].filename);
                    console.log("Resized image path:", resizedImagePath);

                    try {
                        await sharp(originalImagePath)
                            .resize({width: 440, height: 440})
                            .toFile(resizedImagePath);
                        
                        // Delete the original file after resizing
                        fs.unlinkSync(originalImagePath);
                        
                        images.push(req.files[i].filename);
                    } catch (error) {
                        console.error("Error processing image:", error);
                        return res.status(500).json({ error: "Error processing image" });
                    }
                }
            }

            // Find category by name and get its ID
            const category = await Category.findOne({name: products.category});
            if(!category) {
                return res.status(400).json({ error: "Invalid category" });
            }

            // Find brand by name and get its ID
            const brand = await Brand.findOne({brandName: products.brand});
            if(!brand) {
                return res.status(400).json({ error: "Invalid brand" });
            }

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: brand._id, // Store brand ID
                category: category._id, // Store category ID
                regularPrice: parseInt(products.regularPrice),
                salePrice: parseInt(products.salePrice),
                quantity: parseInt(products.quantity) || 1,
                color: products.color,
                productImage: images,
                status: 'Available',
                isBlocked: false
            });

            console.log("New product to save:", newProduct);
            await newProduct.save();
            
            // Redirect with success message
            return res.redirect("/admin/products?success=Product added successfully");
        } else {
            // Redirect with error message
            return res.redirect("/admin/addProducts?error=Product already exists, please try with another name");
        }
    } catch (error) {
        console.error("Error saving product:", error);
        // Redirect with error message
        return res.redirect("/admin/addProducts?error=Error saving product");
    }
};

const getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

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
            search: search
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
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.redirect("/pageerror");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: false}});
        res.redirect("/admin/products");
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

        const images = [];

        // Process new images if uploaded
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const originalImagePath = req.files[i].path;
                
                // Create directory if it doesn't exist
                const uploadDir = path.join('public', 'uploads', 're-image');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const resizedImagePath = path.join(uploadDir, req.files[i].filename);
                
                try {
                    await sharp(originalImagePath)
                        .resize({width: 440, height: 440})
                        .toFile(resizedImagePath);
                    
                    // Delete the original file after resizing
                    fs.unlinkSync(originalImagePath);
                    
                    images.push(req.files[i].filename);
                } catch (error) {
                    console.error("Error processing image:", error);
                    return res.redirect(`/admin/getEditProduct?id=${id}&error=Error processing image`);
                }
            }
        }

        // Update fields
        const updateFields = {
            productName: data.productName,
            description: data.descriptionData, // Match form field name
            brand: brand._id, // Store brand ID instead of name
            category: category._id, // Store category ID
            regularPrice: parseInt(data.regularPrice),
            salePrice: parseInt(data.salePrice),
            quantity: parseInt(data.quantity),
            color: data.color
        };

        // Add new images if any
        if (images.length > 0) {
            updateFields.$push = {productImage: {$each: images}};
        }

        await Product.findByIdAndUpdate(id, updateFields, {new: true});
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
        
        const imagePath = path.join("public", "uploads", "re-image", imageNameToServer);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        } else {
            console.log(`Image ${imageNameToServer} not found`);
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