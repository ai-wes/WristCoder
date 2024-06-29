import React from "react";
import { View, Image, StyleSheet } from "react-native";

const LoopingGif = ({ source, style }) => {
  return (
    <View style={styles.container}>
      <Image
        source={require("./assets/looping_gif.gif")}
        style={[styles.gif, style]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center"
  },
  gif: {
    width: 200,
    height: 200,
    resizeMode: "contain"
  }
});

export default LoopingGif;
