const Razorpay = require('razorpay');
const Order = require('../../models/orderSchema');
const crypto = require('crypto');
const { STATUS_CODE } = require("../../utils/statusCodes.js");
const Product = require("../../models/productSchema")
const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');


let razorpay;
try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay credentials not found in environment variables');
    }
    
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
    console.error('Error initializing Razorpay:', error.message);
}

const createRazorpayOrder = async (req, res) => {
    try {
        if (!razorpay) {
            return res.json({
                success: false,
                message: 'Payment service is not configured'
            });
        }

        const { amount, orderId } = req.body;
        console.log('Creating Razorpay order:', { amount, orderId });

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(amount * 100), 
            currency: 'INR',
            receipt: orderId || `order_${Date.now()}`,
            payment_capture: 1
        });

        console.log('Razorpay order created:', razorpayOrder.id);

        res.json({
            success: true,
            order: razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.json({
            success: false,
            message: 'Error creating payment order: ' + error.message
        });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Failed',
                status: 'Payment Failed'
            });
            return res.json({ success: false, message: 'Payment verification failed' });
        }

        const order = await Order.findById(orderId).populate('orderedItems.product');
        if (!order) return res.json({ success: false, message: 'Order not found' });

        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product._id);
            if (product) {
                product.quantity -= item.quantity;
                if (product.quantity <= 0) product.status = 'out of stock';
                await product.save();
            }
        }

        await Cart.findOneAndUpdate({ userId: order.userId }, { $set: { items: [] } });

        order.paymentStatus = 'Paid';
        order.status = 'Processing';
        order.paymentId = razorpay_payment_id;
        await order.save();

        res.json({ success: true, message: 'Payment verified and order updated', orderId: order._id });

    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({ success: false, message: 'Error verifying payment: ' + error.message });
    }
};

const handlePaymentFailure = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Handling payment failure for order:', orderId);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.warn(`Invalid orderId received: ${orderId}`);
            return res.redirect('/user/orders');
        }

        const order = await Order.findById(orderId).populate('orderedItems.product');
        if (!order) {
            console.warn(`Order not found for failure: ${orderId}`);
            return res.redirect('/user/orders');
        }

        if (order.paymentStatus !== 'Failed') {
            order.paymentStatus = 'Failed';
            order.status = 'Payment Failed';
            await order.save();
        }

        if (!order.stockRestored) {
            for (const item of order.orderedItems) {
                const product = item.product;
                if (product) {
                    product.quantity += item.quantity;
                    await product.save();
                }
            }
            order.stockRestored = true; 
            await order.save();
        }

        res.render('user/payment-failed', { orderId });

    } catch (error) {
        console.error('Error handling payment failure:', error);
        res.redirect('/user/orders');
    }
};

const handlePaymentSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.query;

        console.log('Handling payment success for order:', orderId);

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.warn(`Invalid orderId: ${orderId}`);
            return res.redirect('/user/orders');
        }

        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Failed',
                status: 'Payment Failed'
            });
            return res.redirect(`/user/payment-failed/${orderId}`);
        }

        const order = await Order.findByIdAndUpdate(orderId, {
            paymentStatus: 'Paid',
            status: 'Processing',
            paymentId: razorpay_payment_id
        }, { new: true });

        if (!order) {
            console.warn('Order not found for success update:', orderId);
            return res.redirect('/user/orders');
        }

        return res.redirect(`/user/order-success/${orderId}`);

    } catch (error) {
        console.error('Error handling payment success:', error);
        res.redirect('/user/orders');
    }
};

module.exports = {
    createRazorpayOrder,
    verifyRazorpayPayment,
    handlePaymentFailure,
    handlePaymentSuccess
};