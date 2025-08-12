const { MySQLConnection } = require('./config/database');

async function checkDatabase() {
  const mysqlConn = new MySQLConnection();
  let connection;
  
  try {
    connection = await mysqlConn.getConnection();
    console.log('Database connected');
    
    // Check table structure
    const [structure] = await connection.execute('DESCRIBE approval_patterns');
    console.log('Table structure:', structure);
    
    // Check existing data
    const [data] = await connection.execute('SELECT * FROM approval_patterns LIMIT 5');
    console.log('Sample data:', data);
    
  } catch (error) {
    console.error('Database check error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkDatabase();
