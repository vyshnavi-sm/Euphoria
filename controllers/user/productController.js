const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");




const productDetails = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('category')
            .populate('brand');

        const findCategory = product.category;
        const categoryOffer = findCategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        // First, try to fetch related products from the same category
        let relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isBlocked: false,
            quantity: { $gt: 0 }
        })
        .populate('brand')
        .limit(4);

        // If we don't have enough products from the same category, fetch more products
        if (relatedProducts.length < 4) {
            const additionalProducts = await Product.find({
                _id: { $ne: productId },
                isBlocked: false,
                quantity: { $gt: 0 },
                category: { $ne: product.category._id } // from different categories
            })
            .populate('brand')
            .sort({ createdAt: -1 }) // Get newest products
            .limit(4 - relatedProducts.length);

            relatedProducts = [...relatedProducts, ...additionalProducts];
        }

        res.render("product-details", {
            user: userData,
            product: product,
            quantity: product.quantity,
            totalOffer: totalOffer,
            category: findCategory,
            relatedProducts: relatedProducts
        });
        
    } catch (error) {
        console.error("Error for fetching product details", error);
        res.redirect("/pageNotFound");
    }
}



module.exports ={
    productDetails,
}