const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Brand = require("../../models/brandSchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path =require("path");
const sharp = require("sharp");





const getProductPage = async(req,res)=>{
    try {
        
        const category = await Category.find({isListed:true});
        // const brand = await Brand.find({isBlocked:false})
        res.render("products",{
            cat:category,
            // brand:brand
        });

    } catch (error) {

        res.redirect("/pageerror");
        
    }
}


// const addProducts = async(req,res)=>{
//     try {
         
//         const products =req.body;;
//         const productExists = await Product.findOne({
//             productName:products.productName,

//         })

//         if(!productExists){
//             const images = [];

//             if(req.files && req.files.length>0){
//                 for(let i=0;i<req.files.length;i++){
//                     const originalImagePath = req.files[i].path;

//                     const resizedImagePath = path.join('public','uploads','product-images',req.files[i].filename);
//                     await sharp(originalImagePath).resize({width:440,height:440}).toFile(resizedImagePath);
//                     images.push(req.files[i].filename);
//                 }
//             }

//             const categoryId = await Category.findOne({name:products.category});

//             if(!categoryId){
//                 return res.status(400).json("Invalid category name")
//             }

//             const newProduct = new Product({
//                 productName:products.productName,
//                 description:products.description,
//                 brand:products.brand,
//                 category:categoryId._id,
//                 regularPrice:products.regularPrice,
//                 salePrice:products.salePrice,
//                 createdOn:new Date(),
//                 quantity:products.quantity,
//                 size:products.size,
//                 color:products.color,
//                 productImages:images,
//                 status:'Available',


//             });

//             await newProduct.save();
//             return res.redirect("/admin/addProducts");

//         }else{
//             return res.status(400).json("Product already exists,please try with another name");
//         }
//     } catch (error) {

//         console.error("Error saving product",error);
//         return res.redirect("/admin/pageerror")
        
//     }
// }


const addProducts = async (req, res) => {
    try {
        const products = req.body;
        const productExists = await Product.findOne({ productName: products.productName });

        if (!productExists) {
            const images = [];

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.resolve(__dirname, "../../public/uploads/product-images", req.files[i].filename);

                    // Check if the image file exists
                    if (!fs.existsSync(originalImagePath)) {
                        console.error("File not found:", originalImagePath);
                        return res.status(500).json({ message: "File upload failed" });
                    }

                    try {
                        // Get image metadata
                        const metadata = await sharp(originalImagePath).metadata();
                        console.log("Original Image Metadata:", metadata);

                        // Ensure cropping works
                        const width = metadata.width;
                        const height = metadata.height;

                        // Define crop position (center)
                        const cropWidth = 440;
                        const cropHeight = 440;
                        const left = Math.floor((width - cropWidth) / 2);
                        const top = Math.floor((height - cropHeight) / 2);

                        await sharp(originalImagePath)
                            .extract({ width: cropWidth, height: cropHeight, left: Math.max(0, left), top: Math.max(0, top) }) // Crop manually
                            .resize(cropWidth, cropHeight) // Resize after crop to be safe
                            .toFile(resizedImagePath);

                        console.log("Cropped & Resized Image Saved:", resizedImagePath);
                        images.push(req.files[i].filename);
                    } catch (sharpError) {
                        console.error("Sharp Processing Error:", sharpError);
                        return res.status(500).json({ message: "Image processing failed" });
                    }
                }
            }

            const categoryId = await Category.findOne({ name: products.category });

            if (!categoryId) {
                return res.status(400).json("Invalid category name");
            }

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: products.brand,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                createdOn: new Date(),
                quantity: products.quantity,
                size: products.size,
                color: products.color,
                productImages: images,
                status: "Available",
            });

            await newProduct.save();
            return res.redirect("/admin/addProducts");
        } else {
            return res.status(400).json("Product already exists, please try with another name");
        }
    } catch (error) {
        console.error("Error saving product:", error);
        return res.redirect("/admin/pageerror");
    }
};


module.exports ={
    getProductPage,
    addProducts,
}