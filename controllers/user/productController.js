const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");




const productDetails = async (req,res)=>{
    try {

        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category')
        const findCategory = product.category;
        const categoryOffer = findCategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;
        res.render("product-details",{
            user:userData,
            product:product,
            quantity:product.quantity,
            totalOffer:totalOffer,
            category:findCategory,

        })
        
    } catch (error) {

        console.error("Error for fetching product details",error);
        res.redirect("/pageNotFound")
        
    }


}



module.exports ={
    productDetails,
}