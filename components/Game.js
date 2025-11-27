import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLAYER_SIZE = 50;
const OBSTACLE_WIDTH = 60;
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

export default function Game({ onGameOver }) {
  const playerPos = useSharedValue({ x: SCREEN_WIDTH / 2 - PLAYER_SIZE / 2, y: SCREEN_HEIGHT - 100 });
  const playerColor = useSharedValue(0);
  const score = useRef(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [pendingGameOverScore, setPendingGameOverScore] = useState(null);
  const [obstacles, setObstacles] = useState([]);
  const [particles, setParticles] = useState([]);
  const gameLoopRef = useRef(null);
  const obstacleSpeed = useRef(5);
  // Point sound disabled until assets are added
  const shake = useSharedValue(0);

  // Sound loading removed to avoid bundling errors when file is missing

  // Player movement
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newX = e.absoluteX - PLAYER_SIZE / 2;
      if (newX >= 0 && newX <= SCREEN_WIDTH - PLAYER_SIZE) {
        playerPos.value = {
          x: newX,
          y: playerPos.value.y,
        };
      }
    });

  // Player style with animation
  const playerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: withSpring(playerPos.value.x, { damping: 20, stiffness: 300 }) },
        { translateY: withSpring(playerPos.value.y, { damping: 20, stiffness: 300 }) },
      ],
      backgroundColor: COLORS[playerColor.value],
    };
  });

  // Screen shake style
  const shakeStyle = useAnimatedStyle(() => {
    const translateX = (Math.random() - 0.5) * 2 * shake.value; // small jitter
    const translateY = (Math.random() - 0.5) * 2 * shake.value;
    return { transform: [{ translateX }, { translateY }] };
  });

  // Particles are rendered as simple absolute Views updated via state

  // Generate new obstacle
  const generateObstacle = useCallback(() => {
    const colorIndex = Math.floor(Math.random() * COLORS.length);
    const x = Math.random() * (SCREEN_WIDTH - OBSTACLE_WIDTH);
    
    return {
      id: Date.now() + Math.random(),
      x,
      y: -OBSTACLE_WIDTH,
      color: COLORS[colorIndex],
      colorIndex,
      width: OBSTACLE_WIDTH,
      height: OBSTACLE_WIDTH,
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (isGameOver) return;

    // Spawn obstacles
    const obstacleInterval = setInterval(() => {
      setObstacles(prev => [...prev, generateObstacle()]);
    }, 1200);

    // Game loop ~60fps
    gameLoopRef.current = setInterval(() => {
      setObstacles(prev => {
        const updatedObstacles = prev
          .map(obs => ({ ...obs, y: obs.y + obstacleSpeed.current }))
          .filter(obs => {
            const playerRect = {
              x: playerPos.value.x,
              y: playerPos.value.y,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
            };
            const obstacleRect = { x: obs.x, y: obs.y, width: obs.width, height: obs.height };

            const collision = !(
              playerRect.x > obstacleRect.x + obstacleRect.width ||
              playerRect.x + playerRect.width < obstacleRect.x ||
              playerRect.y > obstacleRect.y + obstacleRect.height ||
              playerRect.y + playerRect.height < obstacleRect.y
            );

            if (collision) {
              if (playerColor.value === obs.colorIndex) {
                // Match color - score point
                score.current += 1;
                setCurrentScore(score.current);
                // Sound disabled until assets are added
                // Haptics: impact on score
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

                // Emit particles around player
                const px = playerPos.value.x + PLAYER_SIZE / 2;
                const py = playerPos.value.y + PLAYER_SIZE / 2;
                const burst = Array.from({ length: 14 }).map((_, i) => ({
                  id: `p-${Date.now()}-${i}-${Math.random()}`,
                  x: px + (Math.random() - 0.5) * 20,
                  y: py + (Math.random() - 0.5) * 20,
                  vx: (Math.random() - 0.5) * 2,
                  vy: -2 - Math.random() * 2,
                  life: 30 + Math.floor(Math.random() * 20),
                  color: COLORS[obs.colorIndex],
                  size: 4 + Math.random() * 6,
                  opacity: 1,
                }));
                setParticles(prevP => [...prevP, ...burst]);

                // Trigger screen shake
                shake.value = withSequence(
                  withTiming(8, { duration: 40 }),
                  withTiming(0, { duration: 120 })
                );
                return false; // remove obstacle
              } else {
                // Game over
                clearInterval(gameLoopRef.current);
                clearInterval(obstacleInterval);
                setIsGameOver(true);
                setPendingGameOverScore(score.current);
                // Haptics: notify on game over
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
                return false;
              }
            }

            // Keep obstacle if still on screen
            return obs.y < SCREEN_HEIGHT;
          });

        // Increase difficulty
        if (score.current > 0 && score.current % 5 === 0) {
          obstacleSpeed.current = Math.min(16, 5 + Math.floor(score.current / 5));
        }

        // Update particles
        setParticles(prev => {
          const next = prev
            .map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              vy: p.vy * 0.98 + 0.02, // slight gravity ease
              life: p.life - 1,
              opacity: Math.max(0, p.opacity - 0.03),
            }))
            .filter(p => p.life > 0 && p.opacity > 0 && p.y > -20);
          return next;
        });

        return updatedObstacles;
      });
    }, 16);

    return () => {
      clearInterval(obstacleInterval);
      clearInterval(gameLoopRef.current);
    };
  }, [isGameOver, generateObstacle, playerPos, playerColor]);

  // Defer notifying parent about game over to avoid setState during render warning
  useEffect(() => {
    if (isGameOver && pendingGameOverScore != null) {
      onGameOver?.(pendingGameOverScore);
      // clear pending score to avoid repeated calls
      setPendingGameOverScore(null);
    }
  }, [isGameOver, pendingGameOverScore, onGameOver]);

  // Change player color on tap
  const changeColor = useCallback(() => {
    playerColor.value = (playerColor.value + 1) % COLORS.length;
  }, [playerColor]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <LinearGradient
        colors={["#0f1020", "#1a1a3a", "#1f1b4a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
        <Text style={styles.score}>Score: {currentScore}</Text>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.player, playerStyle]} />
        </GestureDetector>

        {obstacles.map((obstacle) => (
          <View
            key={obstacle.id}
            style={[
              styles.obstacle,
              {
                left: obstacle.x,
                top: obstacle.y,
                backgroundColor: obstacle.color,
                width: obstacle.width,
                height: obstacle.height,
              },
            ]}
          />
        ))}

        {particles.map((p) => (
          <View
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.color,
              opacity: p.opacity,
            }}
          />
        ))}

        <TouchableOpacity style={styles.colorButton} onPress={changeColor}>
          <Text style={styles.colorButtonText}>Change Color</Text>
        </TouchableOpacity>

        {isGameOver && (
          <View style={styles.gameOverContainer}>
            <Text style={styles.gameOverText}>Game Over!</Text>
            <Text style={styles.finalScore}>Score: {currentScore}</Text>
            <TouchableOpacity
              style={styles.restartButton}
              onPress={() => {
                setObstacles([]);
                setParticles([]);
                score.current = 0;
                setCurrentScore(0);
                setIsGameOver(false);
                obstacleSpeed.current = 5;
                playerPos.value = { x: SCREEN_WIDTH / 2 - PLAYER_SIZE / 2, y: SCREEN_HEIGHT - 100 };
              }}
            >
              <Text style={styles.restartButtonText}>Play Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1020',
  },
  score: {
    position: 'absolute',
    top: 40,
    left: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    zIndex: 10,
  },
  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: PLAYER_SIZE / 2,
    backgroundColor: COLORS[0],
    zIndex: 5,
  },
  obstacle: {
    position: 'absolute',
    borderRadius: 10,
  },
  colorButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#e94560',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  colorButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  gameOverContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  gameOverText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  finalScore: {
    fontSize: 32,
    color: 'white',
    marginBottom: 40,
  },
  restartButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
  },
  restartButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
