const express = require('express');
const router = express.Router();
const { MySQLConnection } = require('../config/database');
const { requireAuth, requireAdmin } = require('./auth');

// Submit query for approval
router.post('/request', requireAuth, async (req, res) => {
  const { connectionId, queryText, reason, database } = req.body;
  const userId = req.session.user.id;

  if (!queryText || !reason) {
    return res.status(400).json({
      success: false,
      message: 'Query text and reason are required'
    });
  }

  // Determine query type
  const queryUpper = queryText.trim().toUpperCase();
  let queryType = 'OTHER';
  
  if (queryUpper.startsWith('CREATE')) queryType = 'CREATE';
  else if (queryUpper.startsWith('DROP')) queryType = 'DROP';
  else if (queryUpper.startsWith('ALTER')) queryType = 'ALTER';
  else if (queryUpper.startsWith('INSERT')) queryType = 'INSERT';
  else if (queryUpper.startsWith('UPDATE')) queryType = 'UPDATE';
  else if (queryUpper.startsWith('DELETE')) queryType = 'DELETE';
  else if (queryUpper.startsWith('TRUNCATE')) queryType = 'TRUNCATE';

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    await connection.execute(`
      INSERT INTO query_approval_requests (user_id, connection_id, query_text, query_type, reason, database_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, connectionId, queryText, queryType, reason, database]);

    res.json({
      success: true,
      message: 'Query submitted for approval'
    });

  } catch (error) {
    console.error('Request approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit request'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get pending approval requests (admin only)
router.get('/pending', requireAdmin, async (req, res) => {
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [requests] = await connection.execute(`
      SELECT 
        ar.id,
        ar.query_text,
        ar.query_type,
        ar.reason,
        ar.requested_at,
        ar.database_name as db_name,
        u.username,
        u.full_name,
        dc.name as connection_name
      FROM query_approval_requests ar
      JOIN users u ON ar.user_id = u.id
      LEFT JOIN database_connections dc ON ar.connection_id = dc.id
      WHERE ar.status = 'pending'
      ORDER BY ar.requested_at ASC
    `);

    res.json({
      success: true,
      requests
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending requests'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Approve or reject query request (admin only)
router.post('/decision/:requestId', requireAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { action, comment, autoExecute = true } = req.body; // action: 'approved' or 'rejected'
  const adminId = req.session.user.id;

  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid action'
    });
  }

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    // Get the request details first
    const [requests] = await connection.execute(`
      SELECT 
        ar.*,
        dc.type,
        dc.host,
        dc.port,
        dc.username,
        dc.password,
        dc.database_name as connection_database,
        dc.use_ssl
      FROM query_approval_requests ar
      LEFT JOIN database_connections dc ON ar.connection_id = dc.id
      WHERE ar.id = ?
    `, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    const request = requests[0];
    
    // Log request details for debugging
    console.log('Approval request details:', {
      id: request.id,
      database_name: request.database_name,
      connection_database: request.connection_database,
      type: request.type,
      host: request.host,
      port: request.port,
      username: request.username
    });
    
    // Update approval status
    await connection.execute(`
      UPDATE query_approval_requests 
      SET status = ?, approved_by = ?, approval_comment = ?, approved_at = NOW()
      WHERE id = ?
    `, [action, adminId, comment, requestId]);

    let executionResult = null;

    // If approved and autoExecute is true, execute the query
    if (action === 'approved' && autoExecute && request.connection_id) {
      try {
        const { DynamicMySQLConnection, DynamicPostgreSQLConnection } = require('../config/database');
        
        let targetConnection;
        
        if (request.type === 'mysql') {
          const dynamicConn = new DynamicMySQLConnection({
            host: request.host,
            port: request.port,
            user: request.username,
            password: request.password,
            database: request.database_name || request.connection_database,
            ssl: request.use_ssl
          });
          targetConnection = await dynamicConn.getConnection();
        } else if (request.type === 'postgresql') {
          const dynamicConn = new DynamicPostgreSQLConnection({
            host: request.host,
            port: request.port,
            user: request.username,
            password: request.password,
            database: request.database_name || request.connection_database,
            ssl: request.use_ssl
          });
          targetConnection = await dynamicConn.getConnection();
        }

        if (targetConnection) {
          // Execute the approved query
          if (request.type === 'mysql') {
            const [results] = await targetConnection.execute(request.query_text);
            executionResult = {
              success: true,
              results: results,
              affectedRows: results.affectedRows || 0,
              message: 'Query executed successfully after approval'
            };
          } else if (request.type === 'postgresql') {
            const results = await targetConnection.query(request.query_text);
            executionResult = {
              success: true,
              results: results.rows,
              affectedRows: results.rowCount || 0,
              message: 'Query executed successfully after approval'
            };
          }
          
          await targetConnection.end();
          
          // Log successful execution
          await connection.execute(`
            UPDATE query_approval_requests 
            SET approval_comment = CONCAT(?, '\n\nAuto-executed: SUCCESS')
            WHERE id = ?
          `, [comment || '', requestId]);
        }
      } catch (executeError) {
        console.error('Auto-execution error:', executeError);
        // Log execution failure
        await connection.execute(`
          UPDATE query_approval_requests 
          SET approval_comment = CONCAT(?, '\n\nAuto-execute FAILED: ', ?)
          WHERE id = ?
        `, [comment || '', executeError.message, requestId]);
        
        executionResult = {
          success: false,
          error: executeError.message,
          message: 'Query approved but execution failed'
        };
      }
    }

    res.json({
      success: true,
      message: `Query request ${action}`,
      executionResult: executionResult
    });

  } catch (error) {
    console.error('Approval decision error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process decision'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get user's own requests
router.get('/my-requests', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [requests] = await connection.execute(`
      SELECT 
        ar.id,
        ar.query_text,
        ar.query_type,
        ar.reason,
        ar.status,
        ar.approval_comment,
        ar.requested_at,
        ar.approved_at,
        ar.database_name as db_name,
        admin.username as approved_by_username,
        dc.name as connection_name
      FROM query_approval_requests ar
      LEFT JOIN users admin ON ar.approved_by = admin.id
      LEFT JOIN database_connections dc ON ar.connection_id = dc.id
      WHERE ar.user_id = ?
      ORDER BY ar.requested_at DESC
    `, [userId]);

    res.json({
      success: true,
      requests
    });

  } catch (error) {
    console.error('Get user requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get requests'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Check if query needs approval
router.post('/check-approval-needed', requireAuth, (req, res) => {
  const { queryText } = req.body;
  const userRole = req.session.user.role;

  // Admin can execute any query without approval
  if (userRole === 'admin') {
    return res.json({
      success: true,
      needsApproval: false
    });
  }

  // Check query type
  const queryUpper = queryText.trim().toUpperCase();
  const needsApproval = queryUpper.startsWith('INSERT') || 
                       queryUpper.startsWith('UPDATE') || 
                       queryUpper.startsWith('DELETE') || 
                       queryUpper.startsWith('DROP') || 
                       queryUpper.startsWith('ALTER') || 
                       queryUpper.startsWith('CREATE') ||
                       queryUpper.startsWith('TRUNCATE');

  res.json({
    success: true,
    needsApproval
  });
});

module.exports = router;
