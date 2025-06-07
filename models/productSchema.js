const mongoose = require("mongoose")
const {Schema} = mongoose;


const productSchema = new Schema({
    productName:{
        type:String,
        required:true

    },
    description:{
        type:String,
        required:true
    },
    brand:{
        type:Schema.Types.ObjectId,
        ref:"Brand",
        required:true
    },
    category:{
        type:Schema.Types.ObjectId,
        ref:"Category",
        required:true
    },
    regularPrice:{
        type:Number,
        required:true,
    },
    salePrice:{
        type:Number,
        required:true,
    },
    productOffer :{
        type:Number,
        default:0,
    },
    quantity:{
        type:Number,
        default:1
    },
    color:{
        type:String,
        required:true
    },
    productImage:{
        type:[String],
        required:true,
    },
    isBlocked:{
        type:Boolean,
        required:false
    },
    status:{
        type:String,
        enum:["Available","out of stock","Discountinued"],
        required:true,
        default:"Available"
    },
    offerDiscount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    }
},{timestamps:true});

const Product = mongoose.model("Product", productSchema);


module.exports = Product;
