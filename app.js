const express=require('express');
const app = express();
const path = require("path");
const dotenv = require("dotenv")
dotenv.config();
const passport = require("./config/passport")
const session = require("express-session")
const flash = require('connect-flash');
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const methodOverride = require('method-override');

const sessionMiddleware = require("./middlewares/sessionMiddleware");
const MongoStore = require('connect-mongo');

db()

// Add cache control middleware
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 72 * 60 * 60, // 72 hours in seconds
        autoRemove: 'native',
        touchAfter: 24 * 3600 // time period in seconds
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000, // 72 hours in milliseconds
        sameSite: 'lax'
    }
}));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Add flash middleware
app.use(flash());

// Make flash messages available to all views
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine","ejs");
app.set("views", [
    path.join(__dirname, "views"),
    path.join(__dirname, "views/admin"),
    path.join(__dirname, "views/user"),
]);

app.use(express.static("public"));

// Apply session middleware to routes
app.use("/signup", sessionMiddleware.preventBackToSignup);
app.use("/login", sessionMiddleware.preventBackToLogin);
app.use("/verify-otp", sessionMiddleware.preventBackToOtp);

// Make user data available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Mount routes
app.use("/", userRouter);
app.use("/admin", adminRouter);

// Increase event emitter max listeners
require('events').EventEmitter.defaultMaxListeners = 15;

const PORT=process.env.PORT || 4000;

app.listen(PORT,()=>{
    console.log("Server Running at 4000");
})

module.exports = app;