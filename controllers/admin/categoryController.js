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

const getListCategory = async(req,res)=>{
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect("/admin/category");


    } catch (error) {
        res.redirect("/pageerror");
        
    }
}

const getUnlistCategory = async(req,res)=>{
    try {
        let id =req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect("/admin/category");


    } catch (error) {
        res.redirect("/pageerror");
        
    }
}
const getEditCategory = async(req,res)=>{
    try {
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        res.render("editCategory",{category:category})
    } catch (error) {
        res.redirect("/pageerror")
        
    }
}

const editCategory = async(req,res)=>{
    try {
        
        const id = req.params.id;
        const {categoryName,description} =req.body;
        const existingCategory = await Category.findOne({name:categoryName});

        if(existingCategory){
            return res.status(400).json({error:"Category exists, please choose another name"})
        }

        const updateCategory = await Category.findByIdAndUpdate(id,{
            name:categoryName,
            description:description,

        },{new:true});

        if(updateCategory){
            res.redirect("/admin/category");
        }else{
            res.status(404).json({error:"Category not found"})
        }
    } catch (error) {
        res.status(500).json({error:"Internal server error"})
    }
}

module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
};
