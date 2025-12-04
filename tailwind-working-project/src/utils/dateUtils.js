/**
 * Date utility functions for consistent date formatting across the application
 */

/**
 * Format a date to DD-MM-YYYY format
 * @param {string|Date} date - Date in ISO format (YYYY-MM-DD) or Date object
 * @returns {string} Date in DD-MM-YYYY format
 */
export function formatDateDDMMYYYY(date) {
  if (!date) return '';
  
  let dateObj;
  if (typeof date === 'string') {
    dateObj = new Date(date + 'T00:00:00'); // Add time to avoid timezone issues
  } else {
    dateObj = new Date(date);
  }
  
  if (isNaN(dateObj.getTime())) return '';
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}-${month}-${year}`;
}

/**
 * Format a date to DD/MM/YYYY format
 * @param {string|Date} date - Date in ISO format (YYYY-MM-DD) or Date object
 * @returns {string} Date in DD/MM/YYYY format
 */
export function formatDateDDMMYYYYSlash(date) {
  if (!date) return '';
  
  let dateObj;
  if (typeof date === 'string') {
    dateObj = new Date(date + 'T00:00:00'); // Add time to avoid timezone issues
  } else {
    dateObj = new Date(date);
  }
  
  if (isNaN(dateObj.getTime())) return '';
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Convert DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD for form inputs
 * @param {string} dateStr - Date in DD-MM-YYYY or DD/MM/YYYY format
 * @returns {string} Date in YYYY-MM-DD format for HTML date inputs
 */
export function convertToISODate(dateStr) {
  if (!dateStr) return '';
  
  // Handle DD-MM-YYYY or DD/MM/YYYY formats
  const parts = dateStr.split(/[-\/]/);
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum > 1900) {
      return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }
  
  return dateStr; // Return as-is if can't convert
}

/**
 * Get today's date in YYYY-MM-DD format for form inputs
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayISO() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Get today's date in DD-MM-YYYY format for display
 * @returns {string} Today's date in DD-MM-YYYY format
 */
export function getTodayDDMMYYYY() {
  return formatDateDDMMYYYY(new Date());
}