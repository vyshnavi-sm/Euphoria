const multer = require("multer");
const path = require("path");
const fs = require('fs');

const uploadDirs = {
    general: path.join('public', 'uploads'),
    brand: path.join('public', 'uploads', 'brand-images'),
    product: path.join('public', 'uploads', 'product-images')
};

Object.values(uploadDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
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

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload only images.'), false);
    }
};

const uploads = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 
    }
});

module.exports = uploads;