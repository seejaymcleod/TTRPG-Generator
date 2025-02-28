// Debug utilities for TTRPG Generator

// Global debug flag - set to true to enable debug panel
const DEBUG_MODE = true;

// Initialize the debug panel
function initDebugPanel() {
  if (!DEBUG_MODE) return;
  
  // Create debug panel if it doesn't exist
  if (!document.getElementById('debug-panel')) {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      width: 400px;
      max-height: 300px;
      background-color: rgba(0,0,0,0.8);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 5px;
      z-index: 10000;
      overflow-y: auto;
      display: ${DEBUG_MODE ? 'block' : 'none'};
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      border-bottom: 1px solid #00ff00;
      padding-bottom: 5px;
    `;
    
    const title = document.createElement('span');
    title.textContent = 'TTRPG Generator Debug';
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
      background: none;
      border: 1px solid #00ff00;
      color: #00ff00;
      cursor: pointer;
      padding: 2px 5px;
    `;
    clearBtn.onclick = () => clearDebugPanel();
    
    header.appendChild(title);
    header.appendChild(clearBtn);
    
    const content = document.createElement('div');
    content.id = 'debug-content';
    
    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
  }
  
  logDebug('Debug panel initialized');
}

// Log a debug message to both console and debug panel
function logDebug(message, data = null) {
  if (!DEBUG_MODE) return;
  
  const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
  const msgWithTimestamp = `[${timestamp}] ${message}`;
  
  // Log to console
  console.log(msgWithTimestamp);
  if (data) console.log(data);
  
  // Log to debug panel if it exists
  const panel = document.getElementById('debug-content');
  if (!panel) return;
  
  const logItem = document.createElement('div');
  logItem.style.marginBottom = '5px';
  
  const msgDiv = document.createElement('div');
  msgDiv.textContent = msgWithTimestamp;
  logItem.appendChild(msgDiv);
  
  // Add data if provided
  if (data) {
    const dataDiv = document.createElement('div');
    dataDiv.style.paddingLeft = '15px';
    dataDiv.style.color = '#88ff88';
    
    // Format the data
    let dataStr;
    try {
      dataStr = typeof data === 'object' ? 
        JSON.stringify(data, null, 2).substring(0, 200) : 
        String(data);
      
      if (typeof data === 'object' && data !== null && JSON.stringify(data).length > 200) {
        dataStr += '... (truncated)';
      }
    } catch (e) {
      dataStr = '[Complex Object]';
    }
    
    dataDiv.textContent = dataStr;
    logItem.appendChild(dataDiv);
  }
  
  panel.appendChild(logItem);
  
  // Auto-scroll to bottom
  panel.scrollTop = panel.scrollHeight;
  
  // Limit number of messages
  while (panel.children.length > 50) {
    panel.removeChild(panel.firstChild);
  }
}

// Clear the debug panel
function clearDebugPanel() {
  const panel = document.getElementById('debug-content');
  if (panel) {
    panel.innerHTML = '';
    log