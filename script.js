
// ============================================
// SOS SAFETY SYSTEM - FIREBASE INTEGRATION
// ============================================

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

// INITIALIZATION
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let currentLocation = null;
let watchId = null;
let sosActive = false;
let audioContext = null;
let alarmInterval = null;
let contacts = JSON.parse(localStorage.getItem("sosContacts") || "{}");

// DOM ELEMENTS
const $ = id => document.getElementById(id);

const sosButton = $("sosButton");
const silenceButton = $("silenceButton");
const resetButton = $("resetButton");

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function logActivity(message) {
    const log = $("activityLog");
    if (!log) return;

    const item = document.createElement("p");
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = new Date().toLocaleTimeString();

    item.appendChild(time);
    item.appendChild(document.createTextNode(message));
    log.prepend(item);
}

function updateStatus(id, value) {
    setText(id, value);
}

// FIREBASE AUTHENTICATION
async function initializeFirebase() {
    setText("serverStatus", "CONNECTING...");

    try {
        const result = await auth.signInAnonymously();
        currentUser = result.user;

        setText("serverStatus", "CONNECTED");
        logActivity("Firebase authentication successful.");
        return true;

    } catch (error) {
        console.error("Firebase error:", error);
        setText("serverStatus", "CONNECTION FAILED");
        logActivity("Firebase connection failed: " + error.message);
        return false;
    }
}

// SAVE LOCATION TO FIREBASE
async function saveLocationToFirebase(position) {
    if (!currentUser) return;

    const data = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now(),
        sosActive: sosActive
    };

    try {
        await database.ref("users/" + currentUser.uid + "/location").set(data);
        setText("serverStatus", "LOCATION SYNCED");
    } catch (error) {
        console.error("Location upload failed:", error);
        setText("serverStatus", "SYNC FAILED");
        logActivity("Location sync failed.");
    }
}

// GPS TRACKING
function startLocationTracking() {
    if (!navigator.geolocation) {
        setText("trackingStatus", "GPS NOT SUPPORTED");
        return;
    }

    if (!window.isSecureContext) {
        setText("trackingStatus", "HTTPS REQUIRED");
        logActivity("GPS requires HTTPS or localhost.");
        return;
    }

    if (watchId !== null) return;

    setText("trackingStatus", "REQUESTING GPS...");
    setText("location", "Waiting for GPS...");
    
    watchId = navigator.geolocation.watchPosition(
        async position => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            const lat = currentLocation.latitude;
            const lng = currentLocation.longitude;

            setText("location", lat.toFixed(6) + ", " + lng.toFixed(6));
            setText("trackingStatus", "GPS ACTIVE");
            setText("lastLocationUpdate", new Date().toLocaleTimeString());

            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            const mapLink = $("mapLink");

            if (mapLink) {
                mapLink.href = mapUrl;
                mapLink.textContent = "OPEN CURRENT LOCATION IN MAPS";
                mapLink.target = "_blank";
            }

            const map = $("map");
            if (map) {
                map.innerHTML = `
                    <div class="map-placeholder">
                        <span>📍</span>
                        <p>GPS LOCATION ACTIVE</p>
                        <small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
                        <small>Open Google Maps using the link below</small>
                    </div>`;
            }

            await saveLocationToFirebase(position);
        },

        error => {
            console.error("GPS error:", error);
            setText("trackingStatus", "GPS ERROR");
            setText("location", "Location unavailable");
            logActivity("GPS error: " + error.message);
        },

        {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 15000
        }
    );

    logActivity("GPS tracking started.");
}

function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    setText("trackingStatus", "TRACKING STOPPED");
}

// BROWSER ALARM
function startAlarm() {
    stopAlarm();

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            setText("soundStatus", "AUDIO NOT SUPPORTED");
            return;
        }

        audioContext = new AudioContextClass();

        function beep() {
            if (!audioContext || audioContext.state === "closed") return;

            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = "sawtooth";
            oscillator.frequency.value = 850;

            gain.gain.value = 0.12;

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
        }

        beep();
        alarmInterval = setInterval(beep, 700);

        setText("soundStatus", "ALARM ACTIVE");
    } catch (error) {
        console.error(error);
        setText("soundStatus", "ALARM UNAVAILABLE");
    }
}

function stopAlarm() {
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }

    if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
    }

    audioContext = null;
    setText("soundStatus", "ALARM OFF");
}

// CONTACT MANAGEMENT
function loadContacts() {
    if ($("contact1")) $("contact1").value = contacts.name1 || "";
    if ($("phone1")) $("phone1").value = contacts.phone1 || "";
    if ($("contact2")) $("contact2").value = contacts.name2 || "";
    if ($("phone2")) $("phone2").value = contacts.phone2 || "";
}

function saveContactDetails() {
    contacts = {
        name1: $("contact1")?.value.trim() || "",
        phone1: $("phone1")?.value.trim() || "",
        name2: $("contact2")?.value.trim() || "",
        phone2: $("phone2")?.value.trim() || ""
    };

    localStorage.setItem("sosContacts", JSON.stringify(contacts));

    setText("contactMessage", "CONTACTS SAVED");
    logActivity("Emergency contacts saved locally.");
    updateMessagePreview();
}

function createEmergencyMessage() {
    let message = "EMERGENCY SOS! I need help.";

    if (currentLocation) {
        const mapUrl =
            `https://www.google.com/maps?q=${currentLocation.latitude},${currentLocation.longitude}`;

        message += "\nMy current location: " + mapUrl;
    } else {
        message += "\nMy GPS location is currently unavailable.";
    }

    return message;
}

function updateMessagePreview() {
    setText("messagePreview", createEmergencyMessage());
}

function sendWhatsAppAlert(phone, statusId) {
    if (!phone) {
        setText(statusId, "PHONE NUMBER MISSING");
        return;
    }

    const cleanPhone = phone.replace(/\D/g, "");

    if (cleanPhone.length < 10) {
        setText(statusId, "INVALID PHONE NUMBER");
        return;
    }

    const message = encodeURIComponent(createEmergencyMessage());
    const url = `https://wa.me/${cleanPhone}?text=${message}`;

    window.open(url, "_blank");

    setText(statusId, "WHATSAPP OPENED - PRESS SEND");
    logActivity("WhatsApp alert prepared. Manual Send required.");
}

// SOS ACTIVATION
async function activateSOS() {
    if (sosActive) return;

    sosActive = true;

    setText("systemStatus", "EMERGENCY ACTIVE");
    setText("alertStatus", "SOS ACTIVATED");
    setText("shareLinkStatus", "LOCATION SYNC PENDING");

    logActivity("EMERGENCY SOS ACTIVATED.");

    startAlarm();
    startLocationTracking();

    if (currentUser && currentLocation) {
        const position = {
            coords: {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                accuracy: 0
            }
        };

        await saveLocationToFirebase(position);
    }

    updateMessagePreview();
}

// RESET
async function resetSystem() {
    sosActive = false;

    stopAlarm();
    stopLocationTracking();

    setText("systemStatus", "SYSTEM STANDBY");
    setText("alertStatus", "NO ACTIVE ALERT");
    setText("shareLinkStatus", "NOT SHARED");
    setText("location", "Tracking stopped");
    setText("trackingStatus", "STANDBY");

    if (currentUser) {
        try {
            await database.ref(
                "users/" + currentUser.uid + "/location/sosActive"
            ).set(false);
        } catch (error) {
            console.error(error);
        }
    }

    currentLocation = null;
    updateMessagePreview();

    logActivity("System reset.");
}

// PERMISSION CHECK
async function verifyPermissions() {
    setText("permissionResult", "CHECKING PERMISSIONS...");

    setText(
        "locationPermissionStatus",
        navigator.geolocation ? "SUPPORTED - REQUEST ON GPS START" : "NOT SUPPORTED"
    );

    setText(
        "internetPermissionStatus",
        navigator.onLine ? "ONLINE" : "OFFLINE"
    );

    setText(
        "whatsappPermissionStatus",
        "MANUAL SEND REQUIRED"
    );

    setText(
        "permissionResult",
        "Permission status checked. GPS permission is requested when tracking starts."
    );
}

// EVENT LISTENERS
if (sosButton) {
    sosButton.addEventListener("click", activateSOS);
}

if (silenceButton) {
    silenceButton.addEventListener("click", stopAlarm);
}

if (resetButton) {
    resetButton.addEventListener("click", resetSystem);
}

if ($("permissionButton")) {
    $("permissionButton").addEventListener("click", verifyPermissions);
}

if ($("locationButton")) {
    $("locationButton").addEventListener("click", startLocationTracking);
}

if ($("saveContacts")) {
    $("saveContacts").addEventListener("click", saveContactDetails);
}

if ($("sendContact1")) {
    $("sendContact1").addEventListener("click", () => {
        sendWhatsAppAlert(contacts.phone1, "deliveryStatus1");
    });
}

if ($("sendContact2")) {
    $("sendContact2").addEventListener("click", () => {
        sendWhatsAppAlert(contacts.phone2, "deliveryStatus2");
    });
}

window.addEventListener("online", () => {
    setText("internetPermissionStatus", "ONLINE");
});

window.addEventListener("offline", () => {
    setText("internetPermissionStatus", "OFFLINE");
});

// STARTUP
loadContacts();
updateMessagePreview();

setText("systemStatus", "INITIALIZING...");
setText("serverStatus", "CONNECTING...");
setText("trackingStatus", "STANDBY");
setText("alertStatus", "NO ACTIVE ALERT");
setText("soundStatus", "ALARM OFF");
setText("shareLinkStatus", "NOT CREATED");

initializeFirebase();
verifyPermissions();

logActivity("SOS Safety System initialized.");
