const Razorpay = require('razorpay');
const Order = require('../../models/orderSchema');
const crypto = require('crypto');

// Initialize Razorpay with error handling
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
    // Don't throw here, let the application continue but handle the error in the routes
}

// Create Razorpay order
const createRazorpayOrder = async (req, res) => {
    try {
        if (!razorpay) {
            return res.json({
                success: false,
                message: 'Payment service is not properly configured'
            });
        }

        const { amount, orderId } = req.body;
        
        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: amount * 100, // Razorpay expects amount in paise
            currency: 'INR',
            receipt: orderId,
            payment_capture: 1
        });

        res.json({
            success: true,
            order: razorpayOrder
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.json({
            success: false,
            message: 'Error creating payment order'
        });
    }
};

// Verify Razorpay payment
const verifyRazorpayPayment = async (req, res) => {
    try {
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.json({
                success: false,
                message: 'Payment service is not properly configured'
            });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        // Verify signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // Update order status
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Paid',
                paymentId: razorpay_payment_id,
                status: 'Processing'
            });

            res.json({
                success: true,
                message: 'Payment verified successfully'
            });
        } else {
            res.json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.json({
            success: false,
            message: 'Error verifying payment'
        });
    }
};

module.exports = {
    createRazorpayOrder,
    verifyRazorpayPayment
}; 