const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body; 
        const userId = req.session.user;

        if (!userId) {
            return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Please login to add items to cart' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Product not found' });
        }

        if (product.quantity <= 0) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Product is out of stock' });
        }

        if (quantity > product.quantity) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Requested quantity exceeds available stock' });
        }

        if(product.salePrice<=0){
            return res.status(STATUS_CODE.BAD_REQUEST).json({message:"The product price is invalid"})

        }

        if(product.salePrice>product.totalPrice){
            await Product.deleteOne({_id:product._id})
        }

        const totalPrice = product.salePrice * quantity;

        let cart = await Cart.findOne({ userId });

        if (!cart) {
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
            const existingItemIndex = cart.items.findIndex(
                item => item.productId.toString() === productId
            );

            if (existingItemIndex !== -1) {
                const newQuantity = cart.items[existingItemIndex].quantity + quantity;
                
                if (newQuantity > 5) {
                    return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                        message: 'Maximum quantity per product is 5',
                        errorType: 'quantity_limit'
                    });
                }
                
                if (newQuantity > product.quantity) {
                    return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                        message: 'Total quantity exceeds available stock',
                        errorType: 'stock_limit'
                    });
                }
                
                cart.items[existingItemIndex].quantity = newQuantity;
                cart.items[existingItemIndex].totalPrice = 
                    cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].price;
            } else {
                const totalItemsInCart = cart.items.reduce((total, item) => total + item.quantity, 0);
                if (totalItemsInCart + quantity > 10) {
                    return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                        message: 'Maximum total items in cart is 10',
                        errorType: 'cart_limit'
                    });
                }
                cart.items.push({
                    productId,
                    quantity,
                    price: product.salePrice,
                    totalPrice
                });
            }
        }

        await cart.save();
        res.status(STATUS_CODE.SUCCESS).json({ message: 'Product added to cart successfully', cart });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
    }
};


const removeFromCart = async (req, res) => {
    try {
        const productId = req.params.productId || req.body.productId;
        const userId = req.session.user;

        if (!userId) {
            return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Please login to remove items from cart' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Cart not found' });
        }

        cart.items = cart.items.filter(
            item => item.productId.toString() !== productId
        );

        await cart.save();
        res.status(STATUS_CODE.SUCCESS).json({ success: true, message: 'Product removed from cart successfully', cart });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
    }
};

const updateCart = async (req, res) => {
    try {
        const { productId, quantity, change } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(STATUS_CODE.UNAUTHORIZED).json({ message: 'Please login to update cart' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Cart not found' });
        }
        
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        if (!cartItem) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Product not found in cart' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Product not found' });
        }

        let newQuantity;
        
        if (change !== undefined) {
            newQuantity = cartItem.quantity + change;
        } else if (quantity !== undefined) {
            newQuantity = quantity;
        } else {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Either quantity or change must be provided' });
        }

        if (newQuantity <= 0) {
            cart.items = cart.items.filter(item => item.productId.toString() !== productId);
            await cart.save();
            return res.status(STATUS_CODE.SUCCESS).json({ 
                success: true, 
                message: 'Item removed from cart', 
                cart,
                newQuantity: 0
            });
        }

        if (newQuantity > 5) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                message: 'Maximum quantity per product is 5',
                errorType: 'quantity_limit'
            });
        }

        if (newQuantity > product.quantity) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                message: 'Requested quantity exceeds available stock',
                errorType: 'stock_limit'
            });
        }

        const totalItemsInCart = cart.items.reduce((total, item) => {
            if (item.productId.toString() === productId) {
                return total + newQuantity; 
            }
            return total + item.quantity;
        }, 0);

        if (totalItemsInCart > 10) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ 
                message: 'Maximum total items in cart is 10',
                errorType: 'cart_limit'
            });
        }

        cartItem.quantity = newQuantity;
        cartItem.totalPrice = newQuantity * cartItem.price;

        await cart.save();
        res.status(STATUS_CODE.SUCCESS).json({ 
            success: true,
            message: 'Cart updated successfully', 
            cart,
            newQuantity: newQuantity
        });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
    }
};

const getCart = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId })
            .populate('items.productId');
            
        res.render('user/cart', { 
            cart: cart || { items: [] },
            user: req.session.user 
        });
    } catch (error) {
        console.error('Error getting cart:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).render('error', { message: 'Internal server error' });
    }
};

module.exports = {
    addToCart,
    removeFromCart,
    updateCart,
    getCart
}; 


