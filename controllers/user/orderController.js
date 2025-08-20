const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");
const { formatToIST } = require('../../utils/timezone.js'); 
const moment = require("moment-timezone"); 

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
            // First try to find orders by orderId
            const orderIdQuery = { 
                userId, 
                orderId: { $regex: searchQuery, $options: 'i' }
            };
            
            // Also search by product names
            const productResults = await Product.find({
                productName: { $regex: searchQuery, $options: 'i' }
            }).select('_id');
            
            const productIds = productResults.map(p => p._id);
            
            query.$or = [
                { orderId: { $regex: searchQuery, $options: 'i' } },
                { 'orderedItems.product': { $in: productIds } }
            ];
        }

        const orders = await Order.find(query)
           .populate({
                path: 'orderedItems.product',
                select: 'productName productImage salePrice',
                options: { strictPopulate: false }
                })
 
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        // Process orders to add delivery charge and format product data for EJS compatibility
        orders.forEach(order => {
            if (order.totalPrice < 1000) {
                order.deliveryCharge = 50;
            } else {
                order.deliveryCharge = 0;
            }

            // Enhanced debugging: Log product information
            console.log(`\n=== Order ${order.orderId} ===`);
            console.log('Total ordered items:', order.orderedItems.length);
            
            order.orderedItems.forEach((item, index) => {
                console.log(`\nItem ${index}:`);
                console.log('- Product exists:', !!item.product);
                
                if (item.product) {
                    if (typeof item.product === 'string') {
                        console.log('- Product is ObjectId string:', item.product);
                    } else {
                        console.log('- Product ID:', item.product._id);
                        console.log('- Product Name:', item.product.productName);
                        console.log('- Product Images array:', item.product.images);
                        console.log('- Product Image field:', item.product.productImage);
                        
                        // Check which image source is available
                        let availableImage = null;
                        if (item.product.images && Array.isArray(item.product.images) && item.product.images.length > 0) {
                            availableImage = item.product.images[0];
                            console.log('- Using images array:', availableImage);
                        } else if (item.product.productImage) {
                            availableImage = item.product.productImage;
                            console.log('- Using productImage field:', availableImage);
                        }
                        console.log('- Final available image:', availableImage);
                    }
                } else {
                    console.log('- Product is null/undefined');
                }
            });

            // Add products array for EJS template compatibility
            order.products = order.orderedItems.map(item => ({
                productId: item.product,
                quantity: item.quantity,
                price: item.price,
                status: item.status
            }));
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
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send('Error loading orders');
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

        order.createdOnIST = formatToIST(order.createdOn);

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
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send('Error loading order details');
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

        const formattedOrder = {
            ...order.toObject(),
            createdOnFormatted: formatToIST(order.createdOn),
            deliveredOnFormatted: formatToIST(order.deliveredOn),
            estimatedDeliveryFormatted: formatToIST(order.estimatedDeliveryDate)
        };

        const pdfBuffer = await createPDF('invoice', { order: formattedOrder, companyInfo });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=invoice_${order.orderId}.pdf`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send('Error generating invoice');
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

        const formattedOrder = {
            ...order._doc,
            createdOnFormatted: moment(order.createdOn).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
            updatedAtFormatted: moment(order.updatedAt).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
            estimatedDeliveryFormatted: order.estimatedDeliveryDate 
                ? moment(order.estimatedDeliveryDate).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A")
                : null
        };

        res.render('user/order-details', { order: formattedOrder });
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