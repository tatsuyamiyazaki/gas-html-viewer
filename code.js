/**
 * Google Apps Script Web App - Backend Logic
 * Provides services for browsing Google Drive folder by folder and viewing HTML files.
 *
 * Requires the Drive API (v3) Advanced Service, enabled in appsscript.json.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const HTML_MIME = 'text/html';
const HTML_EXTENSION = '.html';
const FILE_FIELDS = 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, driveId)';
const FILES_PAGE_SIZE = 200;
const DRIVES_PAGE_SIZE = 100;
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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
 * Lists the direct children (sub-folders and HTML files) of a location.
 *
 * @param {Object} location One of:
 *   { kind: 'root' }                     - virtual top level (My Drive / Shared drives / Shared with me)
 *   { kind: 'myDrive' }                  - root of the user's My Drive
 *   { kind: 'sharedDrives' }             - list of shared drives the user can access
 *   { kind: 'sharedWithMe' }             - items shared directly with the user
 *   { kind: 'folder', id: string }       - a folder or shared drive root by ID
 * @return {Object} { success, items } or { success: false, error }
 */
function listChildren(location) {
  try {
    const loc = location || { kind: 'root' };
    const items = listItemsForLocation(loc);
    return { success: true, items: sortItems(items) };
  } catch (error) {
    console.error('Error listing children for ' + JSON.stringify(location) + ':', error);
    return { success: false, error: error.toString() };
  }
}

function listItemsForLocation(loc) {
  switch (loc.kind) {
    case 'root':
      return buildRootItems();
    case 'myDrive':
      return listFiles("'root' in parents and trashed = false", {});
    case 'sharedDrives':
      return listSharedDrives();
    case 'sharedWithMe':
      return listFiles('sharedWithMe = true and trashed = false', {});
    case 'folder':
      assertValidId(loc.id);
      return listFiles("'" + loc.id + "' in parents and trashed = false", { corpora: 'allDrives' });
    default:
      throw new Error('Unknown location kind: ' + loc.kind);
  }
}

function buildRootItems() {
  return [
    { type: 'folder', name: 'マイドライブ', location: { kind: 'myDrive' } },
    { type: 'folder', name: '共有ドライブ', location: { kind: 'sharedDrives' } },
    { type: 'folder', name: '共有アイテム', location: { kind: 'sharedWithMe' } }
  ];
}

function listSharedDrives() {
  const drives = [];
  let pageToken = null;
  do {
    const response = Drive.Drives.list({ pageSize: DRIVES_PAGE_SIZE, pageToken: pageToken });
    (response.drives || []).forEach(drive => {
      drives.push({ type: 'folder', name: drive.name, location: { kind: 'folder', id: drive.id } });
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return drives;
}

/**
 * Runs a Drive files.list query restricted to folders and HTML files, following pagination.
 */
function listFiles(baseQuery, extraArgs) {
  const typeFilter = "(mimeType = '" + FOLDER_MIME + "' or mimeType = '" + HTML_MIME + "' or name contains '" + HTML_EXTENSION + "')";
  const items = [];
  let pageToken = null;
  do {
    const args = Object.assign({
      q: baseQuery + ' and ' + typeFilter,
      fields: FILE_FIELDS,
      pageSize: FILES_PAGE_SIZE,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    }, extraArgs);
    const response = Drive.Files.list(args);
    (response.files || []).forEach(file => {
      const item = toItem(file);
      if (item) items.push(item);
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return items;
}

function toItem(file) {
  if (file.mimeType === FOLDER_MIME) {
    return { type: 'folder', name: file.name, location: { kind: 'folder', id: file.id } };
  }
  const isHtml = file.mimeType === HTML_MIME || file.name.toLowerCase().endsWith(HTML_EXTENSION);
  if (!isHtml) return null;
  return {
    type: 'file',
    id: file.id,
    name: file.name,
    size: Number(file.size) || 0,
    updated: file.modifiedTime ? new Date(file.modifiedTime).getTime() : null,
    url: file.webViewLink
  };
}

/**
 * Folders first, then files; each group sorted by name (case-insensitive).
 */
function sortItems(items) {
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const folders = items.filter(item => item.type === 'folder').sort(byName);
  const files = items.filter(item => item.type === 'file').sort(byName);
  return folders.concat(files);
}

function assertValidId(id) {
  if (!id || !DRIVE_ID_PATTERN.test(id)) {
    throw new Error('Invalid folder ID.');
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
