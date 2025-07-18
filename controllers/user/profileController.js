const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/images/profiles'),
  filename: (req, file, cb) =>
    cb(null, 'profile-' + Date.now() + path.extname(file.originalname)),
});

const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Error hashing password:", error);
    throw error;
  }
};

const generateUniqueCode = async (length, charset, field) => {
  let code, exists;
  do {
    code = Array.from({ length }, () =>
      charset.charAt(Math.floor(Math.random() * charset.length))
    ).join("");
    exists = await User.findOne({ [field]: code });
  } while (exists);
  return code;
};

const getProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    if (!user.referalCode) {
      user.referalCode = await generateUniqueCode(
        8,
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        "referalCode"
      );
    }

    if (!user.referralToken) {
      user.referralToken = await generateUniqueCode(
        20,
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz",
        "referralToken"
      );
    }

    await user.save();

    const walletPage = parseInt(req.query.walletPage) || 1;
    const walletlimit = 5;
    const walletskip = (walletPage - 1) * walletlimit;

    const totalWalletCount = await WalletTransaction.countDocuments({userId})

    const walletHistory = await WalletTransaction.find({userId})
    .sort({createdAt:-1})
    .skip(walletskip)
    .limit(walletlimit)


      const orderPage = parseInt(req.query.orderPage) || 1;
      const orderLimit = 5;
      const orderSkip = (orderPage - 1) * orderLimit;

      const totalWalletPages = Math.ceil(totalWalletCount / walletlimit);
      


    const [orders, totalOrders, walletTransactions, userAddress] = await Promise.all([
      Order.find({ userId }).populate("orderedItems.product").sort({ createdOn: -1 }).skip(orderSkip).limit(orderLimit),
      Order.countDocuments({ userId }),
      WalletTransaction.find({ userId }).sort({ createdAt: -1 }).limit(50),
      Address.findOne({ userId }),
    ]);
    const totalOrderPages = Math.ceil(totalOrders / orderLimit);

      res.render("user/profile", {
      user: {
        ...user.toObject(),
        referralRewards: user.referralRewards || [],
        referralToken: user.referralToken || '',
      },
      orders,
      walletTransactions: walletHistory,
      userAddress,
      currentPage: orderPage,
      totalPages: Math.ceil(totalOrders / orderLimit),
      currentWalletPage: walletPage,
      totalWalletPages: Math.ceil(totalWalletCount / walletlimit),
      searchQuery: req.query.query || "",
    });

  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send("Error fetching profile");
  }
};


const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, phone } = req.body;

    if (!name) return res.status(400).json({ success: false, message: "Name is required" });
    if (phone && !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit phone number" });
    }

    const updateData = { name, ...(phone && { phone }) };
    if (req.file) updateData.profilePicture = req.file.path;

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });
    if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });

    req.session.user = updatedUser;
    res.status(200).json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: "An error occurred while updating profile" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
