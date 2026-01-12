const express = require('express');
const path = require('path');
const fs = require('fs');

// Import the compiled engine
// Note: Running from root, so dist is at ./dist
const { TableLoader, Renderer } = require('./dist/src/engine');

const app = express();
const PORT = process.env.PORT || 1337;

app.use(express.static(__dirname));
app.use(express.json());

// Add a route to serve the extractContext function directly (Legacy Compat)
app.get('/js/extractContext.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
/**
 * Global extractContext function to fix "extractContext is not defined" error
 * This needs to be included before any other scripts
 */
(function() {
    console.log("Loading extractContext polyfill");

    // Define globally with both naming conventions
    window.extractContext = function(context, key, defaultValue = null) {
        if (!context || typeof context !== 'object') return defaultValue;
        if (key in context) return context[key];
        return defaultValue;
    };

    // Also define with capital E for consistency
    window.ExtractContext = window.extractContext;

    console.log("extractContext polyfill loaded successfully");
})();
  `);
});

// Initialize and load tables using the new Engine Loader
const loader = new TableLoader();
const tablesJsonPath = path.join(__dirname, 'dist', 'tables.json');
console.log(`Loading tables from ${tablesJsonPath}...`);

// Ensure build exists
if (!fs.existsSync(tablesJsonPath)) {
  console.error("❌ dist/tables.json not found! Run 'npm run build:tables' first.");
  process.exit(1);
}

loader.loadFromJSON(tablesJsonPath);
console.log(`Engine loaded with ${loader.getAllTables().length} tables.`);

// Helper to get renderer instance (fresh seed per request? Or per generation?)
// For now, new renderer per request to ensure fresh RNG if no seed provided, 
// or maybe we want a global one? 
// The legacy code didn't use seedrandom globally, it used Math.random.
// Our new engine uses seedrandom. If we want true properties of random, 
// we can instantiate Renderer with no seed (it uses Date.now + random).
const getRenderer = (seed) => new Renderer(loader, seed);

// --- API Endpoints ---

// GET /api/tables
app.get('/api/tables', (req, res) => {
  try {
    const tables = loader.getAllTables().map(t => {
      // Normalize type to array if possible or keep as is
      return {
        filename: t.filename,
        tablename: t.tablename || 'Unknown',
        game: t.game || 'Unknown',
        type: t.type || 'Unknown',
        setting: t.setting || 'Unknown',
        source: t.source || null,
        inputField: t.inputField || null
      };
    });
    res.json(tables);
  } catch (e) {
    console.error("Error fetching tables:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/content
app.get('/api/content', (req, res) => {
  try {
    // Try to load js-yaml
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch (e) {
      console.error("js-yaml not found, cannot serve YAML content");
      return res.status(500).json({ error: "Server missing js-yaml dependency" });
    }

    const contentDir = path.join(__dirname, '_Content');
    const contentData = [];

    // For now, explicitly load ShadowDark content
    // In future, this should walk the directory
    const sdContentPath = path.join(contentDir, 'ShadowDark', 'ShadowDark_Content.yaml');

    if (fs.existsSync(sdContentPath)) {
      const fileContent = fs.readFileSync(sdContentPath, 'utf8');
      const data = yaml.load(fileContent);
      if (Array.isArray(data)) {
        contentData.push(...data);
      }
    }

    res.json({ content: contentData });
  } catch (e) {
    console.error("Error serving content:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/templates
app.get('/api/templates', (req, res) => {
  try {
    let yaml;
    try {
      yaml = require('js-yaml');
    } catch (e) {
      return res.status(500).json({ error: "Server missing js-yaml dependency" });
    }

    const templatePath = path.join(__dirname, '_Content', 'display_templates.yaml');
    if (fs.existsSync(templatePath)) {
      const fileContent = fs.readFileSync(templatePath, 'utf8');
      const data = yaml.load(fileContent);
      res.json(data);
    } else {
      res.json({}); // Return empty if no config
    }
  } catch (e) {
    console.error("Error serving templates:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/generate
app.post('/api/generate', (req, res) => {
  const { table, number, inputValues } = req.body;

  if (!table) {
    return res.status(400).json({ error: 'Invalid request data: table is required' });
  }

  // Find the table using the same logic as the loader/legacy
  // Loader indexes by filename and name. 
  // Client sends { filename, tablename, ... }
  let targetTable;
  if (table.filename) {
    targetTable = loader.getTableByFilename(table.filename);
  }
  if (!targetTable && table.tablename) {
    targetTable = loader.getTableByName(table.tablename);
  }

  if (!targetTable) {
    return res.status(404).json({ error: `Table not found: ${table.filename || table.tablename}` });
  }

  const count = parseInt(number) || 1;
  const results = [];
  const renderer = getRenderer(); // Random seed


  // Log the incoming request details
  console.log(`[Generate] Request for: ${targetTable.tablename} (${targetTable.filename}). Count: ${count}`);

  try {
    for (let i = 0; i < count; i++) {
      // Context includes input values
      const context = { ...(inputValues || {}) };
      // Ensure thisResult is null initially
      context.thisResult = null;

      const identifier = targetTable.filename || targetTable.tablename;
      const result = renderer.generate(identifier, context);

      if (result._isSeparateRows) {
        results.push(result);
      } else if (Array.isArray(result.result) && !result._isCareer && !result._isMultiElementArray) {
        results.push(result);
      } else {
        results.push(result);
      }
    }

    res.json({ results });
  } catch (e) {
    console.error(`[Generate Error] Failed for table: ${targetTable.tablename}`);
    console.error(`Params: count=${count}, inputs=${JSON.stringify(inputValues)}`);
    console.error("Stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reroll
app.post('/api/reroll', (req, res) => {
  const { table, header, context, inputValues } = req.body;

  if (!table || !header) {
    return res.status(400).json({ error: 'Missing table or header' });
  }

  // Attempt to locate the root table context
  let rootTable;
  if (table.filename) rootTable = loader.getTableByFilename(table.filename);
  if (!rootTable && table.tablename) rootTable = loader.getTableByName(table.tablename);

  if (!rootTable) {
    return res.status(404).json({ error: 'Table not found' });
  }

  const renderer = getRenderer();
  const mergedContext = { ...(context || {}), ...(inputValues || {}) };

  try {
    const result = renderer.reroll(rootTable, header, mergedContext);

    // Return { result: { ... }, context: ... }
    res.json({
      result: result,
      context: mergedContext // Context might have been updated by mutations (though new engine tries to be immutable, assignments happen)
      // Actually, new engine context entries are assigned to `context` object passed in.
    });
  } catch (e) {
    console.error("Reroll error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/table-contents (Matching Legacy Structure)
app.post('/api/table-contents', (req, res) => {
  const { table } = req.body;
  let target;
  if (table.filename) target = loader.getTableByFilename(table.filename);
  if (!target && table.tablename) target = loader.getTableByName(table.tablename);

  if (!target) return res.status(404).json({ error: 'Table not found' });

  // Helper to process results for display (stringify objects/arrays)
  const processResultsForDisplay = (results) => {
    if (!results) return [];
    return results.map(r => {
      if (typeof r === 'string') return r;
      if (typeof r === 'number') return String(r);
      // Handle array results (e.g. multi-roll format or just data)
      if (Array.isArray(r)) return JSON.stringify(r);
      // Handle object results (e.g. directives)
      if (typeof r === 'object') {
        if (r.roll) return `[Directive: Roll ${r.roll}]`;
        return JSON.stringify(r);
      }
      return String(r);
    });
  };

  // Recursive function to match legacy structure
  const processTableForDisplay = (t) => {
    const out = {
      name: t.tablename || t.name || 'Unnamed Table',
      filename: t.filename,
      type: t.type || 'Unknown',
      game: t.game || 'Unknown',
      setting: t.setting || 'Unknown',
      subtables: []
    };

    // Handle description
    if (t.description) {
      if (Array.isArray(t.description)) out.description = t.description.join(' ');
      else if (typeof t.description === 'string') out.description = t.description;
    }

    // 1. Direct results -> "Main Results" subtable
    if (t.results && Array.isArray(t.results) && t.results.length > 0) {
      out.subtables.push({
        name: 'Main Results',
        results: processResultsForDisplay(t.results)
      });
    }

    // 2. Subtables (tables/subTables)
    const childTables = t.tables || t.subTables || [];
    childTables.forEach(sub => {
      const processedSub = {
        name: sub.tablename || sub.name || 'Unnamed Subtable',
        results: []
      };

      // Description for subtable
      if (sub.description) {
        if (Array.isArray(sub.description)) processedSub.description = sub.description.join(' ');
        else if (typeof sub.description === 'string') processedSub.description = sub.description;
      }

      // Custom Display
      if (sub.customDisplay) {
        processedSub.customDisplay = sub.customDisplay;
      }

      // Results
      if (sub.results && Array.isArray(sub.results)) {
        processedSub.results = processResultsForDisplay(sub.results);
      }

      // Nested subtables (legacy structure supports infinite nesting, but usually 1 level deep in UI)
      // Legacy uses 'nestedSubtables' for deeper levels or just recurses? 
      // Legacy `server.js` snippet showed: `processedSubtable.nestedSubtables = subTable.subTables.map(...)`
      // Let's replicate this pattern if it exists.
      if (sub.subTables || sub.tables) {
        // Recurse strictly for nesting in the UI structure if needed, 
        // OR just push them as sibling subtables if that's how the UI renders.
        // Legacy snippet specifically creates `nestedSubtables` on the subtable object.
        const nested = sub.subTables || sub.tables;
        if (nested && Array.isArray(nested)) {
          processedSub.nestedSubtables = nested.map(n => {
            const nRes = {
              name: n.tablename || n.name || 'Unnamed',
              results: processResultsForDisplay(n.results || [])
            };
            if (n.description) nRes.description = Array.isArray(n.description) ? n.description.join(' ') : n.description;
            return nRes;
          });
        }
      }

      out.subtables.push(processedSub);
    });

    return out;
  };

  try {
    const tableData = processTableForDisplay(target);
    res.json({ tableData });
  } catch (e) {
    console.error("Error processing table contents:", e);
    res.status(500).json({ error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`Server v2 running on port ${PORT}`);
  console.log(`Powered by TypeScript Engine`);
});

// --- User System Implementation ---

const crypto = require('crypto');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// User Data Helper Functions
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading users:", e);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Error saving users:", e);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST /api/register
app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const newUser = {
    username,
    email: email || '', // Optional for now to support old users, but UI should require it
    passwordHash: hashPassword(password),
    favorites: [],
    resetToken: null,
    resetTokenExpiry: null
  };

  users.push(newUser);
  saveUsers(users);

  // Return user without password
  const { passwordHash, ...safeUser } = newUser;
  res.json({ user: safeUser });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

// POST /api/user/favorites/toggle
app.post('/api/user/favorites/toggle', (req, res) => {
  const { username, tableFilename } = req.body;

  // In a real app we'd verify a session token here. 
  // For this simple local tool, we trust the client provided username for now, 
  // or we could require password again (too annoying).
  // Implicit trust for local tool context.

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.username === username);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = users[userIndex];
  if (!user.favorites) user.favorites = [];

  const favIndex = user.favorites.indexOf(tableFilename);
  let isFavorite = false;

  if (favIndex === -1) {
    user.favorites.push(tableFilename);
    isFavorite = true;
  } else {
    user.favorites.splice(favIndex, 1);
    isFavorite = false;
  }

  saveUsers(users);

  res.json({ favorites: user.favorites, isFavorite });
});

// --- Password Recovery ---

// Mock Email Sender (future SMTP hook)
async function sendEmail(to, subject, body) {
  console.log('=================================================');
  console.log(`[MOCK EMAIL] To: ${to}`);
  console.log(`[MOCK EMAIL] Subject: ${subject}`);
  console.log(`[MOCK EMAIL] Body:`);
  console.log(body);
  console.log('=================================================');
  // Return true to simulate success
  return true;
}

// POST /api/forgot-password
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required' });

  const users = loadUsers();
  const user = users.find(u => u.email === email);

  // Security: Don't reveal if user exists or not, but for dev/MVP we can be lenient or just standardized
  // If user not found, we just pretend we sent it to avoid enumeration? 
  // For this local generator, let's be helpfully explicitly.
  if (!user) {
    return res.status(404).json({ error: 'User with this email not found' });
  }

  // Generate Token
  const token = crypto.randomBytes(20).toString('hex');
  const expiry = Date.now() + 3600000; // 1 hour from now

  user.resetToken = token;
  user.resetTokenExpiry = expiry;

  saveUsers(users);

  // "Send" Email
  const success = await sendEmail(
    user.email,
    'Password Reset Request',
    `You requested a password reset. Your token is: ${token}\n\nUse this token in the app to reset your password.`
  );

  if (success) {
    res.json({ message: 'Password reset email sent (check server console)' });
  } else {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /api/reset-password
app.post('/api/reset-password', (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }

  const users = loadUsers();
  const user = users.find(u =>
    u.resetToken === token &&
    u.resetTokenExpiry > Date.now()
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  // Reset Password
  user.passwordHash = hashPassword(newPassword);
  user.resetToken = null;
  user.resetTokenExpiry = null;

  saveUsers(users);

  res.json({ message: 'Password successfully reset' });
});

// --- Admin Endpoints ---

// Middleware to check if user is admin
// Trusts 'x-username' header for local tool context
function requireAdmin(req, res, next) {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Access denied: Admins only' });
  }

  req.adminUser = user;
  next();
}

// GET /api/admin/users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = loadUsers();
  // Return safe user objects
  const safeUsers = users.map(u => {
    const { passwordHash, resetToken, resetTokenExpiry, ...safe } = u;
    return safe;
  });
  res.json({ users: safeUsers });
});

// PUT /api/admin/users/:username
app.put('/api/admin/users/:username', requireAdmin, (req, res) => {
  const targetUsername = req.params.username;
  const { newUsername, email, password, isAdmin } = req.body;

  const users = loadUsers();
  const userIndex = users.findIndex(u => u.username === targetUsername);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Update fields
  const user = users[userIndex];

  if (newUsername && newUsername !== user.username) {
    // Check collision
    if (users.find(u => u.username === newUsername)) {
      return res.status(409).json({ error: 'New username already taken' });
    }
    user.username = newUsername;
  }

  if (email !== undefined) user.email = email;
  if (password) user.passwordHash = hashPassword(password);
  if (isAdmin !== undefined) user.isAdmin = !!isAdmin;

  saveUsers(users);

  const { passwordHash, resetToken, resetTokenExpiry, ...safeUser } = user;
  res.json({ message: 'User updated', user: safeUser });
});

// DELETE /api/admin/users/:username
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const targetUsername = req.params.username;

  // Prevent self-deletion ? Maybe? Or just allowed.
  // Generally good to prevent deleting yourself efficiently to avoid locking yourself out if you are the only admin.
  if (targetUsername === req.adminUser.username) {
    return res.status(400).json({ error: 'Cannot delete your own account while logged in.' });
  }

  const users = loadUsers();
  const newUsers = users.filter(u => u.username !== targetUsername);

  if (users.length === newUsers.length) {
    return res.status(404).json({ error: 'User not found' });
  }

  saveUsers(newUsers);
  res.json({ message: `User ${targetUsername} deleted` });
});

