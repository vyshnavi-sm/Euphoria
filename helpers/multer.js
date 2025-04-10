const multer = require("multer");
const path = require("path");
const fs = require('fs');

// Create uploads directories if they don't exist
const uploadDirs = {
    general: 'uploads',
    brand: 'uploads/brand-images',
    product: 'uploads/product-images'
};

Object.values(uploadDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Storage Engine
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Determine the destination based on the route
        let uploadDir = uploadDirs.general;
        if (req.originalUrl.includes('/addBrand')) {
            uploadDir = uploadDirs.brand;
        } else if (req.originalUrl.includes('/addProducts')) {
            uploadDir = uploadDirs.product;
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File Filter (only allow images)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

// Initialize Multer
const uploads = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

module.exports = uploads;
