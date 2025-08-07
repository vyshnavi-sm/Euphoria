const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");

const calculateOrderTotal = (cart, coupon, deliveryCharge = 0) => {
    const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let couponDiscountAmount = 0;

    if (coupon) {
        couponDiscountAmount = coupon.discountType === 'percentage' 
            ? Math.min(subtotal * (coupon.discountValue / 100), coupon.maxDiscountAmount || Infinity)
            : coupon.discountValue;
        couponDiscountAmount = Math.min(couponDiscountAmount, subtotal);
    }

    const taxes = Math.round(subtotal * 0.18);
    const total = subtotal + taxes + deliveryCharge - couponDiscountAmount;

    return { subtotal, taxes, discount: couponDiscountAmount, total, deliveryCharge };
};

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        let [cart, userData, addressData] = await Promise.all([
            Cart.findOne({ userId }).populate({ path: 'items.productId', select: 'productName productImage price' }),
            User.findById(userId).lean(),
            Address.findOne({ userId }).lean()
        ]);

        if (!cart || cart.items.length === 0) return res.redirect('/user/cart');
        if (!userData) return res.redirect('/login');

        // ✅ Filter out items where productId is null
        const validItems = cart.items.filter(item => item.productId);
        if (validItems.length !== cart.items.length) {
            cart.items = validItems;
            await cart.save(); // optional cleanup in DB
        }

        const address = (addressData?.address?.length > 0) 
            ? (addressData.address.find(a => a._id.equals(req.query.addressId)) || addressData.address[0])
            : null;

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const deliveryCharge = subtotal >= 1000 ? 0 : 50;

        const [appliedCoupon, availableCoupons] = await Promise.all([
            req.session.appliedCouponId ? Coupon.findById(req.session.appliedCouponId) : null,
            Coupon.find({
                isActive: true,
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                $expr: { $lt: ['$usageCount', '$usageLimit'] },
                usedBy: { $ne: userId }
            })
        ]);

        const { subtotal: calculatedSubtotal, taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon, deliveryCharge);

        res.render('user/checkout', { 
            cart, subtotal: calculatedSubtotal, taxes, discount, total: total + deliveryCharge,
            user: userData, addresses: addressData?.address || [], appliedCoupon, availableCoupons, deliveryCharge
        });
        
    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).render('error', { message: 'Internal server error' });
    }
};


const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.json({ success: false, message: 'User not logged in' });

        const { addressId, address, paymentMethod } = req.body;

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty.' });
        }

        for (const item of cart.items) {
            const product = item.productId;
            if (!product) return res.json({ success: false, message: `Product ${item.productId} not found` });
            if (product.quantity <= 0) return res.json({ success: false, message: `${product.productName} is out of stock` });
            if (item.quantity > product.quantity) {
                return res.json({ success: false, message: `Only ${product.quantity} units of ${product.productName} are available` });
            }
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const deliveryCharge = subtotal >= 1000 ? 0 : 50;
        const appliedCoupon = req.session.appliedCouponId ? await Coupon.findById(req.session.appliedCouponId) : null;
        const { taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon, deliveryCharge);

        if (paymentMethod === 'cod' && total > 1000) {
            return res.json({ success: false, message: 'Cash on Delivery not available for orders above ₹1000' });
        }

        if (paymentMethod === 'wallet') {
            const user = await User.findById(userId);
            if (!user) return res.json({ success: false, message: 'User not found' });
            if (user.wallet < total) return res.json({ success: false, message: 'Insufficient wallet balance' });

            user.wallet -= total;
            await user.save();

            const order = new Order({
                userId,
                orderedItems: cart.items.map(item => ({
                    product: item.productId._id,
                    quantity: item.quantity,
                    price: item.productId.salePrice || item.productId.price,
                    status: 'Processing'
                })),
                totalPrice: subtotal,
                discount,
                finalAmount: total,
                deliveryCharge,
                address: addressId,
                addressDetails: address,
                paymentMethod,
                paymentStatus: 'Paid',
                status: 'Processing',
                createdOn: new Date()
            });

            await order.save();
            cart.items = [];
            await cart.save();
            req.session.appliedCouponId = null;

            return res.json({ success: true, message: 'Order placed successfully', orderId: order._id });
        }

        if (paymentMethod === 'razorpay') {
            const order = new Order({
                userId,
                orderedItems: cart.items.map(item => ({
                    product: item.productId._id,
                    quantity: item.quantity,
                    price: item.productId.salePrice || item.productId.price,
                    status: 'Pending'
                })),
                totalPrice: subtotal,
                discount,
                finalAmount: total,
                deliveryCharge,
                address: addressId,
                addressDetails: address,
                paymentMethod: 'razorpay',
                paymentStatus: 'Pending',
                status: 'Awaiting Payment',
                createdOn: new Date()
            });

            const savedOrder = await order.save();

            return res.json({
                success: true,
                createRazorpayOrder: true,
                total,
                orderId: savedOrder._id 
            });
        }

        if (paymentMethod === 'cod') {
            for (const item of cart.items) {
                const product = item.productId;
                product.quantity -= item.quantity;
                if (product.quantity <= 0) product.status = 'out of stock';
                await product.save();
            }

            const order = new Order({
                userId,
                orderedItems: cart.items.map(item => ({
                    product: item.productId._id,
                    quantity: item.quantity,
                    price: item.productId.salePrice || item.productId.price,
                    status: 'Processing'
                })),
                totalPrice: subtotal,
                discount,
                finalAmount: total,
                deliveryCharge,
                address: addressId,
                addressDetails: address,
                paymentMethod,
                paymentStatus: 'Pending',
                status: 'Processing',
                createdOn: new Date()
            });

            await order.save();
            cart.items = [];
            await cart.save();
            req.session.appliedCouponId = null;

            return res.json({ success: true, message: 'Order placed successfully', orderId: order._id });
        }

        res.json({ success: false, message: 'Invalid payment method' });

    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id || req.session.user;
        if (!userId) return res.redirect('/login');

        console.log('Looking for order with ID:', orderId, 'User ID:', userId);

        let order = orderId.match(/^[0-9a-fA-F]{24}$/) 
            ? await Order.findOne({ userId, _id: orderId }).populate('orderedItems.product')
            : await Order.findOne({ orderId, userId }).populate('orderedItems.product');

        console.log('Found order:', order ? order._id : 'Not found');

        if (!order) {
            console.log('Order not found, redirecting to orders page');
            return res.redirect('/user/orders');
        }

        res.render('user/order-success', { orderId: order.orderId || order._id, order });

    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/user/orders');
    }
};

const handleRetryPayment = async (req, res) => {
    try {

        const { orderId } = req.params;
        const userId = req.session.user._id || req.session.user;
        if (!orderId) return res.redirect('/shop');

        const failedOrder = await Order.findOne({
            _id: orderId, userId, paymentStatus: 'Failed'
        }).populate('orderedItems.product');

        if (!failedOrder) return res.redirect('/shop');

        const cartItems = failedOrder.orderedItems.map(item => ({
            productId: item.product._id, quantity: item.quantity,
            price: item.price, totalPrice: item.price * item.quantity
        }));

        await Cart.findOneAndUpdate({ userId }, { $set: { items: cartItems } }, { upsert: true });
        res.redirect('/user/checkout?retryOrderId=' + orderId);
    } catch (error) {
        console.error('Error handling retry payment:', error);
        res.redirect('/shop');
    }
};

module.exports = { 
    getCheckoutPage,
     placeOrder,
      getOrderSuccess, 
      handleRetryPayment 
    };