const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const profileController = require("../controllers/user/profileController");
const { userAuth } = require("../middlewares/auth");
const auth = require('../middlewares/auth');
const productController = require("../controllers/user/productController");
const cartController = require("../controllers/user/cartController");
const wishlistController = require("../controllers/user/wishlistController");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const paymentController = require('../controllers/user/paymentController');
const referralController = require('../controllers/user/referralController');
const upload = require('../helpers/imageUpload');
const homeController = require('../controllers/user/homeController');
const couponController = require('../controllers/user/couponController');
const cancelController = require('../controllers/user/cancelController');
const returnController = require('../controllers/user/returnController');
const addressController = require('../controllers/user/addressController');
const forgotPasswordController = require('../controllers/user/forgotPasswordController');
const PasswordController = require('../controllers/user/passwordController');
const emailController = require('../controllers/user/emailController');


// Basic routes
router.get("/pageNotFound", userController.pageNotFound);
router.get("/", homeController.loadHomepage);
router.get("/shop", homeController.loadShoppingPage);

// Filter routes
router.get("/filter", homeController.filterProduct);
router.get("/filterPrice", homeController.filterByPrice);

// Signup/Register routes
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);

// OTP Verification Routes
router.get("/verify-otp", userController.loadVerifyOtp);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.post("/clear-otp-session", (req, res) => {
    delete req.session.userOtp;
    delete req.session.userData;
    res.json({ success: true });
});

// Google Auth Routes
router.get("/auth/google", passport.authenticate('google', {scope: ['profile', 'email']}));
router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/signup'}), (req, res) => {
    req.session.user = req.user._id;
    res.redirect("/");
});

// Login/Logout Routes
router.get("/login", userController.loadLogin);
router.post("/login", userController.login);
router.get("/logout", userController.logout);

// Profile Management Routes
router.get('/forgot-password', forgotPasswordController.getForgotPassPage);
router.post("/forgotPass-otp", forgotPasswordController.forgotEmailValid);
router.post("/verify-passForgot-otp", forgotPasswordController.verifyForgotPassOtp);
router.get("/reset-password", forgotPasswordController.getResetPassPage);
router.post("/reset-password", PasswordController.postNewPassword);
router.post("/resend-forgot-otp", forgotPasswordController.resendOtp);
router.post("/resend-change-email-otp", forgotPasswordController.resendOtp);
router.get("/userProfile", userAuth, profileController.getProfile);
router.post("/update-profile", userAuth, upload.single('profilePicture'), profileController.updateProfile);
router.get("/change-email", emailController.changeEmail);
router.post("/change-email", emailController.changeEmailValid);
router.post("/verify-email-otp", emailController.verifyEmailOtp);
router.get("/change-password", PasswordController.changePassword);
router.post("/change-password", PasswordController.postNewPassword);
router.post("/verify-changepassword-otp", PasswordController.verifyChangePassOtp);
router.get("/addresses", addressController.viewAddresses);

// Product Management
router.get("/product/:id", productController.productDetails);

// Address Management
router.get("/addAddress", addressController.addAddress);
router.post("/addAddress", addressController.postAddAddress);
router.get("/edit-address/:id", addressController.editAddress);
router.post("/edit-address/:id", addressController.updateAddress);
router.get("/deleteAddress", userAuth, addressController.deleteAddress);

// Cart Routes
router.post("/user/cart/add", userAuth, cartController.addToCart);
router.post("/user/cart/remove", userAuth, cartController.removeFromCart);
router.get("/user/cart", userAuth, cartController.getCart);
router.post("/user/cart/update", userAuth, cartController.updateCart);

// Wishlist Routes
router.get("/user/wishlist", userAuth, wishlistController.getWishlist);
router.post("/user/wishlist/toggle", userAuth, wishlistController.toggleWishlist);
router.get("/user/wishlist/status/:productId", userAuth, wishlistController.getWishlistStatus);

// Checkout Routes
router.get("/user/checkout", userAuth, checkoutController.getCheckoutPage);
router.get('/user/retry-payment', userAuth, checkoutController.handleRetryPayment);
router.post("/user/place-order", userAuth, checkoutController.placeOrder);
router.get("/user/order-success/:orderId", userAuth, checkoutController.getOrderSuccess);
router.get('/user/orders/:orderId/retry-payment', userAuth, checkoutController.handleRetryPayment);

// Coupon Routes
router.post("/apply-coupon", userAuth, couponController.applyCoupon);
router.post("/remove-coupon", userAuth, couponController.removeCoupon);

// Order Routes
router.get("/user/orders", userAuth, orderController.getUserOrders);
router.get("/user/orders/:id", userAuth, orderController.getOrderDetails);
router.post("/user/orders/:orderId/cancel", userAuth, cancelController.cancelOrder);
router.post("/user/orders/:orderId/return", userAuth, returnController.returnOrder);
router.post("/user/orders/:orderId/items/:itemId/cancel", userAuth, cancelController.cancelItem);
router.post("/user/orders/:orderId/items/:itemId/return", userAuth, returnController.returnSingleItem);
router.get("/user/orders/:orderId/invoice", userAuth, orderController.downloadInvoice);

// Payment routes
router.post('/user/create-razorpay-order', userAuth, paymentController.createRazorpayOrder);
router.post('/user/verify-razorpay-payment', userAuth, paymentController.verifyRazorpayPayment);
router.get('/user/payment-failed/:orderId', userAuth, paymentController.handlePaymentFailure);

// Referral Routes
router.get("/referral", userAuth, (req, res) => {
    res.render("user/referral", { user: req.session.user });
});
router.get("/referral/code", userAuth, referralController.getReferralCode);
router.post("/referral/process", userAuth, referralController.processReferral);
router.get("/referral/stats", userAuth, referralController.getReferralStats);






module.exports = router;

               