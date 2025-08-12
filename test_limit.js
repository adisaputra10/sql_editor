const { MySQLConnection } = require('./config/database');

async function testSelectLimit() {
  const mysqlConn = new MySQLConnection();
  let connection;
  
  try {
    connection = await mysqlConn.getConnection();
    console.log('Database connected');
    
    // Check current select_limit setting
    const [settings] = await connection.execute(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ?',
      ['select_limit']
    );
    console.log('Current select_limit setting:', settings);
    
    // Update select_limit to 3 as requested
    await connection.execute(
      'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
      ['3', 'select_limit']
    );
    console.log('Updated select_limit to 3');
    
    // Verify update
    const [updatedSettings] = await connection.execute(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ?',
      ['select_limit']
    );
    console.log('Verified select_limit setting:', updatedSettings);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testSelectLimit();
