const mongoose = require("mongoose");
const { Schema } = mongoose;
const bcrypt = require("bcrypt");

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
  profilePicture: {
    type: String,
    default: '/public/images/profiles/Add image.png'
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
  wallet: {
    type: Number,
    default: 0
  },
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
    type: String,
    unique: true,
    sparse: true
  },
  referralToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  referralCount: {
    type: Number,
    default: 0
  },
  referralRewards: [{
    amount: Number,
    date: {
      type: Date,
      default: Date.now
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "User"
    }
  }],
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

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    if (!this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }
  next();
});

userSchema.pre('save', async function(next) {
  if (!this.referalCode) {
    const generateReferralCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let isUnique = false;
    let referralCode;
    
    while (!isUnique) {
      referralCode = generateReferralCode();
      const existingUser = await this.constructor.findOne({ referalCode: referralCode });
      if (!existingUser) {
        isUnique = true;
      }
    }
    
    this.referalCode = referralCode;
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
