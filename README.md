# MapleTools

Tools for a MapleStory party, live at https://dubfighter1337.github.io/Mapletools/.

| Page | What it does |
|---|---|
| **Characters** (`index.html`, start page) | The party roster: add a character by name (NA/EU), with picture, level, class, combat power or HEXA converted, and all Arcane/Sacred/Grand Sacred symbols. Create or join a party here. |
| **HEXA Planner** (`hexa.html`) | Talent-calculator style 6th job planner: what to level next, what it costs, how many days of fragments. |
| **Boss Schedule** (`bosses.html`) | Boss groups with their members, ticked off when done; resets weekly (Thursday 00:00 UTC) or monthly (Black Mage, 1st of the month). |
| **Boss Planner** (`planner.html`) | Per character: the weekly bosses, crystals (14 per character, 180 per world) and mesos. Ticking a schedule group ticks its bosses here. |
| **Dailies** (`dailies.html`) | Per character: daily, weekly and monthly tasks (symbols, Monster Park, Ursus, daily bosses, guild, ...) plus custom ones. |

The menu on every page comes from `TOOLS` in `app/site.js`; add a new tool there. The logo is
`app/mushroom.png`, made from a MapleStory mushroom picture by `tools/make-logo.ps1` (recolours it to the
site's teal).

## Parties (live sharing)

On the Characters page you can **create a party** (you get a code like `ABCDE-FGHJK`) or **join** one with a
code or invite link. Everyone in the party sees the same roster and boss schedule, updated live. Everyone
sees all characters but only edits their own (enforced by the page, not by the server, which is fine for a
friends' group). Joining on a second device: pick "I'm <your name>" when joining.

Without a party, the roster and schedule are kept in your own browser only.

Party data lives in a free Firebase Realtime Database (project `mapletools-69cbe`). The site's Firebase
config is in `app/config.js` (public by design). The database rules are in `database.rules.json`:
anyone who knows a party's code can read and write that party, and nobody can list parties. To change
them, paste the file into Firebase console → Realtime Database → Rules → Publish.

The HEXA Planner is personal: its levels stay in your browser and are not shared with the party.

### Order and layout

Characters are shown strongest first (combat power, then HEXA converted, level, name). **Reorder** in your own
block (Characters, Boss Planner, Dailies) lets you drag your cards into your own order, shared by those three
pages; **Reset to CP order** undoes it. On the Boss Schedule, **Arrange** lets anyone in the party drag the boss
cards into rows (and add empty spots) so the board looks like the party wants; the layout is shared.

### Your devices and backup

The **Your devices** card on the Characters page (`app/devices.js`):
- **Show QR code / Copy link**: a link with your party code and player id (`index.html?device=CODE.PLAYERID`).
  Scanning it on a phone opens MapleTools as you in your party, so phone and PC stay in sync. Without a party,
  **Sync with my phone** first makes a party of your own (with your characters in it) and then shows the code.
- **Copy backup / Restore backup**: your characters with their Boss Planner and Dailies picks, your custom
  tasks and presets as one piece of text (`MT1.` + compressed JSON). Restoring makes them yours in the
  current party or on this device; a character with the same name is replaced instead of duplicated.

## Characters

Type a name, pick NA or EU and press **+**. The character's level, class, world and picture come from
Nexon's official rankings (see "Character lookup" below); then fill in **combat power** (in millions) or
**HEXA converted** (at least one is required) and the symbol levels. ARC and SAC totals are worked out
from the symbol levels (Arcane: 30 at level 1, +10 per level; Sacred and Grand Sacred: 10 per level; Grand
Sacred counts toward SAC), plus the optional **Bonus ARC / Bonus SAC** fields: Force from skills or titles,
or just a total for anyone who doesn't want to fill in every symbol. **↻** on a card updates level, class and
picture from the rankings.

The lines on each card come from `CARD_ROWS` at the top of `app/roster.js`. To add a line, add a row
there and a field in the character form (`index.html`, and `openCharDialog`/`saveChar` in `roster.js`).

## Boss Schedule and Boss Planner

A schedule group has a name, a reset, up to 6 members, and the bosses it clears ("Ticks in the Boss
Planner"). Naming a group after a boss (`Hard Lucid 2`, `HLucid`, `C Gloom`) links that boss. Naming it
after a bundle (`Ctene ...`) lists the bundle's bosses as checkboxes: untick the ones that group doesn't
do (for example Lotus and Damien when those are soloed), or add more with "+ Add a boss".

When a group is ticked in the schedule, those bosses are ticked in the Boss Planner for every member
character, and the group's member count is used as the party size (the crystal's value is split). In the
planner each player picks their characters' bosses (**Bosses** on a card: difficulty, party size, presets,
max 14 weekly) and ticks what they cleared on their own. Ticks clear themselves at the weekly or monthly
reset.

Boss data is in `data/bosses.js`: each boss's difficulties and crystal price (Heroic worlds, from the
in-game price list), the bundles (Ctene) and the ready-made presets. Add a boss or update a price there;
`id`s are saved in party data, so don't rename them. Limits, as in game: 14 weekly-boss crystals per
character, 180 crystals per world (weekly and monthly; daily bosses count too but belong to the dailies tool).

## Dailies

Per character, the tasks done on a reset besides weekly bossing: symbol dailies and weeklies, Monster Park,
Ursus (a counter: 3 runs a day), daily bosses, guild, legion, Threads of Fate, 6th job dungeons. Each player
picks their characters' tasks (**Tasks** on a card: chips per group, "all" skips symbols that are maxed on
the Characters page, presets and "Same as <character>"), and anyone can add a **custom task** with its own
reset, shared with the party. Resets: daily 00:00 UTC, Monday, Wednesday (events), Thursday (weekly) and
the 1st of the month. The task list is `data/tasks.js`.

## Upcoming patches

Patch changes can be prepared in the data and switched on later in `data/patches.js`. v.272
(November 11, 2026) is ready but switched off; set `v272: true` once it's live:
- Easy Cygnus is removed; Normal Cygnus, Hard Hilla and Chaos Pink Bean become daily bosses (they leave the
  Boss Planner and appear under Daily Bosses on the Dailies page).
- Monster Park Extreme is removed; the weekly "Extreme Monster Parker" quest and buying Extreme Momo are added.
- Ursus becomes once a day with 2x mesos all day (the Ursus countdown disappears).

### Character lookup (Nexon rankings relay)

Nexon's ranking API doesn't allow other websites to read it from the browser, so the site asks a tiny relay
that runs as a free Google Apps Script web app (the code is `tools/lookup-relay.gs`). Without it, characters
are added by hand. To set it up:

1. Go to https://script.google.com, click **New project**, name it `MapleTools lookup`.
2. Replace the code in `Code.gs` with the contents of `tools/lookup-relay.gs` and save.
3. **Deploy → New deployment**, gear icon → **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy.
4. Allow the permission Google asks for (the script needs to fetch `nexon.com`).
5. Copy the **Web app URL** (ends in `/exec`), put it in `window.LOOKUP_URL` in `app/config.js`, commit and push.

The relay is live. After changing `tools/lookup-relay.gs`, paste it into the Apps Script project again and use
**Deploy → Manage deployments → ✏️ → Version: New version → Deploy**, so the `/exec` URL stays the same.

## HEXA Planner

Covers all 54 classes.

| Classes | System | Data from |
|---|---|---|
| Hoyoung, Ren | HEXA Matrix | Soushi's HEXA tracker (MapleScouter priority orders, 6 variants) |
| Erel Light, Sia Astelle | Erda Link | Erel / Sia Erda Link trackers ("Vinny Prog" order) |
| The other 50 | HEXA Matrix | [Metumtam](https://github.com/darealshekel/Metumtam) (MapleScouter orders, fragment- and Sol Erda-limited) |

All data lives in this folder (`data/`). The app never talks to Google Sheets or other sites.
Metumtam's orders for 48 classes were calculated with KMS data, so some skills can be ahead of GMS;
those classes say so under their name.

### Using it

Open `hexa.html` (or the HEXA Planner in the menu). Double-clicking the file works too; no install needed.

- **Click** a node: +1 level. **Right-click**: −1. **Shift+click**: max. **Shift+right-click**: back to the start.
- The glowing node is the next upgrade in the selected **Priority** order. **Done: Lv X** marks it done.
- **Looking ahead** lists the next upgrades. Fill in **Fragments owned / per day** to get day estimates.
- **Undo** (or Ctrl+Z) reverts changes. **Reset** puts every node of the class back to its starting level.
- On a phone, tap to level up and use the − button in the **Node** panel to level down.
- The top bar shows up to 15 pinned classes (it scrolls sideways if they don't fit). **All classes ▾** opens the full list (with search); click the
  **★** next to a class to pin or unpin it. Each browser remembers its own pins.

Your levels are saved in the browser you use. Each browser, and each way of opening the page, has its own
saved copy. Use **Backup** to save a file and **Restore** to load it somewhere else.

On first open, each class starts from the levels in your own sheets (`data/my-levels.js`). That file only
exists on your PC; it's left out of git, so the shared GitHub Pages copy starts everyone at zero.

## Publishing (GitHub Pages)

The shared copy is this folder pushed to GitHub with Pages turned on. To publish changes:

```
powershell -ExecutionPolicy Bypass -File tools\bump-version.ps1
git add -A
git commit -m "Update data"
git push
```

`bump-version.ps1` gives the pages' links a new `?v=` stamp. GitHub Pages lets browsers keep files for
10 minutes, and without a new stamp a friend could get the new page with an old cached script, which breaks
it until the cache runs out. GitHub rebuilds the site in a minute or two. Friends' levels are saved in their
own browsers.

## Adding or changing data

### A class sheet got updated, or a new class

Run the importer on the sheet. It works for both tracker types and figures out which one it is:

```
powershell -ExecutionPolicy Bypass -File tools\import-class.ps1 -Source "<sheet link or .xlsx file>" -Id <id> -Name "<Display Name>"
```

- `-Source`: a Google Sheets link (shared as "Anyone with the link") or a downloaded `.xlsx`.
- `-Id`: short lowercase name used for the file, e.g. `kain`. Re-using an id overwrites that class.
- `-Name`: the tab name shown in the app.
- `-SaveLevels`: also copy the levels typed into that sheet as your starting levels.
- `-LevelsFrom "<link>"`: take the levels from another sheet (e.g. your own copy) instead.
- `-Category`: `Warrior`, `Mage`, `Archer`, `Thief` or `Pirate` (groups the class in the class list).

It writes `data/classes/<id>.js` and icons to `data/icons/<id>/`, and adds the class to `data/classes/index.js`.

Examples (these are the commands used to build the current data):

```
# HEXA classes: point at the class's source sheet from Soushi's class list
tools\import-class.ps1 -Source "https://docs.google.com/spreadsheets/d/1dGuPsKLnCYrjYxcCLzUroBUi4TpG4iaLziMM8A0WTxU/edit" -Id hoyoung -Name "Hoyoung" -Category Thief
tools\import-class.ps1 -Source "https://docs.google.com/spreadsheets/d/1pkPMoiICiTzrrMGOyHKO0LiQjAifBBm0LDt5gT4ZT60/edit" -Id ren -Name "Ren" -Category Warrior -SaveLevels -LevelsFrom "<your own copy of the HEXA tracker>"

# Erda Link classes: point at the tracker sheet
tools\import-class.ps1 -Source "https://docs.google.com/spreadsheets/d/1N7pKMWa8cscPa_MtbiqRQNycCR8jbemKoyla1Z-mgto/edit" -Id erel -Name "Erel Light" -Category Warrior -SaveLevels -LevelsFrom "<your own copy of the Erel tracker>"
tools\import-class.ps1 -Source "https://docs.google.com/spreadsheets/d/1dOIP089yZPlNF7AeGT4S-tI8j2Xflu6bAhvY0WGVlhA/edit" -Id sia -Name "Sia Astelle" -Category Mage
```

### All other classes (Metumtam)

The other 50 classes come from Metumtam's `data.js`, which holds MapleScouter's priority orders for every
class (one for when fragments are your bottleneck, one for when Sol Erda is). To refresh them when
Metumtam updates, or to pull in a class it adds:

```
powershell -ExecutionPolicy Bypass -File tools\import-metumtam.ps1
powershell -ExecutionPolicy Bypass -File tools\import-metumtam.ps1 -Only kain,lara
```

It skips `hoyoung`, `ren`, `erel` and `sia` (they have their own sources; change with `-Skip`), downloads
icons it doesn't have yet, adds Sol Janus (not in Metumtam's orders), and treats each HEXA Stat step as
"level that stat node to 20". Third skill nodes only have Korean names in Metumtam; they show as
"Skill III" with the Korean name in the tooltip.

### Icons

Metumtam classes get their icons from Metumtam. For other HEXA classes the icons come from the
MapleStory wiki. After importing one, run:

```
powershell -ExecutionPolicy Bypass -File tools\fetch-icons.ps1 -Id <id>
```

It matches node names against the wiki's `<Class>/Skills` page and prints every match. If it picks the
wrong file or finds nothing, choose one yourself, e.g. `-Map @{ '3b' = 'Skill_HEXA_Heaven_Consuming_Flames.png' }`.
Skills newer than the wiki (Ascent and Skill III nodes) usually aren't there yet; Metumtam's `assets/`
folder has them (that's where Hoyoung's and Ren's came from). Re-importing a class keeps icons that are
already in `data/icons/<id>/`.

For a HEXA tracker copy, only the class selected in its "Choose Class" box is in the file. Select the
class you want before downloading, or use that class's source sheet as above.

### Adding a skill or changing numbers by hand

Each class is one readable file, `data/classes/<id>.js`, with two lists.

**`nodes`**, one line per node:

```js
{ id: "3e", name: "New Mastery Skill", short: "New Skill", group: "mastery", role: "Mastery", max: 30, cost: "mastery" },
```

| Field | Meaning |
|---|---|
| `id` | Unique within the class; orders refer to it. |
| `name`, `short` | Full name and the short label shown under the tile (`short` is optional). |
| `group` | Colour/section: `skill`, `mastery`, `boost`, `common`, `stat`, `shinestone`, `utility`, `special`. |
| `role` | Small label under the name (HEXA), e.g. `Origin`, `Mastery`, `Boost`. |
| `min`, `max` | Level range. `min: 1` for Origin (granted at 6th job). |
| `cost` | HEXA only: a cost table from `data/hexa-costs.js` (`origin`, `skill`, `skill3`, `mastery`, `boost`, `common`, `common3`). |
| `costs` | Or per-level costs: `[[solErda, fragments], ...]`, entry 1 is the cost to reach level 1. |
| `icon` | Optional picture, e.g. `data/icons/ren/3e.png`. Without one the tile shows initials. |
| `x`, `y` | Erda Link only: position on the board (the tracker sheet's column and row numbers). |

**`orders`**, the priority lists. Each step is `["node id", target level]`, optionally with a note:
`["m1", 1, "Goal: Unlock M1"]`. The planner walks a list top to bottom and recommends the first step
you haven't reached yet. Add a node to an order where it should be levelled, or add a whole new order
`{ id: "my-order", name: "My order", steps: [...] }` and pick it in the Priority box.

To add a new class by hand, copy an existing file of the same system, change `id` and `name`, and add
the id to `data/classes/index.js`.

HEXA cost tables are shared by every HEXA class in `data/hexa-costs.js`. If Nexon changes the costs,
edit them there.

## Notes on the data

- HEXA Stat fragment costs depend on rolls, so they're not counted in totals (same as the sheet).
- Erda Link costs come from the order list. Shinestone costs are averages (upgrades can fail), and nodes
  the order never touches (drop rate, meso, Lock, …) show `?` for cost.
- Sol Janus on Erda Link uses Sol Hecate's costs past level 1 (the order only unlocks it).
- Nodes without an icon show initials. Drop a PNG in `data/icons/<class>/` and set `icon` on the node.

## Files

```
index.html            Characters page (start page)
hexa.html             HEXA Planner
bosses.html           Boss Schedule
planner.html          Boss Planner
dailies.html          Dailies
app/site.js, site.css    shared menu, helpers and styles
app/party.js          party data (local, or live via Firebase)
app/bossing.js        boss helpers shared by the schedule and planner (resets, which bosses a group clears)
app/config.js         Firebase config + character lookup relay URL
app/roster.*, hexa.*, bosses.*, planner.*, dailies.*   one script + stylesheet per page
app/devices.js        Characters page: QR code / device link and backup
app/arrange.js        drag and drop for Reorder (characters) and Arrange (schedule layout)
app/tracker.css       character cards shared by the Boss Planner and Dailies
app/mushroom.png      logo and tab icon (tools/make-logo.ps1)
data/bosses.js        bosses, crystal prices, bundles (Ctene) and presets
data/tasks.js         the Dailies task list
data/patches.js       upcoming patch switches (v272)
database.rules.json   Firebase Realtime Database rules
tools/lookup-relay.gs  character lookup relay (Google Apps Script)
data/hexa-costs.js    HEXA cost tables
data/classes/         one file per class + index.js (load order)
data/icons/           node icons
data/my-levels.js     your starting levels from your sheets (local only, not in git)
tools/import-class.ps1  sheet -> data importer
tools/import-metumtam.ps1  Metumtam data.js -> the other 50 classes
tools/fetch-icons.ps1   wiki -> skill icons
tools/lib/              shared helpers (xlsx reader, class file writer)
tools/serve.ps1       optional local web server (http://localhost:8765)
tools/bump-version.ps1  new ?v= stamp on the pages' links (run before publishing)
tools/make-logo.ps1   mushroom picture -> teal logo
tools/fetch-wiki-icons.ps1  wiki -> boss and symbol icons (data/icons/bosses, data/icons/symbols)
```

## Credits

Priority orders: MapleScouter, via Soushi's HEXA Matrix Tracker (Hoyoung, Ren), Metumtam by darealshekel
(other classes) and "Vinny Prog" (Erel Light, Sia Astelle). Icons: MapleStory Wiki, Metumtam and the
tracker sheets. Game names and art belong to Nexon.
