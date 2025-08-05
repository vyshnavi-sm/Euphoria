const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const returnSingleItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user;

        if (!userId) return res.json({ success: false, message: 'User not logged in' });
        if (!reason?.trim()) return res.json({ success: false, message: 'Return reason is required' });

        const order = await Order.findOne({_id : orderId, userId });
        if (!order) return res.json({ success: false, message: 'Order not found' });

        const item = order.orderedItems.id(itemId);
        if (!item) return res.json({ success: false, message: 'Item not found in order' });
        if (order.status !== 'Delivered') return res.json({ success: false, message: 'Can only request return for items in delivered orders' });
        if (['Return Requested', 'Returned'].includes(item.status)) return res.json({ success: false, message: 'Return has already been requested for this item' });

        const splitDiscountAcrossItems = () => {
            if (!order.orderedItems.some(i => i.proportionalDiscount !== undefined) && order.discount > 0) {
                const total = order.orderedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
                order.orderedItems.forEach(i => {
                    const percent = total > 0 ? (i.price * i.quantity) / total : 0;
                    i.proportionalDiscount = Math.round(order.discount * percent * 100) / 100;
                });
            }
        };

        const splitTaxAcrossItems = () => {
            const tax = order.finalAmount - (order.totalPrice + order.deliveryCharge - order.discount);
            if (!order.orderedItems.some(i => i.proportionalTax !== undefined) && tax > 0) {
                const total = order.orderedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
                order.orderedItems.forEach(i => {
                    const percent = total > 0 ? (i.price * i.quantity) / total : 0;
                    i.proportionalTax = Math.round(tax * percent * 100) / 100;
                });
            }
        };

        splitDiscountAcrossItems();
        splitTaxAcrossItems();

        const itemSubtotal = item.price * item.quantity;
        const itemProportionalDiscount = item.proportionalDiscount || 0;
        const itemProportionalTax = item.proportionalTax || 0;
        const refundAmount = itemSubtotal + itemProportionalTax - itemProportionalDiscount;

        item.status = 'Return Requested';
        item.returnReason = reason.trim();
        item.returnDetails = { itemSubtotal, proportionalTax: itemProportionalTax, proportionalDiscount: itemProportionalDiscount, refundAmount, returnRequestedAt: new Date() };

        order.returnHistory = order.returnHistory || [];
        order.returnHistory.push({
            itemId,
            productId: item.product,
            quantity: item.quantity,
            reason: reason.trim(),
            returnType: 'Single Item',
            requestedAt: new Date(),
            status: 'Pending',
            refundDetails: { itemSubtotal, proportionalTax: itemProportionalTax, proportionalDiscount: itemProportionalDiscount, refundAmount }
        });

        if (!order.orderedItems.some(i => !['Returned', 'Return Requested', 'Cancelled'].includes(i.status))) {
            order.status = 'Return Request';
        }

        await order.save();

        res.json({
            success: true,
            message: 'Return request for item submitted successfully',
            returnDetails: { itemSubtotal, proportionalTax: itemProportionalTax, proportionalDiscount: itemProportionalDiscount, refundAmount },
            updatedOrderTotals: {
                finalAmount: order.finalAmount,
                totalPrice: order.totalPrice,
                discount: order.discount
            }
        });
    } catch (error) {
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error submitting return request', error: error.message });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user;

        if (!userId) return res.json({ success: false, message: 'User not logged in' });
        if (!reason) return res.json({ success: false, message: 'Return reason is required' });

        const order = await Order.findOne({_id : orderId, userId })
            .populate('orderedItems.product')
            .select('+orderedItems.adminRejectionReason +orderedItems.adminReturnReason +adminReturnRejectionReason +adminRejectionReason');

        if (!order) return res.json({ success: false, message: 'Order not found' });
        if (order.status !== 'Delivered') return res.json({ success: false, message: 'Can only return delivered orders' });

        for (const item of order.orderedItems) {
            const product = item.product?._id && await Product.findById(item.product._id);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }
        }

        order.status = 'Return Request';
        order.returnReason = reason;
        await order.save();

        res.json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error processing return:', error);
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error processing return', error: error.message });
    }
};

module.exports={
    returnSingleItem,
    returnOrder
}