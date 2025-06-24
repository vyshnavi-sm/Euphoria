const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const { createPDF } = require('../../utils/pdfGenerator');
const User = require('../../models/userSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');

const getUserOrders = async (req, res) => {
    try {
        // Get user ID from session, handling both direct ID and user object cases
        const userId = req.session.user; // Correctly get user ID from session

        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of orders per page
        const skip = (page - 1) * limit;
        const searchQuery = req.query.query?.trim();

        let query = { userId };

        // Add search functionality to the database query
        if (searchQuery) {
            query.$or = [
                { _id: { $regex: searchQuery, $options: 'i' } }, // Search by Order ID
                // To search within orderedItems product names, we need aggregation
                // For simplicity, we'll keep the basic search on ID for now
                // A more complex implementation would involve aggregation
            ];
        }

        // Fetch user orders with sorting and pagination applied by the database
       const orders = await Order.find(query)
    .populate('orderedItems.product')
    .sort({ createdOn: -1 })
    .skip(skip)
    .limit(limit);

// Apply delivery charge logic
    orders.forEach(order => {
        if (order.totalPrice < 1000) {
            order.deliveryCharge = 50;
        } else {
            order.deliveryCharge = 0;
        }
    });


        // Get the total count of orders matching the search query for pagination
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('user/orders', {
            orders, // Render paginated and filtered orders
            currentPage: page,
            totalPages,
            searchQuery: searchQuery || '' // Pass the search query back to the template
        });

    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).send('Error loading orders');
    }
};

const searchUserOrders = async (req, res) => {
    // This function is now redundant as getUserOrders handles search
    // We can redirect to the main orders page with the query
    const query = req.query.query?.trim();
    res.redirect(`/user/orders${query ? '?query=' + query : ''}`);
};

const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        }).populate('orderedItems.product');

        if (!order) {
            return res.redirect('/user/orders');
        }
        order.deliveryCharge = order.totalPrice < 1000 ? 50 : 0;


        console.log('Fetched order details for user:', order._id);
        console.log('Order status:', order.status);
        console.log('Overall admin rejection reason:', order.adminReturnRejectionReason);
        order.orderedItems.forEach((item, index) => {
            console.log(`Item ${index} status: ${item.status}`);
            console.log(`Item ${index} admin rejection reason: ${item.adminRejectionReason}`);
        });

        res.render('user/order-details', { order });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).send('Error loading order details');
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        
        // Try different ways to get userId
        let userId = req.session?.user_id || 
                     req.session?.userId || 
                     req.session?.user?._id ||
                     req.session?.user?.id ||
                     req.user?.id || 
                     req.user?._id || 
                     req.userId ||
                     req.body.userId ||
                     req.headers['x-user-id'];

        console.log('=== CANCEL ORDER DEBUG ===');
        console.log('Order ID:', orderId);
        console.log('User ID:', userId);
        console.log('=== END DEBUG ===');

        if (!orderId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID is required' 
            });
        }

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated. Please log in again.'
            });
        }

        // Find order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check authorization
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to cancel this order' 
            });
        }

        // Check if order can be cancelled
        if (!['Processing', 'Confirmed', 'Pending'].includes(order.status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order cannot be cancelled in its current status' 
            });
        }

        if (order.status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        let refundProcessed = false;
        let refundAmount = 0;

        // Process refund to wallet - Updated condition to include 'Pending' orders
        if (['Paid', 'Pending'].includes(order.paymentStatus)) {
            console.log('Processing full order refund...');
            
            // Find user and ensure wallet field exists
            const user = await User.findById(userId);
            
            if (!user) {
                console.log('User not found for wallet refund');
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found for wallet refund' 
                });
            }

            // Calculate refund amount - use finalAmount which includes all calculations
            refundAmount = Math.abs(Number(order.finalAmount)) || 0;
            
            if (refundAmount <= 0) {
                console.log('Invalid refund amount:', refundAmount);
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid refund amount calculated' 
                });
            }

            // Ensure wallet is initialized as number
            if (user.wallet === undefined || user.wallet === null) {
                user.wallet = 0;
            }
            
            const currentWallet = Number(user.wallet) || 0;
            const newWalletBalance = currentWallet + refundAmount;
            
            console.log(`Current wallet balance: ₹${currentWallet}`);
            console.log(`Full refund amount: ₹${refundAmount}`);
            console.log(`New wallet balance: ₹${newWalletBalance}`);
            
            // Update wallet with precise calculation
            user.wallet = Math.round(newWalletBalance * 100) / 100; // Round to 2 decimal places
            
            // Save user with error handling
            try {
                await user.save();
                refundProcessed = true;
                console.log(`Wallet updated successfully. New balance: ₹${user.wallet}`);
            } catch (saveError) {
                console.error('Error saving user wallet:', saveError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to process wallet refund' 
                });
            }

            // Create wallet transaction record with clear cancellation status
            try {
                const transactionData = {
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Order Cancelled - Refund (Order #${order.orderId || orderId})`,
                    status: 'Cancelled', // Add explicit status
                    orderId: order._id,
                    transactionType: 'order_cancellation' // Add transaction type for better categorization
                };
                
                console.log('Creating wallet transaction with data:', transactionData);
                
                const walletTransaction = await WalletTransaction.create(transactionData);
                
                console.log('Wallet transaction created successfully:', walletTransaction._id);
                
                // Verify transaction was created
                const verifyTransaction = await WalletTransaction.findById(walletTransaction._id);
                if (verifyTransaction) {
                    console.log('Transaction verified in database');
                } else {
                    console.error('Transaction not found after creation!');
                }
                
            } catch (transactionError) {
                console.error('Error creating wallet transaction:', transactionError);
                console.error('Transaction error details:', transactionError.message);
                // Don't fail the entire process if transaction record fails
            }
        } else {
            console.log(`Payment status is '${order.paymentStatus}', no wallet refund processed`);
        }

        // Update order status and all items
        order.status = 'Cancelled';
        order.cancellationReason = reason ? reason.trim() : 'Order cancelled by customer';
        
        // Cancel all items in the order
        order.orderedItems.forEach(item => {
            if (item.status !== 'Cancelled') {
                item.status = 'Cancelled';
                item.cancellationReason = reason ? reason.trim() : 'Order cancelled by customer';
            }
        });

        // Save the order
        await order.save();

        return res.json({ 
            success: true, 
            message: 'Order cancelled successfully',
            refundAmount: refundAmount,
            refundProcessed: refundProcessed,
            orderStatus: order.status
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid Order ID format' 
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error: ' + error.message
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error while cancelling order'
        });
    }
};

const cancelItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        
        // Try different ways to get userId
        let userId = req.session?.user_id || 
                     req.session?.userId || 
                     req.session?.user?._id ||
                     req.session?.user?.id ||
                     req.user?.id || 
                     req.user?._id || 
                     req.userId ||
                     req.body.userId ||
                     req.headers['x-user-id'];

        console.log('=== CANCEL ITEM DEBUG ===');
        console.log('Order ID:', orderId);
        console.log('Item ID:', itemId);
        console.log('User ID:', userId);
        console.log('=== END DEBUG ===');

        // Validate required fields
        if (!orderId || !itemId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID and Item ID are required' 
            });
        }

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated. Please log in again.'
            });
        }

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cancellation reason is required' 
            });
        }

        // Find order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check authorization
        if (order.userId.toString() !== userId.toString()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to cancel items in this order' 
            });
        }

        // Check order status
        if (!['Processing', 'Confirmed', 'Pending'].includes(order.status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Items cannot be cancelled in the current order status' 
            });
        }

        // Find the specific item
        const itemIndex = order.orderedItems.findIndex(item => 
            item._id.toString() === itemId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found in order' 
            });
        }

        const item = order.orderedItems[itemIndex];

        if (item.status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Item is already cancelled' 
            });
        }

        // Fixed refund calculation
        const itemTotal = Number(item.price) * Number(item.quantity);
        
        // Get all active (non-cancelled) items for proportion calculation
        const activeItems = order.orderedItems.filter(orderItem => orderItem.status !== 'Cancelled');
        const totalActiveAmount = activeItems.reduce((sum, orderItem) => {
            return sum + (Number(orderItem.price) * Number(orderItem.quantity));
        }, 0);

        // Calculate item proportion based on active items
        const itemProportion = totalActiveAmount > 0 ? itemTotal / totalActiveAmount : 0;

        // Get order totals
        const orderDiscount = Number(order.discount) || 0;
        const orderDeliveryCharge = Number(order.deliveryCharge) || 0;
        
        // Calculate proportional discount and delivery charge
        const itemDiscountPortion = orderDiscount * itemProportion;
        const itemDeliveryPortion = orderDeliveryCharge * itemProportion;

        // Calculate tax portion (assuming tax is calculated on item total)
        const taxRate = 0.18; // 18% GST - adjust according to your tax calculation
        const itemTaxPortion = itemTotal * taxRate;

        // Total refund = item price + proportional tax + proportional delivery - proportional discount
        let refundAmount = itemTotal + itemTaxPortion + itemDeliveryPortion - itemDiscountPortion;
        refundAmount = Math.max(0, Math.round(refundAmount * 100) / 100); // Ensure non-negative and round to 2 decimals

        console.log('=== REFUND CALCULATION DEBUG ===');
        console.log('Item total:', itemTotal);
        console.log('Total active amount:', totalActiveAmount);
        console.log('Item proportion:', itemProportion);
        console.log('Order discount:', orderDiscount);
        console.log('Order delivery charge:', orderDeliveryCharge);
        console.log('Item tax portion:', itemTaxPortion);
        console.log('Item discount portion:', itemDiscountPortion);
        console.log('Item delivery portion:', itemDeliveryPortion);
        console.log('Final refund amount:', refundAmount);
        console.log('=== END REFUND DEBUG ===');

        let refundProcessed = false;

        // Process refund to wallet - Updated condition to include 'Pending' orders
        if (['Paid', 'Pending'].includes(order.paymentStatus) && refundAmount > 0) {
            console.log('Processing wallet refund...');
            
            const user = await User.findById(userId);
            
            if (!user) {
                console.log('User not found for wallet refund');
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found for wallet refund' 
                });
            }

            // Ensure wallet is initialized
            if (user.wallet === undefined || user.wallet === null) {
                user.wallet = 0;
            }

            const currentWallet = Number(user.wallet) || 0;
            const newWalletBalance = currentWallet + refundAmount;
            
            console.log(`Current wallet balance: ₹${currentWallet}`);
            console.log(`Refund amount: ₹${refundAmount}`);
            console.log(`New wallet balance: ₹${newWalletBalance}`);
            
            user.wallet = Math.round(newWalletBalance * 100) / 100;
            
            try {
                await user.save();
                refundProcessed = true;
                console.log(`Wallet updated successfully. New balance: ₹${user.wallet}`);
            } catch (saveError) {
                console.error('Error saving user wallet:', saveError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to process wallet refund' 
                });
            }

            // Create wallet transaction record with clear item cancellation status
            try {
                const transactionData = {
                    userId: user._id,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Item Cancelled - Refund (Order #${order.orderId || orderId}) - ${item.productName || 'Item'}`,
                    status: 'Item Cancelled', // Clear status for item cancellation
                    orderId: order._id,
                    itemId: item._id, // Add item ID for reference
                    transactionType: 'item_cancellation' // Add transaction type for better categorization
                };
                
                console.log('Creating wallet transaction with data:', transactionData);
                
                const walletTransaction = await WalletTransaction.create(transactionData);
                
                console.log('Wallet transaction created successfully:', walletTransaction._id);
                
                // Verify transaction was created
                const verifyTransaction = await WalletTransaction.findById(walletTransaction._id);
                if (verifyTransaction) {
                    console.log('Transaction verified in database');
                } else {
                    console.error('Transaction not found after creation!');
                }
                
            } catch (transactionError) {
                console.error('Error creating wallet transaction:', transactionError);
                console.error('Transaction error details:', transactionError.message);
            }
        } else {
            console.log(`Payment status: '${order.paymentStatus}', Refund amount: ${refundAmount} - No wallet refund processed`);
        }

        // Mark the item as cancelled
        order.orderedItems[itemIndex].status = 'Cancelled';
        order.orderedItems[itemIndex].cancellationReason = reason.trim();

        // Recalculate order totals
        const remainingActiveItems = order.orderedItems.filter(item => item.status !== 'Cancelled');
        
        if (remainingActiveItems.length === 0) {
            // All items cancelled - update order status
            order.status = 'Cancelled';
            order.totalPrice = 0;
            order.discount = 0;
            order.finalAmount = 0;
        } else {
            // Recalculate totals for remaining items
            const newSubtotal = remainingActiveItems.reduce((sum, activeItem) => {
                return sum + (Number(activeItem.price) * Number(activeItem.quantity));
            }, 0);

            // Recalculate proportional discount
            const originalSubtotal = order.orderedItems.reduce((sum, orderItem) => {
                return sum + (Number(orderItem.price) * Number(orderItem.quantity));
            }, 0);
            
            const remainingProportion = originalSubtotal > 0 ? newSubtotal / originalSubtotal : 0;
            
            order.totalPrice = newSubtotal;
            order.discount = Math.round((orderDiscount * remainingProportion) * 100) / 100;
            
            // Recalculate tax and final amount
            const newTax = newSubtotal * taxRate;
            const newDeliveryCharge = remainingActiveItems.length > 0 ? orderDeliveryCharge : 0; // Keep delivery charge if items remain
            
            order.finalAmount = Math.round((newSubtotal + newTax + newDeliveryCharge - order.discount) * 100) / 100;
        }

        // Save the order
        await order.save();

        return res.json({ 
            success: true, 
            message: 'Item cancelled successfully',
            refundAmount: refundAmount,
            refundProcessed: refundProcessed,
            orderUpdate: {
                newOrderTotal: order.finalAmount,
                remainingDiscount: order.discount,
                orderStatus: order.status,
                activeItemsCount: remainingActiveItems.length
            }
        });

    } catch (error) {
        console.error('Error cancelling item:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid ID format' 
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error: ' + error.message
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error while cancelling item'
        });
    }
};

const returnSingleItem = async (req, res) => {
    try {
        // console.log('--- returnSingleItem function started ---');
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user; // Correctly get user ID from session

        // console.log('Received params and body:', { orderId, itemId, reason });
        // console.log('User ID from session:', userId);

        if (!userId) {
            // console.log('Error: User not logged in');
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason || reason.trim() === '') {
            // console.log('Error: Return reason is required');
            return res.json({ success: false, message: 'Return reason is required' });
        }

        // console.log('Searching for order with ID:', orderId, 'for user:', userId);
        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            // console.log('Error: Order not found');
            return res.json({ success: false, message: 'Order not found' });
        }

        // console.log('Order found. Searching for item with ID:', itemId);
        const item = order.orderedItems.id(itemId);

        if (!item) {
            // console.log('Error: Item not found in order');
            return res.json({ success: false, message: 'Item not found in order' });
        }

        // console.log('Item found. Checking order status:', order.status);
        // Check if the item is in a returnable status (e.g., 'Delivered')
        if (order.status !== 'Delivered') {
            // console.log('Error: Order status is not Delivered');
            return res.json({ success: false, message: 'Can only request return for items in delivered orders' });
        }

        // Check if item is already returned or return requested
        if (item.status === 'Return Requested' || item.status === 'Returned') {
            return res.json({ success: false, message: 'Return has already been requested for this item' });
        }

        // Split discount proportionally across all items if not already done
        const splitDiscountAcrossItems = () => {
            // Check if discount has already been split (items have proportionalDiscount field)
            const alreadySplit = order.orderedItems.some(item => item.proportionalDiscount !== undefined);
            
            if (!alreadySplit && order.discount > 0) {
                // Calculate total value of all items
                const totalItemsValue = order.orderedItems.reduce((total, item) => 
                    total + (item.price * item.quantity), 0
                );

                // Split discount proportionally across all items
                order.orderedItems.forEach(item => {
                    const itemValue = item.price * item.quantity;
                    const proportionalPercentage = totalItemsValue > 0 ? (itemValue / totalItemsValue) : 0;
                    item.proportionalDiscount = Math.round((order.discount * proportionalPercentage) * 100) / 100;
                });

                console.log('Discount split across items:', order.orderedItems.map(item => ({
                    itemId: item._id,
                    itemValue: item.price * item.quantity,
                    proportionalDiscount: item.proportionalDiscount
                })));
            }
        };

        // Split tax proportionally across all items if not already done
        const splitTaxAcrossItems = () => {
            // Assuming tax is calculated as a percentage of total price or included in finalAmount
            // We'll calculate tax as the difference between finalAmount and (totalPrice + deliveryCharge - discount)
            const calculatedTax = order.finalAmount - (order.totalPrice + order.deliveryCharge - order.discount);
            
            // Check if tax has already been split
            const alreadySplit = order.orderedItems.some(item => item.proportionalTax !== undefined);
            
            if (!alreadySplit && calculatedTax > 0) {
                // Calculate total value of all items
                const totalItemsValue = order.orderedItems.reduce((total, item) => 
                    total + (item.price * item.quantity), 0
                );

                // Split tax proportionally across all items
                order.orderedItems.forEach(item => {
                    const itemValue = item.price * item.quantity;
                    const proportionalPercentage = totalItemsValue > 0 ? (itemValue / totalItemsValue) : 0;
                    item.proportionalTax = Math.round((calculatedTax * proportionalPercentage) * 100) / 100;
                });

                console.log('Tax split across items:', order.orderedItems.map(item => ({
                    itemId: item._id,
                    itemValue: item.price * item.quantity,
                    proportionalTax: item.proportionalTax
                })));
            }
        };

        // Split discount and tax across all items
        splitDiscountAcrossItems();
        splitTaxAcrossItems();

        // Get the proportional amounts for the item being returned
        const itemSubtotal = item.price * item.quantity;
        const itemProportionalDiscount = item.proportionalDiscount || 0;
        const itemProportionalTax = item.proportionalTax || 0;

        // Calculate refund amount for this specific item
        const refundAmount = itemSubtotal + itemProportionalTax - itemProportionalDiscount;

        // console.log('Item return calculations:', {
        //     itemSubtotal,
        //     itemProportionalDiscount,
        //     itemProportionalTax,
        //     refundAmount
        // });

        // console.log('Order status is Delivered. Updating item status and reason.');
        // Update the item's status to 'Return Requested'
        item.status = 'Return Requested';
        item.returnReason = reason.trim();
        
        // Store the return details for reference
        item.returnDetails = {
            itemSubtotal: itemSubtotal,
            proportionalTax: itemProportionalTax,
            proportionalDiscount: itemProportionalDiscount,
            refundAmount: refundAmount,
            returnRequestedAt: new Date()
        };

        // Update order totals to reflect the return
        // Reduce the final amount by the refund amount
        // order.finalAmount = Math.max(0, order.finalAmount - refundAmount);
        
        // Reduce total discount by the item's proportional discount
        // order.discount = Math.max(0, order.discount - itemProportionalDiscount);

        // Update total price by removing the returned item's value
        // order.totalPrice = Math.max(0, order.totalPrice - itemSubtotal);

        // Add return history entry if returnHistory field exists or create it
        if (!order.returnHistory) {
            order.returnHistory = [];
        }
        
        order.returnHistory.push({
            itemId: itemId,
            productId: item.product,
            quantity: item.quantity,
            reason: reason.trim(),
            returnType: 'Single Item',
            requestedAt: new Date(),
            status: 'Pending',
            refundDetails: {
                itemSubtotal: itemSubtotal,
                proportionalTax: itemProportionalTax,
                proportionalDiscount: itemProportionalDiscount,
                refundAmount: refundAmount
            }
        });

        // Check if all items are returned/cancelled and update order status accordingly
        const activeItems = order.orderedItems.filter(orderItem => 
            orderItem.status !== 'Returned' && 
            orderItem.status !== 'Return Requested' && 
            orderItem.status !== 'Cancelled'
        );

        if (activeItems.length === 0) {
            order.status = 'Return Request';
        }

        // console.log('Saving updated order:', order._id);
        await order.save();

        // console.log('Order saved successfully. Return request for item submitted.');
        // console.log('--- returnSingleItem function finished ---');
        return res.json({ 
            success: true, 
            message: 'Return request for item submitted successfully',
            returnDetails: {
                itemSubtotal: itemSubtotal,
                proportionalTax: itemProportionalTax,
                proportionalDiscount: itemProportionalDiscount,
                refundAmount: refundAmount
            },
            updatedOrderTotals: {
                finalAmount: order.finalAmount,
                totalPrice: order.totalPrice,
                discount: order.discount
            }
        });

    } catch (error) {
        // console.error('--- Error in returnSingleItem function ---');
        // console.error('Error details:', error);
        // console.error('--- End of Error in returnSingleItem ---');
        return res.status(500).json({ success: false, message: 'Error submitting return request', error: error.message });
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        // const userId = req.session.user._id ? req.session.user._id : req.session.user;
        const userId = req.session.user; // Correctly get user ID from session

        if (!userId) {
            return res.json({ success: false, message: 'User not logged in' });
        }

        if (!reason) {
            return res.json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        })
        .populate('orderedItems.product')
        .select('+orderedItems.adminRejectionReason +orderedItems.adminReturnReason +adminReturnRejectionReason +adminRejectionReason'); // Include admin rejection reasons

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.json({ success: false, message: 'Can only return delivered orders' });
        }

        // Populate the order to access product details
        await order.populate('orderedItems.product');

        // Update product stock for each item
        for (const item of order.orderedItems) {
            if (item.product && item.product._id) {
                const product = await Product.findById(item.product._id);
                if (product) {
                    product.quantity += item.quantity;
                    await product.save();
                }
            }
        }

        order.status = 'Return Request';
        order.returnReason = reason;
        await order.save();

        return res.json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error processing return:', error);
        return res.status(500).json({ success: false, message: 'Error processing return', error: error.message });
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({
            _id: orderId,
            userId: userId
        }).populate('orderedItems.product');

        if (!order) {
            return res.redirect('/user/orders');
        }

        // Company info (customize as needed)
        const companyInfo = {
            name: 'Euphoria',
            address: 'Calicut, Kerala 673613',
            email: 'support@euphoria.com',
            phone: '+91 7012287796',
            website: 'www.euphoria.com',
            gst: 'GSTIN1234567890'
        };

        // Ensure totalPrice and finalAmount are numbers and not undefined/null
        order.totalPrice = typeof order.totalPrice === 'number' && !isNaN(order.totalPrice) ? order.totalPrice : 0;
        order.finalAmount = typeof order.finalAmount === 'number' && !isNaN(order.finalAmount) ? order.finalAmount : 0;
        order.discount = typeof order.discount === 'number' && !isNaN(order.discount) ? order.discount : 0;

        // Generate PDF buffer
        const pdfBuffer = await createPDF('invoice', { order, companyInfo });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=invoice_${order.orderId}.pdf`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.user._id ? req.session.user._id : req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const order = await Order.findOne({ _id: orderId, userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName productImage salePrice'
            });

        if (!order) {
            return res.redirect('/user/orders');
        }

        res.render('user/order-details', { order });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.redirect('/user/orders');
    }
};

module.exports = {
    getUserOrders,
    searchUserOrders,
    getSingleOrder,
    cancelOrder,
    cancelItem,
    returnSingleItem,
    returnOrder,
    downloadInvoice,
    getOrderDetails,
};




