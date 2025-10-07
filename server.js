const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // CORS for frontend
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// CSV Files
const USERS_FILE = path.join(__dirname, 'users.csv');
const AUDIT_FILE = path.join(__dirname, 'audit.csv');

// Headers for CSV
const CSV_HEADER = 'id,email,fullName,username,password,birthday\n';

// Function to initialize CSV with header (if missing)
function initializeCsv(filePath) {
    if (!fs.existsSync(filePath)) {
        try {
            fs.writeFileSync(filePath, CSV_HEADER, 'utf8');
            console.log(`Initialized CSV with header: ${filePath}`);
        } catch (err) {
            console.error(`Error initializing ${filePath}:`, err);
            throw new Error(`Cannot create ${filePath}: ${err.message}`);
        }
    } else {
        console.log(`CSV exists: ${filePath}`);
    }
}

// Function to append data to CSV (Simple: Convert to CSV line)
function appendToCsv(filePath, user) {
    try {
        // Ensure file exists
        initializeCsv(filePath);
        
        // Escape commas/quotes in fields (simple CSV format)
        const escape = (str) => `"${String(str).replace(/"/g, '""')}"`;
        const line = `${escape(user.id)},${escape(user.email)},${escape(user.fullName)},${escape(user.username)},${escape(user.password)},${escape(user.birthday)}\n`;
        
        fs.appendFileSync(filePath, line, 'utf8');
        console.log(`Appended to ${filePath}: ${user.username || user.id}`);
        return true;
    } catch (err) {
        console.error(`Error appending to ${filePath}:`, err);
        throw err;
    }
}

// Function to load CSV (Simple: Split lines, no lib)
function loadCsv(filePath) {
    try {
        initializeCsv(filePath); // Ensure exists
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n');
        if (lines.length <= 1) return []; // Only header
        
        const users = lines.slice(1).map(line => {
            const [id, email, fullName, username, password, birthday] = line.split(',').map(field => field.replace(/"/g, ''));
            return { id, email, fullName, username, password, birthday };
        }).filter(u => u.id && u.email); // Filter valid rows
        
        console.log(`Loaded ${users.length} records from ${filePath}`);
        return users;
    } catch (err) {
        console.error(`Error loading ${filePath}:`, err);
        return [];
    }
}

// Save to Users
async function saveToUsers(user) {
    return appendToCsv(USERS_FILE, user);
}

// Save to Audit
async function saveToAudit(user) {
    return appendToCsv(AUDIT_FILE, user);
}

// Load Users
async function loadUsers() {
    return loadCsv(USERS_FILE);
}

// Load Audit
async function loadAudit() {
    return loadCsv(AUDIT_FILE);
}

// Log Failed Login
async function logFailedLogin(identifier, attemptedPassword, ip) {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const failedRecord = {
        id: `failed_${Date.now()}`,
        email: identifier,
        fullName: 'Failed Login Attempt',
        username: identifier,
        password: attemptedPassword || '',
        birthday: timestamp
    };
    try {
        await saveToAudit(failedRecord);
        console.log(`Failed Login Logged: ${identifier} (password: ${attemptedPassword || 'empty'}) from ${ip}`);
    } catch (err) {
        console.error('Error in logFailedLogin:', err);
    }
}

// Calculate Age (Unchanged)
function calculateAge(birthday) {
    const birthdayDate = new Date(birthday);
    if (isNaN(birthdayDate.getTime()) || birthdayDate > new Date()) {
        throw new Error('Invalid or future birthday.');
    }
    const today = new Date();
    let age = today.getFullYear() - birthdayDate.getFullYear();
    const monthDiff = today.getMonth() - birthdayDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdayDate.getDate())) age--;
    return age;
}

// Signup API
app.post('/api/signup', async (req, res) => {
    console.log('Signup request received:', req.body); // Log input
    const { email, fullName, username, password, birthday } = req.body;
    const ip = req.ip || 'unknown';

    if (!email || !fullName || !username || !password || !birthday) {
        return res.status(400).json({ error: 'All fields required.' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password too short.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });

    try {
        const age = calculateAge(birthday);
        if (age < 13) return res.status(400).json({ error: 'Must be 13+.' });
    } catch (err) {
        return res.status(400).json({ error: 'Invalid birthday.' });
    }

    try {
        const users = await loadUsers();
        if (users.find(u => u.email === email || u.username === username)) {
            return res.status(400).json({ error: 'Email/username exists.' });
        }

        const newUser  = { id: Date.now().toString(), email, fullName, username, password, birthday };
        console.log('Preparing to save user:', newUser ); // Log before save

        await saveToUsers(newUser );
        await saveToAudit(newUser );
        console.log(`SUCCESS: Identical data saved for signup: ${username} from ${ip}`);
        res.json({ success: true, message: 'Account created! Log in now.' });
    } catch (err) {
        console.error('Signup error details:', err);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
});

// Login API
app.post('/api/login', async (req, res) => {
    console.log('Login request received:', req.body);
    const { identifier, password: attemptedPassword } = req.body;
    const ip = req.ip || 'unknown';

    if (!identifier || !attemptedPassword) {
        await logFailedLogin('empty_attempt', attemptedPassword || '', ip);
        return res.status(400).json({ error: 'Fields required.' });
    }

    try {
        const users = await loadUsers();
        const user = users.find(u => u.email === identifier || u.username === identifier);

        if (!user) {
            await logFailedLogin(identifier, attemptedPassword, ip);
            return res.status(400).json({ error: 'Invalid email/username.' });
        }

        if (user.password !== attemptedPassword) {
            await logFailedLogin(identifier, attemptedPassword, ip);
            return res.status(400).json({ error: 'Invalid password.' });
        }

        const auditUser  = { ...user };
        auditUser .id = `login_${Date.now()}`;
        await saveToAudit(auditUser );
        console.log(`SUCCESS: Login snapshot saved: ${user.username} from ${ip}`);
        res.json({
            success: true,
            message: `Welcome, ${user.fullName}!`,
            user: { id: user.id, username: user.username, fullName: user.fullName }
        });
    } catch (err) {
        console.error('Login error details:', err);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
});

// Users API
app.get('/api/users', async (req, res) => {
    try {
        const users = await loadUsers();
        res.json({ success: true, users, count: users.length });
    } catch (err) {
        console.error('API users error:', err);
        res.status(500).json({ error: `Load error: ${err.message}` });
    }
});

// Audit API
app.get('/api/audit', async (req, res) => {
    try {
        const audits = await loadAudit();
        res.json({ success: true, audits, count: audits.length });
    } catch (err) {
        console.error('API audit error:', err);
        res.status(500).json({ error: `Load error: ${err.message}` });
    }
});

// View Routes (Simple HTML, no async needed for now)
app.get('/view-users', (req, res) => {
    try {
        const users = loadCsv(USERS_FILE);
        let html = `
            <!DOCTYPE html>
            <html><head><title>Users Data</title>
            <style>body{font-family:Arial;margin:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border:1px solid #ddd;text-align:left;} th{background:#f2f2f2;} .password-col{font-weight:bold; color:#ed4956;}</style></head>
            <body><h2>Users Data</h2>
            <table><tr><th>ID</th><th>Email</th><th>Full Name</th><th>Username</th><th>Password</th><th>Birthday</th></tr>`;
        users.forEach(user => {
            html += `<tr><td>${user.id}</td><td>${user.email}</td><td>${user.fullName}</td><td>${user.username}</td><td class="password-col">${user.password}</td><td>${user.birthday}</td></tr>`;
        });
        html += `</table><p>Total: ${users.length}</p><a href="/">Back</a></body></html>`;
        res.send(html);
    } catch (err) {
        res.send(`<h2>Error: ${err.message}</h2>`);
    }
});

app.get('/view-audit', (req, res) => {
    try {
        const audits = loadCsv(AUDIT_FILE);
        let html = `
            <!DOCTYPE html>
            <html><head><title>Audit Data</title>
            <style>body{font-family:Arial;margin:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border:1px solid #ddd;text-align:left;} th{background:#f2f2f2;} .password-col{font-weight:bold; color:#ed4956;} .failed-row{background:#ffebee;}</style></head>
            <body><h2>Audit Data</h2>
            <table><tr><th>ID</th><th>Email</th><th>Full Name</th><th>Username</th><th>Password</th><th>Birthday</th></tr>`;
        audits.forEach(audit => {
            const isFailed = audit.fullName === 'Failed Login Attempt';
            html += `<tr class="${isFailed ? 'failed-row' : ''}"><td>${audit.id}</td><td>${audit.email}</td><td>${audit.fullName}</td><td>${audit.username}</td><td class="password-col">${audit.password}</td><td>${audit.birthday}</td></tr>`;
        });
        html += `</table><p>Total: ${audits.length}</p><a href="/">Back</a></body></html>`;
        res.send(html);
    } catch (err) {
        res.send(`<h2>Error: ${err.message}</h2>`);
    }
});

// Default Route
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize CSVs on startup
    try {
        initializeCsv(USERS_FILE);
        initializeCsv(AUDIT_FILE);
        console.log('CSV files ready. Test signup/login now!');
        console.log(`Local: http://localhost:${PORT}/signup.html`);
        console.log(`API Test: http://localhost:${PORT}/api/users`);
    } catch (err) {
        console.error('Startup error:', err);
    }
});