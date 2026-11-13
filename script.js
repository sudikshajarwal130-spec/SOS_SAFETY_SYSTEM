
/* =========================================
   SOS GUARD - COMPLETE UPDATED JAVASCRIPT
   Firebase Compat SDK
========================================= */

/* =========================================
   FIREBASE CONFIGURATION
========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyB4C6UHLBfNkE6s-GlWDRi8t27iNS4m1yw",
    authDomain: "sos-guard.firebaseapp.com",
    databaseURL: "https://sos-guard-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sos-guard",
    storageBucket: "sos-guard.firebasestorage.app",
    messagingSenderId: "262503933457",
    appId: "1:262503933457:web:c3c52cc1d533e614d473b0",
    measurementId: "G-46ZTN6N0JQ"
};

/* =========================================
   GITHUB PAGES URL
========================================= */

const GITHUB_PAGES_URL =
    "https://sudikshajarwal130-spec.github.io/SOS_SAFETY_SYSTEM/";

/* =========================================
   FIREBASE INITIALIZATION
========================================= */

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();

/* =========================================
   GLOBAL VARIABLES
========================================= */

let currentUser = null;
let currentPosition = null;
let watchId = null;

let userMap = null;
let userMarker = null;

let viewerMap = null;
let viewerMarker = null;

let isSOSActive = false;
let isAlarmMuted = false;

let audioContext = null;
let alarmInterval = null;

let activeTrackingId = null;

let viewerRef = null;
let viewerListener = null;

let shareBusy = false;

// ESP32 Web Bluetooth
const BLE_SERVICE_UUID = "12345678-1234-1234-1234-123456789000";
const BLE_CHARACTERISTIC_UUID = "12345678-1234-1234-1234-123456789001";
let bleDevice = null;
let bleServer = null;
let bleCharacteristic = null;
let hardwareConnected = false;
let hardwarePosition = null;


const $ = id => document.getElementById(id);

/* =========================================
   COMMON FUNCTIONS
========================================= */

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}

function show(id) {
    if ($(id)) {
        $(id).classList.remove("hidden");
    }
}

function hide(id) {
    if ($(id)) {
        $(id).classList.add("hidden");
    }
}

function setStatus(message) {
    setText("systemStatus", message);
}

function logActivity(message) {
    const log = $("activityLog");

    if (!log) return;

    const empty = log.querySelector(".empty-log");

    if (empty) {
        empty.remove();
    }

    const item = document.createElement("div");

    item.className = "activity-item";

    item.textContent =
        `${new Date().toLocaleTimeString()} — ${message}`;

    log.prepend(item);
}

/* =========================================
   CLOCK & INTERNET
========================================= */

function updateClock() {
    setText(
        "headerClock",
        new Date().toLocaleTimeString()
    );
}

setInterval(updateClock, 1000);

updateClock();

function updateInternetStatus() {
    const online = navigator.onLine;

    setText(
        "internetState",
        online ? "ONLINE" : "OFFLINE"
    );

    setText(
        "internetPermissionStatus",
        online ? "Internet available" : "Internet unavailable"
    );
}

window.addEventListener("online", updateInternetStatus);
window.addEventListener("offline", updateInternetStatus);

updateInternetStatus();

/* =========================================
   TRACKING UTILITIES
========================================= */

function randomTrackingId() {
    const bytes = new Uint8Array(24);

    crypto.getRandomValues(bytes);

    return Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function isViewerRoute() {
    const params = new URLSearchParams(
        window.location.search
    );

    return (
        params.get("view") === "track" &&
        !!params.get("id")
    );
}

/* FIXED: ALWAYS GENERATE GITHUB PAGES URL */

function buildTrackingURL(id) {
    const url = new URL(GITHUB_PAGES_URL);

    url.searchParams.set("view", "track");
    url.searchParams.set("id", id);

    return url.toString();
}

/* =========================================
   GOOGLE SIGN-IN
========================================= */

async function googleSignIn() {
    try {
        setText(
            "loginMessage",
            "Opening Google Sign-In..."
        );

        const provider =
            new firebase.auth.GoogleAuthProvider();

        provider.setCustomParameters({
            prompt: "select_account"
        });

        await auth.signInWithPopup(provider);

    } catch (error) {
        console.error("Google sign-in error:", error);

        setText(
            "loginMessage",
            error.message || "Google sign-in failed."
        );
    }
}

async function googleSignOut() {
    try {
        stopLocationTracking();
        stopAlarmCompletely();
        stopViewerListener();

        await auth.signOut();

        currentPosition = null;
        isSOSActive = false;
        activeTrackingId = null;

        setText("alertState", "INACTIVE");
        setText("alertStatus", "No active alert");

        logActivity("User signed out.");

    } catch (error) {
        console.error(error);

        setStatus("Sign-out failed.");
    }
}

/* =========================================
   AUTH STATE
========================================= */

function showSignedOutPage() {
    hide("accountSection");
    show("loginSection");

    if (isViewerRoute()) {
        hide("userView");
        show("viewerView");

        setText(
            "viewerState",
            "SIGN IN REQUIRED"
        );

        setText(
            "viewerMessage",
            "Sign in using the Google account authorized by the owner."
        );

    } else {
        hide("userView");
        hide("viewerView");
    }
}

auth.onAuthStateChanged(async user => {
    currentUser = user;

    if (!user) {
        stopLocationTracking();
        stopViewerListener();

        showSignedOutPage();

        setText("authStatus", "Not signed in");
        setText("cloudState", "Disconnected");
        setText("cloudPermissionStatus", "Sign in required");
        setText("locationState", "Not signed in");

        setStatus("Please sign in with Google.");

        return;
    }

    hide("loginSection");
    show("accountSection");

    setText(
        "loggedInUser",
        user.displayName || user.email || "User"
    );

    setText("loggedInUID", user.uid);
    setText("authStatus", "Authenticated");
    setText("cloudState", "Connected");
    setText("cloudPermissionStatus", "Signed in");

    /* VIEWER MODE */

    if (isViewerRoute()) {
        hide("userView");
        show("viewerView");

        await startViewer();

        return;
    }

    /* OWNER MODE */

    hide("viewerView");
    show("userView");

    try {
        await database
            .ref("users/" + user.uid + "/profile")
            .update({
                name: user.displayName || "",
                email: (user.email || "").toLowerCase(),
                updatedAt:
                    firebase.database.ServerValue.TIMESTAMP
            });

        setText("cloudState", "Synced");
        setText("locationCloudState", "Synced");

    } catch (error) {
        console.error("Profile save failed:", error);

        setText("cloudState", "Sync failed");
        setText("locationCloudState", "Sync failed");
    }

    setStatus("Account connected.");

    logActivity("Account authenticated.");

    initializeUserMap();

    await checkPermissions();

    requestLocation();

    loadActiveShare();
});

/* =========================================
   MAP FUNCTIONS
========================================= */

function initializeMap(containerId) {
    if (!$(containerId) || !window.L) {
        return null;
    }

    const map = L.map(containerId).setView(
        [26.9124, 75.7873],
        13
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    setTimeout(() => {
        map.invalidateSize();
    }, 300);

    return map;
}

function initializeUserMap() {
    if (userMap) return;

    userMap = initializeMap("userMap");
}

function updateMapMarker(map, marker, position, emoji) {
    if (!map || !position?.coords) {
        return marker;
    }

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    const icon = L.divIcon({
        className: "person-marker",
        html: `<div class="person-marker-inner">${emoji}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    if (!marker) {
        marker = L.marker(
            [lat, lon],
            { icon }
        ).addTo(map);

    } else {
        marker.setLatLng([lat, lon]);
    }

    map.setView([lat, lon], 16);

    return marker;
}

/* =========================================
   GPS LOCATION
========================================= */

function handleLocationError(error) {
    console.error("GPS error:", error);

    let message = "Location unavailable";
    let permissionMessage = "Location error";

    switch (error.code) {
        case 1:
            message = "Location permission denied";
            permissionMessage = "Permission denied";
            break;

        case 2:
            message = "GPS position unavailable";
            permissionMessage = "Position unavailable";
            break;

        case 3:
            message = "GPS request timed out";
            permissionMessage = "Request timed out";
            break;
    }

    setText("locationState", message);
    setText("locationPermissionStatus", permissionMessage);
    setText("permissionLocationStatus", permissionMessage);
    setText("trackingStatus", "GPS not updating");

    setStatus(message);
}

function requestLocation() {
    if (!currentUser) {
        setText("locationState", "Sign in required");
        return;
    }

    if (!navigator.geolocation) {
        setText("locationState", "GPS not supported");
        setText("locationPermissionStatus", "Not supported");
        setText("permissionLocationStatus", "Not supported");

        return;
    }

    if (!window.isSecureContext) {
        setText(
            "locationState",
            "Secure connection required"
        );

        setText("locationPermissionStatus", "HTTPS required");
        setText("permissionLocationStatus", "HTTPS required");

        setStatus("Open website using HTTPS or localhost.");

        return;
    }

    setText("locationState", "Requesting GPS...");
    setText("locationPermissionStatus", "Requesting permission...");

    navigator.geolocation.getCurrentPosition(
        position => {
            currentPosition = position;

            updateLocationUI(position);

            startLocationTracking();

            publishLocation();
        },
        handleLocationError,
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
        }
    );
}

function startLocationTracking() {
    if (
        !navigator.geolocation ||
        watchId !== null
    ) {
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        position => {
            currentPosition = position;

            updateLocationUI(position);

            publishLocation();
        },
        handleLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 30000
        }
    );
}

function stopLocationTracking() {
    if (
        watchId !== null &&
        navigator.geolocation
    ) {
        navigator.geolocation.clearWatch(watchId);
    }

    watchId = null;

    setText("trackingStatus", "Tracking stopped");
}

function updateLocationUI(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy);

    setText("latitude", lat.toFixed(6));
    setText("longitude", lon.toFixed(6));
    setText("accuracy", accuracy + " metres");

    setText(
        "lastUpdated",
        new Date(position.timestamp).toLocaleString()
    );

    setText("locationState", "Location available");
    setText("locationPermissionStatus", "Permission granted");
    setText("permissionLocationStatus", "Permission granted");
    setText("trackingStatus", "Live GPS tracking active");
    setText("trackingDot", "●");

    if ($("openMapLink")) {
        $("openMapLink").href =
            `https://www.google.com/maps?q=${lat},${lon}`;
    }

    initializeUserMap();

    if (userMap) {
        userMarker = updateMapMarker(
            userMap,
            userMarker,
            position,
            "🚶"
        );
    }

    updateWhatsAppLinks();
}

/* =========================================
   FIREBASE LOCATION SYNC
========================================= */

async function publishLocation() {
    if (!currentUser || !currentPosition) {
        return;
    }

    if (!navigator.onLine) {
        setText("cloudState", "Offline");
        return;
    }

    const p = currentPosition;

    const locationData = {
        active: isSOSActive,
        updatedAt:
            firebase.database.ServerValue.TIMESTAMP,
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy
    };

    try {
        await database
            .ref("users/" + currentUser.uid + "/location")
            .update(locationData);

        if (activeTrackingId) {
            await database
                .ref(
                    "trackingSessions/" +
                    activeTrackingId +
                    "/location"
                )
                .update(locationData);
        }

        setText("cloudState", "Synced");

    } catch (error) {
        console.error("Cloud update failed:", error);

        setText("cloudState", "Sync failed");
    }
}

/* =========================================
   SOS SOUND
========================================= */

async function startAlarm() {
    try {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            setText(
                "alertStatus",
                "SOS active — sound unavailable"
            );

            return;
        }

        if (
            !audioContext ||
            audioContext.state === "closed"
        ) {
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        if (!isSOSActive || isAlarmMuted) {
            return;
        }

        function beep() {
            if (
                !audioContext ||
                audioContext.state !== "running" ||
                !isSOSActive ||
                isAlarmMuted
            ) {
                return;
            }

            const oscillator =
                audioContext.createOscillator();

            const gain =
                audioContext.createGain();

            oscillator.type = "sawtooth";
            oscillator.frequency.value = 850;

            gain.gain.setValueAtTime(
                0.12,
                audioContext.currentTime
            );

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start();

            oscillator.stop(
                audioContext.currentTime + 0.35
            );
        }

        if (alarmInterval) {
            clearInterval(alarmInterval);
        }

        beep();

        alarmInterval = setInterval(beep, 650);

        setText("alertStatus", "SOS ALERT ACTIVE");

    } catch (error) {
        console.error("Audio error:", error);

        setText(
            "alertStatus",
            "SOS active — sound unavailable"
        );
    }
}

function silenceAlarm() {
    isAlarmMuted = true;

    if (alarmInterval) {
        clearInterval(alarmInterval);
    }

    alarmInterval = null;

    if (
        audioContext &&
        audioContext.state !== "closed"
    ) {
        audioContext.close();
    }

    audioContext = null;

    setText(
        "alertStatus",
        isSOSActive
            ? "SOS ACTIVE — SOUND MUTED"
            : "No active alert"
    );
}

function stopAlarmCompletely() {
    if (alarmInterval) {
        clearInterval(alarmInterval);
    }

    alarmInterval = null;

    if (
        audioContext &&
        audioContext.state !== "closed"
    ) {
        audioContext.close();
    }

    audioContext = null;
    isAlarmMuted = false;
}

/* =========================================
   SOS CONTROLS
========================================= */

async function activateSOS() {
    if (!currentUser) {
        setStatus(
            "Sign in before activating the demo alert."
        );

        return;
    }

    isSOSActive = true;
    isAlarmMuted = false;

    setText("alertState", "ACTIVE");
    setText("alertStatus", "SOS ALERT ACTIVE");

    setStatus("Emergency demo alert activated.");

    logActivity("SOS demo alert activated.");

    startAlarm();

    if (!currentPosition) {
        requestLocation();

    } else {
        await publishLocation();
    }
}

async function stopSOS() {
    isSOSActive = false;

    stopAlarmCompletely();

    setText("alertState", "INACTIVE");
    setText("alertStatus", "SOS alert stopped");

    setStatus("SOS demo alert stopped.");

    await publishLocation();

    await stopSecureSharing(false);

    setText(
        "shareLinkStatus",
        "SOS reset. Location sharing stopped."
    );

    logActivity(
        "SOS reset and location sharing stopped."
    );
}

/* =========================================
   WHATSAPP CONTACTS
========================================= */

function normalizePhoneNumber(phone) {
    if (!phone) return "";

    let number = String(phone).replace(/\D/g, "");

    if (number.startsWith("00")) {
        number = number.slice(2);
    }

    if (
        number.length === 11 &&
        number.startsWith("0")
    ) {
        number = number.slice(1);
    }

    if (number.length === 10) {
        number = "91" + number;
    }

    if (
        number.length < 11 ||
        number.length > 15
    ) {
        return "";
    }

    return number;
}

function makeWhatsAppLink(phone) {
    const number = normalizePhoneNumber(phone);

    if (!number) return "#";

    let message =
        "SOS! I need help. Please contact me immediately.";

    if (currentPosition) {
        const lat = currentPosition.coords.latitude;
        const lon = currentPosition.coords.longitude;

        message +=
            ` My current location: https://www.google.com/maps?q=${lat},${lon}`;

    } else {
        message +=
            " My current GPS location is not available yet.";
    }

    message +=
        " This is an SOS Guard demonstration message.";

    return (
        "https://wa.me/" +
        number +
        "?text=" +
        encodeURIComponent(message)
    );
}

function loadContacts() {
    let saved = {};

    try {
        saved = JSON.parse(
            localStorage.getItem("sosContacts") || "{}"
        );

    } catch (error) {
        console.error(error);
    }

    if ($("contact1Name")) {
        $("contact1Name").value = saved.name1 || "";
    }

    if ($("contact1Phone")) {
        $("contact1Phone").value = saved.phone1 || "";
    }

    if ($("contact2Name")) {
        $("contact2Name").value = saved.name2 || "";
    }

    if ($("contact2Phone")) {
        $("contact2Phone").value = saved.phone2 || "";
    }

    updateWhatsAppLinks();
}

function saveContacts() {
    const data = {
        name1: $("contact1Name")?.value.trim() || "",
        phone1: $("contact1Phone")?.value.trim() || "",
        name2: $("contact2Name")?.value.trim() || "",
        phone2: $("contact2Phone")?.value.trim() || ""
    };

    if (
        data.phone1 &&
        !normalizePhoneNumber(data.phone1)
    ) {
        setText(
            "contactMessage",
            "Contact 1 number is invalid."
        );

        return;
    }

    if (
        data.phone2 &&
        !normalizePhoneNumber(data.phone2)
    ) {
        setText(
            "contactMessage",
            "Contact 2 number is invalid."
        );

        return;
    }

    localStorage.setItem(
        "sosContacts",
        JSON.stringify(data)
    );

    updateWhatsAppLinks();

    setText(
        "contactMessage",
        "Contacts saved on this device."
    );

    logActivity("Emergency contacts saved locally.");
}

function updateWhatsAppLinks() {
    let saved = {};

    try {
        saved = JSON.parse(
            localStorage.getItem("sosContacts") || "{}"
        );

    } catch (error) {
        console.error(error);
    }

    const link1 = $("whatsapp1");
    const link2 = $("whatsapp2");

    if (link1) {
        link1.href = makeWhatsAppLink(
            saved.phone1 || ""
        );

        link1.target = "_blank";
        link1.rel = "noopener noreferrer";
    }

    if (link2) {
        link2.href = makeWhatsAppLink(
            saved.phone2 || ""
        );

        link2.target = "_blank";
        link2.rel = "noopener noreferrer";
    }
}

/* =========================================
   SECURE TRACKING SHARING
========================================= */

async function startSecureSharing() {
    if (!currentUser) {
        setText("shareLinkStatus", "Sign in first.");
        return;
    }

    if (!currentPosition) {
        setText(
            "shareLinkStatus",
            "Waiting for GPS location. Allow location access first."
        );

        requestLocation();

        return;
    }

    const viewerEmail = (
        $("viewerEmail")?.value || ""
    ).trim().toLowerCase();

    const validEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!validEmail.test(viewerEmail)) {
        setText(
            "shareLinkStatus",
            "Enter a valid Google email address."
        );

        return;
    }

    if (
        viewerEmail ===
        (currentUser.email || "").toLowerCase()
    ) {
        setText(
            "shareLinkStatus",
            "Use a different Google account as viewer."
        );

        return;
    }

    if (shareBusy) return;

    shareBusy = true;

    setText(
        "shareLinkStatus",
        "Creating secure tracking session..."
    );

    try {
        if (activeTrackingId) {
            await stopSecureSharing(false);
        }

        const id = randomTrackingId();

        const initialLocation = {
            latitude: currentPosition.coords.latitude,
            longitude: currentPosition.coords.longitude,
            accuracy: currentPosition.coords.accuracy,
            updatedAt:
                firebase.database.ServerValue.TIMESTAMP,
            active: isSOSActive
        };

        const session = {
            ownerUid: currentUser.uid,

            ownerEmail:
                (currentUser.email || "").toLowerCase(),

            allowedViewerEmail: viewerEmail,

            createdAt:
                firebase.database.ServerValue.TIMESTAMP,

            active: true,

            location: initialLocation
        };

        await database
            .ref("trackingSessions/" + id)
            .set(session);

        activeTrackingId = id;

        localStorage.setItem(
            "sosActiveTrackingId",
            id
        );

        const trackingURL = buildTrackingURL(id);

        if ($("shareLink")) {
            $("shareLink").value = trackingURL;
        }

        setText(
            "shareLinkStatus",
            "Secure link created. Share it only with the authorized person."
        );

        setText(
            "shareHelp",
            `Authorized Google account: ${viewerEmail}. Sharing continues until stopped.`
        );

        logActivity(
            "Secure location sharing started."
        );

    } catch (error) {
        console.error("Share creation failed:", error);

        setText(
            "shareLinkStatus",
            "Could not create link: " + error.message
        );

    } finally {
        shareBusy = false;
    }
}

async function stopSecureSharing(showMessage = true) {
    if (!currentUser || !activeTrackingId) {
        if (showMessage) {
            setText(
                "shareLinkStatus",
                "There is no active sharing session on this device."
            );
        }

        return;
    }

    const id = activeTrackingId;

    try {
        await database
            .ref("trackingSessions/" + id)
            .update({
                active: false,

                stoppedAt:
                    firebase.database.ServerValue.TIMESTAMP
            });

        activeTrackingId = null;

        localStorage.removeItem(
            "sosActiveTrackingId"
        );

        if ($("shareLink")) {
            $("shareLink").value = "";
        }

        setText(
            "shareHelp",
            "Location is not currently being shared."
        );

        if (showMessage) {
            setText(
                "shareLinkStatus",
                "Sharing stopped. The tracking session is inactive."
            );
        }

        logActivity(
            "Secure location sharing stopped."
        );

    } catch (error) {
        console.error("Stop sharing failed:", error);

        setText(
            "shareLinkStatus",
            "Could not stop sharing: " + error.message
        );
    }
}

async function loadActiveShare() {
    if (!currentUser) return;

    const id = localStorage.getItem(
        "sosActiveTrackingId"
    );

    if (!id) return;

    try {
        const snapshot = await database
            .ref("trackingSessions/" + id)
            .once("value");

        const session = snapshot.val();

        if (
            !session ||
            session.ownerUid !== currentUser.uid ||
            session.active !== true
        ) {
            localStorage.removeItem(
                "sosActiveTrackingId"
            );

            activeTrackingId = null;

            return;
        }

        activeTrackingId = id;

        if ($("shareLink")) {
            $("shareLink").value =
                buildTrackingURL(id);
        }

        if ($("viewerEmail")) {
            $("viewerEmail").value =
                session.allowedViewerEmail || "";
        }

        setText(
            "shareHelp",
            `Authorized Google account: ${session.allowedViewerEmail}.`
        );

        setText(
            "shareLinkStatus",
            "Existing secure sharing session restored."
        );

    } catch (error) {
        console.error(
            "Could not restore sharing session:",
            error
        );
    }
}

async function copyShareLink() {
    const value = $("shareLink")?.value || "";

    if (!value) {
        setText(
            "shareLinkStatus",
            "Create a secure tracking link first."
        );

        return;
    }

    try {
        await navigator.clipboard.writeText(value);

        setText(
            "shareLinkStatus",
            "Tracking link copied."
        );

    } catch (error) {
        $("shareLink").focus();
        $("shareLink").select();

        setText(
            "shareLinkStatus",
            "Clipboard blocked. Press Ctrl+C to copy the selected link."
        );
    }
}

/* =========================================
   TRACKING VIEWER
========================================= */

function stopViewerListener() {
    if (viewerRef && viewerListener) {
        viewerRef.off("value", viewerListener);
    }

    viewerRef = null;
    viewerListener = null;
}

async function startViewer() {
    stopViewerListener();

    const params = new URLSearchParams(
        window.location.search
    );

    const id = params.get("id");

    if (!id || !currentUser) return;

    /* Validate tracking ID format */

    if (!/^[a-f0-9]{48}$/i.test(id)) {
        setText("viewerState", "INVALID LINK");

        setText(
            "viewerMessage",
            "This tracking link is invalid."
        );

        return;
    }

    setText("viewerState", "VERIFYING ACCESS");

    setText(
        "viewerMessage",
        "Checking authorized Google account..."
    );

    try {
        const token =
            await currentUser.getIdTokenResult(true);

        const email = (
            token.claims.email ||
            currentUser.email ||
            ""
        ).toLowerCase();

        const ref = database.ref(
            "trackingSessions/" + id
        );

        const snapshot = await ref.once("value");

        const session = snapshot.val();

        if (!session) {
            throw new Error(
                "Tracking session does not exist."
            );
        }

        if (session.active !== true) {
            throw new Error(
                "The owner has stopped location sharing."
            );
        }

        if (
            !email ||
            email !==
            String(
                session.allowedViewerEmail || ""
            ).toLowerCase()
        ) {
            throw new Error(
                "Access denied. Sign in with the Google account authorized by the owner."
            );
        }

        setText("viewerState", "ACCESS GRANTED");

        setText(
            "viewerMessage",
            "Authorized viewer. Receiving location updates."
        );

        viewerMap = initializeMap("viewerMap");

        viewerRef = ref;

        viewerListener = snapshot => {
            const sessionData = snapshot.val();

            if (!sessionData) {
                setText(
                    "viewerState",
                    "SESSION NOT FOUND"
                );

                setText(
                    "viewerMessage",
                    "This tracking session is unavailable."
                );

                setText(
                    "viewerTrackingStatus",
                    "NOT CONNECTED"
                );

                return;
            }

            if (sessionData.active !== true) {
                setText(
                    "viewerState",
                    "SHARING STOPPED"
                );

                setText(
                    "viewerMessage",
                    "The owner has stopped location sharing."
                );

                setText(
                    "viewerTrackingStatus",
                    "LOCATION SHARING STOPPED"
                );
            }

            const location = sessionData.location;

            if (
                !location ||
                typeof location.latitude !== "number" ||
                typeof location.longitude !== "number"
            ) {
                setText(
                    "viewerTrackingStatus",
                    "WAITING FOR GPS"
                );

                return;
            }

            const position = {
                coords: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy:
                        Number(location.accuracy) || 0
                }
            };

            if (viewerMap) {
                viewerMarker = updateMapMarker(
                    viewerMap,
                    viewerMarker,
                    position,
                    "📍"
                );
            }

            setText(
                "viewerLatitude",
                location.latitude.toFixed(6)
            );

            setText(
                "viewerLongitude",
                location.longitude.toFixed(6)
            );

            setText(
                "viewerAccuracy",
                Math.round(
                    location.accuracy || 0
                ) + " metres"
            );

            setText(
                "viewerLastUpdated",
                location.updatedAt
                    ? new Date(
                        location.updatedAt
                    ).toLocaleString()
                    : "Not available"
            );

            if (sessionData.active === true) {
                setText(
                    "viewerTrackingStatus",
                    location.active
                        ? "SOS ALERT ACTIVE"
                        : "LIVE LOCATION SHARING"
                );
            }

            if ($("viewerOpenMap")) {
                $("viewerOpenMap").href =
                    `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
            }
        };

        viewerRef.on(
            "value",
            viewerListener,
            error => {
                console.error(
                    "Viewer listener error:",
                    error
                );

                setText(
                    "viewerState",
                    "ACCESS ERROR"
                );

                setText(
                    "viewerMessage",
                    "Could not receive location data."
                );
            }
        );

    } catch (error) {
        console.error(
            "Viewer access error:",
            error
        );

        setText(
            "viewerState",
            "ACCESS DENIED"
        );

        setText(
            "viewerMessage",
            error.message || "Unable to verify access."
        );

        setText(
            "viewerTrackingStatus",
            "NOT CONNECTED"
        );
    }
}

/* =========================================
   PERMISSION CHECK
========================================= */

async function checkPermissions() {
    setText(
        "internetPermissionStatus",
        navigator.onLine
            ? "Internet available"
            : "Internet unavailable"
    );

    if (!navigator.geolocation) {
        setText(
            "locationPermissionStatus",
            "GPS not supported"
        );

        setText(
            "permissionLocationStatus",
            "GPS not supported"
        );

    } else if (!window.isSecureContext) {
        setText(
            "locationPermissionStatus",
            "HTTPS required"
        );

        setText(
            "permissionLocationStatus",
            "HTTPS required"
        );

    } else if (navigator.permissions?.query) {
        try {
            const result =
                await navigator.permissions.query({
                    name: "geolocation"
                });

            function updatePermission() {
                let message =
                    "Permission not requested";

                if (result.state === "granted") {
                    message = "Permission granted";

                } else if (result.state === "denied") {
                    message = "Permission denied";
                }

                setText(
                    "locationPermissionStatus",
                    message
                );

                setText(
                    "permissionLocationStatus",
                    message
                );
            }

            updatePermission();

            result.onchange = updatePermission;

        } catch (error) {
            console.error(
                "Permission check error:",
                error
            );

            setText(
                "locationPermissionStatus",
                "Status unavailable"
            );

            setText(
                "permissionLocationStatus",
                "Status unavailable"
            );
        }
    }

    setText(
        "cloudPermissionStatus",
        currentUser
            ? "Signed in"
            : "Sign in required"
    );
}

/* =========================================
   ESP32 WEB BLUETOOTH
========================================= */

function setBleMessage(message) {
    setText("bleMessage", message);
}

function handleBleDisconnect() {
    hardwareConnected = false;
    bleServer = null;
    bleCharacteristic = null;
    setText("bleDeviceStatus", "NOT CONNECTED");
    setText("bleGpsStatus", "WAITING");
    setBleMessage("Hardware disconnected. You can reconnect.");
    if ($("connectBleButton")) $("connectBleButton").disabled = false;
    if ($("disconnectBleButton")) $("disconnectBleButton").disabled = true;
    logActivity("ESP32 hardware disconnected.");
}

function handleBleData(event) {
    try {
        const raw = new TextDecoder().decode(event.target.value);
        setText("bleLastMessage", raw);
        const data = JSON.parse(raw);
        setText("bleDeviceStatus", "CONNECTED");
        setText("bleGpsStatus", data.gps ? "GPS FIX AVAILABLE" : "SEARCHING FOR GPS");

        if (data.gps && Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.lon))) {
            const lat = Number(data.lat), lon = Number(data.lon);
            hardwarePosition = { latitude: lat, longitude: lon, hdop: Number(data.hdop) || null, timestamp: Date.now() };
            currentPosition = { coords: { latitude: lat, longitude: lon, accuracy: null }, timestamp: Date.now() };
            updateLocationUI(currentPosition);
            setText("accuracy", hardwarePosition.hdop ? "HDOP " + hardwarePosition.hdop : "Not reported");
            setText("trackingStatus", "LIVE — ESP32 GPS");
            setBleMessage("ESP32 connected. GPS coordinates are being received.");
            const placeholder = $("userMap")?.querySelector(".map-placeholder");
            if (placeholder) placeholder.remove();
            publishLocation();
        }

        if (data.sos === true) {
            setText("alertState", "ACTIVE");
            setText("alertStatus", "HARDWARE SOS SIGNAL RECEIVED");
        }
    } catch (error) {
        console.error("Invalid ESP32 BLE data:", error);
        setBleMessage("Connected, but received data could not be read as JSON.");
    }
}

async function connectHardware() {
    if (!navigator.bluetooth) {
        setBleMessage("Web Bluetooth unavailable. Use the latest Chrome on HTTPS.");
        return;
    }
    if (!window.isSecureContext) {
        setBleMessage("Open the HTTPS GitHub Pages address.");
        return;
    }

    const button = $("connectBleButton");
    if (button) button.disabled = true;
    setBleMessage("Select SOS_GUARD_ESP32 in the Bluetooth popup...");

    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [BLE_SERVICE_UUID]
        });
        bleDevice.addEventListener("gattserverdisconnected", handleBleDisconnect);
        bleServer = await bleDevice.gatt.connect();
        const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
        bleCharacteristic = await service.getCharacteristic(BLE_CHARACTERISTIC_UUID);
        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener("characteristicvaluechanged", handleBleData);

        hardwareConnected = true;
        setText("bleDeviceStatus", "CONNECTED");
        setBleMessage(bleDevice.name ? "Connected to " + bleDevice.name + ". Waiting for GPS data..." : "BLE device connected. Waiting for GPS data...");
        if ($("disconnectBleButton")) $("disconnectBleButton").disabled = false;
        logActivity("ESP32 hardware connected through Bluetooth.");
    } catch (error) {
        console.error("ESP32 BLE connection failed:", error);
        setBleMessage("Connection failed: " + (error.message || error));
        if (button) button.disabled = false;
    }
}

function disconnectHardware() {
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) bleDevice.gatt.disconnect();
    else handleBleDisconnect();
}

/* =========================================
   BUTTON EVENTS
========================================= */

$("connectBleButton")?.addEventListener("click", connectHardware);
$("disconnectBleButton")?.addEventListener("click", disconnectHardware);

$("googleSignInButton")?.addEventListener(
    "click",
    googleSignIn
);

$("googleSignOutButton")?.addEventListener(
    "click",
    googleSignOut
);

$("sosButton")?.addEventListener(
    "click",
    activateSOS
);

$("silenceButton")?.addEventListener(
    "click",
    silenceAlarm
);

$("stopButton")?.addEventListener(
    "click",
    stopSOS
);

$("saveContacts")?.addEventListener(
    "click",
    saveContacts
);

$("permissionButton")?.addEventListener(
    "click",
    async () => {
        await checkPermissions();

        if (
            currentUser &&
            !isViewerRoute()
        ) {
            requestLocation();

        } else if (!currentUser) {
            setStatus(
                "Sign in before checking GPS."
            );
        }
    }
);

$("startShareButton")?.addEventListener(
    "click",
    startSecureSharing
);

$("copyLinkButton")?.addEventListener(
    "click",
    copyShareLink
);

$("stopShareButton")?.addEventListener(
    "click",
    () => stopSecureSharing(true)
);

$("clearLog")?.addEventListener(
    "click",
    () => {
        const log = $("activityLog");

        if (log) {
            log.innerHTML = "";
        }
    }
);

/* =========================================
   STARTUP
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadContacts();

        checkPermissions();

        updateClock();

        updateInternetStatus();

        logActivity(
            "SOS Guard interface loaded."
        );
    }
);
