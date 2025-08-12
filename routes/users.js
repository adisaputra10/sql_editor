const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { MySQLConnection } = require('../config/database');
const { requireAuth, requireAdmin } = require('./auth');

// Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [users] = await connection.execute(`
      SELECT id, username, full_name, email, role, is_active, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Create new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, fullName, email, role } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({
      success: false,
      message: 'Username, password, and full name are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if username already exists
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user
    await connection.execute(`
      INSERT INTO users (username, password, full_name, email, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [username, hashedPassword, fullName, email || null, role || 'user']);

    res.json({
      success: true,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get user by ID (admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [users] = await connection.execute(`
      SELECT id, username, full_name, email, role, is_active, created_at
      FROM users
      WHERE id = ?
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: users[0]
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Update user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, fullName, email, role, isActive, password } = req.body;

  if (!username || !fullName) {
    return res.status(400).json({
      success: false,
      message: 'Username and full name are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if user exists
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if username is taken by another user
    const [usernameCheck] = await connection.execute(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, id]
    );

    if (usernameCheck.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Prepare update query
    let updateQuery = `
      UPDATE users 
      SET username = ?, full_name = ?, email = ?, role = ?, is_active = ?
    `;
    let params = [username, fullName, email || null, role || 'user', isActive ? 1 : 0];

    // If password is provided, update it too
    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password = ?';
      params.push(hashedPassword);
    }

    updateQuery += ' WHERE id = ?';
    params.push(id);

    await connection.execute(updateQuery, params);

    res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.session.user.id;

  // Prevent admin from deleting themselves
  if (parseInt(id) === parseInt(adminId)) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if user exists
    const [existingUsers] = await connection.execute(
      'SELECT id, username FROM users WHERE id = ?',
      [id]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user (cascade will handle related records)
    await connection.execute('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `User ${existingUsers[0].username} deleted successfully`
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Toggle user status (admin only)
router.patch('/:id/toggle-status', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.session.user.id;

  // Prevent admin from deactivating themselves
  if (parseInt(id) === parseInt(adminId)) {
    return res.status(400).json({
      success: false,
      message: 'You cannot deactivate your own account'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Get current status
    const [users] = await connection.execute(
      'SELECT id, username, is_active FROM users WHERE id = ?',
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentStatus = users[0].is_active;
    const newStatus = currentStatus ? 0 : 1;

    // Update status
    await connection.execute(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `User ${users[0].username} ${newStatus ? 'activated' : 'deactivated'} successfully`,
      newStatus: newStatus
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

module.exports = router;
