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
        const sortBy = req.query.sortBy || 'createdAt'; // Changed to createdAt to match front-end
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

        const skip = (page - 1) * limit;
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        // Map field names to handle both createdAt and createdOn
        let sortField = sortBy;
        // If we're sorting by date, handle both field names
        if (sortBy === 'createdAt') {
            // Use $sort with $or to handle both field names
            // The controller needs to adapt to the actual field in the database
            sortField = 'createdAt'; // Default to createdAt
        }

        // Fetch orders with proper sorting
        const orders = await Order.find(query)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .sort({ [sortField]: sortOrder }) // Use the mapped field name
            .skip(skip)
            .limit(limit)
            .lean(); // Use lean() for better performance

        // Format date for easier rendering and ensure both date fields are available
        orders.forEach(order => {
            // Make sure we have a consistent date field that the frontend can use
            const orderDate = order.createdAt || order.createdOn || new Date();
            order.createdAt = orderDate; // Ensure createdAt exists
            order.formattedDate = new Date(orderDate).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        });

        res.json({
            orders,
            pagination: {
                currentPage: page,
                totalPages,
                totalOrders,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page < totalPages ? page + 1 : null,
                prevPage: page > 1 ? page - 1 : null,
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
            .populate('address')
            .lean(); // Use lean for better performance

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Ensure we have a consistent date field
        const orderDate = order.createdAt || order.createdOn || new Date();
        order.createdAt = orderDate; // Ensure createdAt exists
        order.formattedDate = new Date(orderDate).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

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

        if (!orderId) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        const validStatuses = [
            'Pending', 'Processing', 'Shipped', 'Out for Delivery',
            'Delivered', 'Cancelled', 'Return Request', 'Returned'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        order.status = status;
        // Add a status update timestamp
        order.statusUpdatedAt = new Date();
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

        if (!orderId) {
            return res.status(400).json({ message: 'Order ID is required' });
        }

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
            order.status = 'Returned';
            order.returnStatus = 'Accepted';
            order.returnResponse = reason;
            order.returnProcessedDate = new Date();

            if (refundAmount > 0) {
                const user = await User.findById(order.userId._id);
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }

                user.wallet += refundAmount;
                await user.save();

                await WalletTransaction.create({
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for order #${order._id}`,
                    orderId: order._id
                });
            }

            for (const item of order.orderedItems) {
                const product = item.product;
                if (product) {
                    product.stock += item.quantity;
                    await product.save();
                }
            }
        } else if (action === 'reject') {
            order.status = 'Delivered';
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