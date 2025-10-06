const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { parse } = require('csv-parse/sync');
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;  // ✅ Vercel ke liye correct

app.use(cors());
app.use(cors({ origin: "https://instagram-clone-nine-kappa.vercel.app" }));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ... (tumhara saara API code same rahe)

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// ✅ Sirf ek listen rakhna
app.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
});
