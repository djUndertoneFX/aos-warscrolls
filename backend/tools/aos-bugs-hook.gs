/**
 * AoS Warscrolls — bug report hook (Google Apps Script web app).
 *
 * The site's server POSTs each "File Bug" report here (server.js
 * syncBugReports). This adds it to the TOP of the "AoS Warscrolls Bugs" Google
 * Doc (created in your Drive on the first report; its id is kept in Script
 * Properties as DOC_ID) and, when the server asks (first 5 reports of the day),
 * emails it to you.
 *
 * Setup (once):
 *  1. script.google.com → New project, name it "AoS Warscrolls Bugs Hook",
 *     paste this file in, and set SECRET below to a random string.
 *  2. Run testHook once and approve the permissions (Docs, Drive, Gmail send).
 *  3. Deploy → New deployment → Web app: Execute as "Me", Who has access
 *     "Anyone". Copy the web app URL.
 *  4. On Railway (service aos-warscrolls): BUG_HOOK_URL = that URL,
 *     BUG_HOOK_SECRET = the SECRET.
 */
var SECRET = 'CHANGE-ME';
var DOC_NAME = 'AoS Warscrolls Bugs';

function getDoc_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DOC_ID');
  if (id) { try { return DocumentApp.openById(id); } catch (e) {} }
  var doc = DocumentApp.create(DOC_NAME);
  doc.getBody().setText('AoS Warscrolls bug reports — newest first.');
  props.setProperty('DOC_ID', doc.getId());
  return doc;
}

function addToDoc_(data) {
  var body = getDoc_().getBody();
  // Insert after the intro line so the newest report is always on top.
  var at = 1;
  var title = body.insertParagraph(at++, data.subject || ('Bug #' + data.id));
  title.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  String(data.text || '').split('\n').forEach(function (line) {
    body.insertParagraph(at++, line).setHeading(DocumentApp.ParagraphHeading.NORMAL);
  });
  body.insertHorizontalRule(at++);
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) {}
  if (data.secret !== SECRET) return json_({ ok: false, error: 'bad secret' });
  addToDoc_(data);
  var emailed = false;
  if (data.email) {
    var doc = getDoc_();
    MailApp.sendEmail(data.email, data.subject || 'AoS Warscrolls bug',
      String(data.text || '') + '\n\nAll bugs: ' + doc.getUrl());
    emailed = true;
  }
  return json_({ ok: true, emailed: emailed });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function testHook() {
  addToDoc_({ id: 0, subject: 'Test entry (testHook)', text: 'If you can read this, the hook can write to the doc.' });
  Logger.log(getDoc_().getUrl());
}
