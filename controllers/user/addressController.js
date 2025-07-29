const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const mongoose = require("mongoose");
const { STATUS_CODE } = require("../../utils/statusCodes.js");


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
        const userId = req.session.user && req.session.user._id ? req.session.user._id : req.session.user;
        
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const addressObjectId = new mongoose.Types.ObjectId(addressId);

        const currAddress = await Address.findOne({ 
            userId: userObjectId,
            "address._id": addressObjectId 
        });

        if (!currAddress) {
            console.log("Address document not found for user:", userId);
            return res.redirect("/pageNotFound");
        }

        const addressData = currAddress.address.find(item => item._id.toString() === addressId);
        if (!addressData) {
            console.log("Address item not found in array:", addressId);
            return res.redirect("/pageNotFound");
        }

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
        const userId = req.session.user && req.session.user._id ? req.session.user._id : req.session.user;
        const redirect = req.query.redirect || 'profile';
        
        const { name, mobile, addressType, addressLine1, city, state, pincode } = req.body;
        
        if (!name || !mobile || !addressType || !addressLine1 || !city || !state || !pincode) {
            return res.redirect(`/edit-address/${addressId}?redirect=${redirect}&error=missing_fields`);
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const addressObjectId = new mongoose.Types.ObjectId(addressId);
        
        const pincodeNum = Number(pincode);
        if (isNaN(pincodeNum) || pincodeNum <= 0) {
            return res.redirect(`/edit-address/${addressId}?redirect=${redirect}&error=invalid_pincode`);
        }

        const existingAddress = await Address.findOne({
            userId: userObjectId,
            "address._id": addressObjectId
        });

        if (!existingAddress) {
            console.log("Address not found for user:", userId, "addressId:", addressId);
            return res.redirect(`/edit-address/${addressId}?redirect=${redirect}&error=address_not_found`);
        }

        const result = await Address.findOneAndUpdate(
            { 
                userId: userObjectId,
                "address._id": addressObjectId
            },
            {
                $set: {
                    "address.$[elem].name": name.trim(),
                    "address.$[elem].phone": mobile.trim(),
                    "address.$[elem].addressType": addressType.trim(),
                    "address.$[elem].landMark": addressLine1.trim(),
                    "address.$[elem].city": city.trim(),
                    "address.$[elem].state": state.trim(),
                    "address.$[elem].pincode": pincodeNum,
                    "address.$[elem].altPhone": mobile.trim(),
                    "address.$[elem].updatedAt": new Date()
                }
            },
            {
                arrayFilters: [{ "elem._id": addressObjectId }],
                new: true
            }
        );

        console.log("Update result:", result);

        if (!result) {
            console.log("No document matched the query");
            return res.redirect(`/edit-address/${addressId}?redirect=${redirect}&error=not_found`);
        }

        if (redirect === 'checkout') {
            res.redirect("/user/checkout");
        } else {
            res.redirect("/userProfile#address");
        }

    } catch (error) {
        console.error("Error updating address:", error);
        res.redirect("/pageNotFound");
    }
};


const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const userId = req.session.user;

        if (!addressId) return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: "Address ID is required" });

        const findAddress = await Address.findOne({ userId, "address._id": addressId });
        if (!findAddress) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: "Address not found" });

        const addressBelongsToUser = findAddress.address.some(addr => addr._id.toString() === addressId);
        if (!addressBelongsToUser) return res.status(STATUS_CODE.FORBIDDEN).json({ success: false, message: "Unauthorized to delete this address" });

        const result = await Address.updateOne(
            { userId, "address._id": addressId },
            { $pull: { address: { _id: addressId } } }
        );

        if (!result.modifiedCount) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: "Address not found or already deleted" });

        res.redirect("/userProfile#address");
    } catch (error) {
        console.error("Error in delete address:", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal server error" });
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
