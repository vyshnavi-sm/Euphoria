const Order = require('../../models/orderSchema');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.loadSalesReport = async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // Default 10 items per page
    const skip = (page - 1) * limit;

    let query = {};

    const today = moment().startOf('day');
    const startOfWeek = moment().startOf('week');
    const startOfYear = moment().startOf('year');

    switch (filter) {
      case 'daily':
        query.$or = [
          { createdAt: { $gte: today.toDate() } },
          { createdOn: { $gte: today.toDate() } }
        ];
        break;
      case 'weekly':
        query.$or = [
          { createdAt: { $gte: startOfWeek.toDate() } },
          { createdOn: { $gte: startOfWeek.toDate() } }
        ];
        break;
      case 'yearly':
        query.$or = [
          { createdAt: { $gte: startOfYear.toDate() } },
          { createdOn: { $gte: startOfYear.toDate() } }
        ];
        break;
      case 'custom':
        if (startDate && endDate) {
          query.$or = [
            { 
              createdAt: { 
                $gte: moment(startDate).startOf('day').toDate(), 
                $lte: moment(endDate).endOf('day').toDate() 
              }
            },
            { 
              createdOn: { 
                $gte: moment(startDate).startOf('day').toDate(), 
                $lte: moment(endDate).endOf('day').toDate() 
              }
            }
          ];
        }
        break;
      case 'all':
      default:
        // No date filter for 'all'
        break;
    }

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate('orderedItems.product')
      .populate('userId')
      .sort({ createdAt: -1, createdOn: -1 })
      .skip(skip)
      .limit(limit);

    // Process orders to ensure date field is available
    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      // Use createdOn if createdAt is not available
      orderObj.createdAt = orderObj.createdAt || orderObj.createdOn;
      return orderObj;
    });

    // Calculate overall metrics
    const totalAmount = processedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalDiscount = processedOrders.reduce((sum, order) => {
      // Include both coupon discount and product/category discounts
      const couponDiscount = order.couponDiscount || 0;
      const productDiscount = order.discount || 0;
      return sum + couponDiscount + productDiscount;
    }, 0);
    const netSales = totalAmount - totalDiscount;

    // Calculate pagination info
    const totalPages = Math.ceil(totalOrders / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.render('admin/salesReport', {
      orders: processedOrders,
      totalOrders,
      totalAmount,
      totalDiscount,
      netSales,
      selectedFilter: filter,
      startDate,
      endDate,
      pagination: {
        page,
        limit,
        totalPages,
        totalOrders,
        hasNextPage,
        hasPrevPage,
        startRecord: skip + 1,
        endRecord: Math.min(skip + limit, totalOrders)
      }
    });
  } catch (error) {
    console.error('Error loading sales report:', error);
    res.status(500).send('Error loading sales report');
  }
};

exports.generateSalesReport = async (req, res) => {
  try {
    const { format, filter, startDate, endDate } = req.query;
    let query = {};

    // Apply the same date filtering logic as in loadSalesReport
    const today = moment().startOf('day');
    const startOfWeek = moment().startOf('week');
    const startOfYear = moment().startOf('year');

    switch (filter) {
      case 'daily':
        query.$or = [
          { createdAt: { $gte: today.toDate() } },
          { createdOn: { $gte: today.toDate() } }
        ];
        break;
      case 'weekly':
        query.$or = [
          { createdAt: { $gte: startOfWeek.toDate() } },
          { createdOn: { $gte: startOfWeek.toDate() } }
        ];
        break;
      case 'yearly':
        query.$or = [
          { createdAt: { $gte: startOfYear.toDate() } },
          { createdOn: { $gte: startOfYear.toDate() } }
        ];
        break;
      case 'custom':
        if (startDate && endDate) {
          query.$or = [
            { 
              createdAt: { 
                $gte: moment(startDate).startOf('day').toDate(), 
                $lte: moment(endDate).endOf('day').toDate() 
              }
            },
            { 
              createdOn: { 
                $gte: moment(startDate).startOf('day').toDate(), 
                $lte: moment(endDate).endOf('day').toDate() 
              }
            }
          ];
        }
        break;
    }

    const orders = await Order.find(query)
      .populate('orderedItems.product')
      .populate('userId')
      .sort({ createdAt: -1, createdOn: -1 });

    // Process orders
    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.createdAt = orderObj.createdAt || orderObj.createdOn;
      return orderObj;
    });

    // Calculate metrics
    const totalAmount = processedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalDiscount = processedOrders.reduce((sum, order) => {
      const couponDiscount = order.couponDiscount || 0;
      const productDiscount = order.discount || 0;
      return sum + couponDiscount + productDiscount;
    }, 0);
    const netSales = totalAmount - totalDiscount;

    if (format === 'pdf') {
      // Generate PDF
      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.pdf`);
      doc.pipe(res);

      // Set document margins
      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`);
      doc.moveDown();

      // Add metrics in a box
      const metricsBoxX = doc.page.margins.left;
      const metricsBoxY = doc.y;
      const metricsBoxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let metricsBoxHeight = 0;

      const metrics = [
        { label: 'Total Orders:', value: processedOrders.length },
        { label: 'Total Amount:', value: `₹${totalAmount.toFixed(2)}` },
        { label: 'Total Discounts:', value: `₹${totalDiscount.toFixed(2)}` },
        { label: 'Net Sales:', value: `₹${netSales.toFixed(2)}` }
      ];

      // Calculate height needed for the box
      metrics.forEach(metric => {
        metricsBoxHeight += doc.fontSize(12).heightOfString(`${metric.label} ${metric.value}`) + 5; // Add padding
      });
      metricsBoxHeight += 10; // Add top and bottom padding for the box

      // Draw the box
      doc.rect(metricsBoxX, metricsBoxY, metricsBoxWidth, metricsBoxHeight).stroke();

      // Add metrics text inside the box
      doc.moveDown(0.5); // Add some space after the border
      metrics.forEach(metric => {
        doc.fontSize(12)
           .text(`${metric.label} `, { continued: true })
           .text(`${metric.value}`);
        doc.moveDown(0.2); // Reduce space between metrics
      });
      doc.moveDown(); // Space after the metrics box

      // Add order details
      doc.fontSize(14).text('Order Details');
      doc.moveDown();

      processedOrders.forEach((order, index) => {
        doc.fontSize(12);
        doc.text(`Order ${index + 1}: ${order._id}`);
        doc.text(`Customer: ${order.userId ? order.userId.name : 'N/A'}`);
        doc.text(`Date: ${moment(order.createdAt).format('MMMM Do YYYY, h:mm:ss a')}`);
        doc.text(`Total: ₹${order.totalPrice.toFixed(2)}`);
        doc.text(`Discount: ₹${((order.couponDiscount || 0) + (order.discount || 0)).toFixed(2)}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.moveDown();

        // Add order items
        doc.text('Items:');
        order.orderedItems.forEach(item => {
          if (item.product) {
            doc.text(`- ${item.product.name} (Qty: ${item.quantity})`);
          }
        });
        doc.moveDown();
      });

      doc.end();
    } else if (format === 'excel') {
      // Generate Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // Add headers
      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 30 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Total Amount', key: 'total', width: 15 },
        { header: 'Discount', key: 'discount', width: 15 },
        { header: 'Net Amount', key: 'net', width: 15 },
        { header: 'Payment Method', key: 'payment', width: 15 }
      ];

      // Add summary row
      worksheet.addRow({
        orderId: 'SUMMARY',
        customer: 'Total Orders: ' + processedOrders.length,
        date: '',
        total: totalAmount.toFixed(2),
        discount: totalDiscount.toFixed(2),
        net: netSales.toFixed(2),
        payment: ''
      });

      // Add order rows
      processedOrders.forEach(order => {
        worksheet.addRow({
          orderId: order._id.toString(),
          customer: order.userId ? order.userId.name : 'N/A',
          date: moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          total: order.totalPrice.toFixed(2),
          discount: ((order.couponDiscount || 0) + (order.discount || 0)).toFixed(2),
          net: (order.totalPrice - ((order.couponDiscount || 0) + (order.discount || 0))).toFixed(2),
          payment: order.paymentMethod
        });
      });

      // Style the worksheet
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(2).font = { bold: true };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.xlsx`);

      await workbook.xlsx.write(res);
    } else {
      res.status(400).send('Invalid format specified');
    }
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).send('Error generating sales report');
  }
}; 