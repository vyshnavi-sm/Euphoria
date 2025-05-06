const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

// Get all orders with pagination, search, and filters
const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const sortBy = req.query.sortBy || 'createdOn';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let query = {};
        
        // Search functionality
        if (search) {
            query = {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { 'addressDetails.name': { $regex: search, $options: 'i' } },
                    { 'addressDetails.phone': { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Status filter
        if (status) {
            query.status = status;
        }

        // Calculate skip value for pagination
        const skip = (page - 1) * limit;

        // Get total count of documents
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        // Get orders with pagination
        const orders = await Order.find(query)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit);

        // Calculate pagination info
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        const nextPage = hasNextPage ? page + 1 : null;
        const prevPage = hasPrevPage ? page - 1 : null;

        res.json({
            orders,
            pagination: {
                currentPage: page,
                totalPages,
                totalOrders,
                hasNextPage,
                hasPrevPage,
                nextPage,
                prevPage,
                limit
            }
        });
    } catch (error) {
        console.error('Error in getAllOrders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get single order details
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .populate('address');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return Request', 'Returned'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        order.status = status;
        await order.save();

        res.json({ message: 'Order status updated successfully', order });
    } catch (error) {
        console.error('Error in updateOrderStatus:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Handle return request
const handleReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { action, reason, refundAmount } = req.body;

        const order = await Order.findById(orderId)
            .populate('userId')
            .populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.status !== 'Return Request') {
            return res.status(400).json({ message: 'Order is not in return request status' });
        }

        if (action === 'accept') {
            // Update order status
            order.status = 'Returned';
            order.returnStatus = 'Accepted';
            order.returnResponse = reason;
            order.returnProcessedDate = new Date();

            // Process refund to user's wallet
            if (refundAmount > 0) {
                const user = await User.findById(order.userId._id);
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }

                // Add amount to user's wallet
                user.wallet += refundAmount;
                await user.save();

                // Create wallet transaction record
                await WalletTransaction.create({
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for order #${order._id}`,
                    orderId: order._id
                });
            }

            // Update product stock
            for (const item of order.orderedItems) {
                const product = item.product;
                if (product) {
                    product.stock += item.quantity;
                    await product.save();
                }
            }
        } else if (action === 'reject') {
            order.status = 'Delivered'; // Revert back to delivered status
            order.returnStatus = 'Rejected';
            order.returnResponse = reason;
            order.returnProcessedDate = new Date();
        }

        await order.save();

        res.json({ 
            message: `Return request ${action}ed successfully`,
            order 
        });

    } catch (error) {
        console.error('Error handling return request:', error);
        res.status(500).json({ message: 'Error processing return request' });
    }
};

// Load orders page
const loadOrdersPage = (req, res) => {
    res.render('admin/orders');
};

module.exports = {
    loadOrdersPage,
    getAllOrders,
    getOrderDetails,
    updateOrderStatus,
    handleReturnRequest
}; 