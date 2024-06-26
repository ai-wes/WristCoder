import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Dimensions
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Canvas, Circle, Group } from "@shopify/react-native-skia";

const WEBSOCKET_URL = "wss://wristcode.emotion-ai.io/ws";
const { width, height } = Dimensions.get("window");
const VISUALIZATION_SIZE = Math.min(width, height) * 0.6;

const AIAssistantGUI = () => {
  const [status, setStatus] = useState("Idle");
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [codeOutput, setCodeOutput] = useState([]);
  const [activeTab, setActiveTab] = useState("chat");
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
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers
      });

      // For iOS, we need to set the category to ensure playback through the speaker
      if (Platform.OS === "ios") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers
        });
      }
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
    switch (data.type) {
      case "text":
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "user", text: data.text }
        ]);
        break;
      case "response":
        setResponse(data.text);
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "ai", text: data.text }
        ]);
        break;
      case "audio":
        setAudioQueue((prevQueue) => [...prevQueue, data.audio]);
        break;
      case "code_output":
        setCodeOutput((prevOutput) => [
          ...prevOutput,
          { type: "code", content: data.text }
        ]);
        break;
      case "chat":
        setChatHistory((prevHistory) => [
          ...prevHistory,
          { type: "ai", text: data.text }
        ]);
        break;
      case "agent_execution_result":
        setStatus("Idle");
        break;
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
      const tempFile = `${
        FileSystem.cacheDirectory
      }/temp_audio_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(tempFile, audioData, {
        encoding: FileSystem.EncodingType.Base64
      });

      await soundObject.loadAsync({ uri: tempFile });
      await soundObject.setVolumeAsync(1.0); // Ensure full volume
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

  const updateParticles = (audioData) => {
    const centerX = VISUALIZATION_SIZE / 2;
    const centerY = VISUALIZATION_SIZE / 2;
    const audioValue = Math.max(0, Math.min(1, (audioData[0] + 160) / 160));

    const newParticles = Array(100)
      .fill(0)
      .map((_, index) => {
        const angle = (index / 100) * Math.PI * 2;
        const distance = audioValue * VISUALIZATION_SIZE * 0.4;
        return {
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          size: 2 + audioValue * 3,
          color: `rgba(0, ${Math.floor(255 * audioValue)}, 0, 0.8)`
        };
      });

    setParticles(newParticles);
  };

  const ParticleVisualization = () => (
    <Canvas style={styles.canvas}>
      <Group>
        <Circle
          cx={VISUALIZATION_SIZE / 2}
          cy={VISUALIZATION_SIZE / 2}
          r={VISUALIZATION_SIZE / 2 - 10}
          color="rgba(0, 255, 0, 0.1)"
        />
        <Circle
          cx={VISUALIZATION_SIZE / 2}
          cy={VISUALIZATION_SIZE / 2}
          r={VISUALIZATION_SIZE / 3}
          color="rgba(0, 255, 0, 0.2)"
        />
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

  const renderContent = () => {
    if (isProcessing) {
      return <ActivityIndicator size="large" color="#00ff00" />;
    }
    return (
      <ScrollView style={styles.contentScrollView}>
        <View style={styles.visualizerContainer}>
          <ParticleVisualization />
        </View>
        {activeTab === "chat"
          ? chatHistory.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.messageContainer,
                  item.type === "ai"
                    ? styles.aiMessageContainer
                    : styles.userMessageContainer
                ]}
              >
                <View style={styles.glassEffect}>
                  <Text
                    style={[
                      styles.chatMessage,
                      item.type === "ai" ? styles.aiMessage : styles.userMessage
                    ]}
                  >
                    {item.type === "ai" ? "AI: " : "User: "} {item.text}
                  </Text>
                </View>
              </View>
            ))
          : codeOutput.map((item, index) => (
              <View key={index} style={styles.codeBlock}>
                <Text style={styles.codeText}>{item.content}</Text>
              </View>
            ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={["#000000", "#1a1a1a"]} style={styles.background}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>Status: </Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  status === "Idle" || status === "Connected"
                    ? "#4CAF50"
                    : "#FF4136"
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
                    : "#FF4136"
              }
            ]}
          >
            {status}
          </Text>
        </View>

        <View style={styles.content}>
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
  visualizerContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  canvas: {
    width: VISUALIZATION_SIZE,
    height: VISUALIZATION_SIZE
  },
  bottomContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
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
    fontSize: 18
  },
  userMessage: {
    color: "white"
  },
  aiMessage: {
    color: "white"
  },
  glassEffect: {
    backgroundColor: "rgba(19, 19, 19, 0.272)",
    borderRadius: 20,
    padding: 10,
    marginBottom: 5,
    maxWidth: "80%",
    backdropFilter: "blur(20px)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)"
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: 10,
    color: "grey",
    backgroundColor: "rgba(17, 83, 0, 0.5)"
  },
  aiMessageContainer: {
    alignSelf: "flex-start",
    marginLeft: 10,
    color: "grey"
  },
  messageContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginVertical: 5,
    maxWidth: "80%"
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
  },
  codeScrollView: {
    flex: 1
  },
  codeBlock: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  codeText: {
    color: "white",
    fontFamily: "monospace"
  }
});

export default AIAssistantGUI;
