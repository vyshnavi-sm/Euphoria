const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || ""; 
        let page = parseInt(req.query.page) || 1; 
        const limit = 8; 

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ],
        })
            .sort({ createdOn: -1 }) 
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const userDataWithOrders = await Promise.all(
            userData.map(async (user) => {
                const orderCount = await Order.countDocuments({ userId: user._id });
                return {
                    ...user.toObject(),
                    customerId: user._id.toString().slice(-8).toUpperCase(),
                    orders: orderCount,
                    balance: user.wallet || 0
                };
            })
        );

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ],
        });

        res.render('customers', {
            data: userDataWithOrders,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            searchQuery: search,
        });

    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).send("Internal Server Error");
    }
};

const customerBlocked = async (req, res) => {
    try {
        
        const { id } = req.query;  
        if (!id) {
            return res.status(400).send("Customer ID is required");
        }

        const user = await User.findByIdAndUpdate(id, { isBlocked: true });
        if (!user) {
            return res.status(404).send("User not found");
        }

        res.redirect('/admin/customers');  
    } catch (error) {
        console.error("Error blocking customer:", error);
        res.redirect("/pageerror");
    }
};

const customerUnblocked = async (req, res) => {
    try {
        const { id } = req.query;  
        if (!id) {
            return res.status(400).send("Customer ID is required");
        }

        const user = await User.findByIdAndUpdate(id, { isBlocked: false });
        if (!user) {
            return res.status(404).send("User not found");
        }

        res.redirect('/admin/customers');  
    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.redirect("/pageerror");
    }
};

module.exports = { 
    customerInfo,
    customerBlocked,
    customerUnblocked,
};







