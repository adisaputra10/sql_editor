const express = require('express');
const router = express.Router();
const { MySQLConnection } = require('../config/database');
const { requireAuth, requireAdmin } = require('./auth');

// Get all approval patterns (admin only)
router.get('/', requireAdmin, async (req, res) => {
  console.log('GET /api/approval-patterns called by user:', req.session.user); // Debug log
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    // Try to get patterns with name column, if not exists fall back to without name
    let query = `
      SELECT id, name, pattern, description, is_active, created_at, updated_at
      FROM approval_patterns
      ORDER BY pattern ASC
    `;
    
    let patterns;
    try {
      [patterns] = await connection.execute(query);
    } catch (columnError) {
      if (columnError.message.includes("Unknown column 'name'")) {
        console.log('Name column not found, using fallback query');
        // Fallback query without name column
        query = `
          SELECT id, pattern as name, pattern, description, is_active, created_at, updated_at
          FROM approval_patterns
          ORDER BY pattern ASC
        `;
        [patterns] = await connection.execute(query);
      } else {
        throw columnError;
      }
    }

    console.log('Found patterns:', patterns.length); // Debug log
    res.json({
      success: true,
      data: patterns
    });

  } catch (error) {
    console.error('Get approval patterns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approval patterns'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get approval pattern by id (admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [patterns] = await connection.execute(`
      SELECT id, name, pattern, description, is_active, created_at, updated_at
      FROM approval_patterns
      WHERE id = ?
    `, [id]);

    if (patterns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pattern not found'
      });
    }

    res.json({
      success: true,
      data: patterns[0]
    });

  } catch (error) {
    console.error('Get approval pattern error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approval pattern'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get active approval patterns (used by query execution)
router.get('/active', requireAuth, async (req, res) => {
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [patterns] = await connection.execute(`
      SELECT pattern FROM approval_patterns 
      WHERE is_active = 1
      ORDER BY pattern ASC
    `);

    res.json({
      success: true,
      patterns: patterns.map(p => p.pattern)
    });

  } catch (error) {
    console.error('Get active approval patterns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active approval patterns'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Create new approval pattern (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name, pattern, description, is_active } = req.body;

  if (!name || !pattern) {
    return res.status(400).json({
      success: false,
      message: 'Name and pattern are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if pattern already exists
    const [existingPatterns] = await connection.execute(
      'SELECT id FROM approval_patterns WHERE pattern = ?',
      [pattern.toUpperCase()]
    );

    if (existingPatterns.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Pattern already exists'
      });
    }

    // Insert new pattern
    await connection.execute(`
      INSERT INTO approval_patterns (name, pattern, description, is_active)
      VALUES (?, ?, ?, ?)
    `, [name, pattern.toUpperCase(), description || '', is_active ? 1 : 0]);

    res.json({
      success: true,
      message: 'Approval pattern created successfully'
    });

  } catch (error) {
    console.error('Create approval pattern error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create approval pattern'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Update approval pattern (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, pattern, description, is_active } = req.body;

  if (!name || !pattern) {
    return res.status(400).json({
      success: false,
      message: 'Name and pattern are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if pattern exists
    const [existingPatterns] = await connection.execute(
      'SELECT id FROM approval_patterns WHERE id = ?',
      [id]
    );

    if (existingPatterns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pattern not found'
      });
    }

    // Check if pattern name is taken by another record
    const [duplicateCheck] = await connection.execute(
      'SELECT id FROM approval_patterns WHERE pattern = ? AND id != ?',
      [pattern.toUpperCase(), id]
    );

    if (duplicateCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Pattern already exists'
      });
    }

    // Update pattern
    await connection.execute(`
      UPDATE approval_patterns 
      SET name = ?, pattern = ?, description = ?, is_active = ?
      WHERE id = ?
    `, [name, pattern.toUpperCase(), description || '', is_active ? 1 : 0, id]);

    res.json({
      success: true,
      message: 'Approval pattern updated successfully'
    });

  } catch (error) {
    console.error('Update approval pattern error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update approval pattern'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Toggle pattern status (admin only)
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Get current status
    const [patterns] = await connection.execute(
      'SELECT id, pattern, is_active FROM approval_patterns WHERE id = ?',
      [id]
    );

    if (patterns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pattern not found'
      });
    }

    const currentStatus = patterns[0].is_active;
    const newStatus = currentStatus ? 0 : 1;

    // Update status
    await connection.execute(
      'UPDATE approval_patterns SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `Pattern ${patterns[0].pattern} ${newStatus ? 'activated' : 'deactivated'} successfully`,
      newStatus: newStatus
    });

  } catch (error) {
    console.error('Toggle pattern status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pattern status'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Delete approval pattern (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if pattern exists
    const [patterns] = await connection.execute(
      'SELECT id, pattern FROM approval_patterns WHERE id = ?',
      [id]
    );

    if (patterns.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pattern not found'
      });
    }

    // Delete pattern
    await connection.execute('DELETE FROM approval_patterns WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `Pattern ${patterns[0].pattern} deleted successfully`
    });

  } catch (error) {
    console.error('Delete pattern error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete pattern'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

module.exports = router;
