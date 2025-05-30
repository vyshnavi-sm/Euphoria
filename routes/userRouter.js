const express = require("express")
const router= express.Router();
const userController = require("../controllers/user/userController");
const passport = require("passport");
const profileController = require("../controllers/user/profileController");
const { userAuth } = require("../middlewares/auth");
const productController = require("../controllers/user/productController")
const cartController = require("../controllers/user/cartController")
const wishlistController = require("../controllers/user/wishlistController")
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController")



router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomepage)
router.get("/shop",userController.loadShoppingPage);

// Filter routes
router.get("/filter", userController.filterProduct);
router.get("/filterPrice", userController.filterByPrice);

router.get("/signup",userController.loadSignup)
router.post("/signup",userController.signup)

// OTP Verification Routes
router.get("/verify-otp", userController.loadVerifyOtp);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp);
router.post("/clear-otp-session", (req, res) => {
    delete req.session.userOtp;
    delete req.session.userData;
    res.json({ success: true });
});

// Google Auth Routes
router.get("/auth/google",passport.authenticate('google',{scope:['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    // Set the user session
    req.session.user = req.user._id;
    // Redirect to home page
    res.redirect("/");
});

// Login/Logout Routes
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)

// Profile Management Routes
router.get('/forgot-password',profileController.getForgotPassPage);
router.post("/forgotPass-otp",profileController.forgotEmailValid);
router.post("/verify-passForgot-otp",profileController.verifyForgotPassOtp);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/reset-password",profileController.postNewPassword);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/resend-change-email-otp",profileController.resendOtp);
router.get("/userProfile", userAuth, profileController.userProfile);
router.get("/change-email",profileController.changeEmail )
router.post("/change-email",profileController.changeEmailValid)
router.post("/verify-email-otp",profileController.verifyEmailOtp)
router.post("/update-email",profileController.updateEmail);
router.get("/change-password",profileController.changePassword);
router.post("/change-password",profileController.postNewPassword);
router.post("/verify-changepassword-otp",profileController.verifyChangePassOtp);
router.get("/addresses", profileController.viewAddresses);

// Product Management
router.get("/product/:id",productController.productDetails);

// Address Management
router.get("/addAddress", profileController.addAddress);
router.post("/addAddress", profileController.postAddAddress);
router.get("/edit-address/:id",profileController.editAddress);
router.post("/edit-address/:id", profileController.updateAddress);
router.get("/deleteAddress",userAuth, profileController.deleteAddress);

// Cart Routes
router.post("/user/cart/add", userAuth, cartController.addToCart);
router.delete("/user/cart/remove/:productId", userAuth, cartController.removeFromCart);
router.get("/user/cart", userAuth, cartController.getCart);
router.post("/user/cart/update", userAuth, cartController.updateCart);

// Wishlist Routes
router.get("/user/wishlist", userAuth, wishlistController.getWishlist);
router.post("/user/wishlist/toggle", userAuth, wishlistController.toggleWishlist);
router.get("/user/wishlist/status/:productId", userAuth, wishlistController.getWishlistStatus);


// Checkout Routes
router.get("/user/checkout", userAuth, checkoutController.getCheckoutPage);
router.post("/user/place-order", userAuth, checkoutController.placeOrder);
router.get("/user/order-success/:orderId", userAuth, checkoutController.getOrderSuccess);

// Order Routes
router.get("/user/orders", userAuth, orderController.getUserOrders);
router.get("/user/orders/:id", userAuth, orderController.getOrderDetails);
router.post("/user/orders/:orderId/cancel", userAuth, orderController.cancelOrder);
router.post("/user/orders/:orderId/return", userAuth, orderController.returnOrder);
router.post("/user/orders/:orderId/items/:itemId/cancel", userAuth, orderController.cancelItem);
router.post("/user/orders/:orderId/items/:itemId/return", userAuth, orderController.returnSingleItem);
router.get("/user/orders/:orderId/invoice", userAuth, orderController.downloadInvoice);

module.exports=router;