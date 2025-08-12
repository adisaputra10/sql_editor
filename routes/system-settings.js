const express = require('express');
const router = express.Router();
const { MySQLConnection } = require('../config/database');
const { requireAuth, requireAdmin } = require('./auth');

// Get all system settings (admin only)
router.get('/', requireAdmin, async (req, res) => {
  console.log('GET /api/system-settings called by user:', req.session.user);
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [settings] = await connection.execute(`
      SELECT id, setting_key, setting_value, description, created_at, updated_at
      FROM system_settings
      ORDER BY setting_key ASC
    `);

    console.log('Found settings:', settings.length);
    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system settings'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get system setting by key
router.get('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [settings] = await connection.execute(`
      SELECT setting_value FROM system_settings WHERE setting_key = ?
    `, [key]);

    if (settings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    res.json({
      success: true,
      value: settings[0].setting_value
    });

  } catch (error) {
    console.error('Get system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system setting'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Update system setting (admin only)
router.put('/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) {
    return res.status(400).json({
      success: false,
      message: 'Setting value is required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if setting exists
    const [existingSettings] = await connection.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );

    if (existingSettings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    // Update setting
    await connection.execute(`
      UPDATE system_settings 
      SET setting_value = ?
      WHERE setting_key = ?
    `, [String(value), key]);

    res.json({
      success: true,
      message: 'System setting updated successfully'
    });

  } catch (error) {
    console.error('Update system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system setting'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Create new system setting (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { setting_key, setting_value, description } = req.body;

  if (!setting_key || setting_value === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Setting key and value are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if setting already exists
    const [existingSettings] = await connection.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [setting_key]
    );

    if (existingSettings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Setting already exists'
      });
    }

    // Insert new setting
    await connection.execute(`
      INSERT INTO system_settings (setting_key, setting_value, description)
      VALUES (?, ?, ?)
    `, [setting_key, String(setting_value), description || '']);

    res.json({
      success: true,
      message: 'System setting created successfully'
    });

  } catch (error) {
    console.error('Create system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create system setting'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Delete system setting (admin only)
router.delete('/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();

    // Check if setting exists
    const [existingSettings] = await connection.execute(
      'SELECT id FROM system_settings WHERE setting_key = ?',
      [key]
    );

    if (existingSettings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    // Delete setting
    await connection.execute('DELETE FROM system_settings WHERE setting_key = ?', [key]);

    res.json({
      success: true,
      message: 'System setting deleted successfully'
    });

  } catch (error) {
    console.error('Delete system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete system setting'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

module.exports = router;
