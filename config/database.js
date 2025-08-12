const mysql = require('mysql2/promise');
const { Client } = require('pg');

// Helper function to parse SSL configuration
function parseSSLConfig(ssl) {
  if (ssl === true || ssl === 1 || ssl === '1' || ssl === 'true') {
    return { rejectUnauthorized: false }; // For self-signed certificates
  }
  return null; // Use null instead of false for better compatibility
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Drop child tables first (to avoid foreign key constraint issues)
    await connection.execute(`DROP TABLE IF EXISTS query_history`);
    await connection.execute(`DROP TABLE IF EXISTS database_connections`);
    
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

    console.log('Database tables created successfully');
    
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
