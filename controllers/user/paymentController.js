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
        
        console.log('Creating Razorpay order:', { amount, orderId });
        
        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Razorpay expects amount in paise, ensure it's integer
            currency: 'INR',
            receipt: orderId || `order_${Date.now()}`,
            payment_capture: 1
        });

        console.log('Razorpay order created:', razorpayOrder.id);

        res.json({
            success: true,
            order: razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID // Send key to frontend
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.json({
            success: false,
            message: 'Error creating payment order: ' + error.message
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
            razorpay_signature
        } = req.body;

        console.log('Verifying Razorpay payment:', {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        });

        // Verify signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        console.log('Generated signature:', generated_signature);
        console.log('Received signature:', razorpay_signature);

        if (generated_signature === razorpay_signature) {
            console.log('Payment verification successful');
            
            res.json({
                success: true,
                message: 'Payment verified successfully',
                paymentId: razorpay_payment_id
            });
        } else {
            console.log('Payment verification failed - signature mismatch');
            
            res.json({
                success: false,
                message: 'Payment verification failed - signature mismatch'
            });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.json({
            success: false,
            message: 'Error verifying payment: ' + error.message
        });
    }
};

// Handle payment failure
const handlePaymentFailure = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Handling payment failure for order:', orderId);
        
        // Find and update order status if needed
        if (orderId) {
            try {
                await Order.findByIdAndUpdate(orderId, {
                    paymentStatus: 'Failed',
                    status: 'Payment Failed'
                });
                console.log('Updated order status to failed');
            } catch (updateError) {
                console.error('Error updating order status:', updateError);
            }
        }
        
        res.render('user/payment-failed', { orderId });
    } catch (error) {
        console.error('Error handling payment failure:', error);
        res.redirect('/user/orders');
    }
};

// New function to handle payment success
const handlePaymentSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log('Handling payment success for order:', orderId);
        
        // Find and update order status
        if (orderId) {
            try {
                const order = await Order.findByIdAndUpdate(orderId, {
                    paymentStatus: 'Paid',
                    status: 'Processing'
                }, { new: true });
                
                if (order) {
                    console.log('Updated order status to paid');
                    return res.redirect(`/user/order-success/${orderId}`);
                } else {
                    console.log('Order not found for success update');
                }
            } catch (updateError) {
                console.error('Error updating order status on success:', updateError);
            }
        }
        
        // Fallback redirect
        res.redirect('/user/orders');
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