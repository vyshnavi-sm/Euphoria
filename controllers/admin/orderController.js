const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

// Get all orders with pagination, search, and filters
const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder || 'desc';

        let query = {};

        // Search functionality
        if (search) {
            query.$or = [
                { _id: { $regex: search, $options: 'i' } },
                { 'userId.name': { $regex: search, $options: 'i' } },
                { 'userId.email': { $regex: search, $options: 'i' } }
            ];
        }

        // Status filter
        if (status) {
            query.status = status;
        }

        const skip = (page - 1) * limit;

        // Create sort object - ALWAYS prioritize newest orders first
        let sortObj = {};
        
        if (sortBy === 'totalPrice') {
            // When sorting by price, still keep createdAt as primary sort for recent orders
            sortObj = {
                createdAt: -1, // PRIMARY: Always show newest first
                totalPrice: sortOrder === 'desc' ? -1 : 1 // SECONDARY: Then sort by price
            };
        } else {
            // Default: Sort by creation date (newest first)
            sortObj = {
                createdAt: -1 // Always newest first
            };
        }

        // Aggregation pipeline
        let pipeline = [
            { $match: query },
            // Populate user details
            { 
                $lookup: { 
                    from: 'users', 
                    localField: 'userId', 
                    foreignField: '_id', 
                    as: 'userId' 
                } 
            },
            { $unwind: '$userId' }, // Deconstruct the user array
            // CRITICAL: Sort by newest orders first ALWAYS
            { $sort: sortObj },
            { $skip: skip },
            { $limit: limit }
        ];

        const orders = await Order.aggregate(pipeline);

        // Manually populate orderedItems.product if needed for other parts of the template
        await Order.populate(orders, { path: 'orderedItems.product' });

        // Get total count for pagination (without skip and limit, but with match)
        let countPipeline = [
            { $match: query },
            { $count: 'totalOrders' }
        ];

        const countResult = await Order.aggregate(countPipeline);
        const totalOrders = countResult.length > 0 ? countResult[0].totalOrders : 0;
        const totalPages = Math.ceil(totalOrders / limit);

        // Format date and ensure necessary fields for frontend - preserve original createdAt
        orders.forEach(order => {
            // Use the original createdAt from database (don't override it)
            const orderDate = order.createdAt || order.createdOn;
            
            // Only set createdAt if it doesn't exist
            if (!order.createdAt && order.createdOn) {
                order.createdAt = order.createdOn;
            }
            
            // Add formatted date for display purposes
            order.formattedDate = orderDate ? new Date(orderDate).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }) : 'N/A';
        });

        // Double-check sorting: ensure orders are sorted by newest first
        orders.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.createdOn);
            const dateB = new Date(b.createdAt || b.createdOn);
            return dateB - dateA; // Newest first
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

        // Preserve original createdAt from database
        const orderDate = order.createdAt || order.createdOn;
        
        // Only set createdAt if it doesn't exist
        if (!order.createdAt && order.createdOn) {
            order.createdAt = order.createdOn;
        }
        
        // Add formatted date for display
        order.formattedDate = orderDate ? new Date(orderDate).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }) : 'N/A';

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
            'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Payment Failed'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const currentStatus = order.status;

        // Define allowed status transitions
        const allowedTransitions = {
            'Pending': ['Processing', 'Cancelled', 'Payment Failed'],
            'Processing': ['Shipped', 'Cancelled', 'Payment Failed'],
            'Shipped': ['Out for Delivery', 'Returned', 'Payment Failed'],
            'Out for Delivery': ['Delivered', 'Returned', 'Payment Failed'],
            'Delivered': ['Return Request'],
            'Return Request': ['Returned', 'Delivered'],
            'Payment Failed': ['Cancelled', 'Processing'], // Allow retry or cancellation
            'Cancelled': [], // Terminal status
            'Returned': [] // Terminal status
        };

        // Check if the requested status transition is allowed
        if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(status)) {
             // Allow cancelling or returning an order from most non-terminal states if it's not already cancelled or returned
             if (!['Cancelled', 'Returned'].includes(currentStatus) && (status === 'Cancelled' || status === 'Return Request')) {
                  // Special case: Allow cancelling or requesting return if not already in a terminal state
             } else {
                return res.status(400).json({ error: `Invalid status transition from '${currentStatus}' to '${status}'` });
             }
        }

        order.status = status;
        // Add a status update timestamp (but don't change createdAt)
        order.statusUpdatedAt = new Date();

        // Update individual items status when order is marked as Delivered
        if (status === 'Delivered') {
            order.orderedItems.forEach(item => {
                // Only update status for items that are not cancelled, returned, or return requested
                if (!['Returned', 'Return Requested', 'Cancelled'].includes(item.status)) {
                    item.status = 'Delivered';
                }
            });
        }

        // Update individual items status when order is marked as Payment Failed
        if (status === 'Payment Failed') {
            order.orderedItems.forEach(item => {
                if (!['Returned', 'Return Requested', 'Cancelled'].includes(item.status)) {
                    item.status = 'Payment Failed';
                }
            });
        }

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
        const { action, refundAmount } = req.body;

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
            order.orderedItems.forEach((item) => {
                item.status = "Returned";
            });
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
        }

        await order.save();
        res.json({ success: true, message: `Return request ${action}ed successfully` });
    } catch (error) {
        console.error('Error handling return request:', error);
        res.status(500).json({ success: false, message: 'Error processing return request' });
    }
};

// Handle individual item return request from admin side
const handleItemReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action, refundAmount, rejectReason } = req.body;

        if (!orderId || !itemId) {
            return res.status(400).json({ message: 'Order ID and Item ID are required' });
        }

        const order = await Order.findById(orderId)
            .populate('userId')
            .populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const item = order.orderedItems.id(itemId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found in order' });
        }

        if (item.status !== 'Return Requested') {
            return res.status(400).json({ message: 'Item is not in return request status' });
        }

        if (action === 'accept') {
            item.status = 'Returned';
            item.returnStatus = 'Accepted';

            // Process refund if amount is provided and valid
            const refundAmt = parseFloat(refundAmount);
            if (!isNaN(refundAmt) && refundAmt > 0 && order.userId) {
                const user = await User.findById(order.userId);
                if (user) {
                    user.wallet = (user.wallet || 0) + refundAmt;
                    await user.save();

                    await WalletTransaction.create({
                        userId: user._id,
                        amount: refundAmt,
                        type: 'credit',
                        description: `Refund for item return (Order #${order._id}, Item ID: ${item._id})`,
                        orderId: order._id,
                        itemId: item._id
                    });
                }
            }

            // Update product stock
            const product = item.product;
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }

            // Check if all items are returned
            const allReturned = order.orderedItems.every(item => 
                item.status === 'Returned' || item.status === 'Cancelled'
            );

            if (allReturned) {
                order.status = 'Returned';
                order.returnStatus = 'Accepted';
            }
        } else if (action === 'reject') {
            item.status = 'Delivered';
            item.returnStatus = 'Rejected';
            if (rejectReason) {
                item.adminRejectionReason = rejectReason;
            }
        }

        await order.save();
        res.json({ success: true, message: `Item return request ${action}ed successfully` });
    } catch (error) {
        console.error('Error handling item return request:', error);
        res.status(500).json({ success: false, message: 'Error processing item return request' });
    }
};

// Load orders page
const loadOrdersPage = (req, res) => {
    res.render('admin/orders');
};

// Load order details page
const loadOrderDetailsPage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .populate('address')
            .lean(); // Use lean for better performance

        if (!order) {
            return res.redirect('/admin/orders?error=Order not found');
        }

        console.log('Fetched order status from DB:', order.status); // Log the status
        console.log('statusUpdatedAt from DB:', order.statusUpdatedAt); // Log statusUpdatedAt

        // If the overall order is cancelled, ensure individual items are displayed as cancelled
        if (order.status === 'Cancelled') {
            order.orderedItems.forEach(item => {
                if (item.status !== 'Returned' && item.status !== 'Return Requested') {
                    item.status = 'Cancelled'; // Force display status to Cancelled
                }
            });
        }

        // Preserve original createdAt from database
        const orderDate = order.createdAt || order.createdOn;
        
        // Only set createdAt if it doesn't exist
        if (!order.createdAt && order.createdOn) {
            order.createdAt = order.createdOn;
        }
        
        // Add formatted date for display
        order.formattedDate = orderDate ? new Date(orderDate).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }) : 'N/A';

        // If address is not populated but addressDetails exists, use addressDetails
        if (!order.address && order.addressDetails) {
            order.address = order.addressDetails;
        }

        // Helper function to determine badge class based on status
        const getStatusBadgeClass = (status) => {
          switch(status) {
            case 'Delivered':
              return 'success';
            case 'Cancelled':
            case 'Returned':
            case 'Payment Failed':
              return 'danger';
            case 'Out for Delivery':
              return 'info';
            case 'Shipped':
            case 'Processing':
            case 'Pending':
            case 'Return Request':
            default:
              return 'warning';
          }
        };

        // Add badge class to overall order status
        order.statusBadgeClass = getStatusBadgeClass(order.status);

        // Add badge class to each item status
        order.orderedItems.forEach(item => {
            item.statusBadgeClass = getStatusBadgeClass(item.status);
        });

        res.render('admin/adminOrderdetails', { order });
    } catch (error) {
        console.error('Error in loadOrderDetailsPage:', error);
        res.redirect('/admin/orders?error=Error loading order details');
    }
};

module.exports = {
    loadOrdersPage,
    getAllOrders,
    getOrderDetails,
    updateOrderStatus,
    handleReturnRequest,
    loadOrderDetailsPage,
    handleItemReturnRequest
};