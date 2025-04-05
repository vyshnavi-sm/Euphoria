const express = require("express")
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require("../controllers/admin/customerController")
const{userAuth,adminAuth} = require("../middlewares/auth")
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const uploads = require('../middlewares/imageUpload.js');


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

// Product Management

router.get("/addProducts",adminAuth,productController.getProductPage);
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/products",adminAuth,productController.getAllProducts);

module.exports = router;