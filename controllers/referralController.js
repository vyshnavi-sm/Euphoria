const User = require('../models/userSchema');
const Coupon = require('../models/couponSchema');
const { ReferralOffer } = require('../models/offerSchema');

const referralController = {
    // Get user's referral code
    getReferralCode: async (req, res) => {
        try {
            const userId = req.session.user_id;
            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json({ 
                referralCode: user.referalCode,
                referralCount: user.referralCount,
                referralRewards: user.referralRewards
            });
        } catch (error) {
            console.error('Error getting referral code:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    // Process referral during registration
    processReferral: async (req, res) => {
        try {
            const { referralCode } = req.body;
            const newUserId = req.session.user_id;

            if (!referralCode) {
                return res.status(400).json({ message: 'Referral code is required' });
            }

            // Find referrer
            const referrer = await User.findOne({ referalCode: referralCode });
            if (!referrer) {
                return res.status(404).json({ message: 'Invalid referral code' });
            }

            // Update new user's referredBy field
            const newUser = await User.findById(newUserId);
            if (!newUser) {
                return res.status(404).json({ message: 'User not found' });
            }

            newUser.referredBy = referrer._id;
            await newUser.save();

            // Update referrer's referral count
            referrer.referralCount += 1;
            await referrer.save();

            // Create referral offer
            const referralOffer = new ReferralOffer({
                referrer: referrer._id,
                referred: newUser._id,
                referralCode: referralCode,
                rewardAmount: 100, // You can adjust this amount
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            });
            await referralOffer.save();

            // Add reward to referrer's wallet
            referrer.wallet += 100; // Same amount as rewardAmount
            referrer.referralRewards.push({
                amount: 100,
                referredUser: newUser._id
            });
            await referrer.save();

            res.json({ 
                message: 'Referral processed successfully',
                rewardAmount: 100
            });
        } catch (error) {
            console.error('Error processing referral:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    // Get referral statistics
    getReferralStats: async (req, res) => {
        try {
            const userId = req.session.user_id;
            const user = await User.findById(userId)
                .populate('referralRewards.referredUser', 'name email');

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            const stats = {
                referralCode: user.referalCode,
                totalReferrals: user.referralCount,
                totalRewards: user.referralRewards.reduce((sum, reward) => sum + reward.amount, 0),
                referralHistory: user.referralRewards
            };

            res.json(stats);
        } catch (error) {
            console.error('Error getting referral stats:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};

module.exports = referralController; 






