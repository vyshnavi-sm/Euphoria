const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

// Helper function to calculate the order total with coupon
const calculateOrderTotal = (cart, coupon) => {
    let subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
    let discount = 0;
    let couponDiscountAmount = 0;

    if (coupon) {
        // Check if coupon is a percentage or fixed amount
        if (coupon.discountType === 'percentage') {
            couponDiscountAmount = subtotal * (coupon.discountValue / 100);
            // Apply max discount amount if specified
            if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
                couponDiscountAmount = coupon.maxDiscountAmount;
            }
        } else if (coupon.discountType === 'fixed') {
            couponDiscountAmount = coupon.discountValue;
        }
        // Ensure discount does not exceed subtotal
        discount = Math.min(couponDiscountAmount, subtotal);
    }

    const taxes = Math.round(subtotal * 0.18); // Assuming 18% tax
    const total = subtotal + taxes - discount;

    return { subtotal, taxes, discount: couponDiscountAmount, total };
};

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        // Get the user's cart with populated product data including images
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage price'  // Select only needed fields
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        // Get user data and addresses
        const userData = await User.findById(userId).lean();
        const addressData = await Address.findOne({ userId: userId }).lean();
        
        if (!userData) {
            return res.redirect('/login');
        }

        // Check for applied coupon in session
        const appliedCoupon = req.session.appliedCouponId ? 
            await Coupon.findById(req.session.appliedCouponId) : null;

        // Fetch available coupons for the user
        const currentDate = new Date();
        const availableCoupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            $expr: { $lt: ['$usageCount', '$usageLimit'] }, // Check if usageCount is less than usageLimit
            usedBy: { $ne: userId } // Check if user ID is not in usedBy array
        });

        // Calculate totals based on cart and applied coupon
        const { subtotal, taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon);

        res.render('user/checkout', { 
            cart,
            subtotal,
            taxes,
            discount,
            total,
            user: userData,
            addresses: addressData ? addressData.address : [],
            appliedCoupon,
            availableCoupons // Pass available coupons to the template
        });
      } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const applyCoupon = async (req, res) => {
    try {
        console.log('applyCoupon called with body:', req.body); // Debug log
        const userId = req.session.user;
        if (!userId) {
            console.log('No user ID found in session'); // Debug log
            return res.json({ success: false, message: 'User not logged in' });
        }

        const { couponCode } = req.body;
        console.log('Looking for coupon code:', couponCode); // Debug log
        const currentDate = new Date();

        // 1. Find the coupon
        const coupon = await Coupon.findOne({
            code: couponCode,
            isActive: true,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        });

        console.log('Found coupon:', coupon); // Debug log

        if (!coupon) {
            return res.json({ success: false, message: 'Invalid or expired coupon code.' });
        }

        // 2. Check coupon usage limit (if any)
        if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
            return res.json({ success: false, message: 'Coupon usage limit reached.' });
        }

        // 3. Check if user has already used this coupon
        if (coupon.usedBy.includes(userId)) {
            return res.json({ success: false, message: 'You have already used this coupon.' });
        }

        // 4. Check minimum order amount
        const cart = await Cart.findOne({ userId });
        if (!cart) {
             return res.json({ success: false, message: 'Your cart is empty.' });
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        console.log('Cart subtotal:', subtotal); // Debug log
        console.log('Coupon min order amount:', coupon.minOrderAmount); // Debug log

        if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
            return res.json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minOrderAmount.toFixed(2)} required to use this coupon.`
            });
        }

        // 5. Calculate discount and new total
        const { total, discount: couponDiscountAmount } = calculateOrderTotal(cart, coupon);
        console.log('Calculated total:', total); // Debug log
        console.log('Calculated discount:', couponDiscountAmount); // Debug log

        // 6. Apply coupon - store in session for now
        req.session.appliedCouponId = coupon._id;

        // 7. Send success response with updated total and coupon details
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

        // Remove coupon from session
        req.session.appliedCouponId = null;

        // Recalculate total
        const cart = await Cart.findOne({ userId });
         if (!cart) {
             return res.json({ success: false, message: 'Your cart is empty.' });
        }

        const { total } = calculateOrderTotal(cart, null); // Calculate total without coupon

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

        const { addressId, address, paymentMethod } = req.body;

        // 1. Fetch the user's cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty.' });
        }

        // 2. Check product availability and reduce quantities
        for (const item of cart.items) {
            const product = item.productId;
            
            // Check if product exists and is available
            if (!product) {
                return res.json({ success: false, message: `Product ${item.productId} not found` });
            }

            // Check if product is in stock
            if (product.quantity <= 0) {
                return res.json({ success: false, message: `Product ${product.productName} is out of stock` });
            }

            // Check if requested quantity is available
            if (item.quantity > product.quantity) {
                return res.json({ 
                    success: false, 
                    message: `Only ${product.quantity} units of ${product.productName} are available` 
                });
            }

            // Reduce product quantity
            product.quantity -= item.quantity;
            
            // Update product status if it becomes out of stock
            if (product.quantity === 0) {
                product.status = 'out of stock';
            }
            
            await product.save();
        }

        // 3. Fetch applied coupon from session
        const appliedCoupon = req.session.appliedCouponId ? 
            await Coupon.findById(req.session.appliedCouponId) : null;

        // 4. Calculate order totals
        const { subtotal, taxes, discount, total } = calculateOrderTotal(cart, appliedCoupon);

        // 5. Check wallet balance if payment method is wallet
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

            // Deduct amount from wallet
            user.wallet -= total;
            await user.save();

            // Create wallet transaction record
            await WalletTransaction.create({
                userId: user._id,
                amount: total,
                type: 'debit',
                description: `Payment for order #${cart._id}`,
                orderId: cart._id
            });
        }

        // 6. Create the order
        const order = new Order({
            userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.productId.salePrice,
                status: 'Processing'
            })),
            totalPrice: subtotal,
            discount: discount,
            finalAmount: total,
            address: addressId,
            addressDetails: address,
            status: 'Processing',
            paymentMethod: paymentMethod,
            paymentStatus: paymentMethod === 'wallet' ? 'Paid' : 'Pending'
        });

        await order.save();

        // 7. Clear the cart
        cart.items = [];
        await cart.save();

        // 8. Clear applied coupon from session
        if (appliedCoupon) {
            req.session.appliedCouponId = null;
        }

        // 9. Return success response
        res.json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: order._id,
            total: total
        });

    } catch (error) {
        console.error('Error placing order:', error);
        res.json({ success: false, message: 'Error placing order: ' + error.message });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        // Use user._id if available, otherwise use user directly
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        console.log('Looking for order with ID:', orderId);
        console.log('User ID:', userId);

        // First, try finding by _id if it looks like a MongoDB ObjectId
        let order = null;
        if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
            console.log('Trying to find by _id...');
            order = await Order.findOne({
                userId: userId,
                _id: orderId
            }).populate('orderedItems.product');
        }

        // If not found by _id, try by orderId
        if (!order) {
            console.log('Trying to find by orderId...');
            order = await Order.findOne({ 
                orderId: orderId, 
                userId: userId
            }).populate('orderedItems.product');
        }

        // If still not found, try case-insensitive search
        if (!order) {
            console.log('Trying case-insensitive search...');
            order = await Order.findOne({
                userId: userId,
                orderId: { $regex: new RegExp('^' + orderId + '$', 'i') }
            }).populate('orderedItems.product');
        }

        console.log('Found order:', order);

        if (!order) {
            console.log('Order not found with any method. Trying direct lookup...');
            // Last resort: try to find the order directly without userId filtering
            order = await Order.findById(orderId).populate('orderedItems.product');
            console.log('Direct lookup result:', order);
            
            if (!order) {
                console.log('Order not found with orderId:', orderId);
                return res.redirect('/user/orders');
            }
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

module.exports = {
    getCheckoutPage,
    placeOrder,
    getOrderSuccess,
    applyCoupon,
    removeCoupon
};