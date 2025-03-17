

const pageNotFound = async(req,res) => {
    try {
        
        res.render("page.404")
    } catch (error) {
        res.render("pageNotFound")
    }
}


const loadHomepage = async (req,res)=>{
    try {
        
        return res.render("home");

    } catch (error) {
        
        console.log("Home page not found")
        res.status(500).Send("Server error ")
    }
}

module.exports = {
    loadHomepage,
    pageNotFound

}