const express = require("express")
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require("../controllers/admin/customerController")
const{userAuth,adminAuth} = require("../middlewares/auth")
const categoryController = require("../controllers/admin/categoryController");
const brandController = require("../controllers/admin/brandController")
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");
const multer = require("multer");
const uploads = require('../helpers/multer');


router.get("/pageerror",adminController.pageerror)
// Login Management
router.get("/login",adminController.loadLogin);
router.post("/login",adminController.login);
router.get("/dashboard",adminAuth,adminController.loadDashboard);
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
router.post("/addBrand",adminAuth,uploads.single("image"),brandController.addBrand)
router.get("/blockBrand",adminAuth,brandController.blockBrand);
router.get("/unBlockBrand",adminAuth,brandController.unBlockBrand);
router.get("/deleteBrand",adminAuth,brandController.deleteBrand);




// Product Management

router.get("/addProducts",adminAuth,productController.getProductPage);
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/products",adminAuth,productController.getAllProducts);
router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);
router.get("/editProduct",adminAuth,productController.getEditProduct);
router.post("/editProduct/:id",adminAuth,uploads.array("images",4),productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage);

// Order Management
router.get("/orders", adminAuth, orderController.loadOrdersPage);
router.get("/api/orders", adminAuth, orderController.getAllOrders);
router.get("/api/orders/:orderId", adminAuth, orderController.getOrderDetails);
router.patch("/api/orders/:orderId/status", adminAuth, orderController.updateOrderStatus);
router.post("/api/orders/:orderId/return", adminAuth, orderController.handleReturnRequest);
router.post("/api/orders/:orderId/items/:itemId/return", adminAuth, orderController.handleItemReturnRequest);
router.get("/orders/:orderId", adminAuth, orderController.loadOrderDetailsPage);



module.exports = router;