const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { STATUS_CODE } = require("../../utils/statusCodes.js");


const cancelOrder = async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { reason } = req.body;

        const userId = req.session?.user_id || req.session?.userId || req.session?.user?._id || req.session?.user?.id || req.user?.id || req.user?._id || req.userId || req.body.userId || req.headers['x-user-id'];

        if (!orderNumber) return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Order Number is required' });
        if (!userId) return res.status(STATUS_CODE.UNAUTHORIZED).json({ success: false, message: 'User not authenticated. Please log in again.' });

        const order = await Order.findOne(orderNumber);
        if (!order) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Order not found' });
        
        if (order.userId.toString() !== userId.toString())
            return res.status(STATUS_CODE.FORBIDDEN).json({ success: false, message: 'Not authorized to cancel this order' });
        if (!['Processing', 'Confirmed', 'Pending'].includes(order.status)) 
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Order cannot be cancelled in its current status' });
        if (order.status === 'Cancelled')
             return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Order is already cancelled' });

        let refundProcessed = false, refundAmount = 0;

        if (['Paid', 'Pending'].includes(order.paymentStatus)) {
            const user = await User.findById(userId);
            if (!user) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'User not found for wallet refund' });

            refundAmount = Math.abs(Number(order.finalAmount)) || 0;
            if (refundAmount <= 0) return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid refund amount calculated' });

            user.wallet = Math.round(((Number(user.wallet) || 0) + refundAmount) * 100) / 100;
            try {
                await user.save();
                refundProcessed = true;
            } catch (err) {
                return res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to process wallet refund' });
            }

            try {
                const transactionData = {
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Order Cancelled - Refund (Order #${order.orderNumber || orderNumber})`,
                    status: 'Cancelled',
                    orderNumber: orderNumber,
                    transactionType: 'order_cancellation'
                };
                await WalletTransaction.create(transactionData);
            } catch (err) {
                console.error('Wallet transaction error:', err.message);
            }
        }

        order.status = 'Cancelled';
        order.cancellationReason = reason?.trim() || 'Order cancelled by customer';
        order.orderedItems.forEach(item => {
            if (item.status !== 'Cancelled') {
                item.status = 'Cancelled';
                item.cancellationReason = order.cancellationReason;
            }
        });
        await order.save();

        res.json({ success: true, message: 'Order cancelled successfully', refundAmount, refundProcessed, orderStatus: order.status });

    } catch (error) {
        console.error('Error cancelling order:', error);
        if (error.name === 'CastError') return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Invalid Order ID format' });
        if (error.name === 'ValidationError') return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Validation error: ' + error.message });
        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal server error while cancelling order' });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderNumber, itemId } = req.params;
        const { reason } = req.body;

        let userId = req.session?.user_id || req.session?.userId || req.session?.user?._id || req.session?.user?.id || req.user?.id || req.user?._id || req.userId || req.body.userId || req.headers['x-user-id'];

        if (!orderNumber || !itemId)
             return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Order ID and Item ID are required' });
        if (!userId) 
            return res.status(STATUS_CODE.UNAUTHORIZED).json({ success: false, message: 'User not authenticated. Please log in again.' });
        if (!reason?.trim()) 
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Cancellation reason is required' });

        const order = await Order.findOne(orderNumber);
        if (!order) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Order not found' });
        if (order.userId.toString() !== userId.toString()) return res.status(STATUS_CODE.FORBIDDEN).json({ success: false, message: 'Not authorized to cancel items in this order' });
        if (!['Processing', 'Confirmed', 'Pending'].includes(order.status)) return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Items cannot be cancelled in the current order status' });

        const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId.toString());
        if (itemIndex === -1) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'Item not found in order' });

        const item = order.orderedItems[itemIndex];
        if (item.status === 'Cancelled') return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: 'Item is already cancelled' });

        const itemTotal = Number(item.price) * Number(item.quantity);
        const activeItems = order.orderedItems.filter(item => item.status !== 'Cancelled');
        const totalActiveAmount = activeItems.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
        const itemProportion = totalActiveAmount > 0 ? itemTotal / totalActiveAmount : 0;

        const orderDiscount = Number(order.discount) || 0;
        const orderDeliveryCharge = Number(order.deliveryCharge) || 0;
        const itemDiscountPortion = orderDiscount * itemProportion;
        const itemDeliveryPortion = orderDeliveryCharge * itemProportion;
        const itemTaxPortion = itemTotal * 0.18;

        let refundAmount = Math.max(0, Math.round((itemTotal + itemTaxPortion + itemDeliveryPortion - itemDiscountPortion) * 100) / 100);

        let refundProcessed = false;

        if (['Paid', 'Pending'].includes(order.paymentStatus) && refundAmount > 0) {
            const user = await User.findById(userId);
            if (!user) return res.status(STATUS_CODE.NOT_FOUND).json({ success: false, message: 'User not found for wallet refund' });

            user.wallet = Math.round(((Number(user.wallet) || 0) + refundAmount) * 100) / 100;
            await user.save();
            refundProcessed = true;

            try {
                await WalletTransaction.create({
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Item Cancelled - Refund (Order #${order.orderNumber || orderNumber}) - ${item.productName || 'Item'}`,
                    status: 'Item Cancelled',
                    orderNumber: orderNumber,
                    itemId: item._id,
                    transactionType: 'item_cancellation'
                });
            } catch (e) {
                console.error('Wallet transaction error:', e);
            }
        }

        order.orderedItems[itemIndex].status = 'Cancelled';
        order.orderedItems[itemIndex].cancellationReason = reason.trim();

        const remainingItems = order.orderedItems.filter(i => i.status !== 'Cancelled');

        if (remainingItems.length === 0) {
            order.status = 'Cancelled';
            order.totalPrice = order.discount = order.finalAmount = 0;
        } else {
            const newSubtotal = remainingItems.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
            const originalSubtotal = order.orderedItems.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
            const remainingProportion = originalSubtotal > 0 ? newSubtotal / originalSubtotal : 0;
            const newTax = newSubtotal * 0.18;

            order.totalPrice = newSubtotal;
            order.discount = Math.round(orderDiscount * remainingProportion * 100) / 100;
            order.finalAmount = Math.round((newSubtotal + newTax + (remainingItems.length ? orderDeliveryCharge : 0) - order.discount) * 100) / 100;
        }

        await order.save();

        res.json({
            success: true,
            message: 'Item cancelled successfully',
            refundAmount,
            refundProcessed,
            orderUpdate: {
                newOrderTotal: order.finalAmount,
                remainingDiscount: order.discount,
                orderStatus: order.status,
                activeItemsCount: remainingItems.length
            }
        });

    } catch (error) {
        console.error('Error cancelling item:', error);

        if (['CastError', 'ValidationError'].includes(error.name)) {
            return res.status(STATUS_CODE.BAD_REQUEST).json({ success: false, message: error.name === 'CastError' ? 'Invalid ID format' : 'Validation error: ' + error.message });
        }

        res.status(STATUS_CODE.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal server error while cancelling item' });
    }
};

module.exports={
    cancelOrder,
    cancelItem
}