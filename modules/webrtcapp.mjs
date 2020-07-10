export const WebRTCApp = (function() {

    // Define "global" variables
    var dataChannels = []
    var peerConfig = {"iceServers":[{"urls":"stun:stun.l.google.com:19302"}]};
    var sdpConstraints = { offerToReceiveAudio: false,  offerToReceiveVideo: false };
    var ws = null;
    var client = generateUUID();
    var room = "test_room"
    var wsaddr = "127.0.0.1:3003"

    // This defines what happens when we get a new message
    var onMessage = (message) => {};

    function setOnMessage(handler) {
        onMessage = handler;
    }

    // Generate a random user-id
    function generateUUID() {
        // http://www.ietf.org/rfc/rfc4122.txt
        var s = [];
        var hexDigits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
        s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
        s[8] = s[13] = s[18] = s[23] = "-";

        return s.join("");
    }

    // Avoid responding to ourself, and only respond to messages in the same room
    function shouldRespond(jsonMsg) {
        return jsonMsg.from !== client && ((jsonMsg.endpoint === client) || (jsonMsg.room === room));
    }

    // Connect to the signaling server
    async function connect() {
        return new Promise((resolve, reject) => {
            ws = new WebSocket("ws://" + wsaddr + "?user=" + client + "&room=" + room);
            ws.onopen = (e) => {
                console.log("Websocket opened");
                sendNegotiation('HANDLE_CONNECTION', client)
            }
            ws.onclose = (e) => {
                console.log("Websocket closed");
            }
            ws.onmessage = async (e) => {
                var json = JSON.parse(e.data);
                if (shouldRespond(json)) {
                    if(json.action === "HANDLE_CONNECTION"){
                        console.log("NEW PEER WANTS TO CONNECT")
                        await connectPeers(json.data)
                        resolve(WebRTCApp)
                    } else if (json.action === "offer"){
                        console.log("GOT OFFER FROM A NODE WE WANT TO CONNECT TO")
                        console.log("THE NODE IS", json.from)
                        await processOffer(json.from, json.data)
                        resolve(WebRTCApp)
                    }
                }
            }
            ws.onerror = (e) => {
                console.log("Websocket error");
                reject(e);
            }
        })

    }

    function processMessage(e) {
        var message = JSON.parse(e.data);
        // Here is where we process direct messages from other peers
        onMessage(message);
    }

    // Used when establishing a connection
    function processIce(localConnection, iceCandidate){
        localConnection.addIceCandidate(new RTCIceCandidate(iceCandidate)).catch(e => {
            console.log(e)
        })
    }

    // Used when establishing a connection with a peer
    function sendNegotiation(type, sdp){
        var jsonSend = { protocol: "one-to-all", room: room, from: client, endpoint: "any", action: type, data: sdp};
        ws.send(JSON.stringify(jsonSend));
    }

    // Send connection request to a specific endpoint-id
    function sendOneToOneNegotiation(type, endpoint, sdp){
        var jsonSend = { protocol: "one-to-one", room: room, from: client, endpoint: endpoint, action: type, data: sdp};
        ws.send(JSON.stringify(jsonSend));
    }

    function connectPeers(requestee) {
        return new Promise((resolve, reject) => {
            console.log("CONNECTING PEERS")
            // Create the local connection and its event listeners
            let localConnection = new RTCPeerConnection(peerConfig);
            let sendChannel = localConnection.createDataChannel("sendChannel");

            localConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendOneToOneNegotiation("candidate", requestee, event.candidate)
                }
            }

            function messageListener (e) {
                var json = JSON.parse(e.data);
                if(shouldRespond(json)){
                    if(json.action === "candidate"){
                        processIce(localConnection, json.data);
                    } else if(json.action === "answer"){
                        console.log("--- GOT ANSWER IN CONNECT ---")
                        localConnection.setRemoteDescription(new RTCSessionDescription(json.data));
                    }
                }
            }

            ws.addEventListener('message', messageListener)

            // Create the data channel and establish its event listeners
            sendChannel.onopen = event => {
                console.log("Channel opened");
                resolve(WebRTCApp);
                ws.removeEventListener('message', messageListener)
            }
            sendChannel.onmessage = message => {
                processMessage(message)
            }
            sendChannel.onclose = event =>  {
                console.log("Channel closed");
                ws.removeEventListener('message', messageListener)
                reject();
            };

            dataChannels.push(sendChannel)

            // Now create an offer to connect; this starts the process
            localConnection.createOffer(sdpConstraints)
            .then(offer => {
                localConnection.setLocalDescription(offer)
                sendOneToOneNegotiation("offer", requestee, offer);
                console.log("------ SEND OFFER ------");

            })
            .catch(handleCreateDescriptionError);
        })
    }

    function processOffer(requestee, remoteOffer) {
        console.log("RUNNING PROCESS OFFER")
        return new Promise((resolve, reject) => {
            let localConnection = new RTCPeerConnection(peerConfig);
            
            localConnection.onicecandidate = event => {
                if (event.candidate) {
                    sendOneToOneNegotiation("candidate", requestee, event.candidate)
                }
            }

            localConnection.ondatachannel = event => {
                event.channel.onopen = () => {
                    console.log('Data channel is open and ready to be used.');
                    dataChannels.push(event.channel)
                    resolve(WebRTCApp)
                };
                event.channel.onmessage = message => {
                    processMessage(message)
                };
                event.channel.onerror = error => {
                    // Handle channel errors here!
                    reject(WebRTCApp)
                }
            };

            // SEND ANSWER
            localConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer))
            localConnection.createAnswer().then(localDescription => {
                localConnection.setLocalDescription(localDescription)
                console.log("------ SEND ANSWER ------");
                sendOneToOneNegotiation('answer', requestee, localDescription)
            })
        })
    }

    function handleCreateDescriptionError(error) {
      console.log("Unable to create an offer: " + error.toString());
    }

    function sendDirect(message) {
        let sentMessages = 0
        dataChannels.forEach(function (datachannel) {
            if (datachannel.readyState === 'open') {
                datachannel.send(JSON.stringify({sender: client, payload: message}))
                sentMessages++
            }
        });
        console.log("Sent this many messages:", sentMessages)
    }
    
    return {
        setOnMessage: (setOnMessage),
        connect: (connect),
        sendDirect: (sendDirect),
    };
})();