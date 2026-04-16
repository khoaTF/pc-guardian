const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.PCG_DATA_DIR || path.join(__dirname, '..', '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read JSON data from a file in the data directory
 * @param {string} filename - The JSON filename (e.g., 'settings.json')
 * @param {*} defaultValue - Default value if file doesn't exist
 * @returns {*} Parsed JSON data
 */
function readData(filename, defaultValue = null) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== null) {
        writeData(filename, defaultValue);
      }
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage] Error reading ${filename}:`, err.message);
    return defaultValue;
  }
}

/**
 * Write JSON data to a file in the data directory
 * @param {string} filename - The JSON filename
 * @param {*} data - Data to write
 */
function writeData(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Storage] Error writing ${filename}:`, err.message);
  }
}

/**
 * Append an item to a JSON array file
 * @param {string} filename - The JSON filename
 * @param {*} item - Item to append
 * @param {number} maxItems - Maximum items to keep (0 = unlimited)
 */
function appendToArray(filename, item, maxItems = 0) {
  const data = readData(filename, []);
  data.unshift(item); // Add to beginning
  if (maxItems > 0 && data.length > maxItems) {
    data.length = maxItems; // Trim to max
  }
  writeData(filename, data);
}

module.exports = { readData, writeData, appendToArray, DATA_DIR };
