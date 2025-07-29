const Cart = require('../../models/cartSchema');
const Coupon = require('../../models/couponSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


function calculateOrderTotal(cart, coupon) {
    const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let discount = 0;

    if (coupon) {
        if (coupon.discountType === 'percentage') {
            discount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount) {
                discount = Math.min(discount, coupon.maxDiscountAmount);
            }
        } else if (coupon.discountType === 'fixed') {
            discount = coupon.discountValue;
        }
    }

    const total = Math.max(0, subtotal - discount);
    return { total, discount };
}

const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        const { couponCode } = req.body;
        const currentDate = new Date();

        const coupon = await Coupon.findOne({
            code: couponCode,
            isActive: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        });

        if (!coupon) {
            return res.json({ success: false, message: 'Invalid or expired coupon code.' });
        }

        if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
            return res.json({ success: false, message: 'Coupon usage limit reached.' });
        }

        if (coupon.usedBy.includes(userId)) {
            return res.json({ success: false, message: 'You have already used this coupon.' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
             return res.json({ success: false, message: 'Your cart is empty.' });
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

        if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
            return res.json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minOrderAmount.toFixed(2)} required to use this coupon.`
            });
        }

        const { total, discount: couponDiscountAmount } = calculateOrderTotal(cart, coupon);

        req.session.appliedCouponId = coupon._id;

        res.json({
            success: true,
            message: 'Coupon applied successfully!',
            newTotal: total,
            appliedCoupon: {
                code: coupon.code,
                discount: couponDiscountAmount
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'An error occurred while applying the coupon.' });
    }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        req.session.appliedCouponId = null;

        const cart = await Cart.findOne({ userId });
         if (!cart) {
             return res.json({ success: false, message: 'Your cart is empty.' });
        }

        const { total } = calculateOrderTotal(cart, null);

        res.json({
            success: true,
            message: 'Coupon removed successfully!',
            newTotal: total,
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'An error occurred while removing the coupon.' });
    }
};

module.exports={
    applyCoupon,
    removeCoupon
}