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
        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        const { addressId, address, paymentMethod } = req.body;

        // 1. Fetch the user's cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: 'Your cart is empty.' });
        }

        // 2. Check product availability and reduce quantities
        for (const item of cart.items) {
            const product = item.productId;
            
            // Check if product exists and is available
            if (!product) {
                return res.json({ success: false, message: `Product ${item.productId} not found` });
            }

            // Check if product is in stock
            if (product.quantity <= 0) {
                return res.json({ success: false, message: `Product ${product.productName} is out of stock` });
            }

            // Check if requested quantity is available
            if (item.quantity > product.quantity) {
                return res.json({ 
                    success: false, 
                    message: `Only ${product.quantity} units of ${product.productName} are available` 
                });
            }

            // Reduce product quantity
            product.quantity -= item.quantity;
            
            // Update product status if it becomes out of stock
            if (product.quantity === 0) {
                product.status = 'out of stock';
            }
            
            await product.save();
        }

        // 3. Prepare order items
        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.productId.price
        }));

        // 4. Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const taxes = Math.round(subtotal * 0.18);
        const discount = 0;
        const total = subtotal + taxes - discount;

        // 5. Create the order
        const order = await Order.create({
            userId,
            orderedItems,
            address: addressId,
            addressDetails: {
                name: address?.name || '',
                address: address?.address || '',
                city: address?.city || '',
                state: address?.state || '',
                pincode: address?.pincode || '',
                phone: address?.phone || ''
            },
            paymentMethod,
            discount,
            totalPrice: subtotal,
            finalAmount: total,
            status: 'Processing',
            createdOn: new Date()
        });

        // 6. Clear the user's cart
        cart.items = [];
        await cart.save();

        // 7. Respond with success
        res.json({ 
            success: true, 
            orderId: order._id,
            message: 'Order placed successfully!' 
        });
    } catch (err) {
        console.error('Order error:', err);
        res.json({ success: false, message: 'Failed to place order: ' + err.message });
    }
};

const getOrderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        // Use user._id if available, otherwise use user directly
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        console.log('Looking for order with ID:', orderId);
        console.log('User ID:', userId);

        // First, try finding by _id if it looks like a MongoDB ObjectId
        let order = null;
        if (orderId.match(/^[0-9a-fA-F]{24}$/)) {
            console.log('Trying to find by _id...');
            order = await Order.findOne({
                userId: userId,
                _id: orderId
            }).populate('orderedItems.product');
        }

        // If not found by _id, try by orderId
        if (!order) {
            console.log('Trying to find by orderId...');
            order = await Order.findOne({ 
                orderId: orderId, 
                userId: userId
            }).populate('orderedItems.product');
        }

        // If still not found, try case-insensitive search
        if (!order) {
            console.log('Trying case-insensitive search...');
            order = await Order.findOne({
                userId: userId,
                orderId: { $regex: new RegExp('^' + orderId + '$', 'i') }
            }).populate('orderedItems.product');
        }

        console.log('Found order:', order);

        if (!order) {
            console.log('Order not found with any method. Trying direct lookup...');
            // Last resort: try to find the order directly without userId filtering
            order = await Order.findById(orderId).populate('orderedItems.product');
            console.log('Direct lookup result:', order);
            
            if (!order) {
                console.log('Order not found with orderId:', orderId);
                return res.redirect('/user/orders');
            }
        }

        // Render the order success page with the order details
        res.render('user/order-success', { 
            orderId: order.orderId || order._id,
            order
        });

    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/user/orders');
    }
};

module.exports = {
    getCheckoutPage,
    placeOrder,
    getOrderSuccess
};