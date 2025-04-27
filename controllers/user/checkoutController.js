const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        // Get the user's cart
        const cart = await Cart.findOne({ userId })
            .populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/user/cart');
        }

        // Get user addresses
        const userData = await User.findById(userId);
        const addresses = userData.addresses;

        // Debug logs to verify data
        console.log('User data loaded:', userData._id);
        console.log('Addresses count:', addresses ? addresses.length : 0);
        console.log('Cart items count:', cart.items.length);

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const taxes = Math.round(subtotal * 0.18); // Add taxes calculation (e.g., 18% GST)
        const discount = 0; // Add discount variable (set to 0 or calculate as needed)
        const total = subtotal + taxes - discount; // Update total calculation to include taxes and discount

        res.render('user/checkout', { 
            cart,
            subtotal,
            taxes,
            discount,
            total,
            user: userData,  // Passing user data including addresses
        });
        
    } catch (error) {
        console.error('Error loading checkout page:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

module.exports = {
    getCheckoutPage
};