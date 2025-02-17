import * as React from 'react';
import {DarkTheme, NavigationContainer} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {PreJoinPage} from './PreJoinPage';
import {RoomPage} from './RoomPage';
import Toast from 'react-native-toast-message';

export type RootStackParamList = {
  PreJoinPage: undefined;
  RoomPage: {url: string; token: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <>
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator>
          <Stack.Screen name="PreJoinPage" component={PreJoinPage} />
          <Stack.Screen name="RoomPage" component={RoomPage} />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </>
  );
}
