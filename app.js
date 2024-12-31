// app.js

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCall');

let localStream;
let peerConnection;
let connection;
let localConnectionId;

// STUN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ]
};

// Initialize SignalR connection
connection = new signalR.HubConnectionBuilder()
    .withUrl('https://192.168.1.9:25689/signalingHub',{
          transport: signalR.HttpTransportType.WebSockets, 
        skipNegotiation: true
    }) 
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Start the SignalR connection
connection.start().then(() => {
    console.log('Connected to SignalR signaling server.');
}).catch(err => console.error('SignalR connection error:', err));

// Handle receiving a new user connection
connection.on('UserConnected', async (connectionId) => {
    console.log('New user connected:', connectionId);
});

// Handle receiving a user disconnection
connection.on('UserDisconnected', async (connectionId) => {
    console.log('User disconnected:', connectionId);
    if (peerConnections.has(connectionId)) {
        peerConnections.get(connectionId).close();
        peerConnections.delete(connectionId);

        // Remove the associated video element
        const remoteVideo = document.getElementById(`video-${connectionId}`);
        if (remoteVideo) {
            remoteVideo.remove();
        }
    }
});

// Handle receiving an offer
connection.on('ReceiveOffer', async (offer, senderId) => {
    if (!peerConnections.has(senderId)) {
        await createPeerConnection(senderId);
    }
    const peerConnection = peerConnections.get(senderId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    connection.invoke('SendAnswer', JSON.stringify(peerConnection.localDescription), senderId);
});

// Handle receiving an answer
connection.on('ReceiveAnswer', async (answer, senderId) => {
    if (peerConnections.has(senderId)) {
        const peerConnection = peerConnections.get(senderId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
    }
});

// Handle receiving ICE candidates
connection.on('ReceiveIceCandidate', async (candidate, senderId) => {
    if (peerConnections.has(senderId)) {
        const peerConnection = peerConnections.get(senderId);
        await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
    }
});

// Get user media and initialize local stream
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream; // Store the local media stream
        console.log('Local stream initialized.');
        startCallButton.disabled = false; // Enable call button after stream is ready
    })
    .catch(err => console.error('Error accessing media devices:', err));

// Create a new peer connection
async function createPeerConnection(targetId) {
    const peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to the peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        let remoteVideo = document.getElementById(`video-${targetId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${targetId}`;
            remoteVideo.autoplay = true;
            videosContainer.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            connection.invoke('SendIceCandidate', JSON.stringify(event.candidate), targetId);
        }
    };

    // Store the peer connection
    peerConnections.set(targetId, peerConnection);

    return peerConnection;
}

// Start call by creating offers for all connected users
startCallButton.addEventListener('click', async () => {
    startCallButton.disabled = true; // Prevent multiple call attempts
    console.log('Starting call...');

    const users = []; // Replace with a method to fetch connected user IDs from the backend

    for (const targetId of users) {
        const peerConnection = await createPeerConnection(targetId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        connection.invoke('SendOffer', JSON.stringify(peerConnection.localDescription), targetId);
    }

    console.log('Call started.');
});
