const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');

const getUserOrders = async (req, res) => {
    try {
        // Get user ID from session, handling both direct ID and user object cases
        const userId = req.session.user; // Correctly get user ID from session

        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of orders per page
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query?.trim();

        let query = { userId };

        // Add search functionality to the database query
        if (searchQuery) {
            query.$or = [
                { _id: { $regex: searchQuery, $options: 'i' } }, // Search by Order ID
                // To search within orderedItems product names, we need aggregation
                // For simplicity, we'll keep the basic search on ID for now
                // A more complex implementation would involve aggregation
            ];
        }

        // Fetch user orders with sorting and pagination applied by the database
        const orders = await Order.find(query)
            .populate('orderedItems.product')
            .sort({ createdOn: -1 }) // Always sort by newest first
            .skip(skip)
            .limit(limit);

        // Get the total count of orders matching the search query for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('user/orders', {
            orders, // Render paginated and filtered orders
            currentPage: page,
            totalPages,
            searchQuery: searchQuery || '' // Pass the search query back to the template
        });

    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders');
    }
};

const searchUserOrders = async (req, res) => {
    // This function is now redundant as getUserOrders handles search
    // We can redirect to the main orders page with the query
    const query = req.query.query?.trim();
    res.redirect(`/user/orders${query ? '?query=' + query : ''}`);
};

const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

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

        console.log('Fetched order details for user:', order._id);
        console.log('Order status:', order.status);
        console.log('Overall admin rejection reason:', order.adminReturnRejectionReason);
        order.orderedItems.forEach((item, index) => {
            console.log(`Item ${index} status: ${item.status}`);
            console.log(`Item ${index} admin rejection reason: ${item.adminRejectionReason}`);
        });

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
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

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
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

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

        if (!['Processing', 'Pending'].includes(order.status)) {
            return res.json({ success: false, message: 'Cannot cancel item in current order status' });
        }

        await order.populate('orderedItems.product');

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.json({ success: false, message: 'Item not found in order' });
        }

        if (item.status === 'Cancelled') {
            return res.json({ success: false, message: 'Item is already cancelled' });
        }

        // Update product stock
        if (item.product && item.product._id) {
            await Product.findByIdAndUpdate(
                item.product._id,
                { $inc: { stock: item.quantity } },
                { new: true }
            );
        }

        const cancelledItemTotal = item.price * item.quantity;

        // Mark the item as cancelled
        item.status = 'Cancelled';
        item.cancellationReason = reason.trim();

        // Recalculate total price: only include non-cancelled items
        order.totalPrice = order.orderedItems.reduce((total, currentItem) => {
            
            return currentItem.status !== 'Cancelled'
                ? total + (currentItem.product.salePrice * currentItem.quantity)
                : total;
        }, 0);
        

        // Recalculate tax (18%) and final amount
        order.tax = order.totalPrice * 0.18;
        order.finalAmount = order.totalPrice + order.tax - (order.discount || 0);

        // If all items are cancelled, update order status
        const allCancelled = order.orderedItems.every(item => item.status === 'Cancelled');
        if (allCancelled) {
            order.status = 'Cancelled';
        }

        await order.save();

        return res.json({
            success: true,
            message: 'Item cancelled successfully',
            updatedOrder: {
                totalPrice: order.totalPrice,
                finalAmount: order.finalAmount,
                tax: order.tax,
                itemId: itemId,
                cancelledItemTotal: cancelledItemTotal
            }
        });
    } catch (error) {
        console.error('Error cancelling item:', error);
        return res.status(500).json({ success: false, message: 'Error cancelling item', error: error.message });
     }
};

const returnSingleItem = async (req, res) => {
    try {
        // console.log('--- returnSingleItem function started ---');
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

        // console.log('Received params and body:', { orderId, itemId, reason });
        // console.log('User ID from session:', userId);

        if (!userId) {
            // console.log('Error: User not logged in');
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason || reason.trim() === '') {
            // console.log('Error: Return reason is required');
            return res.json({ success: false, message: 'Return reason is required' });
        }

        // console.log('Searching for order with ID:', orderId, 'for user:', userId);
        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            // console.log('Error: Order not found');
            return res.json({ success: false, message: 'Order not found' });
        }

        // console.log('Order found. Searching for item with ID:', itemId);
        const item = order.orderedItems.id(itemId);

        if (!item) {
            // console.log('Error: Item not found in order');
            return res.json({ success: false, message: 'Item not found in order' });
        }

        // console.log('Item found. Checking order status:', order.status);
        // Check if the item is in a returnable status (e.g., 'Delivered')
        if (order.status !== 'Delivered') {
            // console.log('Error: Order status is not Delivered');
            return res.json({ success: false, message: 'Can only request return for items in delivered orders' });
        }

        // console.log('Order status is Delivered. Updating item status and reason.');
        // Update the item's status to 'Return Requested'
        item.status = 'Return Requested';
        item.returnReason = reason.trim();

        // console.log('Saving updated order:', order._id);
        await order.save();

        // console.log('Order saved successfully. Return request for item submitted.');
        // console.log('--- returnSingleItem function finished ---');
        return res.json({ success: true, message: 'Return request for item submitted successfully' });

    } catch (error) {
        // console.error('--- Error in returnSingleItem function ---');
        // console.error('Error details:', error);
        // console.error('--- End of Error in returnSingleItem ---');
        return res.status(500).json({ success: false, message: 'Error submitting return request', error: error.message });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason) {
            return res.json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        })
        .populate('orderedItems.product')
        .select('+orderedItems.adminRejectionReason +orderedItems.adminReturnReason +adminReturnRejectionReason +adminRejectionReason'); // Include admin rejection reasons

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
                select: 'productName productImage salePrice'
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
    returnSingleItem,
    returnOrder,
    downloadInvoice,
    getOrderDetails,
};



