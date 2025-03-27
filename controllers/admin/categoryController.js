const Category = require("../../models/categorySchema");




const categoryInfo = async(req,res)=>{
    try {
        
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("category",{
            cat:categoryData,
            currentPage:page,
            totalPages:totalPages,
            totalCategories:totalCategories,

        });

    } catch (error) {

        console.error(error)
        res.redirect("/pageerror")
        
    }
}

const addCategory = async (req, res) => {
    try {
        const { name, description, isListed, categoryOffer } = req.body;

        // Validate input fields
        if (!name || !description || isListed === undefined) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check if category already exists
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        // Ensure categoryOffer is either null or a valid date
        let offerDate = null;
        if (categoryOffer) {
            offerDate = new Date(categoryOffer);
            if (isNaN(offerDate.getTime())) {
                return res.status(400).json({ error: "Invalid date format for categoryOffer" });
            }
        }

        // Create new category
        const newCategory = new Category({ 
            name, 
            description, 
            isListed, 
            categoryOffer: offerDate 
        });

        await newCategory.save();

        res.status(201).json({ message: "Category added successfully" });
    } catch (error) {
        console.error("Error adding category:", error); // Log error for debugging
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = {
    categoryInfo,
    addCategory,
};
