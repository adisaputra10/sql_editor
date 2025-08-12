const express = require('express');
const { DynamicMySQLConnection, DynamicPostgreSQLConnection, MySQLConnection } = require('../config/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Helper function to convert boolean to integer for database
function boolToInt(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return 1;
  }
  return 0;
}

// Test database connection
router.post('/test-connection', requireAuth, async (req, res) => {
  const { type, host, port, username, password, database, ssl } = req.body;

  if (!type || !host || !username) {
    return res.status(400).json({
      success: false,
      message: 'Database type, host, and username are required'
    });
  }

  try {
    let connection;
    let result;

    if (type === 'mysql') {
      const config = {
        host,
        port: port || 3306,
        user: username,
        password: password || '',
        database: database || ''
      };
      
      // Only add ssl if it's enabled and not false
      if (ssl && ssl !== false && ssl !== 'false') {
        config.ssl = {};
      }
      
      connection = new DynamicMySQLConnection(config);
      result = await connection.testConnection();
    } else if (type === 'postgresql') {
      const config = {
        host,
        port: port || 5432,
        user: username,
        password: password || '',
        database: database || 'postgres'
      };
      
      // Only add ssl if it's enabled and not false
      if (ssl && ssl !== false && ssl !== 'false') {
        config.ssl = true;
      }
      
      connection = new DynamicPostgreSQLConnection(config);
      result = await connection.testConnection();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported database type'
      });
    }

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed: ' + error.message
    });
  }
});

// Save database connection
router.post('/save-connection', requireAuth, async (req, res) => {
  const { name, type, host, port, username, password, database, ssl } = req.body;
  const userId = req.session.user.id;

  if (!name || !type || !host || !username) {
    return res.status(400).json({
      success: false,
      message: 'Connection name, type, host, and username are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [result] = await connection.execute(
      `INSERT INTO database_connections 
       (user_id, name, type, host, port, username, password, database_name, use_ssl) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name,
        type,
        host,
        port || (type === 'mysql' ? 3306 : 5432),
        username,
        password || '',
        database || '',
        ssl ? 1 : 0 // Convert boolean to integer
      ]
    );

    res.json({
      success: true,
      message: 'Connection saved successfully',
      connectionId: result.insertId
    });

  } catch (error) {
    console.error('Save connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save connection'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get saved connections
router.get('/connections', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [connections] = await connection.execute(
      `SELECT id, name, type, host, port, username, database_name, use_ssl, created_at 
       FROM database_connections 
       WHERE user_id = ? 
       ORDER BY name`,
      [userId]
    );

    res.json({
      success: true,
      connections: connections.map(conn => ({
        ...conn,
        password: '***' // Hide password in response
      }))
    });

  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve connections'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Delete saved connection
router.delete('/connections/:id', requireAuth, async (req, res) => {
  const connectionId = req.params.id;
  const userId = req.session.user.id;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [result] = await connection.execute(
      'DELETE FROM database_connections WHERE id = ? AND user_id = ?',
      [connectionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    res.json({
      success: true,
      message: 'Connection deleted successfully'
    });

  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete connection'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get databases list
router.post('/databases', requireAuth, async (req, res) => {
  const { connectionId } = req.body;
  const userId = req.session.user.id;

  if (!connectionId) {
    return res.status(400).json({
      success: false,
      message: 'Connection ID is required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let adminConnection;

  try {
    adminConnection = await mysqlConn.getConnection();
    
    // Get connection details
    const [connections] = await adminConnection.execute(
      'SELECT * FROM database_connections WHERE id = ? AND user_id = ?',
      [connectionId, userId]
    );

    if (connections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    const connConfig = connections[0];
    let dbConnection;
    let databases = [];

    if (connConfig.type === 'mysql') {
      const config = {
        host: connConfig.host,
        port: connConfig.port,
        user: connConfig.username,
        password: connConfig.password
      };
      
      // Only add ssl if it's enabled (1 in database)
      if (connConfig.use_ssl === 1) {
        config.ssl = {};
      }
      
      dbConnection = new DynamicMySQLConnection(config);
      
      const conn = await dbConnection.getConnection();
      const [rows] = await conn.execute('SHOW DATABASES');
      databases = rows.map(row => row.Database);
      await conn.end();

    } else if (connConfig.type === 'postgresql') {
      const config = {
        host: connConfig.host,
        port: connConfig.port,
        user: connConfig.username,
        password: connConfig.password,
        database: 'postgres'
      };
      
      // Only add ssl if it's enabled (1 in database)
      if (connConfig.use_ssl === 1) {
        config.ssl = true;
      }
      
      dbConnection = new DynamicPostgreSQLConnection(config);
      
      const client = await dbConnection.getConnection();
      const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
      databases = result.rows.map(row => row.datname);
      await client.end();
    }

    res.json({
      success: true,
      databases
    });

  } catch (error) {
    console.error('Get databases error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve databases: ' + error.message
    });
  } finally {
    if (adminConnection) {
      await adminConnection.end();
    }
  }
});

// Get tables list
router.post('/tables', requireAuth, async (req, res) => {
  const { connectionId, database } = req.body;
  const userId = req.session.user.id;

  if (!connectionId || !database) {
    return res.status(400).json({
      success: false,
      message: 'Connection ID and database name are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let adminConnection;

  try {
    adminConnection = await mysqlConn.getConnection();
    
    // Get connection details
    const [connections] = await adminConnection.execute(
      'SELECT * FROM database_connections WHERE id = ? AND user_id = ?',
      [connectionId, userId]
    );

    if (connections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    const connConfig = connections[0];
    let dbConnection;
    let tables = [];

    if (connConfig.type === 'mysql') {
      const config = {
        host: connConfig.host,
        port: connConfig.port,
        user: connConfig.username,
        password: connConfig.password,
        database: database
      };
      
      // Only add ssl if it's enabled (1 in database)
      if (connConfig.use_ssl === 1) {
        config.ssl = {};
      }
      
      dbConnection = new DynamicMySQLConnection(config);
      
      const conn = await dbConnection.getConnection();
      const [rows] = await conn.execute('SHOW TABLES');
      const tableField = `Tables_in_${database}`;
      tables = rows.map(row => ({
        name: row[tableField],
        type: 'table'
      }));
      await conn.end();

    } else if (connConfig.type === 'postgresql') {
      const config = {
        host: connConfig.host,
        port: connConfig.port,
        user: connConfig.username,
        password: connConfig.password,
        database: database
      };
      
      // Only add ssl if it's enabled (1 in database)
      if (connConfig.use_ssl === 1) {
        config.ssl = true;
      }
      
      dbConnection = new DynamicPostgreSQLConnection(config);
      
      const client = await dbConnection.getConnection();
      const result = await client.query(`
        SELECT tablename as name, 'table' as type 
        FROM pg_tables 
        WHERE schemaname = 'public'
        UNION
        SELECT viewname as name, 'view' as type 
        FROM pg_views 
        WHERE schemaname = 'public'
        ORDER BY name
      `);
      tables = result.rows;
      await client.end();
    }

    res.json({
      success: true,
      tables
    });

  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve tables: ' + error.message
    });
  } finally {
    if (adminConnection) {
      await adminConnection.end();
    }
  }
});

module.exports = router;
