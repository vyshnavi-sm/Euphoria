const User = require('../../models/userSchema');
const Coupon = require('../../models/couponSchema');
const { ReferralOffer } = require('../../models/offerSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const referralController = {
    getReferralCode: async (req, res) => {
        try {
            const userId = req.session.user_id;
            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'User not found' });
            }

            res.json({ 
                referralCode: user.referalCode,
                referralCount: user.referralCount,
                referralRewards: user.referralRewards
            });
        } catch (error) {
            console.error('Error getting referral code:', error);
            res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
        }
    },

    processReferral: async (req, res) => {
        try {
            const { referralCode } = req.body;
            const newUserId = req.session.user_id;

            if (!referralCode) {
                return res.status(STATUS_CODE.BAD_REQUEST).json({ message: 'Referral code is required' });
            }

            const referrer = await User.findOne({ referalCode: referralCode });
            if (!referrer) {
                return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'Invalid referral code' });
            }

            const newUser = await User.findById(newUserId);
            if (!newUser) {
                return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'User not found' });
            }

            newUser.referredBy = referrer._id;
            await newUser.save();

            referrer.referralCount += 1;
            await referrer.save();

            const referralOffer = new ReferralOffer({
                referrer: referrer._id,
                referred: newUser._id,
                referralCode: referralCode,
                rewardAmount: 100, 
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
            });
            await referralOffer.save();

            referrer.wallet += 100; 
            referrer.referralRewards.push({
                amount: 100,
                referredUser: newUser._id
            });
            await referrer.save();

            await WalletTransaction.create({
                userId: referrer._id,
                amount: 100,
                type: 'credit',
                description: `Referral bonus for inviting user ${newUser.email}`
            });

            res.json({ 
                message: 'Referral processed successfully',
                rewardAmount: 100
            });
        } catch (error) {
            console.error('Error processing referral:', error);
            res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
        }
    },

    getReferralStats: async (req, res) => {
        try {
            const userId = req.session.user_id;
            const user = await User.findById(userId)
                .populate('referralRewards.referredUser', 'name email');

            if (!user) {
                return res.status(STATUS_CODE.NOT_FOUND).json({ message: 'User not found' });
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
            res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' });
        }
    }
};

module.exports = referralController; 




