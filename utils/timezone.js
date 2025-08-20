const moment = require('moment-timezone');

function formatToIST(date) {
    if (!date) return '';
    return moment(date)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY, hh:mm A"); 
}

module.exports = { formatToIST };
