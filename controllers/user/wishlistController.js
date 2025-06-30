const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');

const getWishlistStatus = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.session.user;

        if (!userId) {
            return res.json({ isInWishlist: false });
        }

        const wishlist = await Wishlist.findOne({ userId });
        const isInWishlist = wishlist && wishlist.items.some(item => 
            item.productId.toString() === productId
        );

        res.json({ isInWishlist });
    } catch (error) {
        console.error('Error checking wishlist status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const toggleWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({ message: 'Please login to manage wishlist' });
        }
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                items: [{
                    productId,
                    addedAt: new Date()
                }]
            });
            await wishlist.save();
            return res.json({ 
                message: 'Product added to wishlist',
                isInWishlist: true 
            });
        }

        const existingItemIndex = wishlist.items.findIndex(
            item => item.productId.toString() === productId
        );

        if (existingItemIndex !== -1) {
            wishlist.items.splice(existingItemIndex, 1);
            await wishlist.save();
            return res.json({ 
                message: 'Product removed from wishlist',
                isInWishlist: false 
            });
        } else {
            wishlist.items.push({
                productId,
                addedAt: new Date()
            });
            await wishlist.save();
            return res.json({ 
                message: 'Product added to wishlist',
                isInWishlist: true 
            });
        }
    } catch (error) {
        console.error('Error toggling wishlist:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const wishlist = await Wishlist.findOne({ userId })
            .populate('items.productId');

        res.render('user/wishlist', { 
            wishlist,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error getting wishlist:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getWishlistStatus,
    toggleWishlist,
    getWishlist
}; 