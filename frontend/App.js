import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import AIAssistantGUI from "./AIAssistantGUI"; // Assuming you have this component

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="AI Assistant"
          component={AIAssistantGUI}
          options={{
            headerStyle: {
              backgroundColor: "#000000"
            },
            headerTintColor: "#fff",
            headerTitleStyle: {
              fontWeight: "bold"
            }
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
