const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

// Helper function to calculate the order total with coupon
const calculateOrderTotal = (cart, coupon, deliveryCharge = 0) => {
    let subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let discount = 0;
    let couponDiscountAmount = 0;

    if (coupon) {
        if (coupon.discountType === 'percentage') {
            couponDiscountAmount = subtotal * (coupon.discountValue / 100);
            if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
                couponDiscountAmount = coupon.maxDiscountAmount;
            }
        } else if (coupon.discountType === 'fixed') {
            couponDiscountAmount = coupon.discountValue;
        }
        discount = Math.min(couponDiscountAmount, subtotal);
    }

    const taxes = Math.round(subtotal * 0.18);
    const total = subtotal + taxes + deliveryCharge - discount;

    return { subtotal, taxes, discount: couponDiscountAmount, total, deliveryCharge };
};

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage price'
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        const userData = await User.findById(userId).lean();
        const addressData = await Address.findOne({ userId }).lean();
        
        if (!userData) {
            return res.redirect('/login');
        }

        const regionCharges = {
            'local': 50,
            'regional': 100,
            'national': 150
        };
        const fixedCharge = 50;

        const address = (addressData && addressData.address && addressData.address.length > 0) 
            ? (addressData.address.find(a => a._id.equals(req.query.addressId)) || addressData.address[0])
            : null;
            
        // Calculate delivery charge based on order total
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        let deliveryCharge = subtotal >= 1000 ? 0 : 50;

        const appliedCoupon = req.session.appliedCouponId ? 
            await Coupon.findById(req.session.appliedCouponId) : null;

        const currentDate = new Date();
        const availableCoupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            $expr: { $lt: ['$usageCount', '$usageLimit'] },
            usedBy: { $ne: userId }
        });

        const { subtotal: calculatedSubtotal, taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon, deliveryCharge);
        const finalTotal = total + deliveryCharge;

        res.render('user/checkout', { 
            cart,
            subtotal: calculatedSubtotal,
            taxes,
            discount,
            total: finalTotal,
            user: userData,
            addresses: addressData ? addressData.address : [],
            appliedCoupon,
            availableCoupons,
            deliveryCharge
        });
        
    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

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
        res.status(500).json({ success: false, message: 'An error occurred while applying the coupon.' });
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
        res.status(500).json({ success: false, message: 'An error occurred while removing the coupon.' });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        const { addressId, address, paymentMethod, paymentId } = req.body;

        console.log('Place order request:', { addressId, paymentMethod, paymentId });

        // 1. Fetch the user's cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty.' });
        }

        // 2. Check product availability and reduce quantities
        for (const item of cart.items) {
            const product = item.productId;
            
            if (!product) {
                return res.json({ success: false, message: `Product ${item.productId} not found` });
            }

            if (product.quantity <= 0) {
                return res.json({ success: false, message: `Product ${product.productName} is out of stock` });
            }

            if (item.quantity > product.quantity) {
                return res.json({ 
                    success: false, 
                    message: `Only ${product.quantity} units of ${product.productName} are available` 
                });
            }

            // Reduce product quantity
            product.quantity -= item.quantity;
            
            if (product.quantity === 0) {
                product.status = 'out of stock';
            }
            
            await product.save();
        }

        // 3. Get delivery charge
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        let deliveryCharge = subtotal >= 1000 ? 0 : 50;

        // 4. Fetch applied coupon from session
        const appliedCoupon = req.session.appliedCouponId ? 
            await Coupon.findById(req.session.appliedCouponId) : null;

        // 5. Calculate order totals WITH delivery charge
        const { subtotal: calculatedSubtotal, taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon, deliveryCharge);

        console.log('Order totals:', { subtotal, taxes, discount, deliveryCharge, total });

        // 6. Validate payment method
        if (paymentMethod === 'cod' && total > 1000) {
            return res.json({ 
                success: false, 
                message: 'Cash on Delivery is not available for orders above ₹1000. Please choose another payment method.' 
            });
        }

        // 7. Check wallet balance if payment method is wallet
        if (paymentMethod === 'wallet') {
            const user = await User.findById(userId);
            if (!user) {
                return res.json({ success: false, message: 'User not found' });
            }

            if (user.wallet < total) {
                return res.json({ 
                    success: false, 
                    message: 'Insufficient wallet balance. Please choose another payment method.' 
                });
            }

            user.wallet -= total;
            await user.save();

            await WalletTransaction.create({
                userId: user._id,
                amount: total,
                type: 'debit',
                description: `Payment for order`,
                orderId: null // Will be updated after order creation
            });
        }

        // 8. Determine payment status
        let paymentStatus = 'Pending';
        if (paymentMethod === 'wallet') {
            paymentStatus = 'Paid';
        } else if (paymentMethod === 'razorpay' && paymentId) {
            paymentStatus = 'Paid';
        } else if (paymentMethod === 'cod') {
            paymentStatus = 'Pending';
        }

        console.log('Payment status determined:', paymentStatus);

        // 9. Create the order
        const order = new Order({
            userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.productId.salePrice || item.productId.price,
                status: 'Processing'
            })),
            totalPrice: subtotal,
            discount: discount,
            finalAmount: total,
            deliveryCharge: deliveryCharge,
            address: addressId,
            addressDetails: address,
            status: 'Processing',
            paymentMethod: paymentMethod,
            paymentStatus: paymentStatus,
            paymentId: paymentId || null,
            couponApplied: appliedCoupon ? true : false,
            createdOn: new Date()
        });

        const savedOrder = await order.save();
        console.log('Order saved successfully:', savedOrder._id);

        // 10. Update wallet transaction with order ID if wallet payment
        if (paymentMethod === 'wallet') {
            await WalletTransaction.updateOne(
                { userId: userId, orderId: null, type: 'debit' },
                { orderId: savedOrder._id },
                { sort: { createdAt: -1 } }
            );
        }

        // 11. Clear the cart
        cart.items = [];
        await cart.save();

        // 12. Update coupon usage if a coupon was applied
        if (appliedCoupon) {
            const coupon = await Coupon.findById(appliedCoupon._id);
            if (coupon) {
                coupon.usageCount += 1;
                coupon.usedBy.push(userId);
                await coupon.save();
            }
            req.session.appliedCouponId = null;
        }

        console.log('Order placed successfully, returning response');

        // 13. Return success response
        res.json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: savedOrder._id,
            total: total
        });

    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: 'Error placing order: ' + error.message });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id || req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        console.log('Looking for order with ID:', orderId);
        console.log('User ID:', userId);

        let order = null;
        
        // Try finding by _id if it looks like a MongoDB ObjectId
        if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
            order = await Order.findOne({
                userId: userId,
                _id: orderId
            }).populate('orderedItems.product');
        }

        // If not found by _id, try by orderId field
        if (!order) {
            order = await Order.findOne({ 
                orderId: orderId, 
                userId: userId
            }).populate('orderedItems.product');
        }

        console.log('Found order:', order ? order._id : 'Not found');

        if (!order) {
            console.log('Order not found, redirecting to orders page');
            return res.redirect('/user/orders');
        }

        // Render the order success page with the order details
        res.render('user/order-success', { 
            orderId: order.orderId || order._id,
            order
        });

    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/user/orders');
    }
};

const handleRetryPayment = async (req, res) => {
    try {
        const { orderId } = req.query;
        const userId = req.session.user._id;

        if (!orderId) {
            return res.redirect('/shop');
        }

        // Find the failed order
        const failedOrder = await Order.findOne({
            _id: orderId,
            userId: userId,
            paymentStatus: 'Failed'
        }).populate('orderedItems.product');

        if (!failedOrder) {
            return res.redirect('/shop');
        }

        // Clear existing cart
        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { items: [] } }
        );

        // Add failed order items to cart
        const cartItems = failedOrder.orderedItems.map(item => ({
            productId: item.product._id,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.price * item.quantity
        }));

        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { items: cartItems } },
            { upsert: true }
        );

        // Redirect to checkout with the orderId
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
    applyCoupon,
    removeCoupon,
    handleRetryPayment
};