import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Game from './components/Game';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const backgroundMusic = React.useRef(null);

  // Play background music only while in gameplay (not on start or end screens)
  useEffect(() => {
    let cancelled = false;
    const ensureStopped = async () => {
      if (backgroundMusic.current) {
        try { await backgroundMusic.current.stopAsync(); } catch {}
        try { await backgroundMusic.current.unloadAsync(); } catch {}
        backgroundMusic.current = null;
      }
    };
    const maybeStart = async () => {
      if (!gameStarted) {
        await ensureStopped();
        return;
      }
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        let soundModule;
        try {
          soundModule = require('./assets/sounds/background.mp3');
        } catch (e) {
          soundModule = require('./assets/sounds/background.wav');
        }
        const { sound } = await Audio.Sound.createAsync(soundModule, {
          volume: 0.6,
          isLooping: true,
        });
        if (cancelled) { try { await sound.unloadAsync(); } catch {}; return; }
        backgroundMusic.current = sound;
        await sound.playAsync();
      } catch (error) {
        console.warn('Background music not available:', error?.message || String(error));
      }
    };
    maybeStart();
    return () => { cancelled = true; };
  }, [gameStarted]);

  // Load high score from storage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('HIGH_SCORE');
        if (raw != null) {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'number' && !Number.isNaN(parsed)) {
            setHighScore(parsed);
          }
        }
      } catch (e) {
        console.warn('Failed to load high score:', e?.message || String(e));
      }
    })();
  }, []);

  const handleGameOver = (score) => {
    // Stop background music on end screen
    if (backgroundMusic.current) {
      try { backgroundMusic.current.stopAsync(); } catch {}
      try { backgroundMusic.current.unloadAsync(); } catch {}
      backgroundMusic.current = null;
    }
    if (score > highScore) {
      setHighScore(score);
      // Persist new high score
      (async () => {
        try {
          await AsyncStorage.setItem('HIGH_SCORE', JSON.stringify(score));
        } catch (e) {
          console.warn('Failed to persist high score:', e?.message || String(e));
        }
      })();
    }
  };

  if (!gameStarted) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <StatusBar hidden />
          <Text style={styles.title}>Color Dash</Text>
          <Text style={styles.subtitle}>Match the colors to score points!</Text>
          <Text style={styles.highScore}>High Score: {highScore}</Text>
          
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>• Swipe left/right to move</Text>
            <Text style={styles.instructionText}>• Tap 'Change Color' to match the falling blocks</Text>
            <Text style={styles.instructionText}>• Match colors to score points</Text>
            <Text style={styles.instructionText}>• Don't hit the wrong color!</Text>
          </View>

          <TouchableOpacity
            style={styles.startButton}
            onPress={() => setGameStarted(true)}
          >
            <Text style={styles.startButtonText}>Start Game</Text>
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Game onGameOver={handleGameOver} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center',
  },
  highScore: {
    fontSize: 24,
    color: '#4ECDC4',
    marginBottom: 40,
    fontWeight: 'bold',
  },
  instructions: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 15,
    width: '100%',
    maxWidth: 350,
    marginBottom: 40,
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  startButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  startButtonText: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
});
