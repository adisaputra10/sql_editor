// Global variables
let currentConnection = null;
let currentDatabase = null;
let queryEditor = null;
let connections = [];

$(document).ready(function() {
    console.log('Dashboard JavaScript loaded');
    
    // Load saved theme
    loadTheme();
    
    // Initialize CodeMirror
    initializeQueryEditor();
    
    // Load connections
    loadConnections();
    
    // Event listeners
    setupEventListeners();
    
    // Additional fallback event listeners
    $(document).on('click', '#getStartedBtn', function(e) {
        e.preventDefault();
        console.log('Get started button clicked (fallback)');
        $('#connectionModal').modal('show');
    });
    
    $(document).on('click', '#addConnectionBtn', function(e) {
        e.preventDefault();
        console.log('Add connection button clicked (fallback)');
        $('#connectionModal').modal('show');
    });
    
    // Set default port based on database type
    $(document).on('change', '#databaseType', function() {
        const type = $(this).val();
        console.log('Database type changed to:', type);
        if (type === 'mysql') {
            $('#port').val(3306);
        } else if (type === 'postgresql') {
            $('#port').val(5432);
        }
    });
    
    console.log('Dashboard initialization complete');
});

// Theme toggle function
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    
    // Update icon and text
    const themeIcon = $('#themeToggle i');
    const themeText = $('#themeToggle').contents().filter(function() {
        return this.nodeType === 3; // Text node
    });
    
    if (isDark) {
        themeIcon.removeClass('bi-moon').addClass('bi-sun');
        $('#themeToggle').html('<i class="bi bi-sun me-2"></i>Light Mode');
        localStorage.setItem('theme', 'dark');
    } else {
        themeIcon.removeClass('bi-sun').addClass('bi-moon');
        $('#themeToggle').html('<i class="bi bi-moon me-2"></i>Dark Mode');
        localStorage.setItem('theme', 'light');
    }
}

// Load saved theme
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        $('#themeToggle').html('<i class="bi bi-sun me-2"></i>Light Mode');
    }
}

function initializeQueryEditor() {
    console.log('Initializing query editor...');
    
    // Check if CodeMirror is loaded
    if (typeof CodeMirror === 'undefined') {
        console.error('CodeMirror is not loaded');
        // Create a simple textarea fallback
        const fallbackHtml = `
            <textarea id="queryTextarea" class="form-control" rows="15" 
                      placeholder="Enter your SQL query here...&#10;&#10;CodeMirror failed to load, using fallback textarea."></textarea>
        `;
        document.getElementById('queryEditor').innerHTML = fallbackHtml;
        
        // Create a simple fallback object
        queryEditor = {
            getValue: () => document.getElementById('queryTextarea').value,
            setValue: (value) => document.getElementById('queryTextarea').value = value,
            focus: () => document.getElementById('queryTextarea').focus()
        };
        return;
    }
    
    try {
        queryEditor = CodeMirror(document.getElementById('queryEditor'), {
            mode: 'text/x-sql',
            theme: 'material',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            indentWithTabs: true,
            smartIndent: true,
            lineWrapping: true,
            extraKeys: {
                'Ctrl-Enter': executeQuery,
                'Cmd-Enter': executeQuery,
                'Ctrl-Space': 'autocomplete'
            },
            placeholder: 'Enter your SQL query here...\n\nKeyboard shortcuts:\n- Ctrl/Cmd + Enter: Execute query\n- Ctrl + Space: Autocomplete'
        });
        console.log('CodeMirror initialized successfully');
    } catch (error) {
        console.error('Error initializing CodeMirror:', error);
        // Fallback to textarea
        const fallbackHtml = `
            <textarea id="queryTextarea" class="form-control" rows="15" 
                      placeholder="Enter your SQL query here...&#10;&#10;Error initializing CodeMirror: ${error.message}"></textarea>
        `;
        document.getElementById('queryEditor').innerHTML = fallbackHtml;
        
        queryEditor = {
            getValue: () => document.getElementById('queryTextarea').value,
            setValue: (value) => document.getElementById('queryTextarea').value = value,
            focus: () => document.getElementById('queryTextarea').focus()
        };
    }
}

function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Add connection button
    $('#addConnectionBtn, #getStartedBtn').click(function(e) {
        e.preventDefault();
        console.log('Add connection button clicked');
        $('#connectionModal').modal('show');
    });

    // Reset form when modal is hidden
    $('#connectionModal').on('hidden.bs.modal', function() {
        $('#connectionForm')[0].reset();
        $('#modalAlertContainer').empty();
    });

    // Test connection
    $('#testConnectionBtn').click(testConnection);

    // Save connection
    $('#saveConnectionBtn').click(saveConnection);

    // Execute query
    $('#executeQueryBtn').click(executeQuery);

    // Clear query
    $('#clearQueryBtn').click(function() {
        queryEditor.setValue('');
    });

    // Database selector change
    $('#databaseSelector').change(function() {
        const selectedDatabase = $(this).val();
        if (selectedDatabase) {
            currentDatabase = selectedDatabase;
            $('#currentDatabaseName').text(selectedDatabase);
            $('#currentDatabaseIndicator').show();
            
            // Update active database in sidebar
            $('.database-item').removeClass('active');
            $(`.database-item[data-database="${selectedDatabase}"]`).addClass('active');
        } else {
            currentDatabase = null;
            $('#currentDatabaseIndicator').hide();
            $('.database-item').removeClass('active');
        }
    });

    // Query history
    $('#queryHistoryBtn').click(showQueryHistory);

    // Logout
    $('#logoutBtn').click(logout);

    // Theme toggle
    $('#themeToggle').click(toggleTheme);
    
    console.log('Event listeners setup complete');
}

function showAlert(type, message, container = 'body') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    if (container === 'body') {
        // Create a fixed alert at the top
        const alertDiv = $(alertHtml).css({
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px'
        });
        $('body').append(alertDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            alertDiv.alert('close');
        }, 5000);
    } else {
        // Insert into specific container
        $(container).html(alertHtml);
        
        // Auto remove after 5 seconds for non-body containers too
        setTimeout(() => {
            $(container + ' .alert').alert('close');
        }, 5000);
    }
}

function loadConnections() {
    console.log('Loading connections...');
    $.ajax({
        url: '/api/database/connections',
        method: 'GET',
        success: function(response) {
            console.log('Connections loaded:', response);
            if (response.success) {
                connections = response.connections;
                displayConnections();
                
                if (connections.length === 0) {
                    console.log('No connections found, showing welcome message');
                    $('#welcomeMessage').show();
                    $('#queryInterface').hide();
                } else {
                    console.log('Connections found, hiding welcome message');
                    $('#welcomeMessage').hide();
                }
            }
        },
        error: function(xhr) {
            console.error('Failed to load connections:', xhr);
            // Show welcome message on error too
            $('#welcomeMessage').show();
            $('#queryInterface').hide();
        }
    });
}

function displayConnections() {
    const connectionsHtml = connections.map(conn => `
        <div class="connection-item mb-2">
            <div class="d-flex align-items-center justify-content-between p-2 rounded" 
                 style="background: rgba(255,255,255,0.1); cursor: pointer;"
                 data-connection-id="${conn.id}">
                <div class="d-flex align-items-center">
                    <i class="bi bi-${conn.type === 'mysql' ? 'database' : 'server'} me-2"></i>
                    <div>
                        <div class="fw-bold">${conn.name}</div>
                        <small class="text-light">${conn.type.toUpperCase()} - ${conn.host}:${conn.port}</small>
                    </div>
                </div>
                <div class="dropdown">
                    <button class="btn btn-sm btn-outline-light" type="button" data-bs-toggle="dropdown">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item connect-btn" href="#" data-connection-id="${conn.id}">
                            <i class="bi bi-plug me-2"></i>Connect
                        </a></li>
                        <li><a class="dropdown-item delete-connection-btn" href="#" data-connection-id="${conn.id}">
                            <i class="bi bi-trash me-2"></i>Delete
                        </a></li>
                    </ul>
                </div>
            </div>
        </div>
    `).join('');
    
    $('#connectionsList').html(connectionsHtml);
    
    // Event listeners for connection items
    $('.connect-btn').click(function(e) {
        e.preventDefault();
        const connectionId = $(this).data('connection-id');
        connectToDatabase(connectionId);
    });
    
    $('.delete-connection-btn').click(function(e) {
        e.preventDefault();
        const connectionId = $(this).data('connection-id');
        if (confirm('Are you sure you want to delete this connection?')) {
            deleteConnection(connectionId);
        }
    });
}

function testConnection() {
    const formData = {
        type: $('#databaseType').val(),
        host: $('#host').val(),
        port: $('#port').val(),
        username: $('#username').val(),
        password: $('#password').val(),
        database: $('#database').val(),
        ssl: $('#ssl').is(':checked')
    };

    if (!formData.type || !formData.host || !formData.username) {
        showAlert('warning', 'Please fill in required fields (type, host, username)', '#modalAlertContainer');
        return;
    }

    $('#testConnectionBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Testing...');

    $.ajax({
        url: '/api/database/test-connection',
        method: 'POST',
        data: formData,
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Connection successful!', '#modalAlertContainer');
            } else {
                showAlert('danger', 'Connection failed: ' + response.message, '#modalAlertContainer');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', 'Connection failed: ' + (response ? response.message : 'Unknown error'), '#modalAlertContainer');
        },
        complete: function() {
            $('#testConnectionBtn').prop('disabled', false).html('<i class="bi bi-wifi me-1"></i>Test Connection');
        }
    });
}

function saveConnection() {
    const formData = {
        name: $('#connectionName').val(),
        type: $('#databaseType').val(),
        host: $('#host').val(),
        port: $('#port').val(),
        username: $('#username').val(),
        password: $('#password').val(),
        database: $('#database').val(),
        ssl: $('#ssl').is(':checked')
    };

    if (!formData.name || !formData.type || !formData.host || !formData.username) {
        showAlert('warning', 'Please fill in required fields', '#modalAlertContainer');
        return;
    }

    $('#saveConnectionBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Saving...');

    $.ajax({
        url: '/api/database/save-connection',
        method: 'POST',
        data: formData,
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Connection saved successfully!');
                $('#connectionModal').modal('hide');
                $('#connectionForm')[0].reset();
                loadConnections();
            } else {
                showAlert('danger', 'Failed to save connection: ' + response.message, '#modalAlertContainer');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', 'Failed to save connection: ' + (response ? response.message : 'Unknown error'), '#modalAlertContainer');
        },
        complete: function() {
            $('#saveConnectionBtn').prop('disabled', false).html('<i class="bi bi-floppy me-1"></i>Save Connection');
        }
    });
}

function deleteConnection(connectionId) {
    $.ajax({
        url: `/api/database/connections/${connectionId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Connection deleted successfully!');
                loadConnections();
                
                // If this was the current connection, reset the interface
                if (currentConnection && currentConnection.id == connectionId) {
                    currentConnection = null;
                    currentDatabase = null;
                    $('#databaseTree').hide();
                    $('#queryInterface').hide();
                    $('#welcomeMessage').show();
                }
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', 'Failed to delete connection: ' + (response ? response.message : 'Unknown error'));
        }
    });
}

function connectToDatabase(connectionId) {
    currentConnection = connections.find(conn => conn.id == connectionId);
    if (!currentConnection) return;

    showAlert('info', `Connecting to ${currentConnection.name}...`);
    
    // Load databases
    loadDatabases(connectionId);
    
    // Show query interface
    $('#welcomeMessage').hide();
    $('#queryInterface').show();
    $('#databaseTree').show();
}

function loadDatabases(connectionId) {
    $.ajax({
        url: '/api/database/databases',
        method: 'POST',
        data: { connectionId: connectionId },
        success: function(response) {
            if (response.success) {
                displayDatabaseTree(response.databases);
                showAlert('success', 'Connected successfully!');
            } else {
                showAlert('danger', 'Failed to load databases: ' + response.message);
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', 'Failed to load databases: ' + (response ? response.message : 'Unknown error'));
        }
    });
}

function displayDatabaseTree(databases) {
    const treeHtml = databases.map(db => `
        <div class="tree-item database-item" data-database="${db}">
            <i class="bi bi-database me-2"></i>${db}
            <div class="tables-container ms-3" style="display: none;">
                <!-- Tables will be loaded here -->
            </div>
        </div>
    `).join('');
    
    $('#treeContent').html(treeHtml);
    
    // Populate database selector dropdown
    const selectorHtml = '<option value="">Select Database</option>' + 
        databases.map(db => `<option value="${db}">${db}</option>`).join('');
    $('#databaseSelector').html(selectorHtml).show();
    
    // Event listener for database items
    $('.database-item').click(function() {
        const database = $(this).data('database');
        const tablesContainer = $(this).find('.tables-container');
        
        if (tablesContainer.is(':visible')) {
            tablesContainer.hide();
            $(this).removeClass('active');
            currentDatabase = null;
            // Hide database indicator
            $('#currentDatabaseIndicator').hide();
        } else {
            $('.database-item').removeClass('active');
            $('.tables-container').hide();
            $(this).addClass('active');
            currentDatabase = database;
            // Show database indicator
            $('#currentDatabaseName').text(database);
            $('#currentDatabaseIndicator').show();
            loadTables(database, tablesContainer);
        }
    });
}

function loadTables(database, container) {
    $.ajax({
        url: '/api/database/tables',
        method: 'POST',
        data: { 
            connectionId: currentConnection.id,
            database: database 
        },
        success: function(response) {
            if (response.success) {
                const tablesHtml = response.tables.map(table => `
                    <div class="tree-item table-item" data-table="${table.name}">
                        <i class="bi bi-table me-2"></i>${table.name}
                        <small class="text-muted">(${table.type})</small>
                    </div>
                `).join('');
                
                container.html(tablesHtml).show();
                
                // Event listener for table items
                container.find('.table-item').click(function(e) {
                    e.stopPropagation();
                    const tableName = $(this).data('table');
                    generateSelectQuery(tableName);
                });
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', 'Failed to load tables: ' + (response ? response.message : 'Unknown error'));
        }
    });
}

function generateSelectQuery(tableName) {
    const query = `SELECT * FROM \`${tableName}\` LIMIT 100;`;
    queryEditor.setValue(query);
    queryEditor.focus();
}

function executeQuery() {
    if (!currentConnection) {
        showAlert('warning', 'Please connect to a database first');
        return;
    }

    const query = queryEditor.getValue().trim();
    if (!query) {
        showAlert('warning', 'Please enter a query');
        return;
    }

    // Check if database is needed for this query
    const needsDatabase = query.toLowerCase().includes('show tables') || 
                         query.toLowerCase().includes('describe ') ||
                         query.toLowerCase().includes('select ') ||
                         query.toLowerCase().includes('insert ') ||
                         query.toLowerCase().includes('update ') ||
                         query.toLowerCase().includes('delete ');

    if (needsDatabase && !currentDatabase) {
        showAlert('warning', 'Please select a database first by clicking on a database name in the left panel');
        return;
    }

    $('#executeQueryBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Executing...');

    const startTime = Date.now();

    $.ajax({
        url: '/api/query/execute',
        method: 'POST',
        data: {
            connectionId: currentConnection.id,
            database: currentDatabase,
            query: query,
            enableMasking: $('#dataMaskingToggle').prop('checked')
        },
        success: function(response) {
            const executionTime = Date.now() - startTime;
            displayQueryResults(response, executionTime);
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            displayQueryError(response ? response.message : 'Query execution failed');
        },
        complete: function() {
            $('#executeQueryBtn').prop('disabled', false).html('<i class="bi bi-play-circle me-1"></i>Execute');
        }
    });
}

function displayQueryResults(response, clientExecutionTime) {
    let resultsHtml = '';

    if (response.success) {
        if (response.results) {
            // Multiple queries
            response.results.forEach((result, index) => {
                resultsHtml += `<div class="mb-4">`;
                resultsHtml += `<h6>Query ${index + 1}: ${result.executionTime}ms</h6>`;
                resultsHtml += `<code class="text-muted small">${result.query}</code>`;
                
                if (result.data) {
                    // SELECT query result
                    resultsHtml += generateTableHtml(result.data, result.columns);
                    resultsHtml += `<small class="text-muted">Returned ${result.rowCount} row(s)`;
                    if (result.masked) {
                        resultsHtml += ` <span class="badge bg-info ms-2"><i class="bi bi-eye-slash me-1"></i>Sensitive data masked</span>`;
                    }
                    resultsHtml += `</small>`;
                } else {
                    // Non-SELECT query result
                    resultsHtml += `<div class="alert alert-success">${result.message}</div>`;
                }
                resultsHtml += `</div>`;
            });
        } else if (response.error) {
            resultsHtml = `<div class="alert alert-danger">${response.error}</div>`;
        }
    } else {
        resultsHtml = `<div class="alert alert-danger">${response.message || 'Query execution failed'}</div>`;
    }

    $('#resultsContent').html(resultsHtml);
    $('#queryResults').show();
    
    // Scroll to results
    $('html, body').animate({
        scrollTop: $('#queryResults').offset().top
    }, 500);
}

function displayQueryError(message) {
    const errorHtml = `<div class="alert alert-danger">${message}</div>`;
    $('#resultsContent').html(errorHtml);
    $('#queryResults').show();
}

function generateTableHtml(data, columns) {
    if (!data || data.length === 0) {
        return '<div class="alert alert-info">No data returned</div>';
    }

    // Define sensitive column patterns (same as backend)
    const sensitivePatterns = [
        /nama/i, /name/i, /email/i, /phone/i, /telepon/i, /hp/i,
        /password/i, /pass/i, /token/i, /secret/i, /key/i,
        /nik/i, /ktp/i, /passport/i, /credit_card/i, /card_number/i
    ];

    let tableHtml = '<div class="table-responsive results-table"><table class="table table-striped table-hover">';
    
    // Header
    tableHtml += '<thead class="table-dark"><tr>';
    if (columns && columns.length > 0) {
        columns.forEach(col => {
            const isSensitive = sensitivePatterns.some(pattern => pattern.test(col.name));
            if (isSensitive) {
                tableHtml += `<th>${col.name} <i class="bi bi-eye-slash text-info" title="Sensitive data masked"></i></th>`;
            } else {
                tableHtml += `<th>${col.name}</th>`;
            }
        });
    } else {
        // Fallback to object keys
        Object.keys(data[0]).forEach(key => {
            const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
            if (isSensitive) {
                tableHtml += `<th>${key} <i class="bi bi-eye-slash text-info" title="Sensitive data masked"></i></th>`;
            } else {
                tableHtml += `<th>${key}</th>`;
            }
        });
    }
    tableHtml += '</tr></thead>';
    
    // Body
    tableHtml += '<tbody>';
    data.forEach(row => {
        tableHtml += '<tr>';
        Object.values(row).forEach(value => {
            let displayValue = value;
            if (value === null) {
                displayValue = '<span class="text-muted">NULL</span>';
            } else if (typeof value === 'string' && value.includes('*')) {
                // Highlight masked data
                displayValue = `<span class="text-info">${value}</span>`;
            } else if (typeof value === 'string' && value.length > 100) {
                displayValue = value.substring(0, 100) + '...';
            }
            tableHtml += `<td>${displayValue}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    
    return tableHtml;
}

function showQueryHistory() {
    $.ajax({
        url: '/api/query/history',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                displayQueryHistory(response.history);
                $('#historyModal').modal('show');
            }
        },
        error: function(xhr) {
            showAlert('danger', 'Failed to load query history');
        }
    });
}

function displayQueryHistory(history) {
    if (history.length === 0) {
        $('#historyContent').html('<div class="text-center text-muted py-4">No query history found</div>');
        return;
    }

    const historyHtml = history.map(item => `
        <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <div>
                    <small class="text-muted">${new Date(item.executed_at).toLocaleString()}</small>
                    <span class="badge ${item.success ? 'bg-success' : 'bg-danger'} ms-2">
                        ${item.success ? 'Success' : 'Error'}
                    </span>
                    ${item.connection_name ? `<span class="badge bg-info ms-1">${item.connection_name}</span>` : ''}
                </div>
                <div>
                    <small class="text-muted">${item.execution_time}s</small>
                    <button class="btn btn-sm btn-outline-primary ms-2 use-query-btn" 
                            data-query="${item.query_text.replace(/"/g, '&quot;')}">
                        Use Query
                    </button>
                </div>
            </div>
            <div class="card-body">
                <code class="text-wrap">${item.query_text}</code>
                ${!item.success && item.error_message ? `<div class="alert alert-danger mt-2 mb-0">${item.error_message}</div>` : ''}
            </div>
        </div>
    `).join('');

    $('#historyContent').html(historyHtml);

    // Event listener for use query buttons
    $('.use-query-btn').click(function() {
        const query = $(this).data('query');
        queryEditor.setValue(query);
        $('#historyModal').modal('hide');
    });
}

function logout() {
    $.ajax({
        url: '/auth/logout',
        method: 'POST',
        success: function() {
            window.location.href = '/';
        },
        error: function() {
            window.location.href = '/';
        }
    });
}
