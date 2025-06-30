const express = require("express")
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require("../controllers/admin/customerController")
const{userAuth,adminAuth} = require("../middlewares/auth")
const categoryController = require("../controllers/admin/categoryController");
const brandController = require("../controllers/admin/brandController")
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const multer = require("multer");
const uploads = require('../helpers/multer');
const upload = require('../helpers/imageUpload')
const salesReportController = require('../controllers/admin/salesReportController');
const returnController = require('../controllers/admin/returnController');
const offerController = require('../controllers/admin/offerController');
const dashBoardController = require('../controllers/admin/dashBoardController');
const getDashboardDataController = require('../controllers/admin/dashboardDataController');


router.get("/pageerror",adminController.pageerror)
// Login Management
router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/dashboard",adminAuth,dashBoardController.loadDashboard);
router.get('/dashboard-data',adminAuth,getDashboardDataController.getDashboardData);

router.get("/logout",adminController.logout)
// Customer Management

router.get("/customers",adminAuth,customerController.customerInfo);
router.get('/blockCustomer',adminAuth,customerController.customerBlocked)
router.get('/unblockCustomer',adminAuth,customerController.customerUnblocked)
// Category Management

router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/UnlistCategory",adminAuth,categoryController.getUnlistCategory)
router.get("/editCategory",adminAuth,categoryController.getEditCategory);
router.post("/editCategory/:id",adminAuth,categoryController.editCategory);
router.get("/category/fix-createdAt", categoryController.fixOldCategories);

// Brand Management

router.get("/brands",adminAuth,brandController.getBrandPage);
router.post("/addBrand",adminAuth,upload.single("image"),brandController.addBrand)
router.get("/blockBrand",adminAuth,brandController.blockBrand);
router.get("/unBlockBrand",adminAuth,brandController.unBlockBrand);
router.get("/deleteBrand",adminAuth,brandController.deleteBrand);

// Product Management

router.get("/addProducts",adminAuth,productController.getProductPage);
router.post("/addProducts",adminAuth,upload.any("images"),productController.addProducts);
router.get("/products",adminAuth,productController.getAllProducts);
router.post("/products/blockProduct", adminAuth, productController.blockProduct);
router.post("/products/unblockProduct", adminAuth, productController.unblockProduct);
router.get("/editProduct",adminAuth,productController.getEditProduct);
router.post("/editProduct/:id",adminAuth,upload.any("images"),productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage);

// Offer Management for Products

router.post("/products/applyOffer", adminAuth, offerController.applyProductOffer);
router.post("/products/removeOffer", adminAuth, offerController.removeProductOffer);

// Offer Management for Categories
router.get('/categories/activeOffers', adminAuth, offerController.getActiveOffers);
router.post("/categories/applyOffer", adminAuth, offerController.applyCategoryOffer);
router.post("/categories/removeOffer", adminAuth, offerController.removeCategoryOffer);

// Product Name Duplication Check
router.get("/products/checkDuplicateName", adminAuth, productController.checkDuplicateProductName);

// Order Management
router.get("/orders", adminAuth, orderController.loadOrdersPage);
router.get("/api/orders", adminAuth, orderController.getAllOrders);
router.get("/api/orders/:orderId", adminAuth, orderController.getOrderDetails);
router.patch("/api/orders/:orderId/status", adminAuth, orderController.updateOrderStatus);
router.post("/api/orders/:orderId/return", adminAuth, returnController.handleReturnRequest);
router.post("/api/orders/:orderId/items/:itemId/return", adminAuth, returnController.handleItemReturnRequest);
router.get("/orders/:orderId", adminAuth, orderController.loadOrderDetailsPage);

// Coupon Management
router.get("/coupons", adminAuth, couponController.loadCouponPage);
router.post("/coupons", adminAuth, couponController.createCoupon);
router.delete("/coupons/:id", adminAuth, couponController.deleteCoupon);
router.patch("/coupons/:id/toggle", adminAuth, couponController.toggleCouponStatus);

// Sales Report Management
router.get("/sales-report", adminAuth, salesReportController.loadSalesReport);
router.get("/sales-report/download", adminAuth, salesReportController.generateSalesReport);

module.exports = router;