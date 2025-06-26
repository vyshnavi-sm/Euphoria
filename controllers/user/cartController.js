const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');

// Add to cart
const addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body; // Default quantity to 1 if not provided
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ message: 'Please login to add items to cart' });
        }

        // Get product details
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Check if product is in stock
        if (product.quantity <= 0) {
            return res.status(400).json({ message: 'Product is out of stock' });
        }

        // Check if requested quantity exceeds available stock
        if (quantity > product.quantity) {
            return res.status(400).json({ message: 'Requested quantity exceeds available stock' });
        }

        // Calculate total price using salePrice
        const totalPrice = product.salePrice * quantity;

        // Find user's cart
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            // Create new cart if doesn't exist
            cart = new Cart({
                userId,
                items: [{
                    productId,
                    quantity,
                    price: product.salePrice,
                    totalPrice
                }]
            });
        } else {
            // Check if product already exists in cart
            const existingItemIndex = cart.items.findIndex(
                item => item.productId.toString() === productId
            );

            if (existingItemIndex !== -1) {
                // Update quantity and total price if product exists
                const newQuantity = cart.items[existingItemIndex].quantity + quantity;
                
                // Check if new quantity exceeds maximum limit of 5 for individual product
                if (newQuantity > 5) {
                    return res.status(400).json({ message: 'Maximum quantity per product is 5' });
                }
                
                // Check if new quantity exceeds available stock
                if (newQuantity > product.quantity) {
                    return res.status(400).json({ message: 'Total quantity exceeds available stock' });
                }
                
                cart.items[existingItemIndex].quantity = newQuantity;
                cart.items[existingItemIndex].totalPrice = 
                    cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].price;
            } else {
                // Check total items in cart before adding new item
                const totalItemsInCart = cart.items.reduce((total, item) => total + item.quantity, 0);
                if (totalItemsInCart + quantity > 10) {
                    return res.status(400).json({ message: 'Maximum total items in cart is 10' });
                }

                // Add new item if product doesn't exist
                cart.items.push({
                    productId,
                    quantity,
                    price: product.salePrice,
                    totalPrice
                });
            }
        }

        await cart.save();
        res.status(200).json({ message: 'Product added to cart successfully', cart });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Remove from cart
const removeFromCart = async (req, res) => {
    try {
        const productId = req.params.productId || req.body.productId;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ message: 'Please login to remove items from cart' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Remove the item from cart
        cart.items = cart.items.filter(
            item => item.productId.toString() !== productId
        );

        await cart.save();
        res.status(200).json({ success: true, message: 'Product removed from cart successfully', cart });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update cart item quantity
const updateCart = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ message: 'Please login to update cart' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Find the item in cart
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ message: 'Product not found in cart' });
        }

        // Check product stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Check if quantity exceeds maximum limit of 5 for individual product
        if (quantity > 5) {
            return res.status(400).json({ message: 'Maximum quantity per product is 5' });
        }

        // Check if quantity exceeds available stock
        if (quantity > product.quantity) {
            return res.status(400).json({ message: 'Requested quantity exceeds available stock' });
        }

        // Calculate total items in cart after update
        const currentItemQuantity = cartItem.quantity;
        const totalItemsInCart = cart.items.reduce((total, item) => {
            if (item.productId.toString() === productId) {
                return total + quantity; // Use new quantity for current item
            }
            return total + item.quantity;
        }, 0);

        // Check if total items would exceed 10
        if (totalItemsInCart > 10) {
            return res.status(400).json({ message: 'Maximum total items in cart is 10' });
        }

        // Update quantity and total price
        cartItem.quantity = quantity;
        cartItem.totalPrice = quantity * cartItem.price;

        await cart.save();
        res.status(200).json({ message: 'Cart updated successfully', cart });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get cart
const getCart = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId })
            .populate('items.productId');

        // Render the cart page with cart data
        res.render('user/cart', { 
            cart: cart || { items: [] },
            user: req.session.user 
        });
    } catch (error) {
        console.error('Error getting cart:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};

module.exports = {
    addToCart,
    removeFromCart,
    updateCart,
    getCart
}; 


