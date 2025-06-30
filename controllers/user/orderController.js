const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

const getUserOrders = async (req, res) => {
    try {
        const userId = req.session.user; 
        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10; 
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query?.trim();

        let query = { userId };

        if (searchQuery) {
            query.$or = [
                { _id: { $regex: searchQuery, $options: 'i' } },
            ];
        }

       const orders = await Order.find(query)
    .populate('orderedItems.product')
    .sort({ createdOn: -1 })
    .skip(skip)
    .limit(limit);

    orders.forEach(order => {
        if (order.totalPrice < 1000) {
            order.deliveryCharge = 50;
        } else {
            order.deliveryCharge = 0;
        }
    });


        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('user/orders', {
            orders, 
            currentPage: page,
            totalPages,
            searchQuery: searchQuery || '' 
        });

    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders');
    }
};

const searchUserOrders = async (req, res) => {
    const query = req.query.query?.trim();
    res.redirect(`/user/orders${query ? '?query=' + query : ''}`);
};

const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user; 

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
        order.deliveryCharge = order.totalPrice < 1000 ? 50 : 0;


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

        const companyInfo = {
            name: 'Euphoria',
            address: 'Calicut, Kerala 673613',
            email: 'support@euphoria.com',
            phone: '+91 7012287796',
            website: 'www.euphoria.com',
            gst: 'GSTIN1234567890'
        };

        order.totalPrice = typeof order.totalPrice === 'number' && !isNaN(order.totalPrice) ? order.totalPrice : 0;
        order.finalAmount = typeof order.finalAmount === 'number' && !isNaN(order.finalAmount) ? order.finalAmount : 0;
        order.discount = typeof order.discount === 'number' && !isNaN(order.discount) ? order.discount : 0;

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
    downloadInvoice,
    getOrderDetails,
};
