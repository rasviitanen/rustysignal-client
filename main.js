import { WebRTCApp } from './modules/webrtcapp.mjs';

console.log("Starting WebRTCApp...");
WebRTCApp.connect();

// Setup WebRTC
WebRTCApp.setOnMessage(message => {
    console.log("Got new a message", message);
    var messageElem = document.createElement("div");
    messageElem.innerHTML = "<strong>" + message.sender + "</strong>:   " + message.payload;
    document.getElementById("messages").appendChild(messageElem);
});

document.getElementById("myBtn").addEventListener("click", (e) => {
    e.preventDefault();
    let inputBox = document.getElementById("myInp");
    WebRTCApp.sendDirect(inputBox.value);
    inputBox.value = "";
})

// Send message on enter-keystroke
document.getElementById("myInp").addEventListener("keyup", (e) => {
    if (e.keyCode === 13) {
        e.preventDefault();
        document.getElementById("myBtn").click();
    }
});