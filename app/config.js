// Site configuration. Both values are public by design.

// Firebase project for party codes (live shared roster + boss schedule). Access is controlled by the
// database rules (database.rules.json). Set to null to run without party sync.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyANhvCMOvtguAu9eeJLxmbsGLu6bDLD2To',
  authDomain: 'mapletools-69cbe.firebaseapp.com',
  databaseURL: 'https://mapletools-69cbe-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mapletools-69cbe',
  storageBucket: 'mapletools-69cbe.firebasestorage.app',
  messagingSenderId: '1007342786396',
  appId: '1:1007342786396:web:aeff163ef92fa5d447d399',
};

// Character lookup relay: tools/lookup-relay.gs deployed as a Google Apps Script web app (its /exec URL).
// It reads Nexon's official rankings for the roster's "add by name". null = characters are added by hand.
window.LOOKUP_URL = null;
