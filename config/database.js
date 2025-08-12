const mysql = require('mysql2/promise');
const { Client } = require('pg');

// Helper function to parse SSL configuration
function parseSSLConfig(ssl) {
  if (ssl === true || ssl === 1 || ssl === '1' || ssl === 'true') {
    return { rejectUnauthorized: false }; // For self-signed certificates
  }
  if (ssl === false || ssl === 0 || ssl === '0' || ssl === 'false' || ssl === null || ssl === undefined) {
    return null; // Explicitly disable SSL
  }
  return null; // Default to no SSL for better compatibility
}

// MariaDB connection for user data (reference data)
class MySQLConnection {
  constructor() {
    this.config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sql_editor_users',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }

  async getConnection() {
    try {
      const connection = await mysql.createConnection(this.config);
      return connection;
    } catch (error) {
      // If SSL connection fails and SSL was enabled, try without SSL
      if (error.code === 'HANDSHAKE_NO_SSL_SUPPORT' && this.config.ssl) {
        console.log('SSL not supported by server, falling back to non-SSL connection');
        const fallbackConfig = { ...this.config, ssl: null };
        try {
          const connection = await mysql.createConnection(fallbackConfig);
          return connection;
        } catch (fallbackError) {
          console.error('Fallback connection also failed:', fallbackError);
          throw fallbackError;
        }
      }
      console.error('MySQL connection error:', error);
      throw error;
    }
  }

  async createPool() {
    try {
      const pool = mysql.createPool(this.config);
      return pool;
    } catch (error) {
      console.error('MySQL pool creation error:', error);
      throw error;
    }
  }
}

// Dynamic MariaDB/MySQL connection for user queries
class DynamicMySQLConnection {
  constructor(config) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database || '',
      ssl: parseSSLConfig(config.ssl),
      connectTimeout: 10000
    };
  }

  async getConnection() {
    try {
      const connection = await mysql.createConnection(this.config);
      return connection;
    } catch (error) {
      // If SSL error occurs, try without SSL
      if (error.code === 'HANDSHAKE_NO_SSL_SUPPORT' || error.message.includes('secure connection')) {
        console.log('SSL not supported, trying without SSL...');
        try {
          const configWithoutSSL = {
            ...this.config,
            ssl: null
          };
          const connection = await mysql.createConnection(configWithoutSSL);
          return connection;
        } catch (fallbackError) {
          console.error('Fallback connection without SSL also failed:', fallbackError);
          throw fallbackError;
        }
      }
      console.error('Dynamic MySQL connection error:', error);
      throw error;
    }
  }

  async testConnection() {
    let connection;
    try {
      connection = await this.getConnection();
      await connection.ping();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}

// Dynamic PostgreSQL connection for user queries
class DynamicPostgreSQLConnection {
  constructor(config) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      ssl: parseSSLConfig(config.ssl),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      query_timeout: 10000
    };
  }

  async getConnection() {
    try {
      const client = new Client(this.config);
      await client.connect();
      return client;
    } catch (error) {
      // If SSL error occurs, try without SSL
      if (error.code === 'ECONNREFUSED' || error.message.includes('SSL') || error.message.includes('secure')) {
        console.log('SSL connection failed, trying without SSL...');
        try {
          const configWithoutSSL = {
            ...this.config,
            ssl: false
          };
          const client = new Client(configWithoutSSL);
          await client.connect();
          return client;
        } catch (fallbackError) {
          console.error('Fallback PostgreSQL connection without SSL also failed:', fallbackError);
          throw fallbackError;
        }
      }
      console.error('PostgreSQL connection error:', error);
      throw error;
    }
  }

  async testConnection() {
    let client;
    try {
      client = await this.getConnection();
      await client.query('SELECT 1');
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (client) {
        await client.end();
      }
    }
  }
}

// Initialize the main MariaDB database for user data
async function initializeDatabase() {
  const mysqlConn = new MySQLConnection();
  let connection;

  try {
    // First, connect without database to create it if it doesn't exist
    const tempConfig = { ...mysqlConn.config };
    delete tempConfig.database;
    
    connection = await mysql.createConnection(tempConfig);
    
    // Create database if it doesn't exist
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${mysqlConn.config.database}\``);
    await connection.end();
    
    // Now connect to the created database
    connection = await mysqlConn.getConnection();
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role ENUM('admin', 'user') DEFAULT 'user',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Add role column if it doesn't exist (for existing users table)
    await connection.execute(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role ENUM('admin', 'user') DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1
    `);

    // Create database connections table (to store user's favorite connections)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS database_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        type ENUM('mysql', 'postgresql') NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL,
        username VARCHAR(100) NOT NULL,
        password VARCHAR(255),
        database_name VARCHAR(100),
        use_ssl TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create query history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS query_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        connection_id INT,
        query_text TEXT NOT NULL,
        execution_time DECIMAL(10,3),
        success TINYINT(1) NOT NULL,
        error_message TEXT,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (connection_id) REFERENCES database_connections(id) ON DELETE SET NULL
      )
    `);

    // Create query approval requests table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS query_approval_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        connection_id INT,
        query_text TEXT NOT NULL,
        query_type ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DROP', 'CREATE', 'OTHER') NOT NULL,
        reason TEXT,
        database_name VARCHAR(255),
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        approved_by INT,
        approval_comment TEXT,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (connection_id) REFERENCES database_connections(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add database_name column to query_approval_requests if not exists
    try {
      await connection.execute(`
        ALTER TABLE query_approval_requests 
        ADD COLUMN database_name VARCHAR(255) NULL
        AFTER reason
      `);
      console.log('Added database_name column to query_approval_requests table');
    } catch (error) {
      if (!error.message.includes('Duplicate column name')) {
        console.log('database_name column already exists or other error:', error.message);
      }
    }

    // Create approval patterns table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS approval_patterns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        pattern VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Check if name column exists and add if missing (for existing databases)
    try {
      await connection.execute(`
        ALTER TABLE approval_patterns 
        ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT '' AFTER id
      `);
    } catch (error) {
      // Column already exists or other error, continue
      if (!error.message.includes('Duplicate column name')) {
        console.log('Note: Could not add name column:', error.message);
      }
    }

    // Insert default approval patterns
    const defaultPatterns = [
      { name: 'Insert Operations', pattern: 'INSERT', description: 'Insert data into tables' },
      { name: 'Update Operations', pattern: 'UPDATE', description: 'Update existing data' },
      { name: 'Delete Operations', pattern: 'DELETE', description: 'Delete data from tables' },
      { name: 'Drop Operations', pattern: 'DROP', description: 'Drop tables, databases, or other objects' },
      { name: 'Alter Operations', pattern: 'ALTER', description: 'Alter table structure or database objects' },
      { name: 'Create Operations', pattern: 'CREATE', description: 'Create tables, databases, or other objects' },
      { name: 'Truncate Operations', pattern: 'TRUNCATE', description: 'Truncate tables (remove all data)' }
    ];

    for (const pattern of defaultPatterns) {
      await connection.execute(`
        INSERT IGNORE INTO approval_patterns (name, pattern, description) 
        VALUES (?, ?, ?)
      `, [pattern.name, pattern.pattern, pattern.description]);
    }

    // Create default admin user if not exists
    const bcrypt = require('bcryptjs');
    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);
    
    // Create default admin user
    await connection.execute(`
      INSERT IGNORE INTO users (username, email, password, full_name, role) 
      VALUES ('admin', 'admin@sqleditor.com', ?, 'System Administrator', 'admin')
    `, [adminPassword]);

    // Create default regular user
    await connection.execute(`
      INSERT IGNORE INTO users (username, email, password, full_name, role) 
      VALUES ('user', 'user@sqleditor.com', ?, 'Regular User', 'user')
    `, [userPassword]);

    console.log('Database tables created successfully');
    console.log('Default admin user created: admin/admin123');
    console.log('Default regular user created: user/user123');
    console.log('Default approval patterns created');

    // Create system settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert default system settings
    const defaultSettings = [
      { 
        key: 'select_limit', 
        value: '10', 
        description: 'Maximum number of rows returned by SELECT queries for non-admin users' 
      },
      { 
        key: 'query_timeout', 
        value: '30', 
        description: 'Query execution timeout in seconds' 
      },
      { 
        key: 'enable_query_logging', 
        value: 'true', 
        description: 'Enable logging of all executed queries' 
      }
    ];

    for (const setting of defaultSettings) {
      try {
        await connection.execute(`
          INSERT IGNORE INTO system_settings (setting_key, setting_value, description) 
          VALUES (?, ?, ?)
        `, [setting.key, setting.value, setting.description]);
      } catch (error) {
        console.log(`Error inserting setting ${setting.key}:`, error.message);
      }
    }

    console.log('Default system settings created');

    // Add default MariaDB connection for admin user
    try {
      const [adminUser] = await connection.execute(
        'SELECT id FROM users WHERE username = ? LIMIT 1',
        ['admin']
      );

      if (adminUser.length > 0) {
        const adminUserId = adminUser[0].id;
        
        // Check if MariaDB connection already exists
        const [existingConn] = await connection.execute(
          'SELECT id FROM database_connections WHERE user_id = ? AND name = ? LIMIT 1',
          [adminUserId, 'Local MariaDB']
        );

        if (existingConn.length === 0) {
          await connection.execute(`
            INSERT INTO database_connections (user_id, name, type, host, port, username, password, database_name, use_ssl) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [adminUserId, 'Local MariaDB', 'mysql', 'localhost', 3306, 'root', '', 'test', 0]);
          
          console.log('Default MariaDB connection created');
        }

        // Add sample database connection for user
        const [regularUser] = await connection.execute(
          'SELECT id FROM users WHERE username = ? LIMIT 1',
          ['user']
        );

        if (regularUser.length > 0) {
          const regularUserId = regularUser[0].id;
          
          const [existingUserConn] = await connection.execute(
            'SELECT id FROM database_connections WHERE user_id = ? AND name = ? LIMIT 1',
            [regularUserId, 'Local MariaDB']
          );

          if (existingUserConn.length === 0) {
            await connection.execute(`
              INSERT INTO database_connections (user_id, name, type, host, port, username, password, database_name, use_ssl) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [regularUserId, 'Local MariaDB', 'mysql', 'localhost', 3306, 'root', '', 'test', 0]);
            
            console.log('Default MariaDB connection created for user');
          }
        }
      }
    } catch (error) {
      console.log('Error creating default MariaDB connections:', error.message);
    }
    
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

module.exports = {
  MySQLConnection,
  DynamicMySQLConnection,
  DynamicPostgreSQLConnection,
  initializeDatabase
};
