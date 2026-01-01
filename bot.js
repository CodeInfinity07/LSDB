const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = 3015;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'assitix_user',
    password: 'THEDEEBEE@123!@#',
    database: 'ludo_star',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
pool.getConnection()
    .then(connection => {
        console.log('✓ Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('✗ Database connection failed:', err);
    });

// ============================================
// Helper function to parse old_names safely
// ============================================
function parseOldNames(oldNames) {
    if (!oldNames) return [];
    if (typeof oldNames === 'string') {
        try {
            const parsed = JSON.parse(oldNames);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return Array.isArray(oldNames) ? oldNames : [];
}

// ============================================
// GET /api/player/:player_id - Get player data
// ============================================
app.get('/api/player/:player_id', async (req, res) => {
    try {
        const { player_id } = req.params;

        const [rows] = await pool.execute(
            'SELECT * FROM players WHERE player_id = ?',
            [player_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Player not found',
                player_id: player_id
            });
        }

        // Parse old_names JSON string back to array
        const player = rows[0];
        player.old_names = parseOldNames(player.old_names);

        res.json({
            success: true,
            data: player
        });

    } catch (error) {
        console.error('Error fetching player:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// ============================================
// POST /api/player - Add new player
// ============================================
app.post('/api/player', async (req, res) => {
    try {
        const { player_id, name, uid, old_names } = req.body;

        // Validation
        if (!player_id || !name || !uid) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: player_id, name, and uid are required'
            });
        }

        // Check if player_id already exists
        const [existingPlayer] = await pool.execute(
            'SELECT player_id FROM players WHERE player_id = ?',
            [player_id]
        );

        if (existingPlayer.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Player ID already exists',
                player_id: player_id
            });
        }

        // Check if UID already exists
        const [existingUid] = await pool.execute(
            'SELECT player_id FROM players WHERE uid = ?',
            [uid]
        );

        if (existingUid.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'UID already exists',
                existing_player_id: existingUid[0].player_id
            });
        }

        // Handle old_names - can be empty array, null, undefined, or array
        const processedOldNames = parseOldNames(old_names);
        const oldNamesJson = JSON.stringify(processedOldNames);
        
        await pool.execute(
            'INSERT INTO players (player_id, name, uid, old_names) VALUES (?, ?, ?, ?)',
            [player_id, name, uid, oldNamesJson]
        );

        res.status(201).json({
            success: true,
            message: 'Player added successfully',
            data: {
                player_id,
                name,
                uid,
                old_names: processedOldNames
            }
        });

    } catch (error) {
        console.error('Error adding player:', error);
        
        // Handle duplicate key errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Duplicate entry detected',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// ============================================
// PUT /api/player/:player_id - Update player
// ============================================
app.put('/api/player/:player_id', async (req, res) => {
    try {
        const { player_id } = req.params;
        const { name, uid, old_names } = req.body;

        // Check if player exists
        const [existingPlayer] = await pool.execute(
            'SELECT * FROM players WHERE player_id = ?',
            [player_id]
        );

        if (existingPlayer.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Player not found',
                player_id: player_id
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (uid !== undefined) {
            updates.push('uid = ?');
            values.push(uid);
        }
        if (old_names !== undefined) {
            const processedOldNames = parseOldNames(old_names);
            updates.push('old_names = ?');
            values.push(JSON.stringify(processedOldNames));
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(player_id);

        await pool.execute(
            `UPDATE players SET ${updates.join(', ')} WHERE player_id = ?`,
            values
        );

        // Fetch updated player
        const [updatedPlayer] = await pool.execute(
            'SELECT * FROM players WHERE player_id = ?',
            [player_id]
        );

        const player = updatedPlayer[0];
        player.old_names = parseOldNames(player.old_names);

        res.json({
            success: true,
            message: 'Player updated successfully',
            data: player
        });

    } catch (error) {
        console.error('Error updating player:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// ============================================
// DELETE /api/player/:player_id - Delete player
// ============================================
app.delete('/api/player/:player_id', async (req, res) => {
    try {
        const { player_id } = req.params;

        const [result] = await pool.execute(
            'DELETE FROM players WHERE player_id = ?',
            [player_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Player not found',
                player_id: player_id
            });
        }

        res.json({
            success: true,
            message: 'Player deleted successfully',
            player_id: player_id
        });

    } catch (error) {
        console.error('Error deleting player:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// ============================================
// GET /api/players - Get all players (with pagination)
// ============================================
app.get('/api/players', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Validate limit to prevent abuse
        const maxLimit = 100;
        const actualLimit = Math.min(limit, maxLimit);

        // Get total count
        const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM players');
        const total = countResult[0].total;

        // Get paginated players - use query() instead of execute() for LIMIT/OFFSET
        const [rows] = await pool.query(
            `SELECT * FROM players LIMIT ${actualLimit} OFFSET ${offset}`
        );

        // Parse old_names for each player
        const players = rows.map(player => ({
            ...player,
            old_names: parseOldNames(player.old_names)
        }));

        res.json({
            success: true,
            data: players,
            pagination: {
                page,
                limit: actualLimit,
                total,
                totalPages: Math.ceil(total / actualLimit)
            }
        });

    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// ============================================
// Root endpoint
// ============================================
app.get('/', (req, res) => {
    res.json({
        message: 'Ludo Star Player API',
        endpoints: {
            'GET /api/player/:player_id': 'Get player by ID',
            'POST /api/player': 'Add new player',
            'PUT /api/player/:player_id': 'Update player',
            'DELETE /api/player/:player_id': 'Delete player',
            'GET /api/players': 'Get all players (with pagination)'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📝 API Documentation: http://localhost:${PORT}\n`);
});