import * as React from 'react';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

import {
  StyleSheet,
  View,
  FlatList,
  ListRenderItem,
  findNodeHandle,
  NativeModules,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import type {RootStackParamList} from './App';
import {useEffect, useState} from 'react';
import {RoomControls} from './RoomControls';
import {ParticipantView} from './ParticipantView';
import {
  AudioSession,
  useIOSAudioManagement,
  useLocalParticipant,
  LiveKitRoom,
  useDataChannel,
  useRoomContext,
  useVisualStableUpdate,
  useTracks,
  TrackReferenceOrPlaceholder,
  ReceivedDataMessage,
} from '@livekit/react-native';
// @ts-ignore
import {
  mediaDevices,
  ScreenCapturePickerView,
} from '@livekit/react-native-webrtc';
import {startCallService, stopCallService} from './callservice/CallService';
import Toast from 'react-native-toast-message';

import 'fastestsmallesttextencoderdecoder';
import {Track} from 'livekit-client';
import type {SimulationScenario} from 'livekit-client';

type SimulateScenario = SimulationScenario;

type RoomControlsProps = {
  micEnabled: boolean;
  setMicEnabled: (enabled: boolean) => void;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
  switchCamera: () => Promise<void>;
  screenShareEnabled: boolean;
  setScreenShareEnabled: (enabled: boolean) => void;
  sendData: (message: string) => void;
  onSimulate: (scenario: SimulateScenario) => void;
  onDisconnectClick: () => void;
};

const requestPermissions = async () => {
  if (Platform.OS === 'ios') {
    try {
      const granted = await mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      return !!granted;
    } catch (e) {
      console.warn('Error getting user media:', e);
      return false;
    }
  } else {
    // For Android
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      return (
        granted['android.permission.CAMERA'] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.RECORD_AUDIO'] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
};

const initializeRoom = async () => {
  // Request permissions first
  const permissionsGranted = await requestPermissions();
  if (!permissionsGranted) {
    throw new Error('Permissions not granted');
  }

  if (Platform.OS === 'ios') {
    try {
      await mediaDevices.getUserMedia({audio: true, video: true});
    } catch (e) {
      console.warn('Initial getUserMedia failed:', e);
    }
  }
};

export const RoomPage = ({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'RoomPage'>) => {
  const {url, token} = route.params;

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        await initializeRoom();
        if (!mounted) {
          return;
        }

        await AudioSession.startAudioSession();
      } catch (error) {
        console.warn(
          'Failed to initialize room or start audio session:',
          error,
        );
        Toast.show({
          type: 'error',
          text1: 'Permission Error',
          text2: 'Please grant camera and microphone permissions',
        });
        navigation.pop();
        return;
      }
    };

    start();
    return () => {
      mounted = false;
      AudioSession.stopAudioSession();
    };
  }, [navigation]);

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      options={{
        adaptiveStream: {pixelDensity: 'screen'},
        // Add iOS-specific options
        publishDefaults: {
          simulcast: Platform.OS === 'ios' ? false : true,
          videoSimulcastLayers: Platform.OS === 'ios' ? [] : undefined,
        },
      }}
      audio={true}
      video={true}
      onError={error => {
        console.error('LiveKit Room error:', error);
        // Handle room connection errors
        Toast.show({
          type: 'error',
          text1: 'Connection Error',
          text2: 'Failed to connect to room',
        });
        navigation.pop();
      }}>
      <RoomView navigation={navigation} />
    </LiveKitRoom>
  );
};

interface RoomViewProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RoomPage'>;
}

const RoomView = ({navigation}: RoomViewProps) => {
  const [isCameraFrontFacing, setCameraFrontFacing] = useState(true);
  const room = useRoomContext();
  useIOSAudioManagement(room);
  // Perform platform specific call setup.
  useEffect(() => {
    startCallService();
    return () => {
      stopCallService();
    };
  }, []);

  // Setup room listeners
  const {send} = useDataChannel((dataMessage: ReceivedDataMessage<string>) => {
    //@ts-ignore
    let decoder = new TextDecoder('utf-8');
    let message = decoder.decode(dataMessage.payload);

    let title = 'Received Message';
    if (dataMessage.from != null) {
      title = 'Received Message from ' + dataMessage.from?.identity;
    }
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
    });
  });

  const tracks = useTracks(
    [
      {source: Track.Source.Camera, withPlaceholder: true},
      {source: Track.Source.ScreenShare, withPlaceholder: false},
    ],
    {onlySubscribed: false},
  );
  const stableTracks = useVisualStableUpdate(tracks, 5);
  // Setup views.
  const stageView = tracks.length > 0 && (
    <ParticipantView trackRef={stableTracks[0]} style={styles.stage} />
  );

  const renderParticipant: ListRenderItem<TrackReferenceOrPlaceholder> = ({
    item,
  }) => {
    return (
      <ParticipantView trackRef={item} style={styles.otherParticipantView} />
    );
  };

  const otherParticipantsView = stableTracks.length > 0 && (
    <FlatList
      data={stableTracks}
      renderItem={renderParticipant}
      horizontal={true}
      style={styles.otherParticipantsList}
    />
  );

  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();

  // Prepare for iOS screenshare.
  const screenCaptureRef = React.useRef(null);
  const screenCapturePickerView = Platform.OS === 'ios' && (
    <ScreenCapturePickerView ref={screenCaptureRef} />
  );

  const startBroadcast = async () => {
    if (Platform.OS === 'ios') {
      const reactTag = findNodeHandle(screenCaptureRef.current);
      await NativeModules.ScreenCapturePickerViewManager.show(reactTag);
      localParticipant.setScreenShareEnabled(true);
    } else {
      localParticipant.setScreenShareEnabled(true);
    }
  };

  const switchCamera = async () => {
    let facingModeStr = !isCameraFrontFacing ? 'front' : 'environment';
    setCameraFrontFacing(!isCameraFrontFacing);

    const devices = (await mediaDevices.enumerateDevices()) as any[];
    let newDevice: any | undefined;

    for (const device of devices) {
      if (
        device.kind === 'videoinput' &&
        // @ts-ignore - LiveKit's type definition issue with 'facing'
        device.facing === facingModeStr
      ) {
        newDevice = device;
        break;
      }
    }

    if (!newDevice) {
      return;
    }

    await room.switchActiveDevice('videoinput', newDevice.deviceId);
  };

  return (
    <View style={styles.container}>
      {stageView}
      {otherParticipantsView}
      <RoomControls
        micEnabled={isMicrophoneEnabled}
        setMicEnabled={(enabled: boolean) => {
          localParticipant.setMicrophoneEnabled(enabled);
        }}
        cameraEnabled={isCameraEnabled}
        setCameraEnabled={(enabled: boolean) => {
          localParticipant.setCameraEnabled(enabled);
        }}
        switchCamera={switchCamera}
        screenShareEnabled={isScreenShareEnabled}
        setScreenShareEnabled={(enabled: boolean) => {
          if (enabled) {
            startBroadcast();
          } else {
            localParticipant.setScreenShareEnabled(enabled);
          }
        }}
        sendData={(message: string) => {
          Toast.show({
            type: 'success',
            text1: 'Sending Message',
            text2: message,
          });

          let encoder = new TextEncoder();
          let encodedData = encoder.encode(message);
          send(encodedData, {reliable: true});
        }}
        onDisconnectClick={() => {
          navigation.pop();
        }}
      />
      {screenCapturePickerView}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    width: '100%',
  },
  otherParticipantsList: {
    width: '100%',
    height: 150,
    flexGrow: 0,
  },
  otherParticipantView: {
    width: 150,
    height: 150,
  },
});
