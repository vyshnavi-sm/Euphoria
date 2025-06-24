const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      tls: true,
      tlsAllowInvalidCertificates: true, // Temporarily disable certificate validation
    });

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.log("❌ DB Connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
