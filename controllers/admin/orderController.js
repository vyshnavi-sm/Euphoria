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
        const sortBy = req.query.sortBy || 'createdAt'; // Default sort by order creation date
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let query = {};

        // Search functionality
        if (search) {
            query = {
                $or: [
                    { _id: { $regex: search, $options: 'i' } }, // Search by Order ID (which is _id)
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

        // Create sort object - ALWAYS prioritize newest orders first
        let sortObj = {};
        
        if (sortBy === 'totalPrice') {
            // When sorting by price, still keep createdAt as primary sort for recent orders
            sortObj = {
                createdAt: -1, // PRIMARY: Always show newest first
                totalPrice: sortOrder // SECONDARY: Then sort by price
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
            'Delivered', 'Cancelled', 'Return Request', 'Returned'
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
            'Pending': ['Processing', 'Cancelled'],
            'Processing': ['Shipped', 'Cancelled'],
            'Shipped': ['Out for Delivery', 'Returned'],
            'Out for Delivery': ['Delivered', 'Returned'],
            'Delivered': ['Return Request'],
            'Return Request': ['Returned', 'Delivered'], // Can accept or reject return request
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
            order.orderedItems.forEach((item)=>{
                item.status="Returned"
            })
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
        } else {
            order.status = 'Delivered';
            order.returnStatus = 'Rejected';
            order.returnProcessedDate = new Date();
            // Preserve cancelled items' status when rejecting return
            order.orderedItems.forEach(item => {
                if (item.status !== 'Cancelled') {
                    item.status = 'Delivered';
                }
            });
            // Assuming a rejection reason is sent in the body for overall order rejection
            if (req.body.rejectReason) {
                order.adminReturnRejectionReason = req.body.rejectReason.trim();
            }
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

// Handle individual item return request from admin side
const handleItemReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action, refundAmount } = req.body;

        if (!orderId || !itemId || !action) {
            return res.status(400).json({ message: 'Missing required parameters' });
        }

        const order = await Order.findById(orderId).populate('orderedItems.product');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const item = order.orderedItems.id(itemId);

        if (!item) {
            return res.status(404).json({ message: 'Item not found in order' });
        }

        // Validate item status - should be 'Return Requested' to process
        if (item.status !== 'Return Requested') {
            return res.status(400).json({ message: `Item status is '${item.status}', cannot process return request.` });
        }

        if (action === 'accept') {
            item.status = 'Returned';
            // Process refund if amount is provided and valid
            const refundAmt = parseFloat(refundAmount);
            if (!isNaN(refundAmt) && refundAmt > 0 && order.userId) {
                 const user = await User.findById(order.userId);
                 if(user) {
                     user.wallet = Number(user.wallet) + refundAmt; // Ensure wallet is treated as a number
                     await user.save();
                     // Log wallet transaction (optional but recommended)
                      await WalletTransaction.create({
                          userId: user._id,
                          amount: refundAmt,
                          type: 'credit',
                          description: `Refund for item return (Order #${order._id}, Item ID: ${item._id})`,
                          orderId: order._id,
                          itemId: item._id
                      });
                 } else {
                     console.error('User not found for wallet update:', order.userId);
                 }
            }

            // Update product stock
            if (item.product) {
                const product = await Product.findById(item.product._id);
                 if(product) {
                     product.stock += item.quantity;
                     await product.save();
                 } else {
                      console.error('Product not found for stock update:', item.product._id);
                 }
            }

            // Recalculate order totals if the item price was included in them
            const returnedItemsTotal = order.orderedItems.reduce((total, item) => {
                if (item.status === 'Returned' || item.status === 'Cancelled') {
                    return total + (item.product.salePrice * item.quantity);
                }
                return total;
            }, 0);

            // Update order totals
            order.totalPrice = order.orderedItems.reduce((total, item) => {
                if (item.status !== 'Returned' && item.status !== 'Cancelled') {
                    return total + (item.product.salePrice * item.quantity);
                }
                return total;
            }, 0);

            // Recalculate tax and final amount
            order.tax = order.totalPrice * 0.18; // Assuming 18% tax
            order.finalAmount = order.totalPrice + order.tax - (order.discount || 0);

        } else if (action === 'reject') {
            // Change item status back to Delivered
            item.status = 'Delivered';
             item.returnReason = undefined; // Clear user's return reason on rejection
            // Save admin's rejection reason for the item
            if (req.body.rejectReason) {
                item.adminRejectionReason = req.body.rejectReason.trim();
            }
        } else {
            return res.status(400).json({ message: 'Invalid action specified' });
        }

        await order.save();

        res.json({ 
            success: true,
            message: `Item return request ${action}ed successfully`,
            itemStatus: item.status, // Return the updated item status
            // Include rejection reason in response if available
            ...(action === 'reject' && item.adminRejectionReason && { adminRejectionReason: item.adminRejectionReason })
        });

    } catch (error) {
        console.error('Error handling item return request:', error);
        res.status(500).json({ message: 'Error processing item return request', error: error.message });
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