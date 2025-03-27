const express=require('express');
const app = express();
const path = require("path");
const dotenv = require("dotenv")
dotenv.config();
const passport = require("./config/passport")
const session = require("express-session")
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
db()


app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine","ejs");
// app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.set("views", [
    path.join(__dirname, "views/user"),
    path.join(__dirname, "views/admin"),
]);
// app.set("views", path.join(__dirname, "views"));


app.use(express.static("public"));

app.use("/",userRouter);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});
app.use("/admin",adminRouter);




const PORT=process.env.PORT || 4000;

app.listen(PORT,()=>{
    console.log("Server Running at 4000");
})


module.exports = app;