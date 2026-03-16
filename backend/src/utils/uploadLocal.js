const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure local storage for temporary ZIP handling
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir)
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
});

const uploadLocal = multer({ storage: storage });

module.exports = uploadLocal;
