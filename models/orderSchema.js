const mongoose = require("mongoose");
const {Schema} = mongoose;
const {v4:uuidv4} = require("uuid");

const orderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderId:{
        type: String,
        default: uuidv4,  // Remove the function call - just pass the function reference
        unique: true
    },
    orderedItems:[{
        product:{
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity:{
            type: Number,
            required: true
        },
        price:{
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ["Processing", "Shipped", "Delivered", "Cancelled", "Returned"],
            default: "Processing"
        },
        cancellationReason: String,
        returnReason: String
    }],
    totalPrice:{
        type: Number,
        required: true
    },
    discount:{
        type: Number,
        default: 0
    },
    finalAmount:{
        type: Number,
        required: true
    },
    address:{
        type: Schema.Types.ObjectId,
        ref: "Address",
        required: true
    },
    addressDetails: {
        name: String,
        address: String,
        city: String,
        state: String,
        pincode: String,
        phone: String
    },
    invoiceDate:{
        type: Date
    },
    status:{
        type: String,
        required: true,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Return Request", "Returned"]
    },
    createdOn:{
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied:{
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        required: true
    },
    cancellationReason: String,
    returnReason: String
});

// Add a pre-save hook to ensure orderId is always set
orderSchema.pre('save', function(next) {
    if (!this.orderId) {
        this.orderId = uuidv4();
    }
    next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;