const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');

const getUserOrders = async (req, res) => {
    try {
        // Get user ID from session, handling both direct ID and user object cases
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Number of orders per page
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalOrders = await Order.countDocuments({ userId });
        const totalPages = Math.ceil(totalOrders / limit);

        // Get orders for the current page
        const orders = await Order.find({ userId })
            .populate('orderedItems.product')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        res.render('user/orders', { 
            orders,
            currentPage: page,
            totalPages,
            searchQuery: req.query.query || ''
        });

    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders');
    }
};

const searchUserOrders = async (req, res) => {
    try {
        const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const query = req.query.query?.trim();

        if (!userId) {
            return res.redirect('/login');
        }

        const orders = await Order.find({ userId })
            .populate('orderedItems.product')
            .sort({ createdOn: -1 });

        const filtered = orders.filter(order =>
            order.orderId.includes(query) ||
            order.orderedItems.some(item =>
                item.product?.productName?.toLowerCase().includes(query.toLowerCase())
            )
        );

        res.render('user/orders', {
            orders: filtered,
            currentPage: 1,
            totalPages: 1,
            searchQuery: query
        });
    } catch (error) {
        console.error('Error searching orders:', error);
        res.status(500).send('Error searching orders');
    }
};

const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        }).populate('orderedItems.product');

        if (!order) {
            return res.redirect('/user/orders');
        }

        res.render('user/order-details', { order });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).send('Error loading order details');
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason || reason.trim() === '') {
            return res.json({ success: false, message: 'Cancellation reason is required' });
        }

        // Find the order without populating first to verify it exists
        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        });

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        // Check if order is in a cancellable state
        if (!['Processing', 'Pending'].includes(order.status)) {
            return res.json({ success: false, message: 'Cannot cancel order in current status' });
        }

        // Populate the order to access product details
        await order.populate('orderedItems.product');

        // Update product stock for each item
        for (const item of order.orderedItems) {
            // Make sure product exists before updating stock
            if (item.product && item.product._id) {
                await Product.findByIdAndUpdate(
                    item.product._id,
                    { $inc: { stock: item.quantity } },
                    { new: true } // Return the updated document
                );
            }
        }

        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = reason.trim();
        await order.save();

        return res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        return res.status(500).json({ success: false, message: 'Error cancelling order', error: error.message });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason || reason.trim() === '') {
            return res.json({ success: false, message: 'Cancellation reason is required' });
        }

        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        // Check if order is in a cancellable state
        if (!['Processing', 'Pending'].includes(order.status)) {
            return res.json({ success: false, message: 'Cannot cancel item in current order status' });
        }

        // Populate the order to access product details
        await order.populate('orderedItems.product');

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.json({ success: false, message: 'Item not found in order' });
        }

        // Update product stock
        if (item.product && item.product._id) {
            await Product.findByIdAndUpdate(
                item.product._id,
                { $inc: { stock: item.quantity } },
                { new: true }
            );
        }

        // Store the item's price before cancellation
        const cancelledItemTotal = item.price * item.quantity;

        // Mark the item as cancelled
        item.status = 'Cancelled';
        item.cancellationReason = reason.trim();

        // Recalculate total price: only include non-cancelled items
        order.totalPrice = order.orderedItems.reduce((total, currentItem) => {
            return currentItem.status !== 'Cancelled'
                ? total + (currentItem.price * currentItem.quantity)
                : total;
        }, 0);

        // Recalculate tax (18%) and final amount
        const tax = order.totalPrice * 0.18;
        order.finalAmount = order.totalPrice + tax - (order.discount || 0);

        await order.save();

        return res.json({
            success: true,
            message: 'Item cancelled successfully',
            updatedOrder: {
                totalPrice: order.totalPrice,
                finalAmount: order.finalAmount,
                tax: tax,
                itemId: itemId,
                cancelledItemTotal: cancelledItemTotal
            }
        });
    } catch (error) {
        console.error('Error cancelling item:', error);
        return res.status(500).json({ success: false, message: 'Error cancelling item', error: error.message });
    }
};


const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason) {
            return res.json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        });

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.json({ success: false, message: 'Can only return delivered orders' });
        }

        // Populate the order to access product details
        await order.populate('orderedItems.product');

        // Update product stock for each item
        for (const item of order.orderedItems) {
            if (item.product && item.product._id) {
                await Product.findByIdAndUpdate(
                    item.product._id,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
            }
        }

        order.status = 'Return Request';
        order.returnReason = reason;
        await order.save();

        return res.json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error processing return:', error);
        return res.status(500).json({ success: false, message: 'Error processing return', error: error.message });
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        }).populate('orderedItems.product');

        if (!order) {
            return res.redirect('/user/orders');
        }

        // Company info (customize as needed)
        const companyInfo = {
            name: 'Euphoria',
            address: 'Calicut, Kerala 673613',
            email: 'support@euphoria.com',
            phone: '+91 7012287796',
            website: 'www.euphoria.com',
            gst: 'GSTIN1234567890'
        };

        // Generate PDF buffer
        const pdfBuffer = await createPDF('invoice', { order, companyInfo });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=invoice_${order.orderId}.pdf`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({ _id: orderId, userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage price'
            });

        if (!order) {
            return res.redirect('/user/orders');
        }

        res.render('user/order-details', { order });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.redirect('/user/orders');
    }
};

module.exports = {
    getUserOrders,
    searchUserOrders,
    getSingleOrder,
    cancelOrder,
    cancelItem,
    returnOrder,
    downloadInvoice,
    getOrderDetails
};