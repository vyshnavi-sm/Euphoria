const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || ""; // Default search value
        let page = parseInt(req.query.page) || 1; // Default page number
        const limit = 8; // Number of users per page

        // Fetch filtered customers
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: search, $options: "i" } }, // Case-insensitive search
                { email: { $regex: search, $options: "i" } },
            ],
        })
            .sort({ createdOn: -1 }) // Sort by creation date in descending order
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        // Count total number of customers
        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ],
        });

        // Render customers.ejs with data
        res.render('customers', {
            data: userData,
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
        
        const { id } = req.query;  // FIX: Use req.query instead of req.params
        if (!id) {
            return res.status(400).send("Customer ID is required");
        }

        const user = await User.findByIdAndUpdate(id, { isBlocked: true });
        if (!user) {
            return res.status(404).send("User not found");
        }

        res.redirect('/admin/customers');  // Refresh page
    } catch (error) {
        console.error("Error blocking customer:", error);
        res.redirect("/pageerror");
    }
};

const customerUnblocked = async (req, res) => {
    try {
        const { id } = req.query;  // FIX: Use req.query instead of req.params
        if (!id) {
            return res.status(400).send("Customer ID is required");
        }

        const user = await User.findByIdAndUpdate(id, { isBlocked: false });
        if (!user) {
            return res.status(404).send("User not found");
        }

        res.redirect('/admin/customers');  // Refresh page
    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.redirect("/pageerror");
    }
};



// const customerBlocked = async (req,res)=>{
//     try {
        
//         let id=req.querry.id;
//         await User.updateOne({_id:id},{$set:{isBlocked:true}})
//         res.redirect("/admin/customers");


//     } catch (error) {
//         console.log("error")
//         res.redirect("/pageerror");
        
//     }
// }

// const customerUnblocked = async(req,res)=>{
//     try {
        
//         let id = req.query.id;
//         await User.updateOne({_id:id},{$set:{isBlocked:false}});
//         res.redirect("/admin/customers")
//     } catch (error) {
// res.redirect("/pageerror")
        
//     }
// }

module.exports = { 
    customerInfo,
    customerBlocked,
    customerUnblocked,
};







