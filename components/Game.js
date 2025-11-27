import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, useAnimatedStyle, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { Audio } from 'expo-av';
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
  const pointSound = useRef(null);
  const shake = useSharedValue(0);
  // Levels
  const [level, setLevel] = useState(1);
  const levelThreshold = 10; // points per level
  const spawnIntervalRef = useRef(null);
  const obstacleSizeRef = useRef(OBSTACLE_WIDTH);
  // Pausing and level-complete UI
  const [isPaused, setIsPaused] = useState(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  // Load point scoring sound
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/point.wav')
        );
        if (!mounted) return;
        pointSound.current = sound;
      } catch (e) {
        // If asset missing, ignore
      }
    })();
    return () => {
      mounted = false;
      if (pointSound.current) {
        pointSound.current.unloadAsync();
        pointSound.current = null;
      }
    };
  }, []);

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
    const size = obstacleSizeRef.current;
    const x = Math.random() * (SCREEN_WIDTH - size);
    // Horizontal velocity for Level 2+
    // For Level 2, emphasize rotation (no horizontal); for Level 3+, allow horizontal
    const vx = (typeof level !== 'undefined' && level >= 3)
      ? ((Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2))
      : 0;
    // Rotation setup for Level 2+
    const angle = (typeof level !== 'undefined' && level >= 2) ? Math.random() * 360 : 0;
    const rotateSpeed = (typeof level !== 'undefined' && level >= 2)
      ? (0.8 + Math.random() * 1.2) * (Math.random() < 0.5 ? -1 : 1)
      : 0;
    
    return {
      id: Date.now() + Math.random(),
      x,
      y: -size,
      color: COLORS[colorIndex],
      colorIndex,
      width: size,
      height: size,
      vx,
      angle,
      rotateSpeed,
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (isGameOver) return;

    // Spawn obstacles (managed by level-dependent interval)
    const startSpawning = () => {
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      const base = 1200;
      const rate = Math.max(500, base - (level - 1) * 100);
      spawnIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          setObstacles(prev => [...prev, generateObstacle()]);
        }
      }, rate);
    };
    startSpawning();

    // Game loop ~60fps
    gameLoopRef.current = setInterval(() => {
      setObstacles(prev => {
        if (isPaused) return prev; // freeze game state while paused
        const updatedObstacles = prev
          .map(obs => {
            // Vertical movement
            let newY = obs.y + obstacleSpeed.current;
            // Horizontal movement for Level 2+
            let newX = obs.x;
            let newVx = obs.vx ?? 0;
            if (level >= 3 && newVx !== 0) {
              newX += newVx;
              if (newX <= 0 || newX + obs.width >= SCREEN_WIDTH) {
                newVx = -newVx; // bounce
                newX = Math.max(0, Math.min(SCREEN_WIDTH - obs.width, newX));
              }
            }
            // Rotation for Level 2+
            let newAngle = obs.angle ?? 0;
            let newRotateSpeed = obs.rotateSpeed ?? 0;
            if (level >= 2 && newRotateSpeed !== 0) {
              newAngle = (newAngle + newRotateSpeed) % 360;
            }
            return { ...obs, y: newY, x: newX, vx: newVx, angle: newAngle, rotateSpeed: newRotateSpeed };
          })
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
                // Play point sound if loaded
                try { pointSound.current?.replayAsync(); } catch {}
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

                // Level progression handling: for every level
                if (score.current > 0 && score.current % levelThreshold === 0) {
                  setIsPaused(true);
                  setShowLevelComplete(true);
                  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                }
                return false; // remove obstacle
              } else {
                // Game over
                clearInterval(gameLoopRef.current);
                if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
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

        // Gradual speed ramp aside from level-ups
        if (score.current > 0 && score.current % 5 === 0) {
          obstacleSpeed.current = Math.min(20, 5 + Math.floor(score.current / 4));
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
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      clearInterval(gameLoopRef.current);
    };
  }, [isGameOver, generateObstacle, level, isPaused]);

  // Restart spawner when level changes (if not game over)
  useEffect(() => {
    if (isGameOver) return;
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }
    const base = 1200;
    const rate = Math.max(500, base - (level - 1) * 100);
    spawnIntervalRef.current = setInterval(() => {
      setObstacles(prev => [...prev, generateObstacle()]);
    }, rate);
    return () => {
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    };
  }, [level, isGameOver, generateObstacle, isPaused]);

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
        <Text style={styles.level}>Level: {level}</Text>

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

        {showLevelComplete && (
          <View style={styles.overlayContainer}>
            <Text style={styles.levelUpTitle}>Level {level} Complete!</Text>
            <View style={styles.overlayButtons}>
              <TouchableOpacity
                style={[styles.overlayButton, { backgroundColor: '#e94560' }]}
                onPress={() => {
                  // Quit treated as ending the run
                  setShowLevelComplete(false);
                  onGameOver?.(score.current);
                }}
              >
                <Text style={styles.overlayButtonText}>Quit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overlayButton, { backgroundColor: '#4ECDC4' }]}
                onPress={() => {
                  // Advance to Level 2 and resume
                  setShowLevelComplete(false);
                  setIsPaused(false);
                  setLevel(prev => prev + 1);
                  obstacleSpeed.current = Math.min(20, obstacleSpeed.current + 1);
                  obstacleSizeRef.current = Math.max(36, obstacleSizeRef.current - 4);
                  // Optionally clear existing obstacles for a clean start
                  setObstacles([]);
                }}
              >
                <Text style={styles.overlayButtonText}>Next Level</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isGameOver && (
          <View style={styles.gameOverContainer}>
            <Text style={styles.gameOverText}>Game Over!</Text>
            <Text style={styles.finalScore}>Score: {currentScore}</Text>
            <Text style={styles.finalScore}>Level: {level}</Text>
            <TouchableOpacity
              style={styles.restartButton}
              onPress={() => {
                setObstacles([]);
                setParticles([]);
                score.current = 0;
                setCurrentScore(0);
                setIsGameOver(false);
                obstacleSpeed.current = 5;
                obstacleSizeRef.current = OBSTACLE_WIDTH;
                setLevel(1);
                setIsPaused(false);
                setShowLevelComplete(false);
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
  level: {
    position: 'absolute',
    top: 40,
    right: 20,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4ECDC4',
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
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    paddingHorizontal: 24,
  },
  levelUpTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
  },
  overlayButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  overlayButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    marginHorizontal: 8,
  },
  overlayButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
