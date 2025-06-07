const mongoose = require('mongoose');

const productOfferSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    discountPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const categoryOfferSchema = new mongoose.Schema({
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    discountPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const referralOfferSchema = new mongoose.Schema({
    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referred: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    referralCode: {
        type: String,
        required: true,
        unique: true
    },
    rewardAmount: {
        type: Number,
        required: true,
        min: 0
    },
    isRedeemed: {
        type: Boolean,
        default: false
    },
    expiryDate: {
        type: Date,
        required: true
    }
}, { timestamps: true });

const ProductOffer = mongoose.model('ProductOffer', productOfferSchema);
const CategoryOffer = mongoose.model('CategoryOffer', categoryOfferSchema);
const ReferralOffer = mongoose.model('ReferralOffer', referralOfferSchema);

module.exports = {
    ProductOffer,
    CategoryOffer,
    ReferralOffer
}; 