const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

const handleReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { action, refundAmount } = req.body;

        if (!orderId) return res.status(400).json({ message: 'Order ID is required' });

        const order = await Order.findById(orderId)
            .populate('userId')
            .populate('orderedItems.product');

        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status !== 'Return Request') return res.status(400).json({ message: 'Order is not in return request status' });

        if (action === 'accept') {
            order.status = 'Returned';
            order.returnStatus = 'Accepted';
            order.returnProcessedDate = new Date();
            order.orderedItems.forEach(item => item.status = 'Returned');

            if (refundAmount > 0) {
                const user = await User.findById(order.userId._id);
                if (!user) return res.status(404).json({ message: 'User not found' });

                user.wallet += refundAmount;
                await user.save();

                await WalletTransaction.create({
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for order #${order._id}`,
                    orderId: order._id
                });
            }

            order.totalPrice = order.discount = order.finalAmount = 0;
        } 
        
        else if (action === 'reject') {
            order.status = 'Delivered';
            order.returnStatus = 'Rejected';
        }

        await order.save();
        res.json({ success: true, message: `Return request ${action}ed successfully` });

    } catch (error) {
        console.error('Error handling return request:', error);
        res.status(500).json({ success: false, message: 'Error processing return request' });
    }
};

const handleItemReturnRequest = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { action, refundAmount, rejectReason } = req.body;

        if (!orderId || !itemId) return res.status(400).json({ message: 'Order ID and Item ID are required' });

        const order = await Order.findById(orderId).populate('userId').populate('orderedItems.product');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const item = order.orderedItems.id(itemId);
        if (!item) return res.status(404).json({ message: 'Item not found in order' });
        if (item.status !== 'Return Requested') return res.status(400).json({ message: 'Item is not in return request status' });

        const recalculateProportionalSplits = (excludeItemId = null) => {
            const activeItems = order.orderedItems.filter(i => i.status !== 'Cancelled' && i.status !== 'Returned' && (!excludeItemId || i._id.toString() !== excludeItemId.toString()));
            const totalItemsValue = activeItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

            order.orderedItems.forEach(i => {
                const itemValue = i.price * i.quantity;
                const percentage = totalItemsValue ? (itemValue / totalItemsValue) : 0;
                if (i.status !== 'Cancelled' && i.status !== 'Returned' && (!excludeItemId || i._id.toString() !== excludeItemId.toString())) {
                    i.proportionalDiscount = order.discount > 0 ? Math.round(order.discount * percentage * 100) / 100 : 0;
                    i.proportionalTax = Math.round((activeItems.reduce((sum, j) => sum + (j.price * j.quantity), 0) * 0.18 * percentage) * 100) / 100;
                } else {
                    i.proportionalDiscount = 0;
                    i.proportionalTax = 0;
                }
            });
        };
        recalculateProportionalSplits();

        const itemSubtotal = item.price * item.quantity;
        const itemProportionalDiscount = item.proportionalDiscount || 0;
        const itemProportionalTax = item.proportionalTax || 0;
        const calculatedRefundAmount = itemSubtotal + itemProportionalTax - itemProportionalDiscount;

        if (action === 'accept') {
            item.status = 'Returned';
            item.returnStatus = 'Accepted';
            item.returnProcessedAt = new Date();

            const refundAmt = refundAmount ? parseFloat(refundAmount) : calculatedRefundAmount;
            if (!isNaN(refundAmt) && refundAmt > 0 && order.userId) {
                const user = await User.findById(order.userId);
                if (user) {
                    user.wallet = (user.wallet || 0) + refundAmt;
                    await user.save();

                    await WalletTransaction.create({
                        userId: user._id,
                        amount: refundAmt,
                        type: 'credit',
                        description: `Refund for item return (Order #${order.orderId || order._id})`,
                        orderId: order._id,
                        itemId: item._id,
                        refundDetails: {
                            itemSubtotal,
                            proportionalTax: itemProportionalTax,
                            proportionalDiscount: itemProportionalDiscount,
                            finalRefundAmount: refundAmt
                        }
                    });
                }
            }

            if (!item.totalsAlreadyAdjusted) {
                order.totalPrice = Math.max(0, order.totalPrice - itemSubtotal);
                order.discount = Math.max(0, order.discount - itemProportionalDiscount);
                order.finalAmount = Math.max(0, order.finalAmount - calculatedRefundAmount);
                item.totalsAlreadyAdjusted = true;
            }

            const product = item.product;
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }

            const historyIndex = order.returnHistory?.findIndex(h => h.itemId.toString() === item._id.toString());
            const historyData = {
                itemId: item._id,
                productId: item.product._id,
                quantity: item.quantity,
                reason: item.returnReason,
                returnType: 'Single Item',
                requestedAt: item.returnDetails?.returnRequestedAt || new Date(),
                processedAt: new Date(),
                status: 'Accepted',
                refundDetails: {
                    itemSubtotal,
                    proportionalTax: itemProportionalTax,
                    proportionalDiscount: itemProportionalDiscount,
                    calculatedRefundAmount,
                    actualRefundAmount: refundAmt
                }
            };

            if (historyIndex !== -1) Object.assign(order.returnHistory[historyIndex], historyData);
            else (order.returnHistory = order.returnHistory || []).push(historyData);

            if (order.orderedItems.every(i => i.status === 'Returned' || i.status === 'Cancelled')) {
                order.status = 'Returned';
                order.returnStatus = 'Accepted';
                order.returnCompletedAt = new Date();
            }

            recalculateProportionalSplits(item._id);

        } else if (action === 'reject') {
            item.status = 'Delivered';
            item.returnStatus = 'Rejected';
            item.returnRejectedAt = new Date();
            if (rejectReason) item.adminRejectionReason = rejectReason;

            if (!item.totalsAlreadyAdjusted) {
                order.totalPrice += itemSubtotal;
                order.discount += itemProportionalDiscount;
                order.finalAmount += calculatedRefundAmount;
                item.totalsAlreadyAdjusted = true;
            }

            const historyIndex = order.returnHistory?.findIndex(h => h.itemId.toString() === item._id.toString());
            const historyData = {
                itemId: item._id,
                productId: item.product._id,
                quantity: item.quantity,
                reason: item.returnReason,
                returnType: 'Single Item',
                requestedAt: item.returnDetails?.returnRequestedAt || new Date(),
                processedAt: new Date(),
                status: 'Rejected',
                rejectionReason: rejectReason,
                refundDetails: {
                    itemSubtotal,
                    proportionalTax: itemProportionalTax,
                    proportionalDiscount: itemProportionalDiscount,
                    calculatedRefundAmount
                }
            };

            if (historyIndex !== -1) Object.assign(order.returnHistory[historyIndex], historyData);
            else (order.returnHistory = order.returnHistory || []).push(historyData);

            item.returnReason = undefined;
            item.returnDetails = undefined;
        }

        await order.save();

        const responseData = {
            success: true,
            message: `Item return request ${action}ed successfully`,
            itemDetails: {
                itemId: item._id,
                status: item.status,
                returnStatus: item.returnStatus,
                itemSubtotal,
                proportionalDiscount: itemProportionalDiscount,
                proportionalTax: itemProportionalTax,
                calculatedRefundAmount
            },
            updatedOrderTotals: {
                totalPrice: order.totalPrice,
                discount: order.discount,
                finalAmount: order.finalAmount,
                orderStatus: order.status
            }
        };

        if (action === 'accept' && refundAmount) {
            responseData.refundProcessed = {
                amount: parseFloat(refundAmount),
                creditedToWallet: true
            };
        }

        res.json(responseData);

    } catch (error) {
        console.error('Error handling item return request:', error);
        res.status(500).json({ success: false, message: 'Error processing item return request', error: error.message });
    }
};

module.exports={
    handleReturnRequest,
    handleItemReturnRequest
}