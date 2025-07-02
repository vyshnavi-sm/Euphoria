const Order = require('../../models/orderSchema');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const User = require('../../models/userSchema');
const { generateOtp } = require('../../utils/otpService');
const { sendVerificationEmail } = require('../../utils/emailService');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');

const loadSalesReport = async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; 
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
        break;
    }

    const totalOrders = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate({
        path: 'orderedItems.product',
        select: 'name price images category'
      })
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .sort({ createdAt: -1, createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.createdAt = orderObj.createdAt || orderObj.createdOn;
      return orderObj;
    });

    const totalAmount = processedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalDiscount = processedOrders.reduce((sum, order) => {
      const couponDiscount = order.couponDiscount || 0;
      const productDiscount = order.discount || 0;
      return sum + couponDiscount + productDiscount;
    }, 0);
    const netSales = totalAmount - totalDiscount;

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

const generateSalesReport = async (req, res) => {
  try {
    const { format, filter, startDate, endDate } = req.query;
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
    }

    const orders = await Order.find(query)
      .populate({
        path: 'orderedItems.product',
        select: 'productName salePrice '
      })
      .populate({
        path: 'userId',
        select: 'name email'
      })
      .sort({ createdAt: -1, createdOn: -1 });



    const processedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.createdAt = orderObj.createdAt || orderObj.createdOn;
      return orderObj;
    });

    const totalAmount = processedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalDiscount = processedOrders.reduce((sum, order) => {
      const couponDiscount = order.couponDiscount || 0;
      const productDiscount = order.discount || 0;
      return sum + couponDiscount + productDiscount;
    }, 0);
    const netSales = totalAmount - totalDiscount;

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=sales-report-${moment().format('YYYY-MM-DD')}.pdf`);
      doc.pipe(res);

      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, { align: 'center' });
      doc.moveDown(2);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const boxHeight = 80;
      const boxY = doc.y;
      
      doc.rect(doc.page.margins.left, boxY, pageWidth, boxHeight).stroke();
      
      const colWidth = pageWidth / 2;
      const rowHeight = boxHeight / 2;
      
      doc.fontSize(10);
      doc.text(`Total Orders: ${processedOrders.length}`, doc.page.margins.left + 10, boxY + 15, { width: colWidth - 20 });
      doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`, doc.page.margins.left + colWidth + 10, boxY + 15, { width: colWidth - 20 });
      
      doc.text(`Total Discounts: ₹${totalDiscount.toFixed(2)}`, doc.page.margins.left + 10, boxY + rowHeight + 15, { width: colWidth - 20 });
      doc.text(`Net Sales: ₹${netSales.toFixed(2)}`, doc.page.margins.left + colWidth + 10, boxY + rowHeight + 15, { width: colWidth - 20 });
      
      doc.y = boxY + boxHeight + 20;

      const tableTop = doc.y;
      const tableHeaders = ['Order ID', 'Customer', 'Date', 'Products', 'Total (₹)', 'Discount (₹)', 'Payment'];
      const columnWidths = [80, 80, 80, 120, 60, 60, 70]; 
      const tableRowHeight = 25;
      let currentY = tableTop;

      function addTableCell(text, x, y, width, height, fontSize = 8) {
        doc.fontSize(fontSize)
           .text(text, x + 3, y + 3, {
             width: width - 6,
             height: height - 6,
             ellipsis: true
           });
      }

      function getProductNames(orderedItems) {
        if (!orderedItems || !Array.isArray(orderedItems)) {
          return 'No products';
        }

        const productNames = orderedItems.map(item => {
          let productName = 'Unknown Product';
          let quantity = item.quantity || 1;


          if (item.product && typeof item.product === 'object') {
            productName = item.product.name || item.product.productName  || 'Unknown Product';
          } else if (item.productName) {
            productName = item.productName;
          } else if (item.name) {
            productName = item.name;
          } else if (typeof item.product === 'string') {
            productName = 'Product ID: ' + item.product.substring(0, 8) + '...';
          }

          return `${productName} (${quantity})`;
        });

        return productNames.join(', ') || 'No products';
      }

      doc.fontSize(9).fillColor('black');
      let headerX = doc.page.margins.left;
      
      doc.rect(doc.page.margins.left, currentY, columnWidths.reduce((a, b) => a + b, 0), tableRowHeight)
         .fillAndStroke('#f0f0f0', '#000000');
      
      doc.fillColor('black');
      for (let i = 0; i < tableHeaders.length; i++) {
        addTableCell(tableHeaders[i], headerX, currentY, columnWidths[i], tableRowHeight, 9);
        headerX += columnWidths[i];
      }
      
      currentY += tableRowHeight;

      let rowIndex = 0;
      for (const order of processedOrders) {
        if (currentY + tableRowHeight > doc.page.height - doc.page.margins.bottom - 50) {
          doc.addPage();
          currentY = doc.page.margins.top;
          
          doc.rect(doc.page.margins.left, currentY, columnWidths.reduce((a, b) => a + b, 0), tableRowHeight)
             .fillAndStroke('#f0f0f0', '#000000');
          
          doc.fillColor('black');
          headerX = doc.page.margins.left;
          for (let i = 0; i < tableHeaders.length; i++) {
            addTableCell(tableHeaders[i], headerX, currentY, columnWidths[i], tableRowHeight, 9);
            headerX += columnWidths[i];
          }
          currentY += tableRowHeight;
        }

        const fillColor = rowIndex % 2 === 0 ? '#ffffff' : '#f9f9f9';
        doc.rect(doc.page.margins.left, currentY, columnWidths.reduce((a, b) => a + b, 0), tableRowHeight)
           .fillAndStroke(fillColor, '#cccccc');

        doc.fillColor('black');
        let cellX = doc.page.margins.left;

        const orderIdShort = order._id.toString().substring(0, 12) + '...';
        addTableCell(orderIdShort, cellX, currentY, columnWidths[0], tableRowHeight);
        cellX += columnWidths[0];

        addTableCell(order.userId ? order.userId.name : 'N/A', cellX, currentY, columnWidths[1], tableRowHeight);
        cellX += columnWidths[1];

        const dateStr = moment(order.createdAt).format('DD/MM/YY HH:mm');
        addTableCell(dateStr, cellX, currentY, columnWidths[2], tableRowHeight);
        cellX += columnWidths[2];

        const productsDisplay = getProductNames(order.orderedItems);
        addTableCell(productsDisplay, cellX, currentY, columnWidths[3], tableRowHeight);
        cellX += columnWidths[3];

        addTableCell(order.totalPrice.toFixed(2), cellX, currentY, columnWidths[4], tableRowHeight);
        cellX += columnWidths[4];

        const totalOrderDiscount = (order.couponDiscount || 0) + (order.discount || 0);
        addTableCell(totalOrderDiscount.toFixed(2), cellX, currentY, columnWidths[5], tableRowHeight);
        cellX += columnWidths[5];

        addTableCell(order.paymentMethod, cellX, currentY, columnWidths[6], tableRowHeight);

        currentY += tableRowHeight;
        rowIndex++;
      }

      doc.moveDown(2);
      doc.fontSize(10).text(`Total Records: ${processedOrders.length}`, { align: 'right' });
      doc.text(`Report Period: ${filter === 'custom' && startDate && endDate ? 
        `${moment(startDate).format('DD/MM/YYYY')} to ${moment(endDate).format('DD/MM/YYYY')}` : 
        filter.charAt(0).toUpperCase() + filter.slice(1)}`, { align: 'right' });

      doc.end();

    } else if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 30 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Products', key: 'products', width: 50 },
        { header: 'Total Amount', key: 'total', width: 15 },
        { header: 'Discount', key: 'discount', width: 15 },
        { header: 'Net Amount', key: 'net', width: 15 },
        { header: 'Payment Method', key: 'payment', width: 15 }
      ];

      worksheet.addRow({
        orderId: 'SUMMARY',
        customer: 'Total Orders: ' + processedOrders.length,
        date: '',
        products: '',
        total: totalAmount.toFixed(2),
        discount: totalDiscount.toFixed(2),
        net: netSales.toFixed(2),
        payment: ''
      });

      function getProductNamesForExcel(orderedItems) {
        if (!orderedItems || !Array.isArray(orderedItems)) {
          return 'No products';
        }

        const productNames = orderedItems.map(item => {
          let productName = 'Unknown Product';
          let quantity = item.quantity || 1;

          if (item.product && typeof item.product === 'object') {
            productName = item.product.name || item.product.productName || 'Unknown Product';
          } else if (item.productName) {
            productName = item.productName;
          } else if (item.name) {
            productName = item.name;
          } else if (typeof item.product === 'string') {
            productName = 'Product ID: ' + item.product;
          }

          return `${productName} (${quantity})`;
        });

        return productNames.join(', ') || 'No products';
      }

      processedOrders.forEach(order => {
        worksheet.addRow({
          orderId: order._id.toString(),
          customer: order.userId ? order.userId.name : 'N/A',
          date: moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          products: getProductNamesForExcel(order.orderedItems),
          total: order.totalPrice.toFixed(2),
          discount: ((order.couponDiscount || 0) + (order.discount || 0)).toFixed(2),
          net: (order.totalPrice - ((order.couponDiscount || 0) + (order.discount || 0))).toFixed(2),
          payment: order.paymentMethod
        });
      });

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

module.exports = {
  loadSalesReport,
  generateSalesReport
};



