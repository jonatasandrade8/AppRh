/**
 * RH Enterprise System - Apps Script Backend
 * 
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Paste this code.
 * 4. Run 'setup()' once to create sheets.
 * 5. Deploy > New Deployment > Web App.
 *    - Description: v1
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy Web App URL and paste into 'js/api.js'.
 */

// --- CONFIGURATION ---
const SHEETS = {
  config: ['id', 'nome', 'cnpj', 'logo'],
  employees: ['id', 'nomeCompleto', 'dataNascimento', 'cpf', 'rg', 'nisPIS', 'endereco', 'estado', 'municipio', 'cargo', 'jornadaHHMM', 'loginUser', 'loginPass', 'storeIds', 'dataAdmissao', 'matricula'],
  admins: ['id', 'user', 'pass'],
  registros_ponto: ['id', 'userId', 'timestamp', 'tipo', 'location', 'device'],
  roles: ['id', 'name'],
  holidays: ['id', 'date', 'name', 'type', 'scope'],
  networks: ['id', 'name'],
  stores: ['id', 'name', 'network', 'state', 'city'],
  states: ['id', 'name']
};

// --- MENU & SETUP ---

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RH Enterprise')
    .addItem('Configurar Banco de Dados', 'setup')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  try {
    Object.keys(SHEETS).forEach(name => {
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        // Remove default columns to clean up
        if(sheet.getMaxColumns() > 1) sheet.deleteColumns(2, sheet.getMaxColumns()-1);
        if(sheet.getMaxRows() > 100) sheet.deleteRows(100, sheet.getMaxRows()-100);
      }
      
      // Ensure headers exist
      const requiredHeaders = SHEETS[name];
      const range = sheet.getRange(1, 1, 1, Math.max(requiredHeaders.length, 1));
      const values = range.getValues()[0];
      
      // If headers don't match or are empty, set them
      if(values.join(',') !== requiredHeaders.join(',')) {
        // If sheet has data but headers wrong, we might overwrite, so perform check?
        // For simplicity in this helper, we assume if 1st row is different, we fix it (or it's new).
        // Only if empty though to avoid destroying data? 
        // User asked for "autoware", so let's check emptiness.
        if(!values[0]) {
           sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
        }
      }

      // Create default admin if not exists in 'admins'
      if(name === 'admins' && sheet.getLastRow() <= 1) {
        sheet.appendRow(['admin1', 'admin', '123456']);
      }
    });
    
    ui.alert('Configuração Concluída!', 'Todas as abas foram criadas/verificadas com sucesso.', ui.ButtonSet.OK);
    
  } catch(e) {
    ui.alert('Erro', e.toString(), ui.ButtonSet.OK);
  }
}

// --- API HANDLING ---

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    const params = e.parameter;
    const action = params.action;
    const collection = params.collection;
    const body = e.postData ? JSON.parse(e.postData.contents) : {};

    if (!collection || !SHEETS[collection]) throw new Error("Invalid collection: " + collection);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(collection);
    
    let result = null;

    switch(action) {
      case 'read':
        result = readData(sheet, params);
        break;
      case 'create':
        result = createData(sheet, body, collection);
        break;
      case 'update':
        result = updateData(sheet, body, params.id, collection);
        break;
      case 'delete':
        result = deleteData(sheet, params.id);
        break;
      default:
        throw new Error("Invalid action");
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'success', data: result}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// --- CRUD HELPER FUNCTIONS ---

function readData(sheet, params) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const results = rows.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  // Basic filtering if query params exist (e.g. user=admin)
  // We handle complex queries in client-side for small datasets, 
  // but for 'registros_ponto' filtering by userId is crucial for performance if dataset grows.
  if(params.userId) {
     return results.filter(r => r.userId == params.userId);
  }
  if(params.user && params.pass) { // Login check
     return results.filter(r => r.user == params.user && r.pass == params.pass);
  }
  
  return results;
}

function createData(sheet, data, collection) {
  const headers = sheet.getDataRange().getValues()[0];
  const id = data.id || Utilities.getUuid();
  data.id = id;
  
  // Handle complex objects (arrays/json) by stringifying
  const row = headers.map(h => {
    let val = data[h];
    if(typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val === undefined ? '' : val;
  });
  
  sheet.appendRow(row);
  return data;
}

function updateData(sheet, data, id, collection) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idx = values.findIndex(function(row) { return row[0] === id; }); // Assumes ID is first column
  
  if(idx === -1) throw new Error("Document not found: " + id);
  
  const currentRow = values[idx];
  // Merge current data with valid new data
  const newData = headers.map((h, i) => {
    if(h === 'id') return id;
    let val = data[h];
    if(val === undefined) return currentRow[i]; // Keep existing
    if(typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val;
  });

  sheet.getRange(idx + 1, 1, 1, headers.length).setValues([newData]);
  
  // Return reconstructed object
  let obj = {};
  headers.forEach((h, i) => obj[h] = newData[i]);
  return obj;
}

function deleteData(sheet, id) {
  const values = sheet.getDataRange().getValues();
  const idx = values.findIndex(function(row) { return row[0] === id; });
  
  if(idx === -1) throw new Error("Document not found");
  
  sheet.deleteRow(idx + 1);
  return {id: id, deleted: true};
}

// Special handling for legacy 'artifacts' path if needed? 
// No, we are flattening the structure to simple sheet names.
