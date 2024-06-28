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
import { Canvas, Circle, Group } from "@shopify/react-native-skia";

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

  const [userInput, setUserInput] = useState("");
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [isCodeConfirmationRequired, setIsCodeConfirmationRequired] =
    useState(false);

  const soundObjectRef = useRef(null);
  const websocketRef = useRef(null);
  const [particles, setParticles] = useState([]);

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
      case "chat":
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
          } else if (
            parsedData.role === "assistant" &&
            parsedData.type === "code"
          ) {
            if (parsedData.start) {
              setCurrentCode("");
            } else if (parsedData.end) {
              setCodeOutput((prevOutput) => [
                ...prevOutput,
                { content: currentCode, type: "code" }
              ]);
              setCurrentCode("");
            } else {
              setCurrentCode((prev) => prev + (parsedData.content || ""));
            }
          }
        } catch (error) {
          console.error("Error parsing code_output:", error);
          setCodeOutput((prevOutput) => [
            ...prevOutput,
            { content: data.text }
          ]);
        }
        break;
      case "input_required":
        setInputRequired(true);
        setInputPrompt(data.prompt);
        setIsCodeConfirmationRequired(true);
        break;
      case "audio":
        setAudioQueue((prevQueue) => [...prevQueue, data.audio]);
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

  const ParticleVisualization = () => (
    <Canvas style={styles.canvas}>
      <Group>
        {particles.map((particle, index) => (
          <Circle
            key={index}
            cx={particle.x}
            cy={particle.y}
            r={particle.size}
            color={particle.color}
          />
        ))}
      </Group>
    </Canvas>
  );
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={["#000000", "#1a1a1a"]} style={styles.background}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>Status: </Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: status === "Connected" ? "#4CAF50" : "#FF4136"
              }
            ]}
          />
          <Text
            style={[
              styles.statusLabel,
              { color: status === "Connected" ? "#4CAF50" : "#FF4136" }
            ]}
          >
            {status}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.visualizerContainer}>
            <ParticleVisualization />
          </View>

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
                      <Text style={styles.codeOutput}>
                        {output.type === "code" ? "Code: " : "Output: "}
                        {output.content}
                      </Text>
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
                style={[
                  styles.tab,
                  activeTab === "console" && styles.activeTab
                ]}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%"
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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  canvas: {
    width: VISUALIZATION_SIZE,
    height: VISUALIZATION_SIZE
  },
  chatContent: {
    padding: 10
  },
  messageContainer: {
    flexDirection: "row",
    marginVertical: 5,
    maxWidth: "80%"
  },
  userMessageContainer: {
    justifyContent: "flex-end",
    alignSelf: "flex-end"
  },
  aiMessageContainer: {
    justifyContent: "flex-start",
    alignSelf: "flex-start"
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
    fontSize: 16
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
    marginBottom: 10
  },
  input: {
    flex: 1,
    color: "white",
    height: 50,
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
    backgroundColor: "#4CAF50",
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
    marginBottom: 20,
    overflow: "hidden"
  },
  mainContentArea: {
    flex: 1
  },
  tabContainer: {
    width: 40,
    backgroundColor: "#2a2a2a",
    justifyContent: "space-between", // Changed from "center" to "space-between"
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255, 255, 255, 0.336)"
  },
  tab: {
    flex: 1, // Changed from fixed height to flex: 1
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 3,
    borderLeftColor: "transparent"
  },
  activeTab: {
    backgroundColor: "#3a3a3a",
    borderLeftColor: "#4CAF50"
  },
  tabText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    transform: [{ rotate: "270deg" }],
    width: 120, // Increased width to accommodate longer text
    textAlign: "center" // Ensure text is centered
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",

    border: "2px solid rgba(255, 255, 255, 0.827)"
  },
  consoleContainer: {
    flex: 1,
    color: "#4CAF50",

    backgroundColor: "#1a1a1a",
    border: "2px solid rgba(255, 255, 255, 0.827)"
  }
});
export default AIAssistantGUI;
