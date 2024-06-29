import React from "react";
import { registerRootComponent } from "expo";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import AIAssistantGUI from "./AIAssistantGUI"; // Adjust the import path if necessary

const Stack = createStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="AIAssistant">
        <Stack.Screen
          name="AIAssistant"
          component={AIAssistantGUI}
          options={{
            headerShown: false // This hides the header for the AIAssistantGUI screen
          }}
        />
        {/* You can add more screens here as needed */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default registerRootComponent(App);
