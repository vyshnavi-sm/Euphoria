const User = require("../../models/userSchema")
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand = require("../../models/brandSchema");
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const loadHomepage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true })
            .sort({ createdAt: -1 })
            .limit(5);

        const categoryImages = {};
        for (const category of categories) {
            const latestProduct = await Product.findOne({
                category: category._id,
                isBlocked: false,
                quantity: { $gt: 0 }
            }).sort({ createdAt: -1 });

            categoryImages[category._id] = (latestProduct?.productImage?.[0]) || null;
        }

        const bestSellerProducts = await Product.find({
            isBlocked: false,
            quantity: { $gt: 0 }
        }).sort({ createdAt: -1 }).limit(4);

        const userData = req.session.user ? await User.findById(req.session.user) : null;

        if (userData && userData.isBlocked) {
            req.session.destroy(() => {
                res.render("user/login", { blockedUser: true });
            });
            return;
        }


        res.render("home", {
            user: userData,
            products: bestSellerProducts,
            categories,
            categoryImages,
            blockedUser: false
        });

    } catch (error) {
        console.log("Home page not found:", error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).send("Server error");
    }
};

const loadShoppingPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 9, skip = (page - 1) * limit;
        const { search = '', sort = '', category, brand, gt, lt } = req.query;

        let query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (category) query.category = category;
        if (brand) query.brand = brand;
        if (gt !== undefined && lt !== undefined)
            query.salePrice = { $gt: parseFloat(gt), $lt: parseFloat(lt) };

        let sortOptions = {
            price_low_high: { salePrice: 1 },
            price_high_low: { salePrice: -1 },
            name_asc: { productName: 1 },
            name_desc: { productName: -1 },
            popularity: { views: -1 },
            rating: { rating: -1 },
            newest: { createdAt: -1 },
            featured: { isFeatured: -1 }
        }[sort] || { createdAt: -1 };

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .populate('category')
            .populate('brand');

        const [categories, brands] = await Promise.all([
            Category.find({ isListed: true }),
            Brand.find({ isBlocked: false })
        ]);

        const user = req.session.user ? await User.findById(req.session.user) : null;

        res.render('user/shop', {
            products,
            categories,
            brands,
            currentPage: page,
            totalPages,
            search,
            sort,
            user,
            selectedCategory: category,
            selectedBrand: brand,
            priceRange: gt && lt ? `${gt}-${lt}` : null
        });

    } catch (error) {
        console.error('Error loading shop page:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).render('error', { message: 'Error loading shop page' });
    }
};

const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const { category: categoryId, brand: brandId, page = 1, search = '' } = req.query;
        const itemsPerPage = 9;
        const startIndex = (page - 1) * itemsPerPage;

        console.log("Filter request:", { categoryId, brandId });

        const [categories, brands] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Brand.find({ isBlocked: false }).lean()
        ]);

        let query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        if (categoryId) query.category = categoryId;
        if (brandId) query.brand = brandId;

        console.log("Query:", JSON.stringify(query));

        let products = await Product.find(query)
            .populate('category')
            .populate('brand')
            .lean();

        if (products.length === 0 && (categoryId || brandId)) {
            const allProducts = await Product.find({
                isBlocked: false,
                quantity: { $gt: 0 }
            })
                .populate('category')
                .populate('brand')
                .lean();

            products = allProducts.filter(product => {
                const matchCategory = categoryId ? product.category?._id.toString() === categoryId : true;
                const matchBrand = brandId ? product.brand?._id.toString() === brandId : true;
                return matchCategory && matchBrand;
            });

            console.log(`Found ${products.length} products after fallback filtering`);
        }

        const totalPages = Math.ceil(products.length / itemsPerPage);
        const currentProducts = products.slice(startIndex, startIndex + itemsPerPage);

       res.render("shop", {
       user: user ? await User.findOne({ _id: user }).lean() : null,
        products: currentProducts,
        categories,
        brands,
        totalPages,
        currentPage: parseInt(page),
        selectedCategory: categoryId,
        selectedBrand: brandId,
        search,
        sort,              
        priceRange        
});


    } catch (error) {
        console.error("Error in filterProduct:", error);
        const [categories, brands] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Brand.find({ isBlocked: false }).lean()
        ]);

        res.render("shop", {
        user: req.session.user ? await User.findOne({ _id: req.session.user }).lean() : null,
        products: [],
        categories,
        brands,
        totalPages: 0,
        currentPage: 1,
        selectedCategory: req.query.category || null,
        selectedBrand: req.query.brand || null,
        search: req.query.search || '',
        sort: req.query.sort || '',             
        priceRange: req.query.gt && req.query.lt ? `${req.query.gt}-${req.query.lt}` : '', 
        errorMessage: "Error loading filtered products. Please try again."
    });

    }
};

const filterByPrice = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = user ? await User.findOne({ _id: user }) : null;
        const [brands, categories] = await Promise.all([
            Brand.find({ isBlocked: false }).lean(),
            Category.find({ isListed: true }).lean()
        ]);

        let findProducts = await Product.find({
            salePrice: { $gt: req.query.gt, $lt: req.query.lt },
            isBlocked: false,
            quantity: { $gt: 0 }
        }).lean();

        findProducts.sort((a, b) => {
            const dateA = a.createdAt || a.createdOn;
            const dateB = b.createdAt || b.createdOn;
            return new Date(dateB) - new Date(dateA);
        });

        const itemsPerPage = 9;
        const currentPage = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        );

        res.render("shop", {
            user: userData,
            products: currentProduct,
            categories,
            brands,
            totalPages,
            currentPage,
            search: req.query.search || '',
            selectedCategory: null,
            selectedBrand: null
        });

    } catch (error) {
        console.error("Error in filterByPrice:", error);
        const [categories, brands] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Brand.find({ isBlocked: false }).lean()
        ]);
        res.render("shop", {
            user: req.session.user ? await User.findOne({ _id: req.session.user }) : null,
            products: [],
            categories,
            brands,
            totalPages: 0,
            currentPage: 1,
            search: '',
            selectedCategory: null,
            selectedBrand: null,
            errorMessage: "Error filtering by price. Please try again."
        });
    }
};

module.exports = {
    loadHomepage,
     loadShoppingPage,
    filterProduct,
    filterByPrice
}