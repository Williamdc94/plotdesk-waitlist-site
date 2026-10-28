/**
 * Google Apps Script: receives signups from the Vercel function and adds a row to this sheet.
 * Setup is in README.md. Paste this into Extensions > Apps Script in a new Google Sheet.
 */
var HEADERS = ['Signed up (UTC)', 'I am', 'Name', 'Email', 'Phone', 'City'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('WAITLIST_SECRET');
    if (!secret || data.secret !== secret) return out_({ ok: false, error: 'forbidden' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
      }
      // Skip duplicates (same email) but still report success so the person sees "You're on the list".
      var emails = sheet.getLastRow() > 1 ? sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues() : [];
      var email = String(data.email || '').toLowerCase();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).toLowerCase() === email) return out_({ ok: true, duplicate: true });
      }
      sheet.appendRow([data.createdAt, data.role, data.name, data.email, data.phone, data.city]);
    } finally {
      lock.releaseLock();
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
