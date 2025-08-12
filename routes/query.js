const express = require('express');
const { DynamicMySQLConnection, DynamicPostgreSQLConnection, MySQLConnection } = require('../config/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Helper function to mask sensitive data
function maskSensitiveData(data, fields) {
  if (!Array.isArray(data) || !fields) return data;
  
  // Define sensitive column patterns
  const sensitivePatterns = [
    /name/i,
    /email/i,
    /phone/i,
    /hp/i,
    /password/i,
    /pass/i,
    /token/i,
    /secret/i,
    /key/i,
    /ktp/i,
    /passport/i,
    /credit_card/i,
    /card_number/i
  ];
  
  // Find sensitive columns
  const sensitiveColumns = fields.filter(field => 
    sensitivePatterns.some(pattern => pattern.test(field.name))
  ).map(field => field.name);
  
  if (sensitiveColumns.length === 0) return data;
  
  // Mask data in sensitive columns
  return data.map(row => {
    const maskedRow = { ...row };
    sensitiveColumns.forEach(column => {
      if (maskedRow[column] !== null && maskedRow[column] !== undefined) {
        const value = String(maskedRow[column]);
        if (value.length <= 2) {
          maskedRow[column] = '*'.repeat(value.length);
        } else {
          // Show first 2 characters, mask the rest
          maskedRow[column] = value.substring(0, 2) + '*'.repeat(Math.max(1, value.length - 2));
        }
      }
    });
    return maskedRow;
  });
}

// Execute SQL query
router.post('/execute', requireAuth, async (req, res) => {
  const { connectionId, database, query, enableMasking = true, approvalId } = req.body;
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  if (!connectionId || !query) {
    return res.status(400).json({
      success: false,
      message: 'Connection ID and query are required'
    });
  }

  const mysqlConn = new MySQLConnection();
  let adminConnection;
  const startTime = Date.now();

  try {
    adminConnection = await mysqlConn.getConnection();

    // Get system settings (for non-admin users)
    let selectLimit = null;
    console.log('User role check:', userRole, 'Session user:', req.session.user); // Debug log
    
    if (userRole !== 'admin') {
      console.log('User is not admin, applying select limit'); // Debug log
      try {
        const [limitSettings] = await adminConnection.execute(
          'SELECT setting_value FROM system_settings WHERE setting_key = ?',
          ['select_limit']
        );
        selectLimit = limitSettings.length > 0 ? parseInt(limitSettings[0].setting_value) : 10;
        console.log('Select limit for user:', selectLimit); // Debug log
      } catch (error) {
        console.log('Could not get select limit setting, using default of 10');
        selectLimit = 10;
      }
    } else {
      console.log('User is admin, no select limit applied'); // Debug log
    }

    // Check if query needs approval (for non-admin users)
    if (userRole !== 'admin') {
      // Get active approval patterns from database
      const [activePatterns] = await adminConnection.execute(`
        SELECT pattern FROM approval_patterns WHERE is_active = true
      `);

      const queryUpper = query.trim().toUpperCase();
      const needsApproval = activePatterns.some(row => 
        queryUpper.startsWith(row.pattern.toUpperCase())
      );

      if (needsApproval) {
        // Check if there's an approved request for this query
        if (!approvalId) {
          return res.status(403).json({
            success: false,
            code: 'APPROVAL_REQUIRED',
            message: 'This query requires admin approval. Please submit a request.',
            needsApproval: true
          });
        }

        // Verify approval exists and is approved
        const [approvals] = await adminConnection.execute(`
          SELECT id FROM query_approval_requests 
          WHERE id = ? AND user_id = ? AND status = 'approved'
        `, [approvalId, userId]);

        if (approvals.length === 0) {
          return res.status(403).json({
            success: false,
            code: 'APPROVAL_REQUIRED',
            message: 'Valid approval required for this query',
            needsApproval: true
          });
        }
      }
    }
    
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
    let result = {};
    let executionTime = 0;
    let success = true;
    let errorMessage = null;

    try {
      if (connConfig.type === 'mysql') {
        const config = {
          host: connConfig.host,
          port: connConfig.port,
          user: connConfig.username,
          password: connConfig.password
        };
        
        // Add database to config if available
        const selectedDatabase = database || connConfig.database_name;
        if (selectedDatabase) {
          config.database = selectedDatabase;
        }
        
        // Only add ssl if it's enabled (1 in database)
        if (connConfig.use_ssl === 1) {
          config.ssl = {};
        }
        
        dbConnection = new DynamicMySQLConnection(config);
        
        const conn = await dbConnection.getConnection();
        
        // If we have a database but it's not in the connection config, use USE statement
        if (database && database !== connConfig.database_name) {
          try {
            await conn.query(`USE \`${database}\``);
          } catch (useError) {
            console.log('Could not USE database, continuing without it:', useError.message);
          }
        }
        
        // Split query by semicolon and execute each statement
        const queries = query.split(';').filter(q => q.trim());
        let allResults = [];
        
        for (let i = 0; i < queries.length; i++) {
          const singleQuery = queries[i].trim();
          if (!singleQuery) continue;
          
          try {
            const queryStartTime = Date.now();
            let rows, fields;
            
            // Handle USE statement with query() instead of execute()
            if (singleQuery.toUpperCase().trim().startsWith('USE ')) {
              await conn.query(singleQuery);
              const queryExecutionTime = Date.now() - queryStartTime;
              allResults.push({
                query: singleQuery,
                message: 'Database selected successfully',
                executionTime: queryExecutionTime
              });
            } else {
              // Apply SELECT limit for non-admin users
              let finalQuery = singleQuery;
              let limitApplied = false;
              
              console.log('Processing query:', singleQuery, 'selectLimit:', selectLimit, 'userRole:', userRole); // Debug log
              
              if (selectLimit && userRole !== 'admin') {
                const queryUpper = singleQuery.toUpperCase().trim();
                if (queryUpper.startsWith('SELECT')) {
                  // Remove existing LIMIT clause if present and apply admin limit
                  let queryWithoutLimit = singleQuery.replace(/\s+LIMIT\s+\d+\s*$/i, '');
                  finalQuery = queryWithoutLimit + ` LIMIT ${selectLimit}`;
                  limitApplied = true;
                  console.log('Admin limit applied:', selectLimit, 'Final query:', finalQuery); // Debug log
                } else {
                  console.log('No limit applied - not a SELECT query'); // Debug log
                }
              } else {
                console.log('No limit applied - admin user or no selectLimit set'); // Debug log
              }
              
              [rows, fields] = await conn.execute(finalQuery);
              const queryExecutionTime = Date.now() - queryStartTime;
              
              // Determine if it's a SELECT query (has rows to return)
              const isSelect = finalQuery.toUpperCase().trim().startsWith('SELECT') || 
                              finalQuery.toUpperCase().trim().startsWith('SHOW') ||
                              finalQuery.toUpperCase().trim().startsWith('DESCRIBE') ||
                              finalQuery.toUpperCase().trim().startsWith('EXPLAIN');
              
              if (isSelect) {
                // Admin tidak di-mask, hanya user biasa yang di-mask
                const shouldMask = enableMasking && userRole !== 'admin';
                const maskedData = shouldMask ? maskSensitiveData(rows, fields) : rows;
                const resultData = {
                  query: singleQuery, // Show original query to user
                  data: maskedData,
                  fields: fields ? fields.map(f => ({ name: f.name, type: f.type })) : [],
                  rowCount: rows.length,
                  executionTime: queryExecutionTime,
                  masked: shouldMask && maskedData !== rows // Indicate if data was masked
                };
                
                // Add limit notice for non-admin users
                if (limitApplied) {
                  resultData.limitApplied = true;
                  resultData.limitValue = selectLimit;
                  resultData.notice = `Results limited to ${selectLimit} rows. Contact admin to increase limit.`;
                }
                
                allResults.push(resultData);
              } else {
                // For INSERT, UPDATE, DELETE, etc.
                allResults.push({
                  query: singleQuery,
                  affectedRows: rows.affectedRows || 0,
                  insertId: rows.insertId || null,
                  message: `Query executed successfully. Affected rows: ${rows.affectedRows || 0}`,
                  executionTime: queryExecutionTime
                });
              }
            }
          } catch (queryError) {
            console.error('Individual query error:', queryError);
            allResults.push({
              query: singleQuery,
              error: queryError.message,
              sqlState: queryError.sqlState,
              errno: queryError.errno
            });
            // Continue with next query instead of breaking
          }
        }
        
        result = {
          results: allResults,
          totalQueries: queries.length
        };
        
        await conn.end();

      } else if (connConfig.type === 'postgresql') {
        const config = {
          host: connConfig.host,
          port: connConfig.port,
          user: connConfig.username,
          password: connConfig.password,
          database: database || connConfig.database_name
        };
        
        // Only add ssl if it's enabled (1 in database)
        if (connConfig.use_ssl === 1) {
          config.ssl = true;
        }
        
        dbConnection = new DynamicPostgreSQLConnection(config);
        
        console.log('PostgreSQL Query execution:', {
          query: query,
          database: database || connConfig.database_name,
          connection: `${connConfig.host}:${connConfig.port}`
        });
        
        const client = await dbConnection.getConnection();
        
        // Split query by semicolon and execute each statement
        const queries = query.split(';').filter(q => q.trim());
        let allResults = [];
        
        for (let i = 0; i < queries.length; i++) {
          const singleQuery = queries[i].trim();
          if (!singleQuery) continue;
          
          const queryStartTime = Date.now();
          const pgResult = await client.query(singleQuery);
          const queryExecutionTime = Date.now() - queryStartTime;
          
          if (pgResult.rows && pgResult.rows.length > 0) {
            // SELECT query
            const columns = pgResult.fields ? pgResult.fields.map(field => ({
              name: field.name,
              type: field.dataTypeID,
              length: field.dataTypeSize
            })) : [];
            
            // Admin tidak di-mask, hanya user biasa yang di-mask
            const shouldMask = enableMasking && userRole !== 'admin';
            const maskedData = shouldMask ? maskSensitiveData(pgResult.rows, columns) : pgResult.rows;
            allResults.push({
              query: singleQuery,
              columns: columns,
              data: maskedData,
              rowCount: pgResult.rows.length,
              executionTime: queryExecutionTime,
              masked: shouldMask && maskedData !== pgResult.rows // Indicate if data was masked
            });
          } else {
            // INSERT, UPDATE, DELETE, etc.
            allResults.push({
              query: singleQuery,
              message: `Query executed successfully. ${pgResult.rowCount || 0} row(s) affected.`,
              affectedRows: pgResult.rowCount || 0,
              executionTime: queryExecutionTime
            });
          }
        }
        
        result = {
          results: allResults,
          totalQueries: queries.length
        };
        
        await client.end();
      }

    } catch (queryError) {
      success = false;
      errorMessage = queryError.message;
      console.error('Query execution error:', {
        error: queryError.message,
        code: queryError.code,
        query: query,
        database: database,
        connectionType: connConfig.type,
        stack: queryError.stack
      });
      result = {
        error: queryError.message,
        code: queryError.code || 'UNKNOWN_ERROR'
      };
    }

    executionTime = Date.now() - startTime;

    // Save query to history
    try {
      await adminConnection.execute(
        `INSERT INTO query_history 
         (user_id, connection_id, query_text, execution_time, success, error_message) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          connectionId,
          query,
          executionTime / 1000, // Convert to seconds
          success,
          errorMessage
        ]
      );
    } catch (historyError) {
      console.error('Failed to save query history:', historyError);
    }

    res.json({
      success,
      executionTime,
      ...result
    });

  } catch (error) {
    console.error('Execute query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute query: ' + error.message
    });
  } finally {
    if (adminConnection) {
      await adminConnection.end();
    }
  }
});

// Get query history
router.get('/history', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { limit = 50, offset = 0 } = req.query;

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [history] = await connection.execute(
      `SELECT 
         qh.id,
         qh.query_text,
         qh.execution_time,
         qh.success,
         qh.error_message,
         qh.executed_at,
         dc.name as connection_name,
         dc.type as connection_type,
         dc.host,
         dc.database_name
       FROM query_history qh
       LEFT JOIN database_connections dc ON qh.connection_id = dc.id
       WHERE qh.user_id = ?
       ORDER BY qh.executed_at DESC
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM query_history WHERE user_id = ?',
      [userId]
    );

    res.json({
      success: true,
      history,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get query history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve query history'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Delete query from history
router.delete('/history/:id', requireAuth, async (req, res) => {
  const historyId = req.params.id;
  const userId = req.session.user.id;

  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    connection = await mysqlConn.getConnection();
    
    const [result] = await connection.execute(
      'DELETE FROM query_history WHERE id = ? AND user_id = ?',
      [historyId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Query history not found'
      });
    }

    res.json({
      success: true,
      message: 'Query history deleted successfully'
    });

  } catch (error) {
    console.error('Delete query history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete query history'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

// Get table structure
router.post('/table-structure', requireAuth, async (req, res) => {
  const { connectionId, database, tableName } = req.body;
  const userId = req.session.user.id;

  if (!connectionId || !database || !tableName) {
    return res.status(400).json({
      success: false,
      message: 'Connection ID, database, and table name are required'
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
    let structure = {};

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
      const [columns] = await conn.execute(`DESCRIBE \`${tableName}\``);
      const [indexes] = await conn.execute(`SHOW INDEXES FROM \`${tableName}\``);
      
      structure = {
        columns: columns.map(col => ({
          field: col.Field,
          type: col.Type,
          null: col.Null === 'YES',
          key: col.Key,
          default: col.Default,
          extra: col.Extra
        })),
        indexes: indexes.map(idx => ({
          name: idx.Key_name,
          column: idx.Column_name,
          unique: idx.Non_unique === 0,
          type: idx.Index_type
        }))
      };
      
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
      
      // Get columns
      const columnsResult = await client.query(`
        SELECT 
          column_name as field,
          data_type as type,
          is_nullable,
          column_default as default_value,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
      // Get indexes
      const indexesResult = await client.query(`
        SELECT 
          indexname as name,
          indexdef as definition
        FROM pg_indexes 
        WHERE tablename = $1 AND schemaname = 'public'
      `, [tableName]);
      
      structure = {
        columns: columnsResult.rows.map(col => ({
          field: col.field,
          type: col.type + (col.character_maximum_length ? `(${col.character_maximum_length})` : ''),
          null: col.is_nullable === 'YES',
          default: col.default_value
        })),
        indexes: indexesResult.rows.map(idx => ({
          name: idx.name,
          definition: idx.definition
        }))
      };
      
      await client.end();
    }

    res.json({
      success: true,
      structure
    });

  } catch (error) {
    console.error('Get table structure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve table structure: ' + error.message
    });
  } finally {
    if (adminConnection) {
      await adminConnection.end();
    }
  }
});

module.exports = router;
