const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// CSV Files
const USERS_FILE = path.join(__dirname, 'users.csv');
const AUDIT_FILE = path.join(__dirname, 'audit.csv'); // Now mirrors users.csv structure

// Users/Audit CSV Writer (SAME structure for both files - identical data)
const csvWriter = createObjectCsvWriter({
    path: USERS_FILE, // Default for users
    header: [
        { id: 'id', title: 'id' }, { id: 'email', title: 'email' }, { id: 'fullName', title: 'fullName' },
        { id: 'username', title: 'username' }, { id: 'password', title: 'password' }, { id: 'birthday', title: 'birthday' }
    ],
    append: true
});

// Function to write to users.csv
async function saveToUsers(user) {
    csvWriter.path = USERS_FILE; // Ensure path is users
    await csvWriter.writeRecords([user]);
}

// Function to write to audit.csv (identical data)
async function saveToAudit(user) {
    csvWriter.path = AUDIT_FILE; // Switch path to audit
    await csvWriter.writeRecords([user]);
}

// Load Users (for validation)
function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) { saveToUsers({}); return []; } // Initialize if missing
        const content = fs.readFileSync(USERS_FILE, 'utf8');
        return parse(content, { columns: true, skip_empty_lines: true });
    } catch (err) { console.error('Error loading users:', err); return []; }
}

// Load Audit (now same as users, for viewing)
function loadAudit() {
    try {
        if (!fs.existsSync(AUDIT_FILE)) { saveToAudit({}); return []; }
        const content = fs.readFileSync(AUDIT_FILE, 'utf8');
        return parse(content, { columns: true, skip_empty_lines: true });
    } catch (err) { console.error('Error loading audit:', err); return []; }
}

// Log Failed Login (UPDATED: Now includes attempted password for monitoring)
async function logFailedLogin(identifier, attemptedPassword, ip) {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Create a record with attempted details (for verification)
    const failedRecord = {
        id: `failed_${Date.now()}`, // Unique ID
        email: identifier, // Use identifier as email placeholder
        fullName: 'Failed Login Attempt',
        username: identifier,
        password: attemptedPassword || '', // Log the actual attempted password (empty if none)
        birthday: timestamp // Use timestamp as placeholder
    };
    await saveToAudit(failedRecord);
    console.log(`Failed Login Logged: ${identifier} (password: ${attemptedPassword || 'empty'}) from ${ip}`);
}

// Calculate Age (Prevents Future Dates)
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

// Signup API (Save identical full user to BOTH files)
app.post('/api/signup', async (req, res) => {
    const { email, fullName, username, password, birthday } = req.body;
    const ip = req.ip;

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

    const users = loadUsers();
    if (users.find(u => u.email === email || u.username === username)) {
        return res.status(400).json({ error: 'Email/username exists.' });
    }

    try {
        const newUser     = { id: Date.now().toString(), email, fullName, username, password, birthday };
        await saveToUsers(newUser    ); // Save to users.csv
        await saveToAudit(newUser    ); // Save IDENTICAL to audit.csv
        console.log(`Identical data saved for signup: ${username} from ${ip}`);
        res.json({ success: true, message: 'Account created! Log in now.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Login API (UPDATED: Passes attempted password to logFailedLogin)
app.post('/api/login', async (req, res) => {
    const { identifier, password: attemptedPassword } = req.body; // Rename for clarity
    const ip = req.ip;

    if (!identifier || !attemptedPassword) {
        await logFailedLogin('empty_attempt', attemptedPassword || '', ip);
        return res.status(400).json({ error: 'Fields required.' });
    }

    const users = loadUsers();
    const user = users.find(u => u.email === identifier || u.username === identifier);

    if (!user) {
        await logFailedLogin(identifier, attemptedPassword, ip); // Log attempted password
        return res.status(400).json({ error: 'Invalid email/username.' });
    }

    if (user.password !== attemptedPassword) {
        await logFailedLogin(identifier, attemptedPassword, ip); // Log attempted password
        return res.status(400).json({ error: 'Invalid password.' });
    }

    // SUCCESS: Save full user (identical to users.csv) to audit.csv
    const auditUser     = { ...user }; // Copy
    auditUser    .id = `login_${Date.now()}`; // New ID for login snapshot
    await saveToAudit(auditUser    ); // Identical structure, full data
    console.log(`Identical user snapshot saved for login: ${user.username} from ${ip}`);
    res.json({
        success: true,
        message: `Welcome, ${user.fullName}!`,
        user: { id: user.id, username: user.username, fullName: user.fullName }
    });
});

// Users API (Full data including password)
app.get('/api/users', (req, res) => {
    const users = loadUsers();
    res.json({ success: true, users, count: users.length });
});

// Audit API (Full data including passwords - now shows attempted ones too)
app.get('/api/audit', (req, res) => {
    const audits = loadAudit();
    res.json({ success: true, audits, count: audits.length });
});

// Formatted Users View (HTML Table, Includes Passwords)
app.get('/view-users', (req, res) => {
    try {
        const users = loadUsers();
        let html = `
            <!DOCTYPE html>
            <html><head><title>Users Data</title>
            <style>body{font-family:Arial;margin:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border:1px solid #ddd;text-align:left;} th{background:#f2f2f2;} .duplicate{background:#ffeb3b;} .password-col{font-weight:bold; color:#ed4956;} .failed-row{background:#ffebee;}</style></head>
            <body><h2>Users Data (Full - Includes Passwords for Education)</h2>
            <table><tr><th>ID</th><th>Email</th><th>Full Name</th><th>Username</th><th>Password</th><th>Birthday</th></tr>`;
        users.forEach((user, index) => {
            const isDuplicate = index > 0 && users[index-1].username === user.username && users[index-1].email === user.email;
            const isFailed = user.fullName === 'Failed Login Attempt'; // Highlight failed rows
            html += `<tr class="${isDuplicate ? 'duplicate' : ''} ${isFailed ? 'failed-row' : ''}"><td>${user.id}</td><td>${user.email}</td><td>${user.fullName}</td><td>${user.username}</td><td class="password-col">${user.password}</td><td>${user.birthday}</td></tr>`;
        });
        html += `</table><p>Total: ${users.length} entries. <a href="/">Back to Login</a></p></body></html>`;
        res.send(html);
    } catch (err) {
        res.send('<h2>Error loading users.</h2><p>' + err.message + '</p>');
    }
});

// Formatted Audit View (HTML Table, Includes Passwords - Highlights Failed Attempts)
app.get('/view-audit', (req, res) => {
    try {
        const audits = loadAudit();
        let html = `
            <!DOCTYPE html>
            <html><head><title>Audit Data</title>
            <style>body{font-family:Arial;margin:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border:1px solid #ddd;text-align:left;} th{background:#f2f2f2;} .duplicate{background:#ffeb3b;} .password-col{font-weight:bold; color:#ed4956;} .failed-row{background:#ffebee;}</style></head>
            <body><h2>Audit Data (Full Mirror - Includes Attempted Passwords for Failed Logins)</h2>
            <table><tr><th>ID</th><th>Email/Identifier</th><th>Full Name</th><th>Username/Identifier</th><th>Attempted Password</th><th>Timestamp</th></tr>`;
        audits.forEach((audit, index) => {
            const isDuplicate = index > 0 && audits[index-1].username === audit.username && audits[index-1].email === audit.email;
            const isFailed = audit.fullName === 'Failed Login Attempt'; // Highlight failed rows (light red)
            html += `<tr class="${isDuplicate ? 'duplicate' : ''} ${isFailed ? 'failed-row' : ''}"><td>${audit.id}</td><td>${audit.email}</td><td>${audit.fullName}</td><td>${audit.username}</td><td class="password-col">${audit.password}</td><td>${audit.birthday}</td></tr>`;
        });
        html += `</table><p>Total: ${audits.length} entries. Filter for 'Failed' to see attempts. <a href="/">Back to Login</a></p></body></html>`;
        res.send(html);
    } catch (err) {
        res.send('<h2>Error loading audit.</h2><p>' + err.message + '</p>');
    }
});

// Default Route
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.listen(PORT, () => {
    console.log(`Server on http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/login.html`);
    console.log(`Signup: http://localhost:${PORT}/signup.html`);
    console.log(`Views: http://localhost:${PORT}/view-users (full) | /view-audit (shows failed passwords)`);
    console.log(`CSV Files: users.csv & audit.csv (identical + failed attempts with passwords)`);
});