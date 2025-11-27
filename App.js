import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Game from './components/Game';
import { Audio } from 'expo-av';
// TEMP: AsyncStorage not installed yet; use no-op helpers to avoid bundling error
const Storage = {
  getItem: async () => null,
  setItem: async () => {},
};

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const backgroundMusic = React.useRef(null);

  // Load and play background music (disabled until assets are added)
  useEffect(() => {
    let isMounted = true;
    // Intentionally disabled to avoid bundling errors when asset files are missing.
    // Re-enable by providing local assets at ./assets/sounds/background.mp3 (or .wav)
    // and using Audio.Sound.createAsync(require('...')) here.
    return () => {
      isMounted = false;
      if (backgroundMusic.current) {
        backgroundMusic.current.unloadAsync();
        backgroundMusic.current = null;
      }
    };
  }, []);

  // Load high score from storage
  useEffect(() => {
    (async () => {
      try {
        const raw = await Storage.getItem('HIGH_SCORE');
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
    if (score > highScore) {
      setHighScore(score);
      // Persist new high score
      (async () => {
        try {
          await Storage.setItem('HIGH_SCORE', JSON.stringify(score));
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
