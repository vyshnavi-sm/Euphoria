const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderId: {
        type: String,
        default: uuidv4,
        unique: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: [
                "Pending",               
                "Processing",
                "Shipped",
                "Out for Delivery",
                "Delivered",
                "Cancelled",
                "Returned",
                "Return Requested",
                "Payment Failed"
            ],
            default: "Processing"
        },
        cancellationReason: String,
        returnReason: String,

        returnStatus: {
            type: String,
            enum: ["Pending", "Accepted", "Rejected"],
        },
        returnProcessedAt: Date,
        returnRejectedAt: Date,
        adminRejectionReason: String,
        returnDetails: {
            returnRequestedAt: Date,
            images: [String],
            description: String
        },

        proportionalDiscount: {
            type: Number,
            default: 0
        },
        proportionalTax: {
            type: Number,
            default: 0
        },
        totalsAlreadyAdjusted: {
            type: Boolean,
            default: false
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    deliveryCharge: {
        type: Number,
        default: 50
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
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
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: [
            "Awaiting Payment",    
            "Pending",             
            "Processing",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Return Request",
            "Returned",
            "Payment Failed"       
        ]
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    estimatedDeliveryDate: {
        type: Date,
        default: function () {
            const date = new Date();
            date.setDate(date.getDate() + 4);
            date.setHours(23, 59, 59, 999);
            return date;
        }
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'upi', 'razorpay', 'paypal', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    paymentId: {
        type: String
    },
    cancellationReason: String,
    returnReason: String,

    returnStatus: {
        type: String,
        enum: ["Pending", "Accepted", "Rejected", "Partial"],
    },
    returnCompletedAt: Date,

    returnHistory: [{
        itemId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: Number,
        reason: String,
        returnType: {
            type: String,
            enum: ["Single Item", "Full Order"],
            default: "Single Item"
        },
        requestedAt: Date,
        processedAt: Date,
        status: {
            type: String,
            enum: ["Pending", "Accepted", "Rejected"],
            required: true
        },
        rejectionReason: String,
        actualRefundAmount: Number,
        refundDetails: {
            itemSubtotal: Number,
            proportionalTax: Number,
            proportionalDiscount: Number,
            calculatedRefundAmount: Number,
            actualRefundAmount: Number
        }
    }]
});

orderSchema.pre('save', function (next) {
    if (!this.orderId) {
        this.orderId = uuidv4();
    }
    next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
