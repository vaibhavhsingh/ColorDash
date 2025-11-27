import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated';
// Sound temporarily disabled until assets are provided

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
  const [obstacles, setObstacles] = useState([]);
  const gameLoopRef = useRef(null);
  const obstacleSpeed = useRef(5);
  // Sound effect loading removed; add assets later and re-enable if desired

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

  // Generate new obstacle
  const generateObstacle = useCallback(() => {
    const colorIndex = Math.floor(Math.random() * COLORS.length);
    const x = Math.random() * (SCREEN_WIDTH - OBSTACLE_WIDTH);
    
    return {
      id: Date.now(),
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
    }, 1500);

    // Game loop
    gameLoopRef.current = setInterval(() => {
      setObstacles(prev => {
        // Move obstacles down
        const updatedObstacles = prev
          .map(obs => ({
            ...obs,
            y: obs.y + obstacleSpeed.current,
          }))
          .filter(obs => {
            // Check collision
            const playerRect = {
              x: playerPos.value.x,
              y: playerPos.value.y,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
            };

            const obstacleRect = {
              x: obs.x,
              y: obs.y,
              width: obs.width,
              height: obs.height,
            };

            // Simple collision detection
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
                return false; // Remove the obstacle
              } else {
                // Game over
                clearInterval(gameLoopRef.current);
                clearInterval(obstacleInterval);
                setIsGameOver(true);
                onGameOver(score.current);
                return false;
              }
            }

            // Remove if out of screen
            return obs.y < SCREEN_HEIGHT;
          });

        return updatedObstacles;
      });

      // Increase difficulty
      if (score.current > 0 && score.current % 5 === 0) {
        obstacleSpeed.current = Math.min(15, 5 + Math.floor(score.current / 5));
      }
    }, 16); // ~60fps

    return () => {
      clearInterval(obstacleInterval);
      clearInterval(gameLoopRef.current);
    };
  }, [isGameOver, generateObstacle, onGameOver, playerPos, playerColor]);

  // Change player color on tap
  const changeColor = useCallback(() => {
    playerColor.value = (playerColor.value + 1) % COLORS.length;
  }, [playerColor]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  score: {
    position: 'absolute',
    top: 40,
    left: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
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
    backgroundColor: '#333',
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
