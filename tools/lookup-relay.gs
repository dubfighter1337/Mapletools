// MapleTools character lookup relay (Google Apps Script).
// Browsers may not read Nexon's ranking API from another website, so this tiny web app fetches it
// for the site and passes on only what the roster needs. Setup steps: README.md, "Character lookup".
//
// GET <web app url>?region=eu&name=RexxErel
//   -> { name, level, job, worldID, image }   or   { error: "..." }

function doGet(e) {
  var p = (e && e.parameter) || {};
  var name = String(p.name || '').trim();
  var region = p.region === 'na' ? 'na' : 'eu';
  if (!/^[A-Za-z0-9]{2,13}$/.test(name)) return json({ error: 'That is not a valid character name.' });

  var url = 'https://www.nexon.com/api/maplestory/no-auth/ranking/v2/' + region +
      '?type=overall&id=weekly&reboot_index=0&page_index=1&character_name=' + encodeURIComponent(name);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return json({ error: 'Nexon rankings answered ' + res.getResponseCode() + '. Try again later.' });

  var ranks = (JSON.parse(res.getContentText()).ranks) || [];
  var r = ranks.filter(function (x) { return String(x.characterName).toLowerCase() === name.toLowerCase(); })[0];
  if (!r) return json({ error: name + ' was not found in the ' + region.toUpperCase() + ' rankings.' });
  return json({ name: r.characterName, level: r.level, job: r.jobName, worldID: r.worldID, image: r.characterImgURL });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
