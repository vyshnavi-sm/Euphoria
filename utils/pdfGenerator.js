const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a PDF invoice for an order
 * @param {string} type - Type of PDF to generate (currently only 'invoice' is supported)
 * @param {Object} data - Data for the PDF (order details, company info, etc.)
 * @returns {Promise<Buffer>} - PDF buffer
 */
const createPDF = async (type, data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                margin: 30,
                size: 'A4',
                bufferPages: true
            });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Helper function to draw bordered box
            const drawBox = (x, y, width, height, fillColor = null) => {
                doc.save(); // Save current state
                if (fillColor) {
                    doc.rect(x, y, width, height).fill(fillColor);
                }
                doc.rect(x, y, width, height).stroke('#000000');
                doc.restore(); // Restore state
            };

            // Page dimensions
            const pageWidth = 595.28; // A4 width in points
            const pageHeight = 841.89; // A4 height in points
            const margin = 30;
            const contentWidth = pageWidth - (margin * 2);

            // Define estimated section heights (adjust as needed)
            const headerHeight = 80;
            const invoiceTitleHeight = 35;
            const orderDetailsHeight = 60;
            const customerHeight = 90;
            const itemRowHeight = 20; // Estimate height per item row
            const itemsPadding = 10; // Padding above/below items table
            const totalsHeight = 100;
            const paymentHeight = 60;
            const footerHeight = 40;

            // Calculate dynamic items table height
            const numberOfItems = data.order.orderedItems.length;
            const itemsContentHeight = (itemRowHeight * numberOfItems) + 30; // Header + rows
            const itemsSectionHeight = itemsContentHeight + (itemsPadding * 2); // Add padding

            // Calculate total required height
            const totalRequiredHeight = headerHeight + invoiceTitleHeight + orderDetailsHeight + customerHeight + itemsSectionHeight + totalsHeight + paymentHeight + footerHeight + (margin * 2) + (7 * 10); // Sum of heights + inter-section spacing

            // Adjust items section height if needed to fit on one page (simplified approach)
            let effectiveItemsSectionHeight = itemsSectionHeight;
            const availableHeight = pageHeight - (headerHeight + invoiceTitleHeight + orderDetailsHeight + customerHeight + totalsHeight + paymentHeight + footerHeight + (margin * 2) + (7 * 10));

            if (totalRequiredHeight > pageHeight) {
                 effectiveItemsSectionHeight = availableHeight > itemsContentHeight ? itemsSectionHeight : Math.max(itemsContentHeight, availableHeight);
            }

            let currentY = margin;

            // 1. COMPANY HEADER SECTION (with box)
            drawBox(margin, currentY, contentWidth, headerHeight, '#f8f8f8');
            
            doc
                .fontSize(18)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text(data.companyInfo.name, margin + 10, currentY + 15, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                });

            doc
                .fontSize(9)
                .font('Helvetica')
                .text(data.companyInfo.address, margin + 10, currentY + 40, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                })
                .text(`Email: ${data.companyInfo.email} | Phone: ${data.companyInfo.phone}`, margin + 10, currentY + 52, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                })
                .text(`Website: ${data.companyInfo.website} | GST: ${data.companyInfo.gst}`, margin + 10, currentY + 64, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                });

            currentY += headerHeight + 10; // Spacing after section

            // 2. INVOICE TITLE
            // drawBox(margin, currentY, contentWidth, invoiceTitleHeight);
            doc
                .fontSize(22)
                .font('Helvetica-Bold')
                .fillColor('#333333')
                .text('INVOICE', margin, currentY + 5, { 
                    width: contentWidth, 
                    align: 'center' 
                });

            currentY += invoiceTitleHeight + 10; // Spacing after section

            // 3. ORDER DETAILS SECTION (with box)
            drawBox(margin, currentY, contentWidth, orderDetailsHeight);
            
            const orderDetailsY = currentY + 10;
            const leftColumnX = margin + 15;
            const rightColumnX = margin + (contentWidth / 2) + 15;
            const columnWidth = (contentWidth / 2) - 30; // Adjust column width

            doc
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('Order Details:', leftColumnX, orderDetailsY, { width: columnWidth })
                .font('Helvetica')
                .text(`Order ID: ${data.order.orderId}`, leftColumnX, orderDetailsY + 15, { width: columnWidth })
                .text(`Status: ${data.order.status}`, leftColumnX, orderDetailsY + 30, { width: columnWidth });

            doc
                .font('Helvetica-Bold')
                .text('Invoice Date:', rightColumnX, orderDetailsY, { width: columnWidth })
                .font('Helvetica')
                .text(new Date(data.order.createdAt).toLocaleDateString('en-IN'), rightColumnX, orderDetailsY + 15, { width: columnWidth });

            currentY += orderDetailsHeight + 10; // Spacing after section

            // 4. CUSTOMER DETAILS SECTION (with box)
            drawBox(margin, currentY, contentWidth, customerHeight);
            
            doc
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('BILL TO:', margin + 15, currentY + 10)
                .font('Helvetica')
                .text(data.order.addressDetails.name, margin + 15, currentY + 25)
                .text(data.order.addressDetails.address, margin + 15, currentY + 40)
                .text(`${data.order.addressDetails.city}, ${data.order.addressDetails.state} - ${data.order.addressDetails.pincode}`, margin + 15, currentY + 55)
                .text(`Phone: ${data.order.addressDetails.phone}`, margin + 15, currentY + 70);

            currentY += customerHeight + 10; // Spacing after section

            // 5. ITEMS TABLE SECTION (with box)
            drawBox(margin, currentY, contentWidth, effectiveItemsSectionHeight);
            
            // Table header
            const tableY = currentY + itemsPadding;
            const colWidths = [200, 80, 80, 100]; // Product, Qty, Price, Amount
            let colX = margin + 15;

            // Header background
            doc.rect(margin + 5, tableY, contentWidth - 10, 20).fillAndStroke('#e8e8e8', '#000000');

            doc
                .fontSize(10)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('Product Name', colX, tableY + 6, { width: colWidths[0] });
            colX += colWidths[0];
            doc.text('Qty', colX, tableY + 6, { width: colWidths[1], align: 'center' });
            colX += colWidths[1];
            doc.text('Price', colX, tableY + 6, { width: colWidths[2], align: 'right' });
            colX += colWidths[2];
            doc.text('Amount', colX, tableY + 6, { width: colWidths[3], align: 'right' });

            // Table rows
            let rowY = tableY + 25;
            doc.font('Helvetica').fontSize(11); // Increased font size for items

            data.order.orderedItems.forEach((item, index) => {
                const itemTotal = item.price * item.quantity;
                colX = margin + 15;

                // Alternate row background
                if (index % 2 === 1) {
                    doc.rect(margin + 5, rowY - 3, contentWidth - 10, 18).fillAndStroke('#f9f9f9', '#f9f9f9');
                }

                doc
                    .fillColor('#000000')
                    .text(item.product.productName, colX, rowY, { width: colWidths[0] });
                colX += colWidths[0];
                doc.text(item.quantity.toString(), colX, rowY, { width: colWidths[1], align: 'center' });
                colX += colWidths[1];
                // Explicitly format price string
                doc.text('₹' + item.price.toFixed(2), colX, rowY, { width: colWidths[2], align: 'right' });
                colX += colWidths[2];
                // Explicitly format amount string
                doc.text('₹' + itemTotal.toFixed(2), colX, rowY, { width: colWidths[3], align: 'right' });

                // Draw row separator
                // doc.moveTo(margin + 5, rowY + 15).lineTo(margin + contentWidth - 5, rowY + 15).stroke('#ddd');
                
                rowY += itemRowHeight;
            });

            currentY += effectiveItemsSectionHeight + 10; // Spacing after section

            // 6. TOTALS SECTION (with box)
            drawBox(margin, currentY, contentWidth, totalsHeight);
            
            const totalsX = margin + contentWidth - 220;
            const totalsStartY = currentY + 15;
            const totalsWidth = 200;
            
            const subtotal = data.order.totalPrice;
            const tax = subtotal * 0.18;
            const discount = data.order.discount || 0;
            const finalAmount = data.order.finalAmount;

            doc
                .fontSize(11) // Increased font size for totals breakdown
                .font('Helvetica')
                .text('Subtotal:', totalsX, totalsStartY, { width: totalsWidth / 2 })
                // Explicitly format subtotal string
                .text('₹' + subtotal.toFixed(2), totalsX + totalsWidth / 2, totalsStartY, { align: 'right', width: totalsWidth / 2 });

            doc
                .text('Tax (18%):', totalsX, totalsStartY + 15, { width: totalsWidth / 2 })
                // Explicitly format tax string
                .text('₹' + tax.toFixed(2), totalsX + totalsWidth / 2, totalsStartY + 15, { align: 'right', width: totalsWidth / 2 });

            if (discount > 0) {
                doc
                    .text('Discount:', totalsX, totalsStartY + 30, { width: totalsWidth / 2 })
                    // Explicitly format discount string
                    .text('-₹' + discount.toFixed(2), totalsX + totalsWidth / 2, totalsStartY + 30, { align: 'right', width: totalsWidth / 2 });
            }

            // Draw line above total
            const totalLineY = totalsStartY + (discount > 0 ? 48 : 33);
            doc.moveTo(totalsX, totalLineY)
               .lineTo(totalsX + totalsWidth, totalLineY)
               .stroke();

            doc
                .fontSize(14) // Increased font size for final TOTAL
                .font('Helvetica-Bold')
                .text('TOTAL:', totalsX, totalLineY + 5, { width: totalsWidth / 2 })
                // Explicitly format total string
                .text('₹' + finalAmount.toFixed(2), totalsX + totalsWidth / 2, totalLineY + 5, { 
                    align: 'right', 
                    width: totalsWidth / 2 
                });

            currentY += totalsHeight + 10; // Spacing after section

            // 7. PAYMENT INFO SECTION (with box)
            drawBox(margin, currentY, contentWidth, paymentHeight, '#f0f8ff');
            
            doc
                .fontSize(10)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('Payment Information:', margin + 15, currentY + 10)
                .font('Helvetica')
                .text(`Payment Method: ${data.order.paymentMethod || 'Cash on Delivery'}`, margin + 15, currentY + 25)
                .text(`Payment Status: ${data.order.paymentStatus || 'Pending'}`, margin + 15, currentY + 40);

            currentY += paymentHeight + 10; // Spacing after section

            // 8. FOOTER SECTION (with box)
            drawBox(margin, currentY, contentWidth, footerHeight, '#f8f8f8');
            
            doc
                .fontSize(9)
                .font('Helvetica')
                .text('Thank you for your business!', margin + 10, currentY + 10, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                })
                .text('This is a computer-generated invoice and does not require a signature.', margin + 10, currentY + 25, { 
                    width: contentWidth - 20, 
                    align: 'center' 
                });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    createPDF
};