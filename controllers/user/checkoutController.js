const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        // Get the user's cart with populated product data including images
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'productName productImage price'  // Select only needed fields
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        // Get user data and addresses
        const userData = await User.findById(userId).lean();
        const addressData = await Address.findOne({ userId: userId }).lean();
        
        if (!userData) {
            return res.redirect('/login');
        }

        // Debug logs to verify data
        console.log('User data loaded:', userData._id);
        console.log('Address Data:', addressData);
        console.log('Addresses count:', addressData ? addressData.address.length : 0);
        console.log('Cart items count:', cart.items.length);
        console.log('First product image:', cart.items[0]?.productId?.productImage?.[0]);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const taxes = Math.round(subtotal * 0.18);
        const discount = 0;
        const total = subtotal + taxes - discount;

        res.render('user/checkout', { 
            cart,
            subtotal,
            taxes,
            discount,
            total,
            user: userData,
            addresses: addressData ? addressData.address : []
        });
        
    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, address, paymentMethod } = req.body;

        console.log('Order placement attempt:', { userId, addressId, address, paymentMethod });

        if (!userId) {
            console.log('No user session found');
            return res.status(401).json({ success: false, message: 'Please login to place order' });
        }

        // Get user's cart
        const cart = await Cart.findOne({ userId })
            .populate('items.productId');

        console.log('Cart found:', cart ? 'Yes' : 'No');
        if (!cart || cart.items.length === 0) {
            console.log('Cart is empty');
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        console.log('Cart items:', cart.items);

        // Get the user's address document
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            console.log('No address document found for user');
            return res.status(400).json({ success: false, message: 'Address not found' });
        }

        // Calculate totals
        const totalPrice = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const taxes = Math.round(totalPrice * 0.18);
        const discount = 0;
        const finalAmount = totalPrice + taxes - discount;

        // Create new order
        const order = new Order({
            userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.price
            })),
            totalPrice,
            discount,
            finalAmount,
            address: addressDoc._id,
            status: 'Pending',
            paymentMethod,
            addressDetails: {
                name: address.name,
                address: address.line1 + (address.line2 ? ', ' + address.line2 : ''),
                city: address.city,
                state: address.state,
                pincode: address.zip,
                phone: address.phone
            }
        });

        console.log('Order object created:', order);

        await order.save();
        console.log('Order saved successfully with ID:', order.orderId);

        // Clear the cart after successful order placement
        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } }
        );
        console.log('Cart cleared successfully');

        res.json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: order.orderId
        });

    } catch (error) {
        console.error('Detailed error in placeOrder:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to place order',
            error: error.message 
        });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id;

        if (!userId) {
            return res.redirect('/login');
        }

        console.log('Looking for order with ID:', orderId);
        console.log('User ID:', userId);

        // Get order details using the orderId field
        const order = await Order.findOne({ 
            orderId: orderId, 
            userId: userId
        }).populate('orderedItems.product');

        console.log('Found order:', order);

        if (!order) {
            console.log('Order not found with orderId:', orderId);
            return res.redirect('/user/orders');
        }

        // Render the order success page with the order details
        res.render('user/order-success', { 
            orderId: order.orderId,
            order
        });

    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/user/orders');
    }
};

const getOrders = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        // Get all orders for the user
        const orders = await Order.find({ userId })
            .populate('orderedItems.product')
            .sort({ createdAt: -1 });

        res.render('user/orders', { 
            orders
        });

    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders');
    }
};

module.exports = {
    getCheckoutPage,
    placeOrder,
    getOrderSuccess,
    getOrders
};