const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let matchQuery = {};
        if (status) matchQuery.status = status;

        if (search) {
            let orArr = [];
            if (mongoose.Types.ObjectId.isValid(search)) {
                orArr.push({ _id: mongoose.Types.ObjectId(search) });
            }
            orArr.push({ 'userId.name': { $regex: search, $options: 'i' } });
            orArr.push({ 'userId.email': { $regex: search, $options: 'i' } });
            matchQuery.$or = orArr;
        }

        const skip = (page - 1) * limit;
        const sortObj = sortBy === 'totalPrice' ? { createdAt: -1, totalPrice: sortOrder } : { createdAt: -1 };

        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userId'
                }
            },
            { $unwind: '$userId' },
            { $match: matchQuery },
            { $sort: sortObj },
            { $skip: skip },
            { $limit: limit }
        ];

        const orders = await Order.aggregate(pipeline);
        await Order.populate(orders, { path: 'orderedItems.product' });

        const countResult = await Order.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userId'
                }
            },
            { $unwind: '$userId' },
            { $match: matchQuery },
            { $count: 'totalOrders' }
        ]);

        const totalOrders = countResult[0]?.totalOrders || 0;
        const totalPages = Math.ceil(totalOrders / limit);

        orders.forEach(order => {
            const orderDate = order.createdAt || order.createdOn;
            if (!order.createdAt && order.createdOn) order.createdAt = order.createdOn;

            order.formattedDate = orderDate
                ? new Date(orderDate).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                  })
                : 'N/A';
        });

        if (sortBy !== 'totalPrice') {
            orders.sort((a, b) => new Date(b.createdAt || b.createdOn) - new Date(a.createdAt || a.createdOn));
        }

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
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .populate('address')
            .lean();

        if (!order) return res.status(STATUS_CODE.NOT_FOUND).json({ error: 'Order not found' });

        const activeItems = order.orderedItems.filter(item => item.status !== 'Cancelled' && item.status !== 'Returned');
        const totalItemsValue = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const subtotal = totalItemsValue;
        const calculatedTax = subtotal * 0.18;

        order.orderedItems.forEach(item => {
            const isActive = item.status !== 'Cancelled' && item.status !== 'Returned';
            const itemValue = item.price * item.quantity;
            const percent = totalItemsValue > 0 ? itemValue / totalItemsValue : 0;
            item.proportionalDiscount = isActive && order.discount > 0 ? +(order.discount * percent).toFixed(2) : 0;
            item.proportionalTax = isActive && calculatedTax > 0 ? +(calculatedTax * percent).toFixed(2) : 0;
        });

        const orderDate = order.createdAt || order.createdOn;
        if (!order.createdAt && order.createdOn) order.createdAt = order.createdOn;
        order.formattedDate = orderDate
            ? new Date(orderDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
            : 'N/A';

        res.json(order);
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!orderId) return res.status(STATUS_CODE.BAD_REQUEST).json({ error: 'Order ID is required' });

        const validStatuses = [
            'Pending', 'Processing', 'Shipped', 'Out for Delivery',
            'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Payment Failed'
        ];
        if (!validStatuses.includes(status)) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ error: 'Invalid status' });
        }

        const order = await Order.findById(orderId);
        if (!order) return res.status(STATUS_CODE.NOT_FOUND).json({ error: 'Order not found' });

        const allowedTransitions = {
            'Pending': ['Processing', 'Cancelled', 'Payment Failed'],
            'Processing': ['Shipped', 'Cancelled', 'Payment Failed'],
            'Shipped': ['Out for Delivery', 'Returned', 'Payment Failed'],
            'Out for Delivery': ['Delivered', 'Returned', 'Payment Failed'],
            'Delivered': ['Return Request'],
            'Return Request': ['Returned', 'Delivered'],
            'Payment Failed': ['Cancelled', 'Processing'],
            'Cancelled': [],
            'Returned': []
        };

        const currentStatus = order.status;
        const isAllowed =
            allowedTransitions[currentStatus]?.includes(status) ||
            (!['Cancelled', 'Returned'].includes(currentStatus) &&
             ['Cancelled', 'Return Request'].includes(status));

        if (!isAllowed) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ error: `Invalid status transition from '${currentStatus}' to '${status}'` });
        }

        order.status = status;
        order.statusUpdatedAt = new Date();

        if (['Delivered', 'Payment Failed'].includes(status)) {
            const newItemStatus = status;
            order.orderedItems.forEach(item => {
                if (!['Returned', 'Return Requested', 'Cancelled'].includes(item.status)) {
                    item.status = newItemStatus;
                }
            });
        }

        await order.save();
        res.json({ message: 'Order status updated successfully', order });
    } catch (error) {
        console.error('Error in updateOrderStatus:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    }
};

const loadOrdersPage = (req, res) => {
    res.render('admin/orders');
};

const loadOrderDetailsPage = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId)
            .populate('userId', 'name email phone')
            .populate('orderedItems.product')
            .populate('address')
            .lean();

        if (!order) return res.redirect('/admin/orders?error=Order not found');

        console.log('Fetched order status from DB:', order.status); 
        console.log('statusUpdatedAt from DB:', order.statusUpdatedAt); 

        if (order.status === 'Cancelled') {
            order.orderedItems.forEach(item => {
                if (!['Returned', 'Return Requested'].includes(item.status)) item.status = 'Cancelled';
            });
        }

        const orderDate = order.createdAt || order.createdOn;
        if (!order.createdAt && order.createdOn) order.createdAt = order.createdOn;
        order.formattedDate = orderDate 
            ? new Date(orderDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) 
            : 'N/A';

        if (!order.address && order.addressDetails) order.address = order.addressDetails;

        const getStatusBadgeClass = status => ({
            'Delivered': 'success',
            'Cancelled': 'danger',
            'Returned': 'danger',
            'Payment Failed': 'danger',
            'Out for Delivery': 'info',
            'Shipped': 'warning',
            'Processing': 'warning',
            'Pending': 'warning',
            'Return Request': 'warning'
        }[status] || 'warning');

        order.statusBadgeClass = getStatusBadgeClass(order.status);
        order.orderedItems.forEach(item => item.statusBadgeClass = getStatusBadgeClass(item.status));

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
    loadOrderDetailsPage
};