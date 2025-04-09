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
        const brand = await Brand.find({isBlocked:false}); 

        res.render("addProducts", {
            cat: category,
            brand: brand 
        });

    } catch (error) {
        res.redirect("/pageerror");
    }
};



const addProducts = async(req,res)=>{
    try {
         
        const products = req.body;
        console.log("Product data:", products); // Add logging to debug
        const productExists = await Product.findOne({
            productName:products.productName,

        })

        if(!productExists){
            const images = [];

            if(req.files && req.files.length>0){
                for(let i=0;i<req.files.length;i++){
                    const originalImagePath = req.files[i].path;

                    console.log(originalImagePath);
                    

                    const resizedImagePath = path.join('public','uploads','product-images',req.files[i].filename);
                    await sharp(originalImagePath).resize({width:440,height:440}).toFile(resizedImagePath);
                    images.push(req.files[i].filename);
                }
            }

            const categoryId = await Category.findOne({name:products.category});

            if(!categoryId){
                return res.status(400).json("Invalid category name")
            }

            const newProduct = new Product({
                productName:products.productName,
                description:products.description,
                brand:products.brand,
                category:categoryId._id,
                regularPrice:products.regularPrice,
                salePrice:products.salePrice,
                createdOn:new Date(),
                quantity:parseInt(products.quantity) || 1, // Ensure quantity is a number
                size:products.size,
                color:products.color,
                productImage:images, // Changed from productImages to productImage to match schema
                status:'Available',
            });

            console.log("New product to save:", newProduct); // Add logging to debug
            await newProduct.save();
            return res.redirect("/admin/addProducts");

        }else{
            return res.status(400).json("Product already exists,please try with another name");
        }
    } catch (error) {

        console.error("Error saving product",error);
        return res.redirect("/admin/pageerror")
        
    }
}



const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;

        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
                { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate("category")
            .exec();

        const count = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
                { brand: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        }).countDocuments();

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isBlocked: false });

        // 🔹 Log the expected file path
        const expectedPath = path.join(__dirname, "../../views/admin/product.ejs");
        // console.log("Checking if file exists at:", expectedPath);

        if (!fs.existsSync(expectedPath)) {
            // console.error(" product.ejs does NOT exist at expected location.");
            return res.status(500).send("View file 'product.ejs' is missing.");
        }

        res.render("product", {
            data: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            cat: category,
            brand: brand,
        });

    } catch (error) {
        console.error("Error rendering product page:", error);
        res.redirect("/pageerror");
    }
};


const blockProduct = async (req,res)=>{
    try {

        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/products");
        
    } catch (error) {

        res.redirect("/pageerror");
        
    }
}

const unblockProduct = async (req,res)=>{
try {
    
    let id = req.query.id;
    await Product.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect("/admin/products");

} catch (error) {

    res.redirect("/pageerror");
    
}
    
   
}


module.exports ={
    getProductPage,
    addProducts,
    getAllProducts,
    blockProduct,
    unblockProduct,
    
}