
/* =========================================
   SOS SAFETY SYSTEM
   EMERGENCY COMMAND CENTER
========================================= */

// ---------- ELEMENTS ----------

const $ = (id) => document.getElementById(id);

const sosButton = $("sosButton");
const silenceButton = $("silenceButton");
const resetButton = $("resetButton");

const systemStatus = $("systemStatus");
const alertStatus = $("alertStatus");
const soundStatus = $("soundStatus");

const permissionButton = $("permissionButton");
const permissionResult = $("permissionResult");

const locationPermissionStatus = $("locationPermissionStatus");
const internetPermissionStatus = $("internetPermissionStatus");
const whatsappPermissionStatus = $("whatsappPermissionStatus");

const locationText = $("location");
const locationButton = $("locationButton");
const lastLocationUpdate = $("lastLocationUpdate");
const trackingStatus = $("trackingStatus");
const trackingInfo = $("trackingInfo");
const mapLink = $("mapLink");
const serverStatus = $("serverStatus");
const shareLinkStatus = $("shareLinkStatus");

const contact1 = $("contact1");
const phone1 = $("phone1");
const contact2 = $("contact2");
const phone2 = $("phone2");

const saveContacts = $("saveContacts");
const contactMessage = $("contactMessage");
const contact1Status = $("contact1Status");
const contact2Status = $("contact2Status");

const messagePreview = $("messagePreview");

const sendContact1 = $("sendContact1");
const sendContact2 = $("sendContact2");

const deliveryStatus1 = $("deliveryStatus1");
const deliveryStatus2 = $("deliveryStatus2");

const activityLog = $("activityLog");


// ---------- SYSTEM VARIABLES ----------

let sosActive = false;
let watchId = null;
let currentLocation = null;

let audioContext = null;
let alarmInterval = null;

let contacts = {
    name1: "",
    phone1: "",
    name2: "",
    phone2: ""
};


// ---------- ACTIVITY LOG ----------

function addLog(message) {

    const time = new Date().toLocaleTimeString();

    const entry = document.createElement("p");

    const timeLabel = document.createElement("span");

    timeLabel.className = "log-time";
    timeLabel.textContent = time;

    entry.appendChild(timeLabel);
    entry.appendChild(document.createTextNode(message));

    activityLog.prepend(entry);
}


// ---------- CONTACTS ----------

function loadContacts() {

    try {

        const saved = localStorage.getItem("sosContacts");

        if (!saved) return;

        contacts = JSON.parse(saved);

        contact1.value = contacts.name1 || "";
        phone1.value = contacts.phone1 || "";

        contact2.value = contacts.name2 || "";
        phone2.value = contacts.phone2 || "";

        updateContactStatus();

    } catch (error) {

        addLog("Unable to load saved contacts.");

    }
}


function updateContactStatus() {

    contact1Status.textContent =
        contacts.phone1 ? "SAVED" : "NOT SAVED";

    contact2Status.textContent =
        contacts.phone2 ? "SAVED" : "NOT SAVED";
}


function saveContactDetails() {

    const number1 = phone1.value.replace(/\D/g, "");
    const number2 = phone2.value.replace(/\D/g, "");

    if (!number1 && !number2) {

        contactMessage.textContent =
            "ENTER AT LEAST ONE CONTACT NUMBER";

        return;
    }

    if (
        (number1 && (number1.length < 10 || number1.length > 15)) ||
        (number2 && (number2.length < 10 || number2.length > 15))
    ) {

        contactMessage.textContent =
            "CHECK YOUR CONTACT NUMBERS";

        return;
    }

    contacts = {

        name1: contact1.value.trim(),
        phone1: number1,

        name2: contact2.value.trim(),
        phone2: number2

    };

    localStorage.setItem(
        "sosContacts",
        JSON.stringify(contacts)
    );

    updateContactStatus();

    contactMessage.textContent =
        "CONTACTS SAVED SUCCESSFULLY";

    addLog("Emergency contacts saved.");
}


// ---------- PERMISSION CHECK ----------

async function verifyPermissions() {

    permissionResult.textContent =
        "CHECKING PERMISSIONS...";

    internetPermissionStatus.textContent =
        navigator.onLine ? "AVAILABLE" : "OFFLINE";

    // A normal website cannot verify WhatsApp login.
    whatsappPermissionStatus.textContent =
        "LOGIN NOT VERIFIED";

    if (!navigator.geolocation) {

        locationPermissionStatus.textContent =
            "NOT SUPPORTED";

        permissionResult.textContent =
            "GPS NOT SUPPORTED BY THIS BROWSER";

        return;
    }

    if (navigator.permissions?.query) {

        try {

            const permission = await navigator.permissions.query({
                name: "geolocation"
            });

            const states = {
                granted: "GRANTED",
                denied: "DENIED",
                prompt: "NEEDS APPROVAL"
            };

            locationPermissionStatus.textContent =
                states[permission.state] || "UNKNOWN";

        } catch (error) {

            locationPermissionStatus.textContent =
                "CHECK WHEN GPS STARTS";

        }

    } else {

        locationPermissionStatus.textContent =
            "CHECK WHEN GPS STARTS";

    }

    permissionResult.textContent =
        navigator.onLine
        ? "PERMISSION STATUS CHECKED"
        : "INTERNET CONNECTION REQUIRED";

    addLog("Permission status checked.");
}


// ---------- GPS TRACKING ----------

function startLocationTracking() {

    if (!navigator.geolocation) {

        locationText.textContent =
            "GPS NOT SUPPORTED";

        addLog("GPS not supported by browser.");

        return;
    }

    if (!window.isSecureContext) {

        locationText.textContent =
            "HTTPS REQUIRED FOR PHONE GPS";

        addLog("Secure HTTPS connection required.");

        return;
    }

    if (watchId !== null) {

        addLog("GPS tracking is already active.");

        return;
    }

    locationText.textContent =
        "WAITING FOR PHONE GPS...";

    trackingStatus.textContent =
        "● CONNECTING";

    navigator.geolocation.watchPosition(

        function(position) {

            currentLocation = {

                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp

            };

            const latitude =
                currentLocation.latitude.toFixed(6);

            const longitude =
                currentLocation.longitude.toFixed(6);

            const googleMapsURL =
                `https://www.google.com/maps?q=${latitude},${longitude}`;

            locationText.textContent =
                `GPS ACTIVE | Accuracy ±${Math.round(currentLocation.accuracy)} m`;

            lastLocationUpdate.textContent =
                new Date(currentLocation.timestamp).toLocaleTimeString();

            mapLink.href = googleMapsURL;
            mapLink.hidden = false;

            trackingStatus.textContent =
                "● GPS ACTIVE";

            trackingInfo.textContent =
                "ACTIVE";

            locationPermissionStatus.textContent =
                "GRANTED";

            updateMessagePreview();

            addLog("Phone GPS location updated.");

        },

        function(error) {

            const errors = {

                1: "LOCATION PERMISSION DENIED",
                2: "GPS POSITION UNAVAILABLE",
                3: "GPS REQUEST TIMED OUT"

            };

            locationText.textContent =
                errors[error.code] || "GPS ERROR";

            trackingStatus.textContent =
                "● GPS ERROR";

            trackingInfo.textContent =
                "ERROR";

            watchId = null;

            addLog("GPS error: " + error.message);

        },

        {

            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 20000

        }

    );

    addLog("Continuous GPS tracking started.");
}


function stopLocationTracking() {

    if (watchId !== null) {

        navigator.geolocation.clearWatch(watchId);

        watchId = null;

    }

    trackingStatus.textContent =
        "● OFFLINE";

    trackingInfo.textContent =
        "OFF";

    addLog("GPS tracking stopped.");
}


// ---------- EMERGENCY MESSAGE ----------

function createEmergencyMessage() {

    let message =
        "🚨 SOS EMERGENCY ALERT!\n\n";

    message +=
        "I NEED EMERGENCY ASSISTANCE. PLEASE CONTACT ME IMMEDIATELY.\n\n";

    if (currentLocation) {

        const latitude =
            currentLocation.latitude.toFixed(6);

        const longitude =
            currentLocation.longitude.toFixed(6);

        const mapURL =
            `https://www.google.com/maps?q=${latitude},${longitude}`;

        message +=
            "MY LATEST LOCATION:\n" + mapURL;

    } else {

        message +=
            "My location is currently unavailable.";

    }

    return message;
}


function updateMessagePreview() {

    messagePreview.textContent =
        createEmergencyMessage();

}


// ---------- WHATSAPP ----------

function sendWhatsAppAlert(number, name, statusElement) {

    if (!number) {

        statusElement.textContent =
            "CONTACT NUMBER NOT SAVED";

        return;
    }

    if (!currentLocation) {

        statusElement.textContent =
            "WAITING FOR GPS LOCATION";

        startLocationTracking();

        return;
    }

    // WhatsApp requires country code.
    // Example: India = 91 followed by mobile number.

    if (number.length === 10) {

        statusElement.textContent =
            "ADD COUNTRY CODE (91)";

        return;
    }

    const message = createEmergencyMessage();

    const whatsappURL =
        "https://wa.me/" +
        number +
        "?text=" +
        encodeURIComponent(message);

    statusElement.textContent =
        "OPENING WHATSAPP...";

    addLog("Opening WhatsApp for " + (name || "emergency contact"));

    window.open(whatsappURL, "_blank");

    statusElement.textContent =
        "AWAITING MANUAL SEND";

}


// ---------- ALARM ----------

async function startAlarm() {

    stopAlarm();

    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {

        soundStatus.textContent =
            "NOT SUPPORTED";

        return;
    }

    try {

        audioContext = new AudioContextClass();

        await audioContext.resume();

        soundStatus.textContent = "ON";

        function beep() {

            if (!audioContext || !sosActive) return;

            const oscillator =
                audioContext.createOscillator();

            const gain =
                audioContext.createGain();

            oscillator.type = "sawtooth";

            oscillator.frequency.value = 850;

            oscillator.connect(gain);

            gain.connect(audioContext.destination);

            gain.gain.setValueAtTime(
                0.18,
                audioContext.currentTime
            );

            oscillator.start();

            oscillator.stop(
                audioContext.currentTime + 0.2
            );

        }

        beep();

        alarmInterval = setInterval(beep, 650);

        addLog("Browser alarm activated.");

    } catch (error) {

        soundStatus.textContent =
            "AUDIO ERROR";

        addLog("Alarm could not start.");

    }

}


function stopAlarm() {

    if (alarmInterval !== null) {

        clearInterval(alarmInterval);

        alarmInterval = null;

    }

    if (audioContext) {

        audioContext.close();

        audioContext = null;

    }

    soundStatus.textContent = "OFF";

}


// ---------- SOS ACTIVATION ----------

function activateSOS() {

    if (sosActive) return;

    sosActive = true;

    alertStatus.textContent =
        "EMERGENCY MODE ACTIVATED";

    alertStatus.style.color =
        "#ff173d";

    systemStatus.textContent =
        "EMERGENCY ACTIVE";

    addLog("SOS ACTIVATED.");

    startAlarm();

    startLocationTracking();

    updateMessagePreview();

}


// ---------- SILENCE ----------

function silenceAlarm() {

    stopAlarm();

    alertStatus.textContent =
        sosActive
        ? "ALARM SILENCED - SOS STILL ACTIVE"
        : "SYSTEM IS READY";

    addLog("Alarm silenced.");

}


// ---------- RESET ----------

function resetSystem() {

    sosActive = false;

    stopAlarm();

    stopLocationTracking();

    currentLocation = null;

    alertStatus.textContent =
        "SYSTEM IS READY";

    alertStatus.style.color =
        "#35e69a";

    systemStatus.textContent =
        "SYSTEM STANDBY";

    locationText.textContent =
        "LOCATION NOT RECEIVED";

    lastLocationUpdate.textContent =
        "--";

    mapLink.hidden = true;

    deliveryStatus1.textContent =
        "WAITING";

    deliveryStatus2.textContent =
        "WAITING";

    serverStatus.textContent =
        "NOT CONNECTED";

    shareLinkStatus.textContent =
        "NOT CREATED";

    updateMessagePreview();

    addLog("System reset.");

}


// ---------- BUTTON EVENTS ----------

sosButton.addEventListener(
    "click",
    activateSOS
);

silenceButton.addEventListener(
    "click",
    silenceAlarm
);

resetButton.addEventListener(
    "click",
    resetSystem
);

permissionButton.addEventListener(
    "click",
    verifyPermissions
);

locationButton.addEventListener(
    "click",
    startLocationTracking
);

saveContacts.addEventListener(
    "click",
    saveContactDetails
);

sendContact1.addEventListener(
    "click",
    function() {

        sendWhatsAppAlert(
            contacts.phone1,
            contacts.name1,
            deliveryStatus1
        );

    }
);

sendContact2.addEventListener(
    "click",
    function() {

        sendWhatsAppAlert(
            contacts.phone2,
            contacts.name2,
            deliveryStatus2
        );

    }
);


// ---------- INTERNET STATUS ----------

window.addEventListener("online", function() {

    internetPermissionStatus.textContent =
        "AVAILABLE";

    addLog("Internet connection restored.");

});


window.addEventListener("offline", function() {

    internetPermissionStatus.textContent =
        "OFFLINE";

    addLog("Internet connection lost.");

});


// ---------- INITIALIZATION ----------

loadContacts();

updateMessagePreview();

serverStatus.textContent =
    "FIREBASE NOT CONFIGURED";

shareLinkStatus.textContent =
    "NOT CREATED";

addLog("SOS COMMAND CENTER INITIALIZED.");

console.log("SOS SAFETY SYSTEM READY.");

