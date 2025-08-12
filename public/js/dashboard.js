// Global variables
let currentConnection = null;
let currentDatabase = null;
let queryEditor = null;
let connections = [];

// Utility function to escape HTML
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

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
    
    // Load pending approvals count for admin
    if (window.userRole === 'admin') {
        loadPendingApprovalsCount();
        setInterval(loadPendingApprovalsCount, 30000); // Refresh every 30 seconds
    }

    // Approval system event listeners
    $('#viewPendingApprovalsBtn').on('click', function() {
        loadPendingApprovals();
        $('#pendingApprovalsModal').modal('show');
    });

    $('#viewMyRequestsBtn').on('click', function() {
        loadUserRequests();
        $('#userRequestsModal').modal('show');
    });

    // User management action event listeners (using event delegation)
    $(document).on('click', '.edit-user-btn', function() {
        console.log('Edit user button clicked'); // Debug log
        const userId = $(this).data('user-id');
        console.log('User ID:', userId); // Debug log
        editUser(userId);
    });

    $(document).on('click', '.toggle-status-btn', function() {
        console.log('Toggle status button clicked'); // Debug log
        const userId = $(this).data('user-id');
        console.log('User ID:', userId); // Debug log
        toggleUserStatus(userId);
    });

    $(document).on('click', '.delete-user-btn', function() {
        console.log('Delete user button clicked'); // Debug log
        const userId = $(this).data('user-id');
        const username = $(this).data('username');
        console.log('User ID:', userId, 'Username:', username); // Debug log
        showDeleteUserModal(userId, username);
    });

    $('#submitApprovalRequestBtn').on('click', function() {
        submitApprovalRequest();
    });

    // Approval decision modal event listeners
    $('#approveDecisionBtn').on('click', function() {
        processDecision('approved');
    });

    $('#rejectDecisionBtn').on('click', function() {
        processDecision('rejected');
    });

    // Quick reject modal event listener
    $('#confirmRejectBtn').on('click', function() {
        confirmQuickReject();
    });
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
    
    // User Management Events
    $('#viewUsersBtn').click(function() {
        $('#querySection').hide();
        $('#userManagementSection').show();
        $('#approvalPatternSection').hide();
        loadUsers();
    });

    $('#backToQueryBtn').click(function() {
        $('#userManagementSection').hide();
        $('#querySection').show();
    });

    $('#addUserBtn').click(showUserForm);
    $('#saveUserBtn').click(saveUser);
    $('#confirmDeleteUserBtn').click(deleteUser);

    // Approval Pattern Management Events
    $('#viewUsersBtn').click(function() {
        $('#querySection').hide();
        $('#userManagementSection').show();
        $('#approvalPatternSection').hide();
        loadUsers();
    });

    $('#backToQueryBtn').click(function() {
        $('#userManagementSection').hide();
        $('#querySection').show();
    });

    // Approval Pattern Management Events
    $('#viewApprovalPatternsBtn').click(function() {
        $('#querySection').hide();
        $('#userManagementSection').hide();
        $('#approvalPatternSection').show();
        loadApprovalPatterns();
    });

    $('#backToQueryFromPatternBtn').click(function() {
        $('#approvalPatternSection').hide();
        $('#querySection').show();
    });

    // System Settings Management Events
    $('#viewSystemSettingsBtn').click(function() {
        $('#querySection').hide();
        $('#userManagementSection').hide();
        $('#approvalPatternSection').hide();
        $('#systemSettingsSection').show();
        loadSystemSettings();
    });

    $('#backToQueryFromSettingsBtn').click(function() {
        $('#systemSettingsSection').hide();
        $('#querySection').show();
    });

    $('#addSettingBtn').click(showAddSettingModal);
    $('#saveSettingBtn').click(saveSetting);
    $('#confirmDeleteSettingBtn').click(function() {
        const settingKey = $(this).data('setting-key');
        deleteSetting(settingKey);
    });

    // Event delegation for setting actions
    $(document).on('click', '.edit-setting-btn', function() {
        const settingKey = $(this).data('key');
        showEditSettingModal(settingKey);
    });

    $(document).on('click', '.delete-setting-btn', function() {
        const settingKey = $(this).data('key');
        showDeleteSettingModal(settingKey);
    });

    $('#addPatternBtn').click(showAddPatternModal);
    $('#savePatternBtn').click(savePattern);
    $('#confirmDeletePatternBtn').click(function() {
        const patternId = $(this).data('pattern-id');
        deletePattern(patternId);
    });

    // Event delegation for pattern actions
    $(document).on('click', '.edit-pattern-btn', function() {
        const patternId = $(this).data('id');
        showEditPatternModal(patternId);
    });

    $(document).on('click', '.toggle-pattern-btn', function() {
        const patternId = $(this).data('id');
        const isActive = $(this).data('active');
        togglePattern(patternId, isActive);
    });

    $(document).on('click', '.delete-pattern-btn', function() {
        const patternId = $(this).data('id');
        const patternName = $(this).data('name');
        showDeletePatternModal(patternId, patternName);
    });
    
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

function clearAlert(container) {
    $(container).empty();
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
            if (xhr.status === 403 && response.code === 'APPROVAL_REQUIRED') {
                // Query needs approval
                showApprovalRequestModal(query);
            } else {
                displayQueryError(response ? response.message : 'Query execution failed');
            }
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
                    if (result.limitApplied) {
                        resultsHtml += ` <span class="badge bg-warning ms-2"><i class="bi bi-exclamation-triangle me-1"></i>Limited to ${result.limitValue} rows</span>`;
                    }
                    resultsHtml += `</small>`;
                    
                    // Add limit notice if applied
                    if (result.limitApplied && result.notice) {
                        resultsHtml += `<div class="alert alert-warning mt-2"><i class="bi bi-info-circle me-2"></i>${result.notice}</div>`;
                    }
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

// Approval System Functions
function loadPendingApprovalsCount() {
    $.ajax({
        url: '/api/approval/pending',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                $('#pendingCount').text(response.requests.length);
                if (response.requests.length > 0) {
                    $('#pendingCount').removeClass('bg-secondary').addClass('bg-danger');
                } else {
                    $('#pendingCount').removeClass('bg-danger').addClass('bg-secondary');
                }
            }
        },
        error: function(xhr) {
            console.error('Failed to load pending approvals count:', xhr);
        }
    });
}

function loadPendingApprovals() {
    $.ajax({
        url: '/api/approval/pending',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                displayPendingApprovals(response.requests);
            }
        },
        error: function(xhr) {
            console.error('Failed to load pending approvals:', xhr);
            showAlert('danger', 'Failed to load pending approvals', '#pendingApprovalsModal .modal-body');
        }
    });
}

function displayPendingApprovals(requests) {
    if (requests.length === 0) {
        $('#pendingApprovalsContent').html('<div class="text-center text-muted"><p>No pending approval requests</p></div>');
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-striped">';
    html += '<thead><tr><th>User</th><th>Connection/DB</th><th>Query Type</th><th>Query</th><th>Reason</th><th>Requested</th><th>Actions</th></tr></thead><tbody>';
    
    requests.forEach(request => {
        html += `
            <tr>
                <td>
                    <strong>${request.username}</strong><br>
                    <small class="text-muted">${request.full_name || 'N/A'}</small>
                </td>
                <td>
                    <small class="text-info">${request.connection_name || 'N/A'}</small><br>
                    <small class="text-muted">DB: ${request.db_name || 'N/A'}</small>
                </td>
                <td><span class="badge bg-info">${request.query_type}</span></td>
                <td>
                    <div style="max-width: 300px; max-height: 100px; overflow: auto;">
                        <code style="font-size: 0.8em;">${request.query_text}</code>
                    </div>
                </td>
                <td>${request.reason || 'No reason provided'}</td>
                <td><small>${new Date(request.requested_at).toLocaleString()}</small></td>
                <td>
                    <button class="btn btn-primary btn-sm me-1 process-approval-btn" 
                            data-request='${JSON.stringify(request).replace(/'/g, "&apos;")}'>
                        <i class="bi bi-gear"></i> Process
                    </button>
                    <button class="btn btn-danger btn-sm quick-reject-btn" 
                            data-request-id="${request.id}"
                            data-user="${request.username}">
                        <i class="bi bi-x"></i> Reject
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    $('#pendingApprovalsContent').html(html);
    
    // Add event listeners for process buttons
    $('.process-approval-btn').off('click').on('click', function() {
        const requestData = JSON.parse($(this).attr('data-request').replace(/&apos;/g, "'"));
        showApprovalDecisionModal(requestData);
    });
    
    // Add event listeners for quick reject buttons
    $('.quick-reject-btn').off('click').on('click', function() {
        const requestId = $(this).data('request-id');
        const username = $(this).data('user');
        showQuickRejectModal(requestId, username);
    });
}

// Legacy functions - kept for compatibility but now use modal
function approveRequest(requestId) {
    console.log('approveRequest called with ID:', requestId);
    // This is now handled by the modal, but kept for compatibility
}

function rejectRequest(requestId) {
    console.log('rejectRequest called with ID:', requestId);
    // This is now handled by the modal, but kept for compatibility
}

function checkQueryApprovalNeeded(query) {
    return $.ajax({
        url: '/api/approval/check-approval-needed',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ queryText: query })
    });
}

function showApprovalRequestModal(query) {
    $('#approvalQuery').val(query);
    
    // Set connection and database info
    $('#approvalConnection').val(currentConnection ? currentConnection.name : 'No connection');
    $('#approvalDatabase').val(currentDatabase || 'No database selected');
    
    // Auto-detect query type
    const queryUpper = query.trim().toUpperCase();
    let queryType = 'OTHER';
    
    if (queryUpper.startsWith('CREATE')) queryType = 'CREATE';
    else if (queryUpper.startsWith('DROP')) queryType = 'DROP';
    else if (queryUpper.startsWith('ALTER')) queryType = 'ALTER';
    else if (queryUpper.startsWith('INSERT')) queryType = 'INSERT';
    else if (queryUpper.startsWith('UPDATE')) queryType = 'UPDATE';
    else if (queryUpper.startsWith('DELETE')) queryType = 'DELETE';
    else if (queryUpper.startsWith('TRUNCATE')) queryType = 'TRUNCATE';
    
    $('#approvalQueryType').val(queryType);
    $('#approvalRequestModal').modal('show');
}

function submitApprovalRequest() {
    const queryText = $('#approvalQuery').val();
    const queryType = $('#approvalQueryType').val();
    const reason = $('#approvalReason').val();
    
    if (!queryType) {
        showAlert('warning', 'Please select query type', '#approvalRequestModal .modal-body');
        return;
    }
    
    if (!reason.trim()) {
        showAlert('warning', 'Please provide a reason for the approval request', '#approvalRequestModal .modal-body');
        return;
    }
    
    $('#submitApprovalRequestBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Submitting...');
    
    $.ajax({
        url: '/api/approval/request',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            queryText: queryText,
            queryType: queryType,
            reason: reason,
            connectionId: currentConnection ? currentConnection.id : null,
            database: currentDatabase
        }),
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Approval request submitted successfully! Please wait for admin approval.');
                $('#approvalRequestModal').modal('hide');
                $('#approvalReason').val(''); // Clear reason field
            } else {
                showAlert('danger', response.message, '#approvalRequestModal .modal-body');
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showAlert('danger', response ? response.message : 'Failed to submit approval request', '#approvalRequestModal .modal-body');
        },
        complete: function() {
            $('#submitApprovalRequestBtn').prop('disabled', false).html('<i class="bi bi-send me-1"></i>Submit Request');
        }
    });
}

function loadUserRequests() {
    $.ajax({
        url: '/api/approval/my-requests',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                displayUserRequests(response.requests);
            }
        },
        error: function(xhr) {
            console.error('Failed to load user requests:', xhr);
            showAlert('danger', 'Failed to load your requests', '#userRequestsModal .modal-body');
        }
    });
}

function displayUserRequests(requests) {
    if (requests.length === 0) {
        $('#userRequestsContent').html('<div class="text-center text-muted"><p>No approval requests found</p></div>');
        return;
    }

    console.log('User requests data:', requests); // Debug log

    let html = '<div class="table-responsive"><table class="table table-striped">';
    html += '<thead><tr><th>Query Type</th><th>Query</th><th>Reason</th><th>Status</th><th>Requested</th><th>Admin Comment</th></tr></thead><tbody>';
    
    requests.forEach(request => {
        const statusBadge = request.status === 'approved' ? 'bg-success' : 
                           request.status === 'rejected' ? 'bg-danger' : 'bg-warning';
        
        html += `
            <tr>
                <td><span class="badge bg-info">${request.query_type}</span></td>
                <td>
                    <div style="max-width: 300px; max-height: 100px; overflow: auto;">
                        <code style="font-size: 0.8em;">${request.query_text}</code>
                    </div>
                </td>
                <td>${request.reason || 'No reason provided'}</td>
                <td><span class="badge ${statusBadge}">${request.status.toUpperCase()}</span></td>
                <td><small>${new Date(request.requested_at).toLocaleString()}</small></td>
                <td>${request.approval_comment || '-'}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    $('#userRequestsContent').html(html);
}

// Global variable to store current request being processed
let currentRequestId = null;
let currentQuickRejectId = null;

function showApprovalDecisionModal(request) {
    currentRequestId = request.id;
    
    // Populate modal with request details
    $('#decisionUser').text(`${request.username} (${request.full_name || 'N/A'})`);
    $('#decisionConnection').text(request.connection_name || 'N/A');
    $('#decisionDatabase').text(request.db_name || 'N/A');
    $('#decisionQueryType').text(request.query_type);
    $('#decisionQuery').text(request.query_text);
    $('#decisionReason').text(request.reason || 'No reason provided');
    
    // Clear previous comment
    $('#decisionComment').val('');
    $('#decisionAlert').empty();
    
    // Show modal
    $('#approvalDecisionModal').modal('show');
}

function processDecision(action) {
    if (!currentRequestId) {
        showAlert('danger', 'No request selected', '#decisionAlert');
        return;
    }
    
    const comment = $('#decisionComment').val();
    const autoExecute = $('#autoExecuteCheck').prop('checked');
    
    if (action === 'rejected' && !comment.trim()) {
        showAlert('warning', 'Rejection reason is required', '#decisionAlert');
        return;
    }
    
    // Disable buttons during processing
    $('#approveDecisionBtn, #rejectDecisionBtn').prop('disabled', true);
    
    if (action === 'approved') {
        $('#approveDecisionBtn').html('<i class="spinner-border spinner-border-sm me-1"></i>Processing...');
    } else {
        $('#rejectDecisionBtn').html('<i class="spinner-border spinner-border-sm me-1"></i>Processing...');
    }
    
    $.ajax({
        url: `/api/approval/decision/${currentRequestId}`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            action: action,
            comment: comment,
            autoExecute: autoExecute
        }),
        success: function(response) {
            console.log('Decision response:', response);
            
            if (response.success) {
                let message = response.message;
                
                // Show execution result if available
                if (response.executionResult) {
                    if (response.executionResult.success) {
                        message += `\n\n✅ Query executed successfully!\nAffected rows: ${response.executionResult.affectedRows || 0}`;
                        showAlert('success', message, '#decisionAlert');
                    } else {
                        message += `\n\n❌ Query execution failed: ${response.executionResult.error}`;
                        showAlert('warning', message, '#decisionAlert');
                    }
                } else {
                    showAlert('success', message, '#decisionAlert');
                }
                
                // Refresh the pending approvals list
                setTimeout(() => {
                    loadPendingApprovals();
                    loadPendingApprovalsCount();
                    $('#approvalDecisionModal').modal('hide');
                }, 2000);
                
            } else {
                showAlert('danger', response.message, '#decisionAlert');
            }
        },
        error: function(xhr) {
            console.error('Failed to process decision:', xhr);
            const response = xhr.responseJSON;
            showAlert('danger', response ? response.message : 'Failed to process decision', '#decisionAlert');
        },
        complete: function() {
            // Re-enable buttons
            $('#approveDecisionBtn').prop('disabled', false).html('<i class="bi bi-check-circle me-1"></i>Approve & Execute');
            $('#rejectDecisionBtn').prop('disabled', false).html('<i class="bi bi-x-circle me-1"></i>Reject');
        }
    });
}

function showQuickRejectModal(requestId, username) {
    currentQuickRejectId = requestId;
    $('#rejectUsername').text(username);
    $('#rejectReason').val('');
    $('#quickRejectAlert').empty();
    $('#quickRejectModal').modal('show');
}

function confirmQuickReject() {
    const reason = $('#rejectReason').val().trim();
    
    if (!reason) {
        showAlert('warning', 'Rejection reason is required', '#quickRejectAlert');
        return;
    }
    
    if (!currentQuickRejectId) {
        showAlert('danger', 'No request selected', '#quickRejectAlert');
        return;
    }
    
    // Disable button during processing
    $('#confirmRejectBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Rejecting...');
    
    $.ajax({
        url: `/api/approval/decision/${currentQuickRejectId}`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            action: 'rejected',
            comment: reason,
            autoExecute: false
        }),
        success: function(response) {
            console.log('Quick reject response:', response);
            
            if (response.success) {
                showAlert('success', 'Request rejected successfully', '#quickRejectAlert');
                
                // Refresh the pending approvals list
                setTimeout(() => {
                    loadPendingApprovals();
                    loadPendingApprovalsCount();
                    $('#quickRejectModal').modal('hide');
                }, 2000);
                
            } else {
                showAlert('danger', response.message || 'Failed to reject request', '#quickRejectAlert');
            }
        },
        error: function(xhr) {
            console.error('Quick reject error:', xhr);
            showAlert('danger', 'Failed to reject request', '#quickRejectAlert');
        },
        complete: function() {
            // Re-enable button
            $('#confirmRejectBtn').prop('disabled', false).html('<i class="bi bi-x-circle me-1"></i>Reject Request');
        }
    });
}

// ==================== USER MANAGEMENT FUNCTIONS ====================

// Global variables for user management
let currentEditUserId = null;

function showUserManagement() {
    // Hide welcome message and query interface
    $('#welcomeMessage').hide();
    $('#queryInterface').hide();
    
    // Show user management section
    $('#userManagementSection').show();
    
    // Load users
    loadUsers();
}

function showQueryInterface() {
    // Hide user management and welcome message
    $('#userManagementSection').hide();
    $('#welcomeMessage').hide();
    
    // Show query interface
    $('#queryInterface').show();
}

function loadUsers() {
    $.ajax({
        url: '/api/users',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                displayUsers(response.users);
            }
        },
        error: function(xhr) {
            console.error('Failed to load users:', xhr);
            showAlert('danger', 'Failed to load users');
        }
    });
}

function displayUsers(users) {
    if (users.length === 0) {
        $('#usersContent').html('<div class="text-center text-muted"><p>No users found</p></div>');
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-striped">';
    html += '<thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>';
    
    users.forEach(user => {
        const statusBadge = user.is_active ? 
            '<span class="badge bg-success">Active</span>' : 
            '<span class="badge bg-secondary">Inactive</span>';
            
        const roleBadge = user.role === 'admin' ? 
            '<span class="badge bg-danger">Admin</span>' : 
            '<span class="badge bg-info">User</span>';
        
        html += `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.full_name}</td>
                <td>${user.email || '-'}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td><small>${new Date(user.created_at).toLocaleDateString()}</small></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary edit-user-btn" data-user-id="${user.id}" title="Edit User">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-${user.is_active ? 'warning' : 'success'} toggle-status-btn" 
                                data-user-id="${user.id}" 
                                title="${user.is_active ? 'Deactivate' : 'Activate'} User">
                            <i class="bi bi-${user.is_active ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-user-btn" 
                                data-user-id="${user.id}" 
                                data-username="${user.username}" 
                                title="Delete User">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    $('#usersContent').html(html);
}

function showUserForm(userId = null) {
    console.log('showUserForm called with userId:', userId); // Debug log
    currentEditUserId = userId;
    
    // Reset form
    $('#userForm')[0].reset();
    $('#userId').val('');
    $('#userActive').prop('checked', true);
    clearAlert('#userFormAlert');
    
    if (userId) {
        // Edit mode
        console.log('Edit mode - loading user data'); // Debug log
        $('#userFormTitle').text('Edit User');
        $('#passwordRequired').hide();
        $('#passwordHelp').show();
        $('#userPassword').prop('required', false);
        
        // Load user data
        $.ajax({
            url: `/api/users/${userId}`,
            method: 'GET',
            success: function(response) {
                if (response.success) {
                    const user = response.user;
                    $('#userId').val(user.id);
                    $('#userUsername').val(user.username);
                    $('#userFullName').val(user.full_name);
                    $('#userEmail').val(user.email || '');
                    $('#userRole').val(user.role);
                    $('#userActive').prop('checked', user.is_active);
                }
            },
            error: function(xhr) {
                console.error('Failed to load user:', xhr);
                showAlert('danger', 'Failed to load user data', '#userFormAlert');
            }
        });
    } else {
        // Add mode
        $('#userFormTitle').text('Add New User');
        $('#passwordRequired').show();
        $('#passwordHelp').hide();
        $('#userPassword').prop('required', true);
    }
    
    $('#userFormModal').modal('show');
}

function saveUser() {
    const userId = $('#userId').val();
    const isEdit = !!userId;
    
    const userData = {
        username: $('#userUsername').val().trim(),
        fullName: $('#userFullName').val().trim(),
        email: $('#userEmail').val().trim(),
        role: $('#userRole').val(),
        isActive: $('#userActive').prop('checked'),
        password: $('#userPassword').val().trim()
    };
    
    // Validation
    if (!userData.username || !userData.fullName) {
        showAlert('warning', 'Username and full name are required', '#userFormAlert');
        return;
    }
    
    if (!isEdit && !userData.password) {
        showAlert('warning', 'Password is required for new users', '#userFormAlert');
        return;
    }
    
    if (userData.password && userData.password.length < 6) {
        showAlert('warning', 'Password must be at least 6 characters', '#userFormAlert');
        return;
    }
    
    // Disable save button
    $('#saveUserBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Saving...');
    
    const url = isEdit ? `/api/users/${userId}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';
    
    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(userData),
        success: function(response) {
            if (response.success) {
                showAlert('success', response.message, '#userFormAlert');
                
                setTimeout(() => {
                    $('#userFormModal').modal('hide');
                    loadUsers();
                }, 1500);
            } else {
                showAlert('danger', response.message || 'Failed to save user', '#userFormAlert');
            }
        },
        error: function(xhr) {
            console.error('Save user error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to save user';
            showAlert('danger', message, '#userFormAlert');
        },
        complete: function() {
            $('#saveUserBtn').prop('disabled', false).html('<i class="bi bi-check-circle me-1"></i>Save User');
        }
    });
}

function editUser(userId) {
    showUserForm(userId);
}

function toggleUserStatus(userId) {
    console.log('toggleUserStatus called with userId:', userId); // Debug log
    $.ajax({
        url: `/api/users/${userId}/toggle-status`,
        method: 'PATCH',
        success: function(response) {
            console.log('Toggle status response:', response); // Debug log
            if (response.success) {
                showAlert('success', response.message);
                loadUsers();
            } else {
                showAlert('danger', response.message || 'Failed to update user status');
            }
        },
        error: function(xhr) {
            console.error('Toggle user status error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to update user status';
            showAlert('danger', message);
        }
    });
}

function showDeleteUserModal(userId, username) {
    console.log('showDeleteUserModal called with userId:', userId, 'username:', username); // Debug log
    currentEditUserId = userId;
    $('#deleteUserName').text(username);
    clearAlert('#deleteUserAlert');
    $('#deleteUserModal').modal('show');
}

function deleteUser() {
    if (!currentEditUserId) return;
    
    $('#confirmDeleteUserBtn').prop('disabled', true).html('<i class="spinner-border spinner-border-sm me-1"></i>Deleting...');
    
    $.ajax({
        url: `/api/users/${currentEditUserId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', response.message, '#deleteUserAlert');
                
                setTimeout(() => {
                    $('#deleteUserModal').modal('hide');
                    loadUsers();
                }, 1500);
            } else {
                showAlert('danger', response.message || 'Failed to delete user', '#deleteUserAlert');
            }
        },
        error: function(xhr) {
            console.error('Delete user error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to delete user';
            showAlert('danger', message, '#deleteUserAlert');
        },
        complete: function() {
            $('#confirmDeleteUserBtn').prop('disabled', false).html('<i class="bi bi-trash me-1"></i>Delete User');
        }
    });
}

// =================== APPROVAL PATTERN MANAGEMENT ===================

// Load approval patterns
function loadApprovalPatterns() {
    console.log('Loading approval patterns...'); // Debug log
    $('#patternsContent').html('<div class="text-center"><div class="spinner-border" role="status"></div></div>');
    
    $.get('/api/approval-patterns')
        .done(function(response) {
            console.log('Approval patterns response:', response); // Debug log
            if (response.success) {
                displayApprovalPatterns(response.data);
            } else {
                $('#patternsContent').html('<div class="alert alert-danger">Failed to load approval patterns</div>');
            }
        })
        .fail(function(xhr) {
            console.error('Load patterns error:', xhr);
            console.error('Response text:', xhr.responseText); // Debug log
            $('#patternsContent').html('<div class="alert alert-danger">Failed to load approval patterns: ' + (xhr.responseJSON ? xhr.responseJSON.message : xhr.statusText) + '</div>');
        });
}

// Display approval patterns
function displayApprovalPatterns(patterns) {
    console.log('Displaying patterns:', patterns); // Debug log
    
    if (!patterns || patterns.length === 0) {
        $('#patternsContent').html(`
            <div class="text-center py-4">
                <i class="bi bi-shield-slash text-muted" style="font-size: 3rem;"></i>
                <h5 class="text-muted mt-3">No Approval Patterns</h5>
                <p class="text-muted">Add patterns to control which queries require approval</p>
            </div>
        `);
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>SQL Pattern</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    patterns.forEach(pattern => {
        const statusBadge = pattern.is_active 
            ? '<span class="badge bg-success">Active</span>' 
            : '<span class="badge bg-secondary">Inactive</span>';
        
        const createdDate = new Date(pattern.created_at).toLocaleDateString();
        const patternName = pattern.name || pattern.pattern || 'Unnamed Pattern';
        
        html += `
            <tr>
                <td><strong>${escapeHtml(patternName)}</strong></td>
                <td><code>${escapeHtml(pattern.pattern)}</code></td>
                <td>${pattern.description ? escapeHtml(pattern.description) : '<em class="text-muted">No description</em>'}</td>
                <td>${statusBadge}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary edit-pattern-btn" data-id="${pattern.id}">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm ${pattern.is_active ? 'btn-outline-warning' : 'btn-outline-success'} toggle-pattern-btn" 
                                data-id="${pattern.id}" data-active="${pattern.is_active}">
                            <i class="bi bi-${pattern.is_active ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-pattern-btn" data-id="${pattern.id}" data-name="${escapeHtml(patternName)}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    $('#patternsContent').html(html);
}

// Show add pattern modal
function showAddPatternModal() {
    $('#patternFormTitle').text('Add New Approval Pattern');
    $('#patternForm')[0].reset();
    $('#patternId').val('');
    $('#patternActive').prop('checked', true);
    $('#patternFormAlert').empty();
    $('#patternFormModal').modal('show');
}

// Show edit pattern modal
function showEditPatternModal(patternId) {
    $('#patternFormTitle').text('Edit Approval Pattern');
    $('#patternFormAlert').empty();
    
    $.get(`/api/approval-patterns/${patternId}`)
        .done(function(response) {
            if (response.success) {
                const pattern = response.data;
                $('#patternId').val(pattern.id);
                $('#patternName').val(pattern.name);
                $('#patternValue').val(pattern.pattern);
                $('#patternDescription').val(pattern.description || '');
                $('#patternActive').prop('checked', pattern.is_active);
                $('#patternFormModal').modal('show');
            } else {
                showAlert('danger', 'Failed to load pattern details');
            }
        })
        .fail(function(xhr) {
            console.error('Load pattern error:', xhr);
            showAlert('danger', 'Failed to load pattern details');
        });
}

// Save pattern (add or edit)
function savePattern() {
    const patternId = $('#patternId').val();
    const formData = {
        name: $('#patternName').val().trim(),
        pattern: $('#patternValue').val().trim().toUpperCase(),
        description: $('#patternDescription').val().trim(),
        is_active: $('#patternActive').is(':checked')
    };

    // Validation
    if (!formData.name || !formData.pattern) {
        showAlert('danger', 'Name and SQL Pattern are required', '#patternFormAlert');
        return;
    }

    $('#savePatternBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Saving...');

    const url = patternId ? `/api/approval-patterns/${patternId}` : '/api/approval-patterns';
    const method = patternId ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        data: JSON.stringify(formData),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                showAlert('success', `Pattern ${patternId ? 'updated' : 'created'} successfully`, '#patternFormAlert');
                
                setTimeout(() => {
                    $('#patternFormModal').modal('hide');
                    loadApprovalPatterns();
                }, 1500);
            } else {
                showAlert('danger', response.message || `Failed to ${patternId ? 'update' : 'create'} pattern`, '#patternFormAlert');
            }
        },
        error: function(xhr) {
            console.error('Save pattern error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : `Failed to ${patternId ? 'update' : 'create'} pattern`;
            showAlert('danger', message, '#patternFormAlert');
        },
        complete: function() {
            $('#savePatternBtn').prop('disabled', false).html('<i class="bi bi-check-circle me-1"></i>Save Pattern');
        }
    });
}

// Toggle pattern active status
function togglePattern(patternId, currentActive) {
    const newStatus = !currentActive;
    const action = newStatus ? 'activate' : 'deactivate';

    $.ajax({
        url: `/api/approval-patterns/${patternId}/toggle`,
        method: 'PATCH',
        success: function(response) {
            if (response.success) {
                showAlert('success', `Pattern ${action}d successfully`);
                loadApprovalPatterns();
            } else {
                showAlert('danger', response.message || `Failed to ${action} pattern`);
            }
        },
        error: function(xhr) {
            console.error('Toggle pattern error:', xhr);
            showAlert('danger', `Failed to ${action} pattern`);
        }
    });
}

// Show delete pattern modal
function showDeletePatternModal(patternId, patternName) {
    $('#deletePatternName').text(patternName);
    $('#deletePatternAlert').empty();
    $('#deletePatternModal').modal('show');
    $('#confirmDeletePatternBtn').data('pattern-id', patternId);
}

// Delete pattern
function deletePattern(patternId) {
    $('#confirmDeletePatternBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Deleting...');

    $.ajax({
        url: `/api/approval-patterns/${patternId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Pattern deleted successfully', '#deletePatternAlert');
                
                setTimeout(() => {
                    $('#deletePatternModal').modal('hide');
                    loadApprovalPatterns();
                }, 1500);
            } else {
                showAlert('danger', response.message || 'Failed to delete pattern', '#deletePatternAlert');
            }
        },
        error: function(xhr) {
            console.error('Delete pattern error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to delete pattern';
            showAlert('danger', message, '#deletePatternAlert');
        },
        complete: function() {
            $('#confirmDeletePatternBtn').prop('disabled', false).html('<i class="bi bi-trash me-1"></i>Delete Pattern');
        }
    });
}

// =================== SYSTEM SETTINGS MANAGEMENT ===================

// Load system settings
function loadSystemSettings() {
    $('#settingsContent').html('<div class="text-center"><div class="spinner-border" role="status"></div></div>');
    
    $.get('/api/system-settings')
        .done(function(response) {
            console.log('System settings response:', response);
            if (response.success) {
                displaySystemSettings(response.data);
            } else {
                $('#settingsContent').html('<div class="alert alert-danger">Failed to load system settings</div>');
            }
        })
        .fail(function(xhr) {
            console.error('Load settings error:', xhr);
            console.error('Response text:', xhr.responseText);
            $('#settingsContent').html('<div class="alert alert-danger">Failed to load system settings: ' + (xhr.responseJSON ? xhr.responseJSON.message : xhr.statusText) + '</div>');
        });
}

// Display system settings
function displaySystemSettings(settings) {
    console.log('Displaying settings:', settings);
    
    if (!settings || settings.length === 0) {
        $('#settingsContent').html(`
            <div class="text-center py-4">
                <i class="bi bi-gear text-muted" style="font-size: 3rem;"></i>
                <h5 class="text-muted mt-3">No System Settings</h5>
                <p class="text-muted">Add settings to configure system behavior</p>
            </div>
        `);
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Setting Key</th>
                        <th>Current Value</th>
                        <th>Description</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    settings.forEach(setting => {
        const createdDate = new Date(setting.created_at).toLocaleDateString();
        const settingKey = setting.setting_key || 'Unknown';
        const settingValue = setting.setting_value || '';
        const description = setting.description || '';
        
        // Special formatting for certain settings
        let displayValue = settingValue;
        if (settingKey === 'select_limit') {
            displayValue = `<span class="badge bg-primary">${settingValue} rows</span>`;
        } else if (settingKey === 'query_timeout') {
            displayValue = `<span class="badge bg-warning">${settingValue} seconds</span>`;
        } else if (settingKey === 'enable_query_logging') {
            displayValue = settingValue === 'true' ? 
                '<span class="badge bg-success">Enabled</span>' : 
                '<span class="badge bg-secondary">Disabled</span>';
        } else {
            displayValue = `<code>${escapeHtml(settingValue)}</code>`;
        }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(settingKey)}</strong></td>
                <td>${displayValue}</td>
                <td>${description ? escapeHtml(description) : '<em class="text-muted">No description</em>'}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary edit-setting-btn" data-key="${escapeHtml(settingKey)}">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-setting-btn" data-key="${escapeHtml(settingKey)}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        
        <div class="mt-4">
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">Important Settings Explained</h6>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <strong>select_limit</strong><br>
                            <small class="text-muted">Maximum rows returned by SELECT queries for non-admin users</small>
                        </div>
                        <div class="col-md-4">
                            <strong>query_timeout</strong><br>
                            <small class="text-muted">Maximum time allowed for query execution</small>
                        </div>
                        <div class="col-md-4">
                            <strong>enable_query_logging</strong><br>
                            <small class="text-muted">Whether to log all executed queries for audit purposes</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#settingsContent').html(html);
}

// Show add setting modal
function showAddSettingModal() {
    $('#settingFormTitle').text('Add New System Setting');
    $('#settingForm')[0].reset();
    $('#settingKey').val('');
    $('#settingKeyInput').prop('disabled', false);
    $('#settingFormAlert').empty();
    $('#settingFormModal').modal('show');
}

// Show edit setting modal
function showEditSettingModal(settingKey) {
    $('#settingFormTitle').text('Edit System Setting');
    $('#settingFormAlert').empty();
    $('#settingKeyInput').prop('disabled', true);
    
    $.get(`/api/system-settings`)
        .done(function(response) {
            if (response.success) {
                const setting = response.data.find(s => s.setting_key === settingKey);
                if (setting) {
                    $('#settingKey').val(setting.setting_key);
                    $('#settingKeyInput').val(setting.setting_key);
                    $('#settingValue').val(setting.setting_value);
                    $('#settingDescription').val(setting.description || '');
                    $('#settingFormModal').modal('show');
                } else {
                    showAlert('danger', 'Setting not found');
                }
            } else {
                showAlert('danger', 'Failed to load setting details');
            }
        })
        .fail(function(xhr) {
            console.error('Load setting error:', xhr);
            showAlert('danger', 'Failed to load setting details');
        });
}

// Save setting (add or edit)
function saveSetting() {
    const isEdit = $('#settingKey').val() !== '';
    const settingKey = isEdit ? $('#settingKey').val() : $('#settingKeyInput').val().trim();
    const formData = {
        setting_key: settingKey,
        setting_value: $('#settingValue').val().trim(),
        description: $('#settingDescription').val().trim()
    };

    // Validation
    if (!formData.setting_key || !formData.setting_value) {
        showAlert('danger', 'Setting key and value are required', '#settingFormAlert');
        return;
    }

    // Special validation for numeric settings
    if (['select_limit', 'query_timeout'].includes(formData.setting_key)) {
        const numValue = parseInt(formData.setting_value);
        if (isNaN(numValue) || numValue <= 0) {
            showAlert('danger', 'This setting requires a positive number', '#settingFormAlert');
            return;
        }
    }

    // Special validation for boolean settings
    if (['enable_query_logging'].includes(formData.setting_key)) {
        if (!['true', 'false'].includes(formData.setting_value.toLowerCase())) {
            showAlert('danger', 'This setting requires "true" or "false"', '#settingFormAlert');
            return;
        }
        formData.setting_value = formData.setting_value.toLowerCase();
    }

    $('#saveSettingBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Saving...');

    const url = isEdit ? `/api/system-settings/${settingKey}` : '/api/system-settings';
    const method = isEdit ? 'PUT' : 'POST';
    const requestData = isEdit ? { value: formData.setting_value } : formData;

    $.ajax({
        url: url,
        method: method,
        data: JSON.stringify(requestData),
        contentType: 'application/json',
        success: function(response) {
            if (response.success) {
                showAlert('success', `Setting ${isEdit ? 'updated' : 'created'} successfully`, '#settingFormAlert');
                
                setTimeout(() => {
                    $('#settingFormModal').modal('hide');
                    loadSystemSettings();
                }, 1500);
            } else {
                showAlert('danger', response.message || `Failed to ${isEdit ? 'update' : 'create'} setting`, '#settingFormAlert');
            }
        },
        error: function(xhr) {
            console.error('Save setting error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : `Failed to ${isEdit ? 'update' : 'create'} setting`;
            showAlert('danger', message, '#settingFormAlert');
        },
        complete: function() {
            $('#saveSettingBtn').prop('disabled', false).html('<i class="bi bi-check-circle me-1"></i>Save Setting');
        }
    });
}

// Show delete setting modal
function showDeleteSettingModal(settingKey) {
    $('#deleteSettingKey').text(settingKey);
    $('#deleteSettingAlert').empty();
    $('#deleteSettingModal').modal('show');
    $('#confirmDeleteSettingBtn').data('setting-key', settingKey);
}

// Delete setting
function deleteSetting(settingKey) {
    $('#confirmDeleteSettingBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Deleting...');

    $.ajax({
        url: `/api/system-settings/${settingKey}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showAlert('success', 'Setting deleted successfully', '#deleteSettingAlert');
                
                setTimeout(() => {
                    $('#deleteSettingModal').modal('hide');
                    loadSystemSettings();
                }, 1500);
            } else {
                showAlert('danger', response.message || 'Failed to delete setting', '#deleteSettingAlert');
            }
        },
        error: function(xhr) {
            console.error('Delete setting error:', xhr);
            const message = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to delete setting';
            showAlert('danger', message, '#deleteSettingAlert');
        },
        complete: function() {
            $('#confirmDeleteSettingBtn').prop('disabled', false).html('<i class="bi bi-trash me-1"></i>Delete Setting');
        }
    });
}
