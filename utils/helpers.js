const generateReferralCode = (userId) => {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 5);
    const userIdStr = userId.toString().slice(-4);
    return `REF-${timestamp}-${randomStr}-${userIdStr}`.toUpperCase();
};

module.exports = {
    generateReferralCode
}; 