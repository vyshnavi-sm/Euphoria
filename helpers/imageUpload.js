const cloudinary = require('../config/cloudinary')
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

const storage = new CloudinaryStorage({
    cloudinary : cloudinary,
    params : {
        folder : "euphoria_products",
        allowed_formats : ["jpg","png","webp","jpeg"]
    }
});

const upload = multer({
    storage,
    limits : {fileSize : 5 * 1024 * 1024},
    fileFilter : (req,file,cb)=>{
        const filetypes = /jpeg|jpg|png|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if(extname && mimetype){
            cb(null,true)
        }else{
            cb(new Error('Only JPG,JPEG,PNG and WEBP images are allowed'));
        }
    }
});

// Export the multer instance directly
module.exports = upload;