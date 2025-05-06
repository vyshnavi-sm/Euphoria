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
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Add company header
            doc
                .fontSize(20)
                .text(data.companyInfo.name, { align: 'center' })
                .moveDown(0.5)
                .fontSize(12)
                .text(data.companyInfo.address, { align: 'center' })
                .text(`Email: ${data.companyInfo.email}`, { align: 'center' })
                .text(`Phone: ${data.companyInfo.phone}`, { align: 'center' })
                .text(`Website: ${data.companyInfo.website}`, { align: 'center' })
                .text(`GST: ${data.companyInfo.gst}`, { align: 'center' })
                .moveDown(1);

            // Add invoice title
            doc
                .fontSize(16)
                .text('INVOICE', { align: 'center' })
                .moveDown(1);

            // Add order details
            doc
                .fontSize(12)
                .text(`Order ID: ${data.order.orderId}`)
                .text(`Date: ${new Date(data.order.createdAt).toLocaleDateString()}`)
                .text(`Status: ${data.order.status}`)
                .moveDown(1);

            // Add customer details
            doc
                .fontSize(14)
                .text('Bill To:', { underline: true })
                .moveDown(0.5)
                .fontSize(12)
                .text(data.order.addressDetails.name)
                .text(data.order.addressDetails.address)
                .text(`${data.order.addressDetails.city}, ${data.order.addressDetails.state}`)
                .text(`Pincode: ${data.order.addressDetails.pincode}`)
                .text(`Phone: ${data.order.addressDetails.phone}`)
                .moveDown(1);

            // Add items table
            doc
                .fontSize(14)
                .text('Items:', { underline: true })
                .moveDown(0.5);

            // Table header
            doc
                .fontSize(12)
                .text('Product', 50, doc.y, { width: 200 })
                .text('Quantity', 250, doc.y, { width: 100 })
                .text('Price', 350, doc.y, { width: 100 })
                .text('Total', 450, doc.y, { width: 100 })
                .moveDown(0.5);

            // Table rows
            data.order.orderedItems.forEach(item => {
                doc
                    .text(item.product.productName, 50, doc.y, { width: 200 })
                    .text(item.quantity.toString(), 250, doc.y, { width: 100 })
                    .text(`₹${item.price.toFixed(2)}`, 350, doc.y, { width: 100 })
                    .text(`₹${(item.price * item.quantity).toFixed(2)}`, 450, doc.y, { width: 100 })
                    .moveDown(0.5);
            });

            // Add totals
            doc
                .moveDown(1)
                .text(`Subtotal: ₹${data.order.totalPrice.toFixed(2)}`, { align: 'right' })
                .text(`Tax (18%): ₹${(data.order.totalPrice * 0.18).toFixed(2)}`, { align: 'right' });

            if (data.order.discount > 0) {
                doc.text(`Discount: -₹${data.order.discount.toFixed(2)}`, { align: 'right' });
            }

            doc
                .fontSize(14)
                .text(`Total: ₹${data.order.finalAmount.toFixed(2)}`, { align: 'right' })
                .moveDown(2);

            // Add footer
            doc
                .fontSize(10)
                .text('Thank you for your business!', { align: 'center' })
                .text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    createPDF
}; 