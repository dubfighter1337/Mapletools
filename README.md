# 6th Job Planner

A talent-calculator style planner for MapleStory 6th job: click nodes up and down, and it tells you
what to level next, what it costs, and how many days of fragments that is. Covers all 54 classes.

| Classes | System | Data from |
|---|---|---|
| Hoyoung, Ren | HEXA Matrix | Soushi's HEXA tracker (MapleScouter priority orders, 6 variants) |
| Erel Light, Sia Astelle | Erda Link | Erel / Sia Erda Link trackers ("Vinny Prog" order) |
| The other 50 | HEXA Matrix | [Metumtam](https://github.com/darealshekel/Metumtam) (MapleScouter orders, fragment- and Sol Erda-limited) |

All data lives in this folder (`data/`). The app never talks to Google Sheets or other sites.
Metumtam's orders for 48 classes were calculated with KMS data, so some skills can be ahead of GMS;
those classes say so under their name.

## Using it

Open `index.html` in your browser (double-click it). No install and no internet connection needed.

- **Click** a node: +1 level. **Right-click**: −1. **Shift+click**: max. **Shift+right-click**: back to the start.
- The glowing node is the next upgrade in the selected **Priority** order. **Done: Lv X** marks it done.
- **Looking ahead** lists the next upgrades. Fill in **Fragments owned / per day** to get day estimates.
- **Undo** (or Ctrl+Z) reverts changes. **Reset** puts every node of the class back to its starting level.
- On a phone, tap to level up and use the − button in the **Node** panel to level down.
- The top bar shows up to 5 pinned classes. **All classes ▾** opens the full list (with search); click the
  **★** next to a class to pin or unpin it. Each browser remembers its own pins.

Your levels are saved in the browser you use. Each browser, and each way of opening the page, has its own
saved copy. Use **Backup** to save a file and **Restore** to load it somewhere else.

On first open, each class starts from the levels in your own sheets (`data/my-levels.js`). That file only
exists on your PC; it's left out of git, so the shared GitHub Pages copy starts everyone at zero.

## Sharing (GitHub Pages)

The shared copy is this folder pushed to GitHub with Pages turned on. To publish changes:

```
git add -A
git commit -m "Update data"
git push
```

GitHub rebuilds the site in a minute or two. Friends' levels are saved in their own browsers.

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
index.html            the app
app/                  app code (registry.js, app.js, style.css)
data/hexa-costs.js    HEXA cost tables
data/classes/         one file per class + index.js (load order)
data/icons/           node icons
data/my-levels.js     your starting levels from your sheets (local only, not in git)
tools/import-class.ps1  sheet -> data importer
tools/import-metumtam.ps1  Metumtam data.js -> the other 50 classes
tools/fetch-icons.ps1   wiki -> skill icons
tools/lib/              shared helpers (xlsx reader, class file writer)
tools/serve.ps1       optional local web server (http://localhost:8765)
```

## Credits

Priority orders: MapleScouter, via Soushi's HEXA Matrix Tracker (Hoyoung, Ren), Metumtam by darealshekel
(other classes) and "Vinny Prog" (Erel Light, Sia Astelle). Icons: MapleStory Wiki, Metumtam and the
tracker sheets. Game names and art belong to Nexon.
