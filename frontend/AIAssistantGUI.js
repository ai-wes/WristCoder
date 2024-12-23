import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  TextInput,
  Alert
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Audio, InterruptionModeIOS } from "expo-av";
import * as FileSystem from "expo-file-system";
import LoopingGif from "./LoopingGif";

const WEBSOCKET_URL = "ws://192.168.1.224:8888/ws";
const { width, height } = Dimensions.get("window");
const VISUALIZATION_SIZE = Math.min(width, height) * 0.6;

const AIAssistantGUI = () => {
  const [status, setStatus] = useState("Idle");
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [codeOutput, setCodeOutput] = useState([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [inputRequired, setInputRequired] = useState(false);
  const [inputPrompt, setInputPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [audioData, setAudioData] = useState(new Uint8Array(128));
  const [audioLevel, setAudioLevel] = useState(1);
  const [audioFrequency, setAudioFrequency] = useState(500);

  const [userInput, setUserInput] = useState("");
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [isCodeConfirmationRequired, setIsCodeConfirmationRequired] =
    useState(false);

  const soundObjectRef = useRef(null);
  const websocketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    connectWebSocket();
    setupAudio();
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

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        playThroughEarpieceAndroid: false
      });
    } catch (error) {
      console.error("Error setting up audio:", error);
    }
  };

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
    console.log("Received WebSocket message:", data);
    switch (data.type) {
      case "parsed_message":
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "ai", text: data.text }
        ]);
        break;
      case "code_output":
        try {
          const parsedData = JSON.parse(data.text);
          if (parsedData.role === "computer" && parsedData.type === "console") {
            if (parsedData.start) {
              setCurrentCode("");
            } else if (parsedData.end) {
              setCodeOutput((prevOutput) => [
                ...prevOutput,
                { content: currentCode }
              ]);
              setCurrentCode("");
            } else {
              setCurrentCode((prev) => prev + (parsedData.content || ""));
            }
          } else {
            setCodeOutput((prevOutput) => [
              ...prevOutput,
              { content: data.text, type: "code_output" }
            ]);
          }
        } catch (error) {
          console.error("Error parsing code_output:", error);
          setCodeOutput((prevOutput) => [
            ...prevOutput,
            { content: data.text, type: "code_output" }
          ]);
        }
        break;
      case "userMessage":
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "userMessage", text: data.text }
        ]);
        break;
      case "parsed_message":
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "ai", text: data.text }
        ]);
        break;
      case "input_required":
        setInputRequired(true);
        setInputPrompt(data.prompt);
        setIsCodeConfirmationRequired(true);
        break;
      case "audio":
        setAudioQueue((prevQueue) => [...prevQueue, data.audio]);
        // Convert base64 audio to Uint8Array for visualization
        const audioArray = new Uint8Array(
          atob(data.audio)
            .split("")
            .map((char) => char.charCodeAt(0))
        );
        setAudioData(audioArray);
        break;
    }
    setIsProcessing(false);
  };

  const sendMessage = () => {
    if (userInput.trim() === "") return;

    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      websocketRef.current.send(
        JSON.stringify({
          type: "text",
          text: userInput
        })
      );
      setChatHistory((prevHistory) => [
        ...prevHistory,
        { type: "user", text: userInput }
      ]);
      setUserInput("");
      setIsProcessing(true);
    } else {
      console.error("WebSocket is not connected");
      setStatus("Error");
    }
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });

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
    setStatus("Idle");
    setRecording(undefined);
    setIsRecording(false);
    setResponse("");
    setIsProcessing(false);
    setAudioQueue([]);
    setIsPlaying(false);
    setChatHistory([]);
    setCodeOutput([]);
    if (soundObjectRef.current) {
      soundObjectRef.current.stopAsync();
      soundObjectRef.current.unloadAsync();
    }

    if (websocketRef.current) {
      websocketRef.current.close();
      connectWebSocket();
    }
  };

  useEffect(() => {
    console.log("inputRequired changed:", inputRequired);
  }, [inputRequired]);

  useEffect(() => {
    console.log("isProcessing changed:", isProcessing);
  }, [isProcessing]);

  const sendUserInput = () => {
    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {
      websocketRef.current.send(
        JSON.stringify({
          type: "text",
          text: userInput
        })
      );
      setInputRequired(false);
      setUserInput("");
      setIsCodeConfirmationRequired(false);

      if (isCodeConfirmationRequired) {
        setCurrentCode("");
      }
    } else {
      console.error("WebSocket is not connected");
      setStatus("Error");
    }
  };

  return (
    <LinearGradient colors={["#000000", "#2f2f2f"]} style={styles.background}>
      <Text style={styles.status}>
        Status: {isConnected ? "Connected" : "Disconnected"}
      </Text>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>Status: </Text>
        <View
          style={[
            styles.statusIndicator,
            {
              backgroundColor: status === "Connected" ? "#1fe026" : "#FF4136"
            }
          ]}
        />
        <Text
          style={[
            styles.statusLabel,
            { color: status === "Connected" ? "#1fe026" : "#FF4136" }
          ]}
        >
          {status}
        </Text>
      </View>
      {/* Visualizer at the top */}
      <View style={styles.visualizerContainer}>
        <LoopingGif
          source={require("./assets/looping_gif.gif")}
          style={{ width: 225, height: 225, marginTop: -15 }} // Adjust size as needed
        />
      </View>
      <View style={styles.content}>
        <View style={styles.chatConsoleContainer}>
          <View style={styles.mainContentArea}>
            {activeTab === "chat" ? (
              <ScrollView
                style={styles.chatContainer}
                contentContainerStyle={styles.chatContent}
              >
                {chatHistory.map((message, index) => (
                  <View
                    key={index}
                    style={[
                      styles.messageContainer,
                      message.type === "ai"
                        ? styles.aiMessageContainer
                        : styles.userMessageContainer
                    ]}
                  >
                    <View style={styles.glassEffect}>
                      <Text
                        style={[
                          styles.chatMessage,
                          message.type === "ai"
                            ? styles.aiMessage
                            : styles.userMessage
                        ]}
                      >
                        {message.type === "ai" ? "AI: " : "User: "}{" "}
                        {message.text}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.consoleContainer}
                contentContainerStyle={styles.consoleContent}
              >
                {codeOutput.map((output, index) => (
                  <View key={index} style={styles.codeOutputContainer}>
                    <Text style={styles.codeOutputLabel}>
                      {output.type === "code" ? "Code:" : "Output:"}
                    </Text>
                    <Text style={styles.codeOutput}>{output.content}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "chat" && styles.activeTab]}
              onPress={() => setActiveTab("chat")}
            >
              <Text style={styles.tabText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "console" && styles.activeTab]}
              onPress={() => setActiveTab("console")}
            >
              <Text style={styles.tabText}>Console</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={userInput}
            onChangeText={setUserInput}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Ionicons name="send" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={refreshContent}
          >
            <Ionicons name="refresh" size={24} color="white" />
            <Text style={styles.refreshText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.activeMicButton]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",

    marginTop: -20
  },
  particleSphere: {
    width: "100%",
    color: "#1fe026"
  },

  background: {
    flex: 1
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 19
  },
  statusText: {
    color: "white",
    fontSize: 18,
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
  visualizerContainer: {
    width: "100%",
    height: "30%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    backgroundColor: "black" // Add a background color for visibility
  },

  chatContent: {
    padding: 10
  },
  messageContainer: {
    flexDirection: "row",
    marginVertical: 5,
    maxWidth: "90%"
  },
  userMessageContainer: {
    backgroundColor: "#343434",
    justifyContent: "flex-end",
    alignSelf: "flex-end",
    borderRadius: 20
  },
  aiMessageContainer: {
    backgroundColor: "#00820475",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    borderRadius: 20
  },
  glassEffect: {
    backgroundColor: "rgba(19, 19, 19, 0.272)",
    borderRadius: 20,
    padding: 10,
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)"
  },
  chatMessage: {
    fontSize: 14
  },
  userMessage: {
    color: "white"
  },
  aiMessage: {
    color: "white"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 25,
    paddingHorizontal: 15,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "rgba(97, 97, 97, 0.2)",
    dropShadow: 150,
    shadowColor: "rgba(134, 134, 134, 0.4)"
  },
  input: {
    flex: 1,
    color: "white",
    height: 30,
    fontSize: 16
  },
  sendButton: {
    padding: 10
  },
  bottomContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  refreshButton: {
    backgroundColor: "#266328b8",
    borderRadius: 25,
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
  },
  content: {
    flex: 1,
    padding: 20
  },
  chatConsoleContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    height: "100%",
    marginBottom: 10,
    overflow: "hidden"
  },
  mainContentArea: {
    flex: 1
  },
  tabContainer: {
    width: 40,
    backgroundColor: "#2a2a2a",
    justifyContent: "space-between",
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255, 255, 255, 0.336)"
  },
  tab: {
    flex: 1,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 3,
    borderLeftColor: "transparent"
  },
  activeTab: {
    backgroundColor: "#3a3a3a",
    borderLeftColor: "#1fe026"
  },
  tabText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    transform: [{ rotate: "270deg" }],
    width: 120,
    textAlign: "center"
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    border: "2px solid rgba(255, 255, 255, 0.827)"
  },
  consoleContainer: {
    flex: 1,
    color: "#1fe026",
    backgroundColor: "#1a1a1a",
    border: "2px solid rgba(255, 255, 255, 0.827)"
  },
  codeOutput: {
    padding: 10,
    color: "#1fe026"
  }
});

export default AIAssistantGUI;
