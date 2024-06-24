import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

const WEBSOCKET_URL = "ws://192.168.1.224:8888/ws";

const AIAssistantGUI = () => {
  const [status, setStatus] = useState("Idle");
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [response, setResponse] = useState("");
  const [code, setCode] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const soundObjectRef = useRef(null);
  const websocketRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (audioQueue.length > 0 && !isPlaying) {
      playNextAudio();
    }
  }, [audioQueue, isPlaying]);

  const connectWebSocket = () => {
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("Connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setStatus("Error");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setStatus("Disconnected");
    };

    websocketRef.current = ws;
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case "text":
        console.log("Received text message:", data.text);
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "user", text: data.text }
        ]);
        break;
      case "response":
        setResponse(data.text);
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "response", text: data.text }
        ]);
        break;
      case "audio":
        setAudioQueue((prevQueue) => [...prevQueue, data.audio]);
        break;
      case "reset_confirmed":
        setStatus("Idle");
        setIsProcessing(false);
    }

    setIsProcessing(false);
  };

  const playNextAudio = async () => {
    if (audioQueue.length === 0) {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    const audioData = audioQueue[0];
    const soundObject = new Audio.Sound();
    soundObjectRef.current = soundObject;

    try {
      // Create a temporary file to store the audio data
      const tempFile = `${
        FileSystem.cacheDirectory
      }/temp_audio_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(tempFile, audioData, {
        encoding: FileSystem.EncodingType.Base64
      });

      await soundObject.loadAsync({ uri: tempFile });
      await soundObject.playAsync();
      soundObject.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setAudioQueue((prevQueue) => prevQueue.slice(1));
          soundObject.unloadAsync().then(() => {
            setIsPlaying(false);
            // Delete the temporary file
            FileSystem.deleteAsync(tempFile, { idempotent: true });
          });
        }
      });
    } catch (error) {
      console.error("Error playing audio:", error);
      setAudioQueue((prevQueue) => prevQueue.slice(1));
      setIsPlaying(false);
    }
  };

  const startRecording = async () => {
    try {
      setStatus("Listening");
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
      setStatus("Error");
    }
  };

  const stopRecording = async () => {
    setStatus("Processing");
    setIsProcessing(true);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    const base64Audio = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    setRecording(undefined);
    setIsRecording(false);

    // Send audio to backend
    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      websocketRef.current.send(
        JSON.stringify({
          type: "audio",
          audio: base64Audio
        })
      );
    } else {
      console.error("WebSocket is not connected");
      setStatus("Error");
    }
  };

  const refreshContent = () => {
    // Reset all states to their initial values
    setStatus("Idle");
    setRecording(undefined);
    setIsRecording(false);
    setResponse("");
    setCode("");
    setActiveTab("chat"); // Assuming "chat" is the initial tab
    setIsProcessing(false);
    setAudioQueue([]);
    setIsPlaying(false);
    setChatHistory([]);

    // Stop and unload any playing audio
    if (soundObjectRef.current) {
      soundObjectRef.current.stopAsync();
      soundObjectRef.current.unloadAsync();
    }

    // Close and reconnect the WebSocket to ensure a fresh start
    if (websocketRef.current) {
      websocketRef.current.close(); // This will trigger the onclose event which sets the status to "Disconnected"
      connectWebSocket(); // Reconnect the WebSocket
    }
  };
  const renderContent = () => {
    if (isProcessing) {
      return <ActivityIndicator size="large" color="#2196F3" />;
    }
    return (
      <ScrollView style={styles.contentScrollView}>
        {activeTab === "chat" ? (
          chatHistory.map((item, index) => (
            <View key={index} style={styles.messageContainer}>
              <Text
                style={[
                  styles.chatMessage,
                  item.type === "response"
                    ? styles.aiMessage
                    : styles.userMessage
                ]}
              >
                {item.type === "response" ? "AI: " : "User: "} {item.text}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.contentText}>{code}</Text>
        )}
      </ScrollView>
    );
  };
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={["#000000", "#1a1a1a"]} style={styles.background}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>STATUS</Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  status === "Idle" || status === "Connected"
                    ? "#4CAF50"
                    : "#FFA500"
              }
            ]}
          />
          <Text
            style={[
              styles.statusLabel,
              {
                color:
                  status === "Idle" || status === "Connected"
                    ? "#4CAF50"
                    : "#FFA500"
              }
            ]}
          >
            {status}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.modelSelector}>
            <Text style={styles.modelText}>Interpreter Model</Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                activeTab === "chat" && styles.activeButton
              ]}
              onPress={() => setActiveTab("chat")}
            >
              <Text style={styles.buttonText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                activeTab === "code" && styles.activeButton
              ]}
              onPress={() => setActiveTab("code")}
            >
              <Text style={styles.buttonText}>Code</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.outputArea}>{renderContent()}</View>

          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={refreshContent}
            >
              <Ionicons name="refresh" size={24} color="white" />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.activeMicButton]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={32}
                color="white"
              />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  background: {
    flex: 1
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10
  },
  statusText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold"
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 10
  },
  statusLabel: {
    fontSize: 18,
    marginLeft: 10
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "space-between"
  },
  modelSelector: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20
  },
  modelText: {
    color: "white",
    fontSize: 16
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
  },
  button: {
    backgroundColor: "#2196F3",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 30,
    flex: 0.48
  },
  activeButton: {
    backgroundColor: "#1565C0"
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    textAlign: "center"
  },
  outputArea: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    flex: 1,
    marginBottom: 20
  },
  contentScrollView: {
    flex: 1
  },
  contentText: {
    color: "white",
    fontSize: 16,
    padding: 10
  },
  chatMessage: {
    borderRadius: 20,
    padding: 10,
    marginBottom: 5,
    maxWidth: "80%"
  },
  userMessage: {
    backgroundColor: "#DCF8C6", // Light green background for user messages
    alignSelf: "flex-end", // Aligns user messages to the right
    marginRight: 10,
    color: "black" // Dark text for better contrast
  },
  aiMessage: {
    backgroundColor: "#ECECEC", // Light grey background for AI messages
    alignSelf: "flex-start", // Aligns AI messages to the left
    marginLeft: 10,
    color: "black" // Dark text for better contrast
  },
  messageContainer: {
    flexDirection: "row",
    justifyContent: "flex-end"
  },
  bottomContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  refreshButton: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center"
  },
  refreshText: {
    color: "white",
    fontSize: 16,
    marginLeft: 5
  },
  micButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center"
  },
  activeMicButton: {
    backgroundColor: "#FF4136"
  }
});

export default AIAssistantGUI;
