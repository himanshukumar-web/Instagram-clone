const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// ✅ CORS fix
app.use(cors({
  origin: 'https://instagram-clone-nine-kappa.vercel.app',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Example test route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// ✅ Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ✅ Single app.listen
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
