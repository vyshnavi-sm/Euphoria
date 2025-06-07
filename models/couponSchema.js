const mongoose = require("mongoose");
const {Schema} = mongoose;

const couponSchema = new mongoose.Schema({
    code:{
        type:String,
        required:true,
        unique:true,
        uppercase: true,
        trim: true
    },
    discountType:{
        type:String,
        required:true,
        enum: ['percentage', 'fixed']
    },
    discountValue:{
        type:Number,
        required:true,
        min: 0
    },
    minOrderAmount:{
        type:Number,
        default: 0,
        min: 0
    },
    maxDiscountAmount:{
        type:Number,
        min: 0
    },
    startDate:{
        type:Date,
        required:true
    },
    endDate:{
        type:Date,
        required:true
    },
    isActive:{
        type:Boolean,
        default:true
    },
    usageLimit:{
        type:Number,
        min: 1
    },
    usageCount:{
        type:Number,
        default: 0,
        min: 0
    },
    usedBy:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }],
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null // Null for general coupons, ObjectId for referral coupons
    }
}, { timestamps: true });

const Coupon = mongoose.model("Coupon",couponSchema);

module.exports = Coupon;