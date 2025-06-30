const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");

const addAddress = async (req, res) => {
    try {
        res.render("add-address", { user: req.session.user });
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const viewAddresses = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        const [userData, addressDoc] = await Promise.all([
            User.findById(userId),
            Address.findOne({ userId })
        ]);

        res.render("addresses", {
            user: userData,
            userAddress: addressDoc?.address || []
        });
    } catch (error) {
        console.error("Error loading addresses:", error);
        res.redirect("/pageNotFound");
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const { name, mobile, addressType, addressLine1, city, state, pincode } = req.body;

        let userAddress = await Address.findOne({ userId });
        const newAddress = {
            addressType, name, city, state, pincode,
            landMark: addressLine1, phone: mobile, altPhone: mobile
        };

        if (!userAddress) {
            userAddress = new Address({ userId, address: [newAddress] });
        } else {
            userAddress.address.push(newAddress);
        }

        await userAddress.save();
        res.redirect(req.query.redirect === 'checkout' ? "/user/checkout" : "/userProfile#address");
    } catch (error) {
        console.error("Error adding address:", error);
        res.redirect("/pageNotFound");
    }
};

const editAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const redirect = req.query.redirect || 'profile';
        const currAddress = await Address.findOne({ "address._id": addressId });

        const addressData = currAddress?.address.find(item => item._id.toString() === addressId);
        if (!addressData) return res.redirect("/pageNotFound");

        res.render("edit-address", {
            address: addressData,
            user: req.session.user,
            redirect
        });
    } catch (error) {
        console.error("Error in edit address:", error);
        res.redirect("/pageNotFound");
    }
};

const updateAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const userId = req.session.user;
        const redirect = req.query.redirect || 'profile';
        const { name, mobile, addressType, addressLine1, city, state, pincode } = req.body;

        const result = await Address.updateOne(
            { userId, "address._id": addressId },
            {
                $set: {
                    "address.$.name": name,
                    "address.$.phone": mobile,
                    "address.$.addressType": addressType,
                    "address.$.landMark": addressLine1,
                    "address.$.city": city,
                    "address.$.state": state,
                    "address.$.pincode": pincode,
                    "address.$.altPhone": mobile
                }
            }
        );

        if (!result.modifiedCount) throw new Error('Address not modified');
        res.redirect(redirect === 'checkout' ? "/user/checkout" : "/userProfile#address");
    } catch (error) {
        console.error("Error updating address:", error);
        res.redirect("/pageNotFound");
    }
};

const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const userId = req.session.user;

        if (!addressId) return res.status(400).json({ success: false, message: "Address ID is required" });

        const findAddress = await Address.findOne({ userId, "address._id": addressId });
        if (!findAddress) return res.status(404).json({ success: false, message: "Address not found" });

        const addressBelongsToUser = findAddress.address.some(addr => addr._id.toString() === addressId);
        if (!addressBelongsToUser) return res.status(403).json({ success: false, message: "Unauthorized to delete this address" });

        const result = await Address.updateOne(
            { userId, "address._id": addressId },
            { $pull: { address: { _id: addressId } } }
        );

        if (!result.modifiedCount) return res.status(404).json({ success: false, message: "Address not found or already deleted" });

        res.redirect("/userProfile#address");
    } catch (error) {
        console.error("Error in delete address:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

module.exports = {
    addAddress,
    viewAddresses,
    postAddAddress,
    editAddress,
    updateAddress,
    deleteAddress
};
