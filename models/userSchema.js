const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true 
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null
  },
  googleId: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
    required: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  cart: [{
    type: Schema.Types.ObjectId,
    ref: "Cart"
  }],
  wallet: [{
    type: Number,
    ref: "Wishlist"
  }],
  orderHistory: [{
    type: Schema.Types.ObjectId,
    ref: "Order"
  }],
  redeemedUsers: [{
    type: Schema.Types.ObjectId,
    ref: "User"
  }],
  addresses: [
    {
      name: String,
      line1: String,
      city: String,
      state: String,
      zip: String,
      phone: String,
      isDefault: {
        type: Boolean,
        default: false
      }
    }
  ],
  referalCode: {
    type: String
  },
  redeemed: {
    type: Boolean
  },
  searchHistory: [{
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    brand: {
      type: String
    },
    searchOn: {
      type: Date,
      default: Date.now
    }
  }],
  createdOn: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", userSchema);
module.exports = User;
