/**
 * Google Apps Script Web App - Backend Logic
 * Provides services for retrieving, inspecting, and viewing HTML files stored in Google Drive.
 */

/**
 * Serve the webapp frontend (index.html).
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Drive HTML Claude Viewer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Scans the user's Google Drive for all HTML files.
 * Returns an array of file metadata.
 * 
 * @return {Object} Result object containing success status and file list or error.
 */
function getHtmlFiles() {
  try {
    const files = [];
    // Search query: mimeType is HTML or the title contains '.html', and is not in trash
    const query = "(mimeType = 'text/html' or title contains '.html') and trashed = false";
    const fileIterator = DriveApp.searchFiles(query);
    
    while (fileIterator.hasNext()) {
      const file = fileIterator.next();
      const name = file.getName();
      const mime = file.getMimeType();
      
      // Secondary filter: If the file is not text/html and doesn't end with .html, skip it
      if (mime !== 'text/html' && !name.toLowerCase().endsWith('.html')) {
        continue;
      }
      
      files.push({
        id: file.getId(),
        name: name,
        size: file.getSize(), // bytes
        created: file.getDateCreated().getTime(), // timestamp
        updated: file.getLastUpdated().getTime(), // timestamp
        url: file.getUrl()
      });
    }
    
    // Sort files alphabetically by name (case-insensitive)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    
    return {
      success: true,
      files: files
    };
  } catch (error) {
    console.error('Error fetching HTML files from Drive:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Retrieves the raw text content of an HTML file from Google Drive by its file ID.
 * 
 * @param {string} fileId The unique ID of the file in Google Drive.
 * @return {Object} Result object containing success status and content or error.
 */
function getFileContent(fileId) {
  try {
    if (!fileId) {
      throw new Error('No file ID provided.');
    }
    
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString('UTF-8');
    
    return {
      success: true,
      content: content,
      name: file.getName(),
      size: file.getSize(),
      updated: file.getLastUpdated().getTime()
    };
  } catch (error) {
    console.error('Error fetching file content for ID ' + fileId + ':', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}
