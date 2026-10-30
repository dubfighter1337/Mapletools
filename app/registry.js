// Global registry that the files in data/ write into. Loaded before any data file.
window.MapleData = {
  classFiles: [],     // ids to load, set by data/classes/index.js
  classes: [],        // filled by MapleData.addClass() in each class file
  hexaCosts: {},      // data/hexa-costs.js
  startingLevels: {}, // data/my-levels.js (optional)
  startingOrders: {}, // data/my-levels.js (optional): priority order id picked in your sheet
  addClass(def) { this.classes.push(def); },
};
